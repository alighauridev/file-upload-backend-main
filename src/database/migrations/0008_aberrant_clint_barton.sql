CREATE TYPE "public"."file_type" AS ENUM('image', 'video');
ALTER TABLE "users_files" ADD COLUMN "file_type" "file_type" DEFAULT 'image' NOT NULL;