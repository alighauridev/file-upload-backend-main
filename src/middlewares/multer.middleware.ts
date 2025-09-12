import multer from "multer";

const multerUpload = multer({
   storage: multer.memoryStorage(),
   limits: {
      fileSize: 50 * 1024 * 1024 // 50MB per file
   }
});

export const dualFileUpload = multerUpload.fields([
   { name: "originalFile", maxCount: 1 },
   { name: "processedFile", maxCount: 1 }
]);

export const singleFile = multerUpload.single("file");

export default multerUpload;
