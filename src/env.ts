import { z } from "zod";
import "dotenv-flow/config";

const envSchema = z.object({
   NODE_ENV: z.enum(["development", "production"]).default("development"),
   PORT: z.coerce.number().default(4001),
   DATABASE_URL: z.string().nonempty(),
   ACCESS_TOKEN_SECRET: z.string().nonempty(),
   ACCESS_TOKEN_EXPIRE: z.string().default("30d"),
   REFRESH_TOKEN_SECRET: z.string().nonempty(),
   REFRESH_TOKEN_EXPIRE: z.string().default("30d"),
   // Production storage
   SUPABASE_URL: z.string().url().optional(),
   SUPABASE_ANON_KEY: z.string().nonempty().optional(),
   SUPABASE_BUCKET_NAME: z.string().nonempty().optional(),
   // Development storage (Docker, see docker-compose.dev.yml)
   LOCAL_STORAGE_URL: z.string().url().default("http://localhost:9000"),
   LOCAL_STORAGE_TOKEN: z.string().default("file_upload_dev_storage"),
   LOCAL_STORAGE_BUCKET_NAME: z.string().default("file-upload"),
   USER_STORAGE_LIMIT: z.string().default("100MB"),
   TRASH_RETENTION_DAYS: z.coerce.number().default(30)
}).superRefine((value, ctx) => {
   // Docker storage is development-only: a hosted deploy must run in production mode (Supabase)
   if (value.NODE_ENV !== "production" && (process.env.RENDER || process.env.VERCEL)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["NODE_ENV"], message: "Hosted deploys must run with NODE_ENV=production" });
   }
   if (value.NODE_ENV === "production") {
      for (const key of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_BUCKET_NAME"] as const) {
         if (!value[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required in production` });
      }
   }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
   console.log("Environment variables validation failed: ", parsedEnv.error.issues);
   throw new Error("There is an error with the environment variables. ");
}

export const env = parsedEnv.data;

export type ENV = z.infer<typeof envSchema>;

declare global {
   namespace NodeJS {
      interface ProcessEnv extends ENV {}
   }
}
