ALTER TABLE "users_files" ALTER COLUMN "file_type" SET DEFAULT 'video';
ALTER TABLE "users_files" ADD COLUMN "audio_url" varchar(2048);