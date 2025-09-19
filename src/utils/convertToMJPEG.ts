// utils/convertToMJPEG.ts
import { spawn } from "child_process";
import { promises as fs } from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
interface VideoConversionOptions {
   fps?: number; // Added
   quality?: number; // Added
   transpose?: number;
   pixFmt?: string;
   cropWidth?: number;
   cropHeight?: number;
   cropXOffset?: string;
   cropYOffset?: string;
   useLanczos?: boolean;
   mjpegQuality?: number;
}

async function convertToAAC(file: Express.Multer.File): Promise<Express.Multer.File> {
   const fileSizeMB = file.size / (1024 * 1024);
   const maxSizeMB = 30;
   if (fileSizeMB > maxSizeMB) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(1)}MB. Maximum: ${maxSizeMB}MB`);
   }

   let ffmpegPath: string | undefined;
   try {
      const req = createRequire(process.cwd() + "/");
      ffmpegPath = (req("ffmpeg-static") as string) || process.env.FFMPEG_PATH;
   } catch {
      ffmpegPath = process.env.FFMPEG_PATH;
   }

   if (!ffmpegPath) {
      throw new Error("FFmpeg not available");
   }

   const inputPath = file.path;
   const outputPath = path.join(os.tmpdir(), `backend_audio_${Date.now()}.aac`);

   try {
      const args = [
         "-hide_banner",
         "-loglevel",
         "error",
         "-i",
         inputPath,
         "-ar",
         "44100",
         "-ac",
         "1",
         "-ab",
         "24k",
         "-filter:a",
         "loudnorm",
         "-filter:a",
         "volume=-5dB",
         "-vn", // No video
         "-y",
         outputPath
      ];

      console.log("Backend Audio FFmpeg command:", ffmpegPath, args.join(" "));

      await new Promise<void>((resolve, reject) => {
         const proc = spawn(ffmpegPath!, args, {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"]
         });

         const timeoutMs = 2 * 60 * 1000;
         const timer = setTimeout(() => {
            proc.kill("SIGKILL");
            reject(new Error("Backend Audio FFmpeg conversion timed out"));
         }, timeoutMs);

         let stderrData = "";
         proc.stderr.on("data", (data) => {
            stderrData += data.toString();
         });

         proc.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
         });

         proc.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
               console.log("Backend Audio FFmpeg conversion completed successfully");
               resolve();
            } else {
               reject(new Error(`Backend Audio FFmpeg exited with code ${code}: ${stderrData}`));
            }
         });
      });

      const converted = await fs.readFile(outputPath);
      const baseName = (file.originalname?.split(".").slice(0, -1).join(".") || "audio").trim() || "audio";

      console.log(`Backend audio conversion complete. Input: ${file.size}, Output: ${converted.length}`);

      // Clean up temp file immediately since we have buffer
      try {
         await fs.unlink(outputPath);
      } catch (cleanupError) {
         console.warn(`Failed to cleanup temp audio file: ${outputPath}`, cleanupError);
      }

      // Create and return audio file object with buffer only
      const audioFile: Express.Multer.File = {
         fieldname: "audio",
         originalname: `${baseName}.aac`,
         encoding: "7bit",
         mimetype: "audio/aac",
         size: converted.length,
         destination: "",
         filename: `${baseName}.aac`,
         path: "",
         buffer: converted,
         stream: null as any
      };

      return audioFile;
   } catch (error: any) {
      console.error("Backend audio conversion error:", error);
      throw new Error(`Backend audio conversion failed: ${error.message || "Unknown error"}`);
   }
}

async function convertToMJPEG(file: Express.Multer.File, options: VideoConversionOptions = {}): Promise<void> {
   const fileSizeMB = file.size / (1024 * 1024);
   const maxSizeMB = 30;
   if (fileSizeMB > maxSizeMB) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(1)}MB. Maximum: ${maxSizeMB}MB`);
   }
   console.log(options);

   let ffmpegPath: string | undefined;
   try {
      const req = createRequire(process.cwd() + "/");
      ffmpegPath = (req("ffmpeg-static") as string) || process.env.FFMPEG_PATH;
   } catch {
      ffmpegPath = process.env.FFMPEG_PATH;
   }

   if (!ffmpegPath) {
      throw new Error("FFmpeg not available");
   }

   const {
      fps = 24,
      quality = 5,
      transpose = 1,
      pixFmt = "yuvj420p",
      cropWidth = 240,
      cropHeight = 240,
      cropXOffset = "(iw-ow)/2",
      cropYOffset = "(ih-oh)/2",
      useLanczos = false
   } = options;

   const safeFps = Math.min(Number(fps), 24);
   const safeQuality = Number(quality) || 25;
   const safeTranspose = Math.max(0, Math.min(3, Number(transpose) || 1));
   const safeCropWidth = Math.min(Number(cropWidth) || 240, 480);
   const safeCropHeight = Math.min(Number(cropHeight) || 240, 480);

   console.log("MJPEG Backend Conversion parameters:", {
      fps: safeFps,
      quality: safeQuality,
      transpose: safeTranspose,
      cropWidth: safeCropWidth,
      cropHeight: safeCropHeight
   });

   const inputPath = file.path;
   const outputPath = path.join(os.tmpdir(), `backend_out_${Date.now()}.mjpeg`);

   try {
      // Build filter chain with fps control
      const filters = [];

      // Add fps reduction first for smaller file
      filters.push(`fps=${safeFps}`);

      // Add cropping
      if (safeCropWidth < 480 || safeCropHeight < 480) {
         filters.push(`crop=${safeCropWidth}:${safeCropHeight}:${cropXOffset}:${cropYOffset}`);
      }

      // Add transpose
      if (safeTranspose > 0) {
         filters.push(`transpose=${safeTranspose}`);
      }

      const vf = filters.join(",");

      const args = [
         "-hide_banner",
         "-loglevel",
         "error",
         "-i",
         inputPath,
         "-vf",
         vf,
         "-pix_fmt",
         pixFmt,
         "-q:v",
         String(safeQuality),
         "-vcodec",
         "mjpeg",
         "-an",
         "-y",
         outputPath
      ];

      console.log("Backend FFmpeg command:", ffmpegPath, args.join(" "));

      await new Promise<void>((resolve, reject) => {
         const proc = spawn(ffmpegPath!, args, {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"]
         });

         const timeoutMs = 2 * 60 * 1000;
         const timer = setTimeout(() => {
            proc.kill("SIGKILL");
            reject(new Error("Backend FFmpeg conversion timed out"));
         }, timeoutMs);

         let stderrData = "";
         proc.stderr.on("data", (data) => {
            stderrData += data.toString();
         });

         proc.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
         });

         proc.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
               console.log("Backend FFmpeg conversion completed successfully");
               resolve();
            } else {
               reject(new Error(`Backend FFmpeg exited with code ${code}: ${stderrData}`));
            }
         });
      });

      const converted = await fs.readFile(outputPath);
      const baseName = (file.originalname?.split(".").slice(0, -1).join(".") || "video").trim() || "video";

      console.log(`Backend conversion complete. Input: ${file.size}, Output: ${converted.length}`);

      try {
         await fs.unlink(outputPath);
         console.log(`✅ Cleaned up video temp file: ${outputPath}`);
      } catch (cleanupError) {
         console.warn(`Failed to cleanup temp video file: ${outputPath}`, cleanupError);
      }

      file.buffer = converted;
      file.size = converted.length;
      file.originalname = `${baseName}.mjpeg`;
      file.mimetype = "video/x-mjpeg";
   } catch (error: any) {
      console.error("Backend video conversion error:", error);
      throw new Error(`Backend video conversion failed: ${error.message || "Unknown error"}`);
   }
}
export { convertToMJPEG, convertToAAC, VideoConversionOptions };
