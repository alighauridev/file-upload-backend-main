class ApiResponse<T> {
   success: boolean;
   statusCode: number;
   message: string;
   data: T;

   constructor(statusCode: number, data: T, message: string = "Success") {
      this.success = statusCode < 400;
      this.statusCode = statusCode;
      this.message = message;
      this.data = data;
   }
}

export default ApiResponse;
