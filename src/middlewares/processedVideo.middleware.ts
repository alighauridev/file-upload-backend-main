import multer from "multer";
import os from "os";
import path from "path";
import { VIDEO_MIME_TYPES } from "../constants";

const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp3"];

const processedVideoStorage = multer.diskStorage({
   destination: (req, file, cb) => {
      cb(null, os.tmpdir());
   },
   filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.fieldname}-${path.basename(file.originalname)}`);
   }
});

const processedVideoUpload = multer({
   storage: processedVideoStorage,
   limits: {
      fileSize: 100 * 1024 * 1024,
      files: 2
   },
   fileFilter: (req, file, cb) => {
      if (file.fieldname === "video" && VIDEO_MIME_TYPES.includes(file.mimetype)) {
         return cb(null, true);
      }
      if (file.fieldname === "audio" && AUDIO_MIME_TYPES.includes(file.mimetype)) {
         return cb(null, true);
      }
      cb(new Error(`Unsupported file for field "${file.fieldname}": ${file.mimetype}`));
   }
});

export const processedVideoFiles = processedVideoUpload.fields([
   { name: "video", maxCount: 1 },
   { name: "audio", maxCount: 1 }
]);
