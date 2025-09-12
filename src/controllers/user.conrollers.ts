import { filesize } from "filesize";
import { CACHE_KEY_PREFIX } from "../constants";
import { InsertUser } from "../database/schema";
import { userCache } from "../middlewares/auth.middleware";
import TokenService from "../services/token.services";
import UserService from "../services/user.services";
import ApiError from "../utils/ApiError";
import ApiResponse from "../utils/ApiResponse";
import asyncHandler from "../utils/asyncHandler";

// Register User
const registerUser = asyncHandler(async (req, res, next) => {
   const { name, email, password }: InsertUser = req.body;
   if (!email || !name || !password) {
      return next(new ApiError(400, "Please provide all the required fields"));
   }

   const existingUser = await UserService.findByEmail(email);

   if (existingUser) {
      return next(new ApiError(400, "User is already exists"));
   }

   const hashPassword = await UserService.hashPassword(password);

   const user = await UserService.createUser({
      name,
      email,
      password: hashPassword,
      provider: "custom"
   });

   if (!user) {
      return next(new ApiError(400, "User creation error"));
   }

   const { accessToken } = await TokenService.generateTokens({
      email: user.email,
      userId: user.id,
      tokenVersion: user.tokenVersion,
      loopDelay: user.loopDelay
   });

   res.status(200).json(
      new ApiResponse(
         200,
         {
            accessToken,
            user
         },
         "User created successfully"
      )
   );
});

// Login User
const loginUser = asyncHandler(async (req, res, next) => {
   const { email, password }: InsertUser = req.body;

   if (!email || !password) {
      return next(new ApiError(400, "Please provide all the required fields"));
   }
   const user = await UserService.findByEmail(email);

   if (!user || user.provider !== "custom") {
      return next(new ApiError(400, "Invalid Credentials"));
   }

   const isPasswordMatch = await UserService.comparePassword(password, user.password);

   if (!isPasswordMatch) {
      return next(new ApiError(400, "Invalid Credentials"));
   }

   const { accessToken } = await TokenService.generateTokens({
      email: user.email,
      userId: user.id,
      tokenVersion: user.tokenVersion,
      loopDelay: user.loopDelay
   });

   res.status(200).json(
      new ApiResponse(
         200,
         {
            accessToken,
            user: UserService.excludePassword(user)
         },
         "User logged in successfully"
      )
   );
});

//Get Profile
const getProfile = asyncHandler(async (req, res, next) => {
   const user = req.user;
   const storage = await UserService.getStorage(user!.id);
   const storageUsed = Number(storage.storageUsed);
   res.status(200).json(new ApiResponse(200, { user: { ...user, storageUsed } }));
});

// Logout User
const logout = asyncHandler(async (req, res, next) => {
   const user = req.user!;

   userCache.del(`${CACHE_KEY_PREFIX.users}:${user?.id}`);

   res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));
});

const updateLoopDelay = asyncHandler(async (req, res, next) => {
   const user = req.user!;
   const { loopDelay } = req.body;

   if (loopDelay < 0) {
      return next(new ApiError(400, "Loop delay must be greater than or equal to 0"));
   }

   await UserService.updateUser(user.id, { loopDelay });

   userCache.del(`${CACHE_KEY_PREFIX.users}:${user.id}`);

   res.status(200).json(new ApiResponse(200, null, "Loop delay updated successfully"));
});

// Logout All Devices
const logoutAll = asyncHandler(async (req, res, next) => {
   const user = req.user!;

   await UserService.incrementTokenVersion(user.id);

   userCache.del(`${CACHE_KEY_PREFIX.users}:${user.id}`);

   res.status(200).json(new ApiResponse(200, null, "Logged out from all devices"));
});

export { getProfile, loginUser, logout, logoutAll, registerUser, updateLoopDelay };
