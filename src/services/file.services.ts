import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import { AvailableFileStatus, FileStatusType, FileType, IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from "../constants";
import { db } from "../database/db";
import { InsertUserFile, userFiles } from "../database/schema";
import StorageService from "./storage.services";

export const getFileType = (mimeType: string): (typeof FileType)[keyof typeof FileType] => {
   if (VIDEO_MIME_TYPES.includes(mimeType)) {
      return FileType.VIDEO;
   } else if (IMAGE_MIME_TYPES.includes(mimeType)) {
      return FileType.IMAGE;
   }
   throw new Error(`Unsupported file type: ${mimeType}`);
};

class FileService {
   public static async create(data: InsertUserFile) {
      const [userFile] = await db.insert(userFiles).values(data).returning({
         id: userFiles.id,
         userId: userFiles.userId,
         fileName: userFiles.fileName,
         mimeType: userFiles.mimeType,
         fileUrl: userFiles.fileUrl,
         audioUrl: userFiles.audioUrl,
         fileSize: userFiles.fileSize,
         fileType: userFiles.fileType,
         status: userFiles.status,
         createdAt: userFiles.createdAt,
         updatedAt: userFiles.updatedAt
      });
      return userFile;
   }

   public static async getLatestFrameNumber(userId: string): Promise<number> {
      const result = await db.query.userFiles.findFirst({
         where: and(eq(userFiles.userId, userId), like(userFiles.fileName, "frame_%")),
         orderBy: (u, { desc }) => [
            desc(
               sql`CAST(
              SUBSTRING(${u.fileName} FROM 'frame_([0-9]+)') 
            AS INT)`
            )
         ],
         columns: {
            fileName: true
         }
      });
      if (!result?.fileName) return 0;

      const match = result.fileName.match(/^frame_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
   }

   public static async listByUserId(userId: string, status: (typeof AvailableFileStatus)[number] = FileStatusType.ACTIVE) {
      let orderByField;
      switch (status) {
         case FileStatusType.ARCHIVED:
            orderByField = userFiles.archivedAt;
            break;
         case FileStatusType.TRASHED:
            orderByField = userFiles.trashedAt;
            break;
         default:
            orderByField = userFiles.createdAt;
      }

      const selectFields: any = {
         id: true,
         userId: true,
         fileName: true,
         mimeType: true,
         fileUrl: true,
         audioUrl: true,
         fileSize: true,
         status: true,
         createdAt: true,
         updatedAt: true,
         fileType: true
      };

      if (status === FileStatusType.ARCHIVED) {
         selectFields.archivedAt = true;
      } else if (status === FileStatusType.TRASHED) {
         selectFields.trashedAt = true;
      }

      const files = await db.query.userFiles.findMany({
         where: and(eq(userFiles.userId, userId), eq(userFiles.status, status)),
         orderBy: (u, { desc }) => [desc(orderByField)],
         columns: selectFields
      });

      return files;
   }

   public static async listPaginated(
      userId: string,
      page: number = 1,
      limit: number = 10,
      status: (typeof AvailableFileStatus)[number] = FileStatusType.ACTIVE
   ) {
      const offset = (page - 1) * limit;

      let orderByField;
      switch (status) {
         case FileStatusType.ARCHIVED:
            orderByField = userFiles.archivedAt;
            break;
         case FileStatusType.TRASHED:
            orderByField = userFiles.trashedAt;
            break;
         default:
            orderByField = userFiles.createdAt;
      }
      const selectFields: any = {
         id: true,
         userId: true,
         fileName: true,
         mimeType: true,
         fileUrl: true,
         audioUrl: true,
         fileSize: true,
         status: true,
         createdAt: true,
         updatedAt: true
      };

      if (status === FileStatusType.ARCHIVED) {
         selectFields.archivedAt = true;
      } else if (status === FileStatusType.TRASHED) {
         selectFields.trashedAt = true;
      }

      const filesWithCount = await db.query.userFiles.findMany({
         where: and(eq(userFiles.userId, userId), eq(userFiles.status, status)),
         orderBy: (u, { desc }) => [desc(orderByField)],
         limit,
         offset,
         columns: selectFields,
         extras: {
            totalCount: sql`count(*) over()`.as("total_count")
         }
      });

      const total = filesWithCount[0]?.totalCount ?? 0;

      return {
         files: filesWithCount.map(({ totalCount, ...file }) => file),
         pagination: {
            total: Number(total),
            currentPage: page,
            limit,
            pages: Math.ceil(Number(total) / limit)
         }
      };
   }

   public static async findById(id: string) {
      return db.query.userFiles.findFirst({
         where: eq(userFiles.id, id)
      });
   }

   public static async findManyFiles(fileIds: string[], columns: any) {
      const files = await db.query.userFiles.findMany({
         where: inArray(userFiles.id, fileIds),
         columns
      });
      return files;
   }

   public static async delete(id: string) {
      const [files] = await db.delete(userFiles).where(eq(userFiles.id, id)).returning({ id: userFiles.id });
      return files;
   }

   public static async deleteMany(ids: string[]) {
      const files = await db
         .delete(userFiles)
         .where(and(inArray(userFiles.id, ids), eq(userFiles.status, FileStatusType.TRASHED)))
         .returning({ id: userFiles.id });
      return files;
   }

   public static async archiveFile(id: string) {
      const timestamp = new Date();
      const [file] = await db
         .update(userFiles)
         .set({
            status: FileStatusType.ARCHIVED,
            archivedAt: timestamp
         })
         .where(eq(userFiles.id, id))
         .returning({ id: userFiles.id });
      return file;
   }

   public static async archiveFiles(ids: string[]) {
      const timestamp = new Date();
      const files = await db
         .update(userFiles)
         .set({
            status: FileStatusType.ARCHIVED,
            archivedAt: timestamp
         })
         .where(and(inArray(userFiles.id, ids), eq(userFiles.status, FileStatusType.ACTIVE)))
         .returning({ id: userFiles.id });
      return files;
   }

   public static async unarchiveFile(id: string) {
      const [file] = await db
         .update(userFiles)
         .set({
            status: FileStatusType.ACTIVE,
            archivedAt: null
         })
         .where(eq(userFiles.id, id))
         .returning({ id: userFiles.id });
      return file;
   }

   public static async unarchiveFiles(ids: string[]) {
      const files = await db
         .update(userFiles)
         .set({
            status: FileStatusType.ACTIVE,
            archivedAt: null
         })
         .where(and(inArray(userFiles.id, ids), eq(userFiles.status, FileStatusType.ARCHIVED)))
         .returning({ id: userFiles.id });
      return files;
   }

   public static async trashFile(id: string) {
      const timestamp = new Date();
      const [file] = await db
         .update(userFiles)
         .set({
            status: FileStatusType.TRASHED,
            trashedAt: timestamp
         })
         .where(eq(userFiles.id, id))
         .returning({ id: userFiles.id });
      return file;
   }

   public static async trashFiles(ids: string[]) {
      const timestamp = new Date();
      const files = await db
         .update(userFiles)
         .set({
            status: FileStatusType.TRASHED,
            trashedAt: timestamp
         })
         .where(and(inArray(userFiles.id, ids), eq(userFiles.status, FileStatusType.ARCHIVED)))
         .returning({ id: userFiles.id });
      return files;
   }

   public static async restoreFileFromTrash(id: string) {
      const [file] = await db
         .update(userFiles)
         .set({
            status: FileStatusType.ARCHIVED,
            trashedAt: null
         })
         .where(and(eq(userFiles.id, id), eq(userFiles.status, FileStatusType.TRASHED)))
         .returning({ id: userFiles.id });
      return file;
   }

   public static async restoreFilesFromTrash(ids: string[]) {
      const files = await db
         .update(userFiles)
         .set({
            status: FileStatusType.ARCHIVED,
            trashedAt: null,
            archivedAt: null
         })
         .where(and(inArray(userFiles.id, ids), eq(userFiles.status, FileStatusType.TRASHED)))
         .returning({ id: userFiles.id });
      return files;
   }

   public static async permanentlyDeleteFromTrash(ids: string[]) {
      const files = await db
         .delete(userFiles)
         .where(and(inArray(userFiles.id, ids), eq(userFiles.status, FileStatusType.TRASHED)))
         .returning({ id: userFiles.id });
      return files;
   }

   public static async emptyTrash(userId: string) {
      const files = await db
         .delete(userFiles)
         .where(and(eq(userFiles.userId, userId), eq(userFiles.status, FileStatusType.TRASHED)))
         .returning({ id: userFiles.id });
      return files;
   }

   public static async cleanExpiredTrashedFiles(userId: string): Promise<{
      deletedCount: number;
      totalFilesSize: number;
      error: string | null;
   }> {
      try {
         const cutoffDate = new Date();
         cutoffDate.setDate(cutoffDate.getDate() - 30);

         const expiredFiles = await db.query.userFiles.findMany({
            where: and(eq(userFiles.userId, userId), eq(userFiles.status, FileStatusType.TRASHED), lt(userFiles.trashedAt!, cutoffDate)),
            columns: {
               id: true
            }
         });

         if (expiredFiles.length === 0) {
            return { deletedCount: 0, totalFilesSize: 0, error: null };
         }

         const fileIds = expiredFiles.map((file) => file.id);

         const result = await StorageService.bulkDelete(fileIds, userId);

         return {
            deletedCount: result.deletedCount || 0,
            totalFilesSize: result.totalFilesSize,
            error: result.error
         };
      } catch (error: any) {
         console.error("Error cleaning expired trash files:", error);
         return { deletedCount: 0, totalFilesSize: 0, error: error.message };
      }
   }
}

export default FileService;
