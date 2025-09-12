import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";

export default defineConfig({
   dialect: "postgresql",
   schema: "./src/database/schema/index.ts",
   out: "./src/database/migrations",
   dbCredentials: {
      url: env.DATABASE_URL
   },
   breakpoints: false,
   verbose: true,
   strict: true
});
