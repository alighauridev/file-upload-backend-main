DROP TABLE "user_sessions" CASCADE;
ALTER TABLE "users" ADD COLUMN "storage_used" numeric DEFAULT '0' NOT NULL;