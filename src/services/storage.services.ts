import bytes from "bytes";
import { filesize } from "filesize";
import fs from "node:fs/promises";
import { CACHE_KEY_PREFIX, FileType } from "../constants";
import { env } from "../env";
import { userCache } from "../middlewares/auth.middleware";
import { UploadFilePayload, UploadFileResponse, UploadFileWithOriginalResponse } from "../types/storage.types";
import { supabase } from "../utils/supabase-client";
import FileService, { getFileType } from "./file.services";
import OriginalFileService from "./original-file.services";
import UserService from "./user.services";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

class StorageService {
   public static async uploadFile({ file, fileName, folderName, userId }: UploadFilePayload): Promise<UploadFileResponse> {
      let error = null;
      let data = null;

      try {
         const fileType = getFileType(file.mimetype);
         const fileSize = Number(file.size);
         console.log(`[uploadFile] Received file: ${file.originalname} size=${filesize(fileSize)}B type='${file.mimetype}'`);
         if (fileType === FileType.IMAGE && fileSize > MAX_IMAGE_SIZE) {
            return {
               error: `Image size exceeds maximum allowed size of ${filesize(MAX_IMAGE_SIZE)}`,
               data: null
            };
         } else if (fileType === FileType.VIDEO && fileSize > MAX_VIDEO_SIZE) {
            return {
               error: `Video size exceeds maximum allowed size of ${filesize(MAX_VIDEO_SIZE)}`,
               data: null
            };
         }

         const storageInfo = await UserService.hasEnoughStorage(userId, fileSize);
         if (!storageInfo?.hasEnough) {
            return {
               error: `User storage limit exceeded. Available: ${bytes(storageInfo?.availableBytes!)}`,
               data: null
            };
         }

         const folderPath = `${folderName}/`;
         const newFileName = await this.processFileName(fileName || file.originalname, userId, file.mimetype);
         const fullFilePath = `${folderPath}${newFileName}`;

         let fileBuffer: Buffer;
         if (file.buffer) {
            fileBuffer = file.buffer;
         } else if (file.path) {
            fileBuffer = await fs.readFile(file.path);
         } else {
            return {
               error: "No file buffer or path available",
               data: null
            };
         }

         console.time("supabase_upload");
         console.log(
            `[uploadFile] Uploading to bucket='${env.SUPABASE_BUCKET_NAME}' path='${fullFilePath}' size=${fileSize}B type='${file.mimetype}' url='${env.SUPABASE_URL}'`
         );

         const response = await supabase.storage.from(env.SUPABASE_BUCKET_NAME).upload(fullFilePath, fileBuffer, {
            contentType: file.mimetype,
            cacheControl: "3600"
         });
         console.timeEnd("supabase_upload");

         if (file.path) {
            try {
               await fs.access(file.path);
               await fs.unlink(file.path);
               console.log(`✅ Cleaned up temp file: ${file.path}`);
            } catch (cleanupError: any) {
               if (cleanupError.code !== "ENOENT") {
                  console.warn(`Failed to delete temp file: ${file.path}`, cleanupError.message);
               }
               // If ENOENT, file already deleted - that's fine
            }
         }
         if (response.error && response.data === null) {
            error = response.error.message;
            return {
               error: response.error.message,
               data: null
            };
         }

         const fileUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_BUCKET_NAME}/${fullFilePath}`;

         console.time("db_create_and_storage_update");
         const [userFile, storage] = await Promise.all([
            FileService.create({
               fileName: newFileName,
               fileUrl: fileUrl,
               mimeType: file.mimetype,
               fileType,
               fileSize: filesize(file.size, { standard: "jedec" }),
               userId: userId
            }),
            UserService.updateStorageUsed(userId, file.size)
         ]);
         console.timeEnd("db_create_and_storage_update");

         const cacheKey = `${CACHE_KEY_PREFIX.users}:${userId}`;
         if (storage) {
            userCache.del(cacheKey);
         }

         data = userFile;

         return {
            error,
            data
         };
      } catch (err: any) {
         if (file.path) {
            try {
               await fs.access(file.path);
               await fs.unlink(file.path);
            } catch (cleanupError: any) {
               if (cleanupError.code !== "ENOENT") {
                  console.warn(`Failed to delete temp file on error: ${file.path}`, cleanupError.message);
               }
            }
         }

         return {
            error: err.message,
            data
         };
      }
   }

   public static async uploadVideoAndAudio({
      videoFile,
      audioFile,
      fileName,
      folderName,
      userId
   }: {
      videoFile: Express.Multer.File;
      audioFile: Express.Multer.File;
      fileName?: string;
      folderName: string;
      userId: string;
   }): Promise<UploadFileResponse> {
      try {
         const videoFileSize = Number(videoFile.size);
         const audioFileSize = Number(audioFile.size);
         const totalSize = videoFileSize + audioFileSize;

         if (videoFileSize > MAX_VIDEO_SIZE) {
            return {
               error: `Video size exceeds maximum allowed size of ${filesize(MAX_VIDEO_SIZE)}`,
               data: null
            };
         }

         const storageInfo = await UserService.hasEnoughStorage(userId, totalSize);
         if (!storageInfo?.hasEnough) {
            return {
               error: `User storage limit exceeded. Available: ${bytes(storageInfo?.availableBytes!)}`,
               data: null
            };
         }

         const folderPath = `${folderName}/`;

         const videoFileName = await this.processFileName(fileName || videoFile.originalname, userId, "video/x-mjpeg");
         const audioFileName = videoFileName.replace(/\.[^.]+$/, ".aac");

         const videoFilePath = `${folderPath}${videoFileName}`;
         const audioFilePath = `${folderPath}${audioFileName}`;

         if (!videoFile.buffer || !audioFile.buffer) {
            return { error: "Video or audio buffer not available", data: null };
         }

         const videoBuffer = videoFile.buffer;
         const audioBuffer = audioFile.buffer;

         const [videoResponse, audioResponse] = await Promise.all([
            supabase.storage.from(env.SUPABASE_BUCKET_NAME).upload(videoFilePath, videoBuffer, {
               contentType: "video/x-mjpeg",
               cacheControl: "3600"
            }),
            supabase.storage.from(env.SUPABASE_BUCKET_NAME).upload(audioFilePath, audioBuffer, {
               contentType: "audio/aac",
               cacheControl: "3600"
            })
         ]);

         if (videoResponse.error && audioResponse.error) {
            return { error: `Failed to upload both video and audio: ${videoResponse.error.message}`, data: null };
         } else if (videoResponse.error) {
            return { error: `Failed to upload video: ${videoResponse.error.message}`, data: null };
         } else if (audioResponse.error) {
            return { error: `Failed to upload audio: ${audioResponse.error.message}`, data: null };
         }

         videoFile.buffer = Buffer.alloc(0);
         audioFile.buffer = Buffer.alloc(0);

         const videoUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_BUCKET_NAME}/${videoFilePath}`;
         const audioUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_BUCKET_NAME}/${audioFilePath}`;

         // Create database record and update storage
         const [userFile, storage] = await Promise.all([
            FileService.create({
               fileName: videoFileName,
               fileUrl: videoUrl,
               audioUrl: audioUrl,
               mimeType: "video/x-mjpeg",
               fileType: FileType.VIDEO,
               fileSize: filesize(totalSize, { standard: "jedec" }),
               userId: userId
            }),
            UserService.updateStorageUsed(userId, totalSize)
         ]);

         // Clear cache
         const cacheKey = `${CACHE_KEY_PREFIX.users}:${userId}`;
         if (storage) {
            userCache.del(cacheKey);
         }

         return { error: null, data: userFile };
      } catch (err: any) {
         return { error: err.message, data: null };
      }
   }

   public static async uploadWithOriginal({
      originalFile,
      processedFile,
      folderName,
      userId
   }: {
      originalFile: Express.Multer.File;
      processedFile: Express.Multer.File;
      folderName: string;
      userId: string;
   }): Promise<UploadFileWithOriginalResponse> {
      try {
         const totalFileSize = Number(originalFile.size) + Number(processedFile.size);
         const storageInfo = await UserService.hasEnoughStorage(userId, totalFileSize);

         if (!storageInfo?.hasEnough) {
            return {
               error: `User storage limit exceeded. Available: ${bytes(storageInfo?.availableBytes!)}`,
               data: null
            };
         }

         const folderPath = `${folderName}/`;
         const baseFileName = await this.processFileName(processedFile.originalname, userId, processedFile.mimetype);
         const ext = processedFile.originalname.split(".").pop()?.toLowerCase();

         const processedFileName = baseFileName;
         const originalFileName = baseFileName.replace(`.${ext}`, `_original.${ext}`);

         const processedFilePath = `${folderPath}${processedFileName}`;
         const originalFilePath = `${folderPath}${originalFileName}`;

         // Upload DIFFERENT files in parallel
         const [processedResponse, originalResponse] = await Promise.all([
            supabase.storage.from(env.SUPABASE_BUCKET_NAME).upload(processedFilePath, processedFile.buffer, {
               contentType: processedFile.mimetype,
               cacheControl: "3600"
            }),
            supabase.storage.from(env.SUPABASE_BUCKET_NAME).upload(originalFilePath, originalFile.buffer, {
               contentType: originalFile.mimetype,
               cacheControl: "3600"
            })
         ]);

         if (processedResponse.error || originalResponse.error) {
            const error = processedResponse.error?.message || originalResponse.error?.message || null;
            return { error, data: null };
         }

         const processedFileUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_BUCKET_NAME}/${processedFilePath}`;
         const originalFileUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_BUCKET_NAME}/${originalFilePath}`;

         // Create records for DIFFERENT files
         const [userFile, originalFileRecord] = await Promise.all([
            FileService.create({
               fileName: processedFileName,
               fileUrl: processedFileUrl,
               mimeType: processedFile.mimetype,
               fileSize: filesize(processedFile.size, { standard: "jedec" }),
               userId: userId
            }),
            OriginalFileService.create({
               userId: userId,
               fileName: originalFileName,
               fileUrl: originalFileUrl,
               fileSize: filesize(originalFile.size, { standard: "jedec" }),
               mimeType: originalFile.mimetype
            })
         ]);

         await UserService.updateStorageUsed(userId, totalFileSize);

         const cacheKey = `${CACHE_KEY_PREFIX.users}:${userId}`;
         userCache.del(cacheKey);
         return {
            error: null,
            data: {
               totalSize: totalFileSize,
               // @ts-ignore
               file: userFile,
               originalFile: originalFileRecord
            }
         };
      } catch (err: any) {
         return { error: err.message, data: null };
      }
   }

   public static async deleteOne(fileId: string): Promise<UploadFileResponse> {
      let data = null;

      try {
         const file = await FileService.findById(fileId);

         if (!file) {
            return {
               error: "File not found",
               data: null
            };
         }
         const fileUrl = file.fileUrl;
         const pathArray = fileUrl.split(env.SUPABASE_BUCKET_NAME + "/");
         const filePath = pathArray[1];
         if (!filePath) {
            return {
               error: "Invalid File Path",
               data: null
            };
         }

         const [storageResult, _] = await Promise.all([
            supabase.storage.from(env.SUPABASE_BUCKET_NAME).remove([filePath]),
            FileService.delete(fileId)
         ]);

         if (storageResult.error) {
            return {
               error: storageResult.error.message,
               data: null
            };
         }
         await UserService.updateStorageUsed(file.userId, bytes(file.fileSize) as number, "decrease");

         data = file;

         return {
            error: null,
            data
         };
      } catch (err: any) {
         return {
            error: err.message,
            data
         };
      }
   }

   public static async bulkDelete(
      fileIds: string[],
      userId: string
   ): Promise<{
      deletedCount: number;
      failedIds: string[];
      totalFilesSize: number;
      error: string | null;
   }> {
      if (!fileIds.length) {
         return {
            deletedCount: 0,
            failedIds: [],
            totalFilesSize: 0,
            error: "No file IDs provided"
         };
      }

      try {
         const files = await FileService.findManyFiles(fileIds, {
            id: true,
            fileUrl: true,
            fileSize: true
         });

         const validFiles = files.filter(Boolean);
         const storagePaths = validFiles
            .map((file: any) => {
               const fileUrl = file.fileUrl as string;
               if (!fileUrl) return null;
               const pathArray = fileUrl.split(env.SUPABASE_BUCKET_NAME + "/");
               return pathArray.length > 1 ? pathArray[1] : null;
            })
            .filter(Boolean) as string[];

         const calculateFilesSize = validFiles
            .map((file: any) => {
               return typeof file.fileSize === "string" ? Number(bytes(file.fileSize)) : Number(file.fileSize);
            })
            .reduce((prev: number, curr: number) => prev + curr, 0);

         const validFileIds = validFiles.map((file: any) => file!.id);
         const failedIds = fileIds.filter((id) => !validFileIds.includes(id));

         let storageResult;
         if (storagePaths.length > 0) {
            storageResult = await supabase.storage.from(env.SUPABASE_BUCKET_NAME).remove(storagePaths);

            if (storageResult.error) {
               return {
                  totalFilesSize: calculateFilesSize,
                  deletedCount: 0,
                  failedIds: fileIds,
                  error: storageResult.error.message
               };
            }
         }

         if (validFileIds.length > 0) {
            const deletedFiles = await FileService.deleteMany(validFileIds);
            const storageResult = await UserService.updateStorageUsed(userId, calculateFilesSize, "decrease");
            return {
               deletedCount: deletedFiles.length,
               failedIds: failedIds,
               totalFilesSize: Number(storageResult.storageUsed),
               error: null
            };
         }

         return {
            deletedCount: 0,
            totalFilesSize: calculateFilesSize,
            failedIds: failedIds,
            error: null
         };
      } catch (err: any) {
         return {
            deletedCount: 0,
            totalFilesSize: 0,
            failedIds: fileIds,
            error: err.message
         };
      }
   }

   public static async deleteOriginalFile(originalFileId: string): Promise<UploadFileResponse> {
      let data = null;

      try {
         const originalFile = await OriginalFileService.findById(originalFileId);

         if (!originalFile) {
            return {
               error: "Original file not found",
               data: null
            };
         }

         const fileUrl = originalFile.fileUrl;
         const pathArray = fileUrl.split(env.SUPABASE_BUCKET_NAME + "/");
         const filePath = pathArray[1];

         if (!filePath) {
            return {
               error: "Invalid original file path",
               data: null
            };
         }

         const [storageResult, deletedRecord] = await Promise.all([
            supabase.storage.from(env.SUPABASE_BUCKET_NAME).remove([filePath]),
            OriginalFileService.delete(originalFileId)
         ]);

         if (storageResult.error) {
            return {
               error: storageResult.error.message,
               data: null
            };
         }

         await UserService.updateStorageUsed(originalFile.userId, bytes(originalFile.fileSize) as number, "decrease");

         // Clear user cache
         const cacheKey = `${CACHE_KEY_PREFIX.users}:${originalFile.userId}`;
         userCache.del(cacheKey);

         data = deletedRecord;

         return {
            error: null,
            // @ts-ignore
            data
         };
      } catch (err: any) {
         return {
            error: err.message,
            // @ts-ignore
            data
         };
      }
   }

   public static async bulkDeleteOriginalFiles(
      originalFileIds: string[],
      userId: string
   ): Promise<{
      deletedCount: number;
      failedIds: string[];
      totalFilesSize: number;
      error: string | null;
   }> {
      if (!originalFileIds.length) {
         return {
            deletedCount: 0,
            failedIds: [],
            totalFilesSize: 0,
            error: "No original file IDs provided"
         };
      }

      try {
         const originalFiles = await OriginalFileService.findManyFiles(originalFileIds, {
            id: true,
            fileUrl: true,
            fileSize: true
         });

         const validFiles = originalFiles.filter(Boolean);
         const storagePaths = validFiles
            .map((file: any) => {
               const fileUrl = file.fileUrl as string;
               if (!fileUrl) return null;
               const pathArray = fileUrl.split(env.SUPABASE_BUCKET_NAME + "/");
               return pathArray.length > 1 ? pathArray[1] : null;
            })
            .filter(Boolean) as string[];

         const calculateFilesSize = validFiles
            .map((file: any) => {
               return typeof file.fileSize === "string" ? Number(bytes(file.fileSize)) : Number(file.fileSize);
            })
            .reduce((prev: number, curr: number) => prev + curr, 0);

         const validFileIds = validFiles.map((file: any) => file!.id);
         const failedIds = originalFileIds.filter((id) => !validFileIds.includes(id));

         let storageResult;
         if (storagePaths.length > 0) {
            storageResult = await supabase.storage.from(env.SUPABASE_BUCKET_NAME).remove(storagePaths);

            if (storageResult.error) {
               return {
                  totalFilesSize: calculateFilesSize,
                  deletedCount: 0,
                  failedIds: originalFileIds,
                  error: storageResult.error.message
               };
            }
         }

         if (validFileIds.length > 0) {
            const deletedFiles = await OriginalFileService.deleteMany(validFileIds);
            const storageResult = await UserService.updateStorageUsed(userId, calculateFilesSize, "decrease");

            const cacheKey = `${CACHE_KEY_PREFIX.users}:${userId}`;
            userCache.del(cacheKey);

            return {
               deletedCount: deletedFiles.length,
               failedIds: failedIds,
               totalFilesSize: Number(storageResult.storageUsed),
               error: null
            };
         }

         return {
            deletedCount: 0,
            totalFilesSize: calculateFilesSize,
            failedIds: failedIds,
            error: null
         };
      } catch (err: any) {
         return {
            deletedCount: 0,
            totalFilesSize: 0,
            failedIds: originalFileIds,
            error: err.message
         };
      }
   }

   private static async processFileName(originalName: string, userId: string, mimeType?: string) {
      const latest = await FileService.getLatestFrameNumber(userId);
      const nextFrame = latest + 1;
      // Prefer extension derived from mimeType when provided to avoid mismatches after processing (e.g., mp4 -> mjpeg)
      const mimeToExt: Record<string, string> = {
         "video/x-mjpeg": "mjpeg",
         "video/mp4": "mp4",
         "video/webm": "webm",
         "image/jpeg": "jpg",
         "image/jpg": "jpg",
         "image/png": "png",
         "image/webp": "webp",
         "image/gif": "gif"
      };
      const forcedExt = mimeType ? mimeToExt[mimeType] : undefined;
      const origExt = originalName.split(".").pop()?.toLowerCase();
      const ext = (forcedExt || origExt) as string;

      const timestamp = new Date().toISOString().split(".")[0].replace("T", "_").replace(/:/g, "-");

      return `frame_${nextFrame}_${timestamp}.${ext}`;
   }
}

export default StorageService;
