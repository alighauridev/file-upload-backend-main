import { Express } from "express";
import { OriginalFile, UserFile } from "../database/schema";
import { FileType } from "../constants";
type UploadFilePayload = {
   fileName?: string;
   folderName: string;
   file: Express.Multer.File;
   userId: string;
};

type DeleteFilePayload = {
   fileName?: string;
   folderName: string;
   file: string;
   fileId: string;
};

type UploadFileResponse = {
   error: null | string;
   data: (Omit<UserFile, "trashedAt" | "archivedAt"> & { fileType: (typeof FileType)[keyof typeof FileType] }) | null;
};

type UploadFileWithOriginalResponse = {
   error: null | string;
   data: {
      totalSize: number;
      file: UserFile;
      originalFile: Pick<OriginalFile, "id" | "fileSize">;
   } | null;
};

export type { UploadFilePayload, UploadFileResponse, DeleteFilePayload, UploadFileWithOriginalResponse };
