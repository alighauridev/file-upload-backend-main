import { db } from "../database/db";
import { NextFunction, Request, Response } from "express";
import { User } from "../database/schema";

declare global {
   namespace Express {
      export interface Request {
         user?: Omit<User, "password"> & { password?: string };
      }
   }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void | any>;

type QueryConfig<T extends keyof typeof db.query> = Parameters<(typeof db.query)[T]["findMany"]>[0];

export type { AsyncHandler, QueryConfig };
