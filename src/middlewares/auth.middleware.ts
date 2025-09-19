import { NextFunction, Request, Response } from "express";
import { User } from "../database/schema";
import TokenService from "../services/token.services";
import UserService from "../services/user.services";
import ApiError from "../utils/ApiError";
import { Cache } from "../utils/cache";
import { CACHE_KEY_PREFIX } from "../constants";

export const userCache = new Cache({
   ttlMinutes: 15,
   maxSize: 1000
});

export const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const authHeader = req.headers.authorization;
      const activationId = req.headers["x-activation-id"] as string;

      if (!authHeader?.startsWith("Bearer ") && !activationId) {
         return next(new ApiError(401, "Unauthorized"));
      }
      let user: User | null = null;
      let userId: string | null = null;

      if (authHeader?.startsWith("Bearer ")) {
         const token = authHeader.split(" ")[1];
         try {
            const decoded = TokenService.verfiyAccessToken(token);
            userId = decoded.userId;

            const cacheKey = `${CACHE_KEY_PREFIX.users}:${userId}`;
            user = userCache.get(cacheKey) as User | null;
            if (!user) {
               // @ts-ignore
               user = await UserService.findByUserId(userId);
               if (user) {
                  userCache.set(cacheKey, user);

                  if (user.tokenVersion !== decoded.tokenVersion) {
                     userCache.del(cacheKey);
                     return next(new ApiError(401, "AUTH_SESSION_EXPIRED"));
                  }
               }
            }
         } catch (error: any) {
            if (error.message === "TOKEN_EXPIRED") {
               return next(new ApiError(401, "AUTH_TOKEN_EXPIRED"));
            } else if (error.message === "INVALID_TOKEN") {
               return next(new ApiError(401, "AUTH_INVALID_TOKEN"));
            } else {
               return next(new ApiError(400, error.message));
            }
         }
      }

      if (!user && activationId) {
         const cacheKey = `${CACHE_KEY_PREFIX.users}:${activationId}`;
         user = userCache.get(cacheKey) as User | null;

         if (!user) {
            // @ts-ignore
            user = await UserService.findByUserId(activationId);

            if (user) {
               userCache.set(cacheKey, user);
            }
         }
      }

      if (!user) {
         return next(new ApiError(401, "Unauthorized"));
      }

      req.user = user;
      next();
   } catch (error: any) {
      next(new ApiError(401, error.message));
   }
};
