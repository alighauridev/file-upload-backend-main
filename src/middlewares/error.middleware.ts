// middlewares/error.middleware.ts - UPDATED
import { Request, Response, NextFunction } from "express";
import ApiError from "../utils/ApiError";
import { PostgresError } from "postgres";
import { env } from "../env";
import handlePostgresError from "../utils/handlePostgressError";
import multer from "multer";

const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
   console.error("Error:", err);

   // Handle 413 Content Too Large errors FIRST
   if (err.status === 413 || err.statusCode === 413 || err.type === "entity.too.large") {
      return res.status(413).json({
         message: "File too large. Maximum size allowed is 5MB for this deployment platform.",
         success: false,
         error: "FILE_TOO_LARGE"
      });
   }

   // Handle multer file size errors
   if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
         return res.status(413).json({
            success: false,
            message: "File too large. Maximum allowed size is 5MB.",
            error: "FILE_TOO_LARGE"
         });
      }
      // Other multer errors
      return res.status(400).json({
         success: false,
         message: err.message,
         error: "UPLOAD_ERROR"
      });
   }

   // Connection errors
   if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      return res.status(503).json({
         message: "Service temporarily unavailable",
         success: false,
         error: "SERVICE_UNAVAILABLE"
      });
   }

   // Postgres errors
   if ("code" in err && typeof err.code === "string") {
      err = handlePostgresError(err as PostgresError);
   }

   // API errors
   if (err instanceof ApiError) {
      return res.status(err.statusCode).json({
         success: false,
         message: err.message,
         ...(env.NODE_ENV === "development" && { stack: err.stack })
      });
   }

   // Default error
   const message = err.message || "Internal Server Error";
   const apiError = new ApiError(500, message);
   return res.status(apiError.statusCode).json({
      success: false,
      message: apiError.message,
      ...(env.NODE_ENV === "development" && { stack: err.stack })
   });
};

export default errorMiddleware;
