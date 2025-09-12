class ApiError extends Error {
   success: boolean;
   statusCode: number;
   message: string;

   constructor(statusCode: number, message: string = "Somethig went wrong") {
      super(message);
      this.statusCode = statusCode;
      this.success = false;
      this.message = message;

      Error.captureStackTrace(this, this.constructor);
   }
}

export default ApiError;
