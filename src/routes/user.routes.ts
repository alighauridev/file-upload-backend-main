import * as userControllers from "../controllers/user.conrollers";
import { Router } from "express";
import { verifyUser } from "../middlewares/auth.middleware";

const router = Router();

router.post("/register", userControllers.registerUser);
router.post("/login", userControllers.loginUser);
router.get("/logout", verifyUser, userControllers.logout);
router.get("/profile", verifyUser, userControllers.getProfile);
router.patch("/change-loop-delay", verifyUser, userControllers.updateLoopDelay);

export default router;
