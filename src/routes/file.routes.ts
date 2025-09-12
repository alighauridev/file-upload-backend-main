import * as fileControllers from "../controllers/file.contollers";
import { Router } from "express";
import { verifyUser } from "../middlewares/auth.middleware";
import { dualFileUpload, singleFile } from "../middlewares/multer.middleware";

const router = Router();

// File upload
router.post("/upload", verifyUser, singleFile, fileControllers.fileUpload);
router.post("/upload-with-original", verifyUser, dualFileUpload, fileControllers.fileUploadWithOriginal);
router.get("/originals", verifyUser, fileControllers.getUserOriginals);
router.post("/originals/bulk-delete", verifyUser, fileControllers.bulkDeleteOriginalFiles);

router.get("/", verifyUser, fileControllers.getFiles);
router.post("/bulk-delete", verifyUser, fileControllers.bulkDeleteFiles);
router.post("/bulk-archive", verifyUser, fileControllers.bulkArchiveFiles);
router.post("/bulk-trash", verifyUser, fileControllers.bulkTrashFiles);
router.post("/bulk-unarchive", verifyUser, fileControllers.bulkUnarchiveFiles);
router.post("/bulk-restore", verifyUser, fileControllers.bulkRestoreFromTrash);

router.delete("/trash/empty", verifyUser, fileControllers.emptyTrash);
router.post("/trash/delete", verifyUser, fileControllers.permanentlyDeleteFiles);

router.post("/archive/:id", verifyUser, fileControllers.archiveFile);
router.post("/unarchive/:id", verifyUser, fileControllers.unarchiveFile);

router.post("/trash/:id", verifyUser, fileControllers.trashFile);
router.post("/restore/:id", verifyUser, fileControllers.restoreFromTrash);

router.route("/:id").get(verifyUser, fileControllers.getFileDetails).delete(verifyUser, fileControllers.deleteFile);

export default router;
