import { PostgresError } from "postgres";
import ApiError from "./ApiError";

const handlePostgresError = (error: PostgresError) => {
   switch (error.code) {
      case "23505": // Unique violation
         const field = error.constraint_name?.split("_")[0] || "field";
         return new ApiError(409, `${field} already exists`);

      case "23503": // Foreign key violation
         return new ApiError(400, "Referenced record does not exist");

      case "23502": // Not null violation
         const column = error.column_name || "field";
         return new ApiError(400, `${column} cannot be null`);

      default:
         return new ApiError(500, "Database error occurred");
   }
};
export default handlePostgresError;
