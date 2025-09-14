// worker.ts
import { Worker } from "bullmq";
import { convertToMJPEG } from "./utils/convertToMJPEG";
import StorageService from "./services/storage.services";
import IORedis from "ioredis";
import fs from "fs/promises";
import { env } from "./env";

const connection = new IORedis({
   maxRetriesPerRequest: null,
   host: env.REDIS_HOST,
   port: env.REDIS_PORT,
   password: env.REDIS_PASSWORD
});

const worker = new Worker(
   "video",
   async (job) => {
      const { file, userId, options } = job.data;
      const originalInputPath = file.path;

      await job.updateProgress(10);

      try {
         await fs.access(file.path);
      } catch (error) {
         throw new Error(`Original video file not found: ${file.path}`);
      }

      await job.updateProgress(20);

      await convertToMJPEG(file, options);

      await job.updateProgress(80);

      const result = await StorageService.uploadFile({
         file,
         folderName: userId,
         userId
      });

      if (result.error) {
         throw new Error(result.error);
      }

      await fs.unlink(originalInputPath).catch(() => {});

      await job.updateProgress(100);
      return result.data;
   },
   {
      connection,
      concurrency: 1,
      stalledInterval: 120000,
      lockDuration: 180000,
      lockRenewTime: 90000,
      maxStalledCount: 1
   }
);

worker.on("completed", (job) => {
   console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
   console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on("progress", (job, progress) => {
   console.log(`🔄 Job ${job.id} progress: ${progress}%`);
});

worker.on("stalled", (jobId) => {
   console.warn(`⚠️ Job ${jobId} stalled - this shouldn't happen now`);
});

console.log("Worker started with proper stall settings");
