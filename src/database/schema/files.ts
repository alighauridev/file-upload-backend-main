import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { AvailableFileStatus, FileStatusType, FileType } from "../../constants";
import { timestamps, timestamptz } from "../../utils/timestamp-helpers";
import { users } from "./users";

export const fileStatusEnum = pgEnum("file_status", AvailableFileStatus as [string]);

export const fileTypeEnum = pgEnum("file_type", ["image", "video"] as const);

export const userFiles = pgTable(
   "users_files",
   {
      id: uuid().defaultRandom().primaryKey(),
      userId: uuid("user_id")
         .references(() => users.id, { onDelete: "cascade" })
         .notNull(),
      fileName: varchar("file_name", { length: 255 }).notNull(),
      mimeType: varchar("mime_type", { length: 100 }).notNull(),
      fileUrl: varchar("file_url", { length: 2048 }).notNull(),
      fileSize: varchar("file_size", { length: 30 }).notNull(),
      fileType: fileTypeEnum("file_type").default(FileType.IMAGE).notNull(),
      status: fileStatusEnum("status").notNull().default(FileStatusType.ACTIVE),
      trashedAt: timestamptz("trashed_at"),
      archivedAt: timestamptz("archived_at"),
      ...timestamps
   },
   (table) => [index("status_idx").on(table.status)]
);

export const originalFiles = pgTable(
   "original_files",
   {
      id: uuid().defaultRandom().primaryKey(),
      userId: uuid("user_id")
         .references(() => users.id, { onDelete: "cascade" })
         .notNull(),
      fileName: varchar("file_name", { length: 255 }).notNull(),
      mimeType: varchar("mime_type", { length: 100 }).notNull(),
      fileUrl: varchar("file_url", { length: 2048 }).notNull(),
      fileSize: varchar("file_size", { length: 30 }).notNull(),
      ...timestamps
   },
   (table) => [index("original_files_user_id_idx").on(table.userId)]
);

export const userOriginalFilesRelations = relations(userFiles, ({ one }) => ({
   user: one(users, {
      fields: [userFiles.userId],
      references: [users.id]
   })
}));

export const userFilesRelations = relations(userFiles, ({ one }) => ({
   user: one(users, {
      fields: [userFiles.userId],
      references: [users.id]
   })
}));
export type OriginalFile = typeof originalFiles.$inferSelect;
export type InsertOriginalFile = typeof originalFiles.$inferInsert;

export type UserFile = typeof userFiles.$inferSelect;
export type InsertUserFile = typeof userFiles.$inferInsert;
