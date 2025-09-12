import multer from "multer";
import { VIDEO_MIME_TYPES } from "../constants";

const multerUpload = multer({
   storage: multer.memoryStorage(),
   limits: {
      fileSize: 50 * 1024 * 1024
   }
});

const videoUpload = multer({
   storage: multer.memoryStorage(),
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
