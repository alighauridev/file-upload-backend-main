import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "../database/db";
import { InsertUser, users } from "../database/schema";
import { GLOBAL_USER_STORAGE_LIMIT } from "../constants";
import bytes from "bytes";

class UserService {
   public static async createUser(data: InsertUser) {
      const [user] = await db.insert(users).values(data).returning();
      return this.excludePassword(user);
   }

   public static async findByEmail(email: string) {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
   }

   public static async findByUserId(userId: string) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      return this.excludePassword(user);
   }

   public static async updateUser(userId: string, data: Partial<InsertUser>) {
      const [user] = await db.update(users).set(data).where(eq(users.id, userId)).returning({ id: users.id });
      return user;
   }

   static async hasEnoughStorage(userId: string, fileSize: number) {
      try {
         const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: {
               storageUsed: true
            }
         });

         if (!user) {
            console.error(`User not found: ${userId}`);
            return null;
         }

         const storageUsed = parseFloat(user.storageUsed.toString());

         if (isNaN(storageUsed)) {
            console.error(`Invalid storageUsed value: ${user.storageUsed} for user: ${userId}`);
            return null;
         }

         const availableBytes = GLOBAL_USER_STORAGE_LIMIT - storageUsed;

         return {
            hasEnough: availableBytes >= fileSize,
            availableBytes: availableBytes,
            totalBytes: GLOBAL_USER_STORAGE_LIMIT,
            usedBytes: storageUsed,
            totalFormatted: bytes(GLOBAL_USER_STORAGE_LIMIT),
            usedFormatted: bytes(storageUsed),
            availableFormatted: bytes(availableBytes)
         };
      } catch (error) {
         console.error("Error checking storage availability:", error);
         throw new Error("Failed to check storage availability");
      }
   }

   static async getStorage(userId: string) {
      const [user] = await db
         .select({
            storageUsed: users.storageUsed
         })
         .from(users)
         .where(eq(users.id, userId));
      return user;
   }

   public static async updateStorageUsed(userId: string, sizeChange: number, type: "increase" | "decrease" = "increase") {
      if (isNaN(sizeChange) || sizeChange < 0) throw new Error("Size change must be a positive number");

      let result;

      if (type === "decrease") {
         result = await db
            .update(users)
            .set({
               storageUsed: sql`GREATEST(CAST(${users.storageUsed} AS numeric) - ${sizeChange}, 0)`
            })
            .where(eq(users.id, userId))
            .returning({ id: users.id, storageUsed: users.storageUsed });
      } else {
         result = await db
            .update(users)
            .set({
               storageUsed: sql`CAST(${users.storageUsed} AS numeric) + ${sizeChange}`
            })
            .where(eq(users.id, userId))
            .returning({ id: users.id, storageUsed: users.storageUsed });
      }

      return result[0];
   }
   public static async incrementTokenVersion(userId: string) {
      const [user] = await db
         .update(users)
         .set({
            tokenVersion: sql`${users.tokenVersion} + 1`
         })
         .where(eq(users.id, userId))
         .returning({ id: users.id, tokenVersion: users.tokenVersion });

      return user;
   }

   public static async hashPassword(password: string): Promise<string> {
      return bcrypt.hash(password, 10);
   }

   public static async comparePassword(password: string, hash: string): Promise<boolean> {
      return bcrypt.compare(password, hash);
   }
   public static excludePassword<T extends { password?: string }>(user: T | null): Omit<T, "password"> | null {
      if (!user) return null;
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
   }
}

export default UserService;
