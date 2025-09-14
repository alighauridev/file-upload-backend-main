import { Queue, Worker } from "bullmq";
import { env } from "../env";
import IORedis from "ioredis";

const connection = new IORedis({ host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD });

export const videoQueue = new Queue("video", { connection });
