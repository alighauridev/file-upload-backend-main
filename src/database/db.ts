import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "../env";

const client = postgres(env.DATABASE_URL, {
   max: 1
});

export const db = drizzle(client, {
   schema,
   logger: env.NODE_ENV !== "production"
});
