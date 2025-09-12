CREATE TYPE "public"."file_status" AS ENUM('active', 'archived', 'trashed');
ALTER TABLE "users" ALTER COLUMN "loop_delay" SET DEFAULT 0;
ALTER TABLE "users_files" ADD COLUMN "status" "file_status" DEFAULT 'active' NOT NULL;
ALTER TABLE "users_files" ADD COLUMN "trashed_at" timestamp with time zone;
ALTER TABLE "users_files" ADD COLUMN "archived_at" timestamp with time zone;