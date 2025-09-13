import multer from "multer";
import { VIDEO_MIME_TYPES } from "../constants";
import os from "os";
import path from "path";

const multerUpload = multer({
   storage: multer.memoryStorage(),
   limits: {
      fileSize: 50 * 1024 * 1024
   }
});

const videoStorage = multer.diskStorage({
   destination: (req, file, cb) => {
      cb(null, os.tmpdir());
   },
   filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${path.basename(file.originalname)}`;
      cb(null, uniqueName);
   }
});

const videoUpload = multer({
   storage: videoStorage,
   limits: {
      fileSize: 100 * 1024 * 1024,
      files: 1
   },
   fileFilter: (req, file, cb) => {
      if (VIDEO_MIME_TYPES.includes(file.mimetype)) {
         cb(null, true);
      } else {
         cb(new Error("Only video files are allowed"));
      }
   }
});

export const dualFileUpload = multerUpload.fields([
   { name: "originalFile", maxCount: 1 },
   { name: "processedFile", maxCount: 1 }
]);

export const singleFile = multerUpload.single("file");

export const videoFile = videoUpload.single("video");

export default multerUpload;
