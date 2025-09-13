import { spawn } from "child_process";
import { promises as fs } from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";

interface VideoConversionOptions {
   startSec?: number;
   durationSec?: number;
   width?: number;
   height?: number;
   fps?: number;
   quality?: number;
   transpose?: number;
   pixFmt?: string;
   cropWidth?: number;
   cropHeight?: number;
   cropXOffset?: string;
   cropYOffset?: string;
   useLanczos?: boolean;
}

async function convertToMJPEG(file: Express.Multer.File, options: VideoConversionOptions = {}): Promise<void> {
   const fileSizeMB = file.size / (1024 * 1024);
   const maxSizeMB = 50;
   if (fileSizeMB > maxSizeMB) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(1)}MB. Maximum file size is ${maxSizeMB}MB.`);
   }

   let ffmpegPath: string | undefined;
   try {
      const req = createRequire(process.cwd() + "/");
      ffmpegPath = (req("ffmpeg-static") as unknown as string) || process.env.FFMPEG_PATH;
   } catch (e) {
      ffmpegPath = process.env.FFMPEG_PATH;
   }
   if (!ffmpegPath) {
      throw new Error("FFmpeg not available");
   }

   const {
      startSec = 0,
      durationSec = 30,
      width = 240,
      height = 240,
      fps = 24,
      quality = 5,
      transpose = 1,
      pixFmt = "yuvj420p",
      cropWidth = 240,
      cropHeight = 240,
      cropXOffset = "(iw-280)/2",
      cropYOffset = "0",
      useLanczos = false
   } = options;

   const safeStart = Math.max(0, Number(startSec) || 0);
   const safeDuration = Math.max(0.1, Number(durationSec) || 30);
   const safeWidth = Math.min(Number(width) || 240, 480);
   const safeHeight = Math.min(Number(height) || 240, 480);
   const safeFps = Math.min(Number(fps) || 24, 60);
   const safeCropWidth = Math.min(Number(cropWidth) || 240, 480);
   const safeCropHeight = Math.min(Number(cropHeight) || 240, 480);

   console.log("MJPEG Conversion parameters:", {
      safeStart,
      safeDuration,
      safeWidth,
      safeHeight,
      safeFps
   });

   const inputPath = file.path; // Use disk path from Multer
   const outputPath = path.join(os.tmpdir(), `out_${Date.now()}.mjpeg`);

   try {
      const filters = [
         `fps=${safeFps}`,
         `scale=${safeWidth}:${safeHeight}:flags=${useLanczos ? "lanczos" : "bicubic"}`,
         `crop=${safeCropWidth}:${safeCropHeight}:${cropXOffset}:${cropYOffset}`,
         `transpose=${transpose}`
      ];
      const vf = filters.join(",");

      const args = [
         "-hide_banner",
         "-loglevel",
         "error",
         "-ss",
         String(safeStart),
         "-i",
         inputPath,
         "-t",
         String(safeDuration),
         "-vf",
         vf,
         "-pix_fmt",
         pixFmt,
         "-q:v",
         String(quality),
         "-vcodec",
         "mjpeg",
         "-an",
         "-y",
         outputPath
      ];

      console.log("FFmpeg command:", ffmpegPath, args.join(" "));

      await new Promise<void>((resolve, reject) => {
         const proc = spawn(ffmpegPath as string, args, {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"]
         });

         const timeoutMs = 5 * 60 * 1000;
         const timer = setTimeout(() => {
            try {
               proc.kill("SIGKILL");
            } catch {}
            reject(new Error("FFmpeg conversion timed out"));
         }, timeoutMs);

         let stderrData = "";
         proc.stderr.on("data", (data) => {
            const errorOutput = data.toString();
            console.error("[ffmpeg]", errorOutput);
            stderrData += errorOutput;
         });

         proc.on("error", (err) => {
            clearTimeout(timer);
            console.error("FFmpeg process error:", err);
            reject(err);
         });

         proc.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
               console.log("FFmpeg conversion completed successfully");
               resolve();
            } else {
               console.error("FFmpeg failed with code:", code, "stderr:", stderrData);
               reject(new Error(`FFmpeg exited with code ${code}: ${stderrData}`));
            }
         });
      });

      const converted = await fs.readFile(outputPath);
      const baseName = (file.originalname?.split(".").slice(0, -1).join(".") || "video").trim() || "video";

      console.log(`Conversion complete. Original size: ${file.size}, New size: ${converted.length}`);

      file.path = outputPath; // Update to new path
      file.size = converted.length;
      file.originalname = `${baseName}.mjpeg`;
      file.mimetype = "video/x-mjpeg";
   } catch (error: any) {
      console.error("Video conversion error:", error);
      throw new Error(`Video conversion failed: ${error.message || "Unknown error"}`);
   } finally {
      await Promise.allSettled([fs.unlink(inputPath).catch(() => {}), fs.unlink(outputPath).catch(() => {})]);
   }
}

export { convertToMJPEG, VideoConversionOptions };
