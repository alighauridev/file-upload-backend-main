import { promises as fs } from "fs";
import StorageService from "../services/storage.services";
import ApiError from "../utils/ApiError";
import ApiResponse from "../utils/ApiResponse";
import asyncHandler from "../utils/asyncHandler";
import { convertProcessedToMJPEG, loadAudioAsMulterFile } from "../utils/convertProcessedToMJPEG";

async function cleanupTempFile(filePath?: string) {
   if (!filePath) return;
   try {
      await fs.unlink(filePath);
   } catch (error) {
      console.warn(`[BACKEND V2] Failed to clean up upload temp file: ${filePath}`, error);
   }
}

/**
 * Accepts a video already trimmed, scaled and fps-limited by the client, plus a
 * finished MP3. Only the MJPEG encode is left to do, because that is the step
 * that inflates the file and so must not happen before the upload.
 */
const uploadProcessedVideo = asyncHandler(async (req, res, next) => {
   const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
   const videoFile = files?.video?.[0];
   const audioFile = files?.audio?.[0];

   if (!videoFile) {
      return next(new ApiError(400, "No video file provided"));
   }
   if (!audioFile) {
      return next(new ApiError(400, "No audio file provided"));
   }

   const videoTempPath = videoFile.path;
   const audioTempPath = audioFile.path;

   try {
      console.log("[BACKEND V2] Processed video upload start");
      console.log("[BACKEND V2] Received:", {
         video: `${videoFile.originalname} (${videoFile.size} bytes)`,
         audio: `${audioFile.originalname} (${audioFile.size} bytes)`
      });

      const [, audioUpload] = await Promise.all([
         convertProcessedToMJPEG(videoFile),
         loadAudioAsMulterFile(audioFile)
      ]);

      const userId = req.user?.id!;

      const { data, error } = await StorageService.uploadVideoAndAudio({
         videoFile,
         audioFile: audioUpload,
         folderName: userId,
         userId
      });

      if (error || !data) {
         console.error("[BACKEND V2] Upload failed:", error);
         return next(new ApiError(400, error || "Failed to upload video and audio"));
      }

      console.log("[BACKEND V2] Upload complete");

      res.status(200).json(new ApiResponse(200, data, "Video uploaded successfully"));
   } catch (error: any) {
      return next(new ApiError(400, `Processed video upload failed: ${error.message}`));
   } finally {
      await Promise.all([cleanupTempFile(videoTempPath), cleanupTempFile(audioTempPath)]);
   }
});

export { uploadProcessedVideo };
