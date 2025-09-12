import { NextFunction, Request, Response } from "express";
import { AsyncHandler } from "../types";

const asyncHandler = (fun: AsyncHandler) => async (req: Request, res: Response, next: NextFunction) => {
   return Promise.resolve(fun(req, res, next)).catch(next);
};

export default asyncHandler;
