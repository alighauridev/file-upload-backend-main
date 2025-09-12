CREATE TYPE "public"."auth_provider" AS ENUM('google', 'custom', 'github');
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token" varchar(2048) NOT NULL,
	"device_id" varchar(300) NOT NULL,
	"device_type" varchar(100) NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
	"password" varchar(60) NOT NULL,
	"provider" "auth_provider" DEFAULT 'custom' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_url" varchar(2048) NOT NULL,
	"file_size" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "users_files" ADD CONSTRAINT "users_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "user_device_id_idx" ON "user_sessions" USING btree ("user_id","device_id");
CREATE UNIQUE INDEX "email_idx" ON "users" USING btree ("email");