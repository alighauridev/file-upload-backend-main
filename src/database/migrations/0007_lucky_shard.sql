CREATE TABLE "original_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_url" varchar(2048) NOT NULL,
	"file_size" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "original_files" ADD CONSTRAINT "original_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "original_files_user_id_idx" ON "original_files" USING btree ("user_id");