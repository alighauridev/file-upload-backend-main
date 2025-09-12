import { relations } from "drizzle-orm";
import { boolean, integer, numeric, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../../utils/timestamp-helpers";
import { userFiles } from "./files";

export const authProviderEnum = pgEnum("auth_provider", ["google", "custom", "github"]);
export const users = pgTable(
   "users",
   {
      id: uuid().defaultRandom().primaryKey(),
      name: varchar("name", { length: 100 }).notNull(),
      email: varchar("email", { length: 100 }).notNull(),
      password: varchar("password", { length: 60 }).notNull(),
      provider: authProviderEnum("provider").default("custom").notNull(),
      isVerified: boolean("is_verified").default(false).notNull(),
      tokenVersion: integer("token_version").notNull().default(0),
      storageUsed: numeric("storage_used").default("0").notNull(),
      loopDelay: integer("loop_delay").default(2).notNull(),
      ...timestamps
   },
   (table) => [uniqueIndex("email_idx").on(table.email)]
);

export const usersRelations = relations(users, ({ many }) => ({
   files: many(userFiles)
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
