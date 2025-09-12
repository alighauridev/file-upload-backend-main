import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "../database/db";
import { InsertOriginalFile, originalFiles } from "../database/schema";

class OriginalFileService {
   public static async create(data: InsertOriginalFile) {
      const [originalFile] = await db.insert(originalFiles).values(data).returning({
         id: originalFiles.id,
         fileSize: originalFiles.fileSize
      });
      return originalFile;
   }

   public static async findById(id: string) {
      return db.query.originalFiles.findFirst({
         where: eq(originalFiles.id, id)
      });
   }

   public static async listByUserId(userId: string) {
      return db.query.originalFiles.findMany({
         where: eq(originalFiles.userId, userId),
         orderBy: (o, { desc }) => [desc(o.createdAt)]
      });
   }

   public static async findManyFiles(
      ids: string[],
      select?: {
         id?: boolean;
         fileUrl?: boolean;
         fileSize?: boolean;
         userId?: boolean;
         fileName?: boolean;
         mimeType?: boolean;
      }
   ) {
      if (!ids.length) return [];

      const selectFields: any = select || {
         id: true,
         userId: true,
         fileName: true,
         mimeType: true,
         fileUrl: true,
         fileSize: true,
         createdAt: true,
         updatedAt: true
      };

      return db.query.originalFiles.findMany({
         where: inArray(originalFiles.id, ids),
         columns: selectFields
      });
   }

   public static async deleteMany(ids: string[]) {
      if (!ids.length) return [];

      const deleted = await db.delete(originalFiles).where(inArray(originalFiles.id, ids)).returning({
         id: originalFiles.id,
         fileUrl: originalFiles.fileUrl,
         fileSize: originalFiles.fileSize,
         userId: originalFiles.userId
      });

      return deleted;
   }

   public static async listPaginated(userId: string, page: number = 1, limit: number = 10, mimeType?: string) {
      const offset = (page - 1) * limit;

      const conditions = [eq(originalFiles.userId, userId)];

      if (mimeType) {
         conditions.push(like(originalFiles.mimeType, `${mimeType}%`));
      }

      const selectFields: any = {
         id: true,
         userId: true,
         fileName: true,
         mimeType: true,
         fileUrl: true,
         fileSize: true,
         createdAt: true,
         updatedAt: true
      };

      const filesWithCount = await db.query.originalFiles.findMany({
         where: and(...conditions),
         orderBy: (o, { desc }) => [desc(o.createdAt)],
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

   public static async delete(id: string) {
      const [deleted] = await db.delete(originalFiles).where(eq(originalFiles.id, id)).returning({
         id: originalFiles.id,
         fileUrl: originalFiles.fileUrl,
         fileSize: originalFiles.fileSize
      });
      return deleted;
   }

   public static async deleteByUserId(userId: string) {
      const deleted = await db.delete(originalFiles).where(eq(originalFiles.userId, userId)).returning({
         id: originalFiles.id,
         fileUrl: originalFiles.fileUrl,
         fileSize: originalFiles.fileSize
      });
      return deleted;
   }
}

export default OriginalFileService;
