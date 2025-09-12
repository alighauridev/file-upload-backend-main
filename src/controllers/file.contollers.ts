import { AvailableFileStatus, CACHE_KEY_PREFIX, FileStatusType, FileType, IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from "../constants";
import { User } from "../database/schema";
import { userCache } from "../middlewares/auth.middleware";
import FileService from "../services/file.services";
import OriginalFileService from "../services/original-file.services";
import StorageService from "../services/storage.services";
import ApiError from "../utils/ApiError";
import ApiResponse from "../utils/ApiResponse";
import asyncHandler from "../utils/asyncHandler";

// Upload File
const fileUpload = asyncHandler(async (req, res, next) => {
   const file = req.file as Express.Multer.File;
   console.log("File :", file);
   if (!file) {
      return next(new ApiError(400, "Please provide a file"));
   }

   // Validate file type
   const allowedMimeTypes = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES];
   if (!allowedMimeTypes.includes(file.mimetype)) {
      return next(new ApiError(400, `Unsupported file type. Allowed types: ${allowedMimeTypes.join(", ")}`));
   }

   const userId = req.user?.id!;
   const { data, error } = await StorageService.uploadFile({
      file,
      folderName: userId,
      userId
   });

   if (error && !data) {
      if (req.file?.buffer) {
         req.file.buffer = Buffer.alloc(0);
      }
      return next(new ApiError(400, error));
   }

   if (file.buffer) {
      file.buffer = Buffer.alloc(0);
   }

   const message = data?.fileType === FileType.VIDEO ? "Video uploaded successfully" : "Image uploaded successfully";

   res.status(200).json(new ApiResponse(200, data, message));
});

// Dual file upload controller
const fileUploadWithOriginal = asyncHandler(async (req, res, next) => {
   const files = req.files as { [fieldname: string]: Express.Multer.File[] };
   const userId = req.user?.id!;
   console.log("File :", files);

   if (!files?.originalFile?.[0] || !files?.processedFile?.[0]) {
      return next(new ApiError(400, "Please provide both originalFile and processedFile"));
   }

   const originalFile = files.originalFile[0];
   const processedFile = files.processedFile[0];

   const result = await StorageService.uploadWithOriginal({
      originalFile,
      processedFile,
      folderName: userId,
      userId
   });

   if (result.error) {
      if (originalFile?.buffer) originalFile.buffer = Buffer.alloc(0);
      if (processedFile?.buffer) processedFile.buffer = Buffer.alloc(0);
      return next(new ApiError(400, result.error));
   }

   if (originalFile?.buffer) originalFile.buffer = Buffer.alloc(0);
   if (processedFile?.buffer) processedFile.buffer = Buffer.alloc(0);

   res.status(201).json(new ApiResponse(201, result.data, "Files uploaded successfully"));
});

//Get Originals Files
const getUserOriginals = asyncHandler(async (req, res, next) => {
   const userId = req.user?.id!;
   const page = parseInt(req.query.page as string) || 1;
   const limit = parseInt(req.query.limit as string) || 10;
   const mimeType = req.query.mime_type as string;

   try {
      const result = await OriginalFileService.listPaginated(userId, page, limit, mimeType);

      res.status(200).json(new ApiResponse(200, { ...result }, "Original files retrieved successfully"));
   } catch (error: any) {
      return next(new ApiError(400, error.message));
   }
});

// Get Files with status filter (active, archived, trashed)
const getFiles = asyncHandler(async (req, res, next) => {
   const { all = "false", status = FileStatusType.ACTIVE } = req.query;
   const user = req.user as User;
   const userId = req.user?.id!;
   const page = Number(req.query.page) || 1;
   const limit = Number(req.query.limit) || 10;
   const fileStatus = status as (typeof AvailableFileStatus)[number];
   let files;

   let totalFilesSize = req.user?.storageUsed;
   if (fileStatus === FileStatusType.TRASHED) {
      const cleanupResult = await FileService.cleanExpiredTrashedFiles(userId);
      if (cleanupResult.deletedCount > 0) {
         totalFilesSize = totalFilesSize;
         console.log(
            `Auto-cleaned ${cleanupResult.deletedCount} expired trash files for user ${userId} (${cleanupResult.totalFilesSize} bytes freed)`
         );
      }
   }

   if (all === "true") {
      files = await FileService.listByUserId(userId, fileStatus);
   } else {
      files = await FileService.listPaginated(userId, page, limit, fileStatus);
   }

   let responseMessage = "Files retrieved successfully";
   if (fileStatus === FileStatusType.ARCHIVED) {
      responseMessage = "Archived files retrieved successfully";
   } else if (fileStatus === FileStatusType.TRASHED) {
      responseMessage = "Trashed files retrieved successfully";
   }

   const loopDelay = user.loopDelay || 0;
   const response: any = all === "true" ? { files, loopDelay } : { ...files, loopDelay };

   if (fileStatus === FileStatusType.TRASHED) {
      response["totalFilesSize"] = Number(totalFilesSize);
   }
   res.status(200).json(new ApiResponse(200, response, responseMessage));
});

//Get File Details
const getFileDetails = asyncHandler(async (req, res, next) => {
   const { id } = req.params;

   if (!id) {
      return next(new ApiError(400, "Please provide id"));
   }

   const file = await FileService.findById(id);
   if (!file) {
      return next(new ApiError(404, "File not found"));
   }

   res.status(200).json(new ApiResponse(200, { file }));
});

//Delete File
const deleteFile = asyncHandler(async (req, res, next) => {
   const { id } = req.params;

   if (!id) {
      return next(new ApiError(400, "Please provide id"));
   }

   const result = await StorageService.deleteOne(id);
   if (result.error) {
      return next(new ApiError(400, result.error));
   }

   return res.status(200).json(new ApiResponse(200, { id: result.data?.id }, "File deleted successfully"));
});

// Bulk Delete Files
const bulkDeleteFiles = asyncHandler(async (req, res, next) => {
   const { fileIds } = req.body;
   console.log("File IDs :", fileIds);
   if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return next(new ApiError(400, "Please provide an array of file IDs"));
   }

   const result = await StorageService.bulkDelete(fileIds, req.user?.id!);

   if (result.error && result.deletedCount === 0) {
      return next(new ApiError(500, result.error || "Failed to delete files"));
   }

   const userId = req.user?.id!;
   const cacheKey = `${CACHE_KEY_PREFIX.users}:${userId}`;

   userCache.del(cacheKey);

   return res.status(200).json(
      new ApiResponse(
         200,
         {
            deletedCount: result.deletedCount,
            failedIds: result.failedIds
         },
         `Successfully deleted ${result.deletedCount} files`
      )
   );
});

// Bulk Delete Files
const bulkDeleteOriginalFiles = asyncHandler(async (req, res, next) => {
   const { fileIds } = req.body;
   console.log("File IDs :", fileIds);
   if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return next(new ApiError(400, "Please provide an array of file IDs"));
   }

   const result = await StorageService.bulkDeleteOriginalFiles(fileIds, req.user?.id!);

   if (result.error && result.deletedCount === 0) {
      return next(new ApiError(500, result.error || "Failed to delete files"));
   }

   const userId = req.user?.id!;
   const cacheKey = `${CACHE_KEY_PREFIX.users}:${userId}`;

   userCache.del(cacheKey);

   return res.status(200).json(
      new ApiResponse(
         200,
         {
            deletedCount: result.deletedCount,
            failedIds: result.failedIds,
            totalFilesSize: result.totalFilesSize
         },
         `Successfully deleted ${result.deletedCount} original files`
      )
   );
});

// Archive File
const archiveFile = asyncHandler(async (req, res, next) => {
   const { id } = req.params;

   if (!id) {
      return next(new ApiError(400, "Please provide id"));
   }

   const file = await FileService.findById(id);
   if (!file) {
      return next(new ApiError(404, "File not found"));
   }

   if (file.status === FileStatusType.ARCHIVED) {
      return next(new ApiError(400, "File is already archived"));
   }

   const archivedFile = await FileService.archiveFile(id);

   return res.status(200).json(new ApiResponse(200, {}, "File archived successfully"));
});

// Unarchive File
const unarchiveFile = asyncHandler(async (req, res, next) => {
   const { id } = req.params;

   if (!id) {
      return next(new ApiError(400, "Please provide id"));
   }

   const file = await FileService.findById(id);
   if (!file) {
      return next(new ApiError(404, "File not found"));
   }

   if (file.status !== FileStatusType.ARCHIVED) {
      return next(new ApiError(400, "File is not archived"));
   }

   const activeFile = await FileService.unarchiveFile(id);

   return res.status(200).json(new ApiResponse(200, {}, "File unarchived successfully"));
});

// Bulk Unarchive Files
const bulkUnarchiveFiles = asyncHandler(async (req, res, next) => {
   const { fileIds } = req.body;

   if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return next(new ApiError(400, "Please provide an array of file IDs"));
   }

   const unarchivedFiles = await FileService.unarchiveFiles(fileIds);

   return res.status(200).json(
      new ApiResponse(
         200,
         {
            count: unarchivedFiles.length
         },
         `Successfully unarchived ${unarchivedFiles.length} files`
      )
   );
});

// Trash File
const trashFile = asyncHandler(async (req, res, next) => {
   const { id } = req.params;

   if (!id) {
      return next(new ApiError(400, "Please provide id"));
   }

   const file = await FileService.findById(id);
   if (!file) {
      return next(new ApiError(404, "File not found"));
   }

   if (file.status === FileStatusType.TRASHED) {
      return next(new ApiError(400, "File is already in trash"));
   }

   await FileService.trashFile(id);

   return res.status(200).json(new ApiResponse(200, {}, "File moved to trash successfully"));
});

// Restore File from Trash
const restoreFromTrash = asyncHandler(async (req, res, next) => {
   const { id } = req.params;

   if (!id) {
      return next(new ApiError(400, "Please provide id"));
   }

   const file = await FileService.findById(id);
   if (!file) {
      return next(new ApiError(404, "File not found"));
   }

   if (file.status !== FileStatusType.TRASHED) {
      return next(new ApiError(400, "File is not in trash"));
   }

   const restoredFile = await FileService.restoreFileFromTrash(id);

   return res.status(200).json(new ApiResponse(200, {}, "File restored from trash successfully"));
});

//Restore Files Bulk from Trash
const bulkRestoreFromTrash = asyncHandler(async (req, res, next) => {
   const { fileIds } = req.body;

   if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return next(new ApiError(400, "Please provide an array of file IDs"));
   }

   const restoredFiles = await FileService.restoreFilesFromTrash(fileIds);

   return res.status(200).json(new ApiResponse(200, {}, `Successfully restored ${restoredFiles.length} files from trash`));
});

// Empty trash for a user
const emptyTrash = asyncHandler(async (req, res, next) => {
   const userId = req.user?.id!;

   const deletedFiles = await FileService.emptyTrash(userId);

   return res.status(200).json(
      new ApiResponse(
         200,
         {
            count: deletedFiles.length,
            deletedIds: deletedFiles.map((file) => file.id)
         },
         "Trash emptied successfully"
      )
   );
});

// Permanently delete files from trash
const permanentlyDeleteFiles = asyncHandler(async (req, res, next) => {
   const { fileIds } = req.body;
   if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return next(new ApiError(400, "Please provide an array of file IDs"));
   }

   const result = await StorageService.bulkDelete(fileIds, req.user?.id!);

   if (result.error && result.deletedCount === 0) {
      return next(new ApiError(500, result.error || "Failed to delete files"));
   }

   const userId = req.user?.id!;
   const cacheKey = `${CACHE_KEY_PREFIX.users}:${userId}`;

   userCache.del(cacheKey);

   return res.status(200).json(
      new ApiResponse(
         200,
         {
            deletedCount: result.deletedCount,
            failedIds: result.failedIds,
            totalFilesSize: result.totalFilesSize
         },
         `Successfully deleted ${result.deletedCount} files`
      )
   );
});

// Bulk Archive Files
const bulkArchiveFiles = asyncHandler(async (req, res, next) => {
   const { fileIds } = req.body;

   if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return next(new ApiError(400, "Please provide an array of file IDs"));
   }

   const archivedFiles = await FileService.archiveFiles(fileIds);

   return res.status(200).json(
      new ApiResponse(
         200,
         {
            count: archivedFiles.length,
            files: archivedFiles
         },
         `Successfully archived ${archivedFiles.length} files`
      )
   );
});

// Bulk Trash Files
const bulkTrashFiles = asyncHandler(async (req, res, next) => {
   const { fileIds } = req.body;

   if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return next(new ApiError(400, "Please provide an array of file IDs"));
   }

   const trashedFiles = await FileService.trashFiles(fileIds);

   return res.status(200).json(
      new ApiResponse(
         200,
         {
            count: trashedFiles.length
         },
         `Successfully moved ${trashedFiles.length} files to trash`
      )
   );
});

export {
   archiveFile,
   bulkArchiveFiles,
   bulkDeleteFiles,
   bulkDeleteOriginalFiles,
   bulkRestoreFromTrash,
   bulkTrashFiles,
   bulkUnarchiveFiles,
   deleteFile,
   emptyTrash,
   fileUpload,
   fileUploadWithOriginal,
   getFileDetails,
   getFiles,
   getUserOriginals,
   permanentlyDeleteFiles,
   restoreFromTrash,
   trashFile,
   unarchiveFile
};
