import { spawn } from "child_process";
import { promises as fs } from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";

interface VideoConversionOptions {
   startSec?: number; // Start time in seconds (default: 0)
   durationSec?: number; // Duration in seconds (default: 20)
   width?: number; // Output width (default: 240)
   height?: number; // Output height (default: 240)
   fps?: number; // Frames per second (default: 24)
   quality?: number; // 2-31, lower is better (default: 5)
   transpose?: number; // 0-3 for rotation (default: 1)
   pixFmt?: string; // Pixel format (default: 'yuvj420p')
   cropWidth?: number; // Crop width (default: 240)
   cropHeight?: number; // Crop height (default: 240)
   cropXOffset?: string; // X offset formula (default: '(iw-280)/2')
   cropYOffset?: string; // Y offset (default: '0')
   useLanczos?: boolean; // Use lanczos scaling (default: false)
}

async function convertToMJPEG(file: Express.Multer.File, options: VideoConversionOptions = {}): Promise<void> {
   // File size check (50MB limit)
   const fileSizeMB = file.size / (1024 * 1024);
   const maxSizeMB = 50;
   if (fileSizeMB > maxSizeMB) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(1)}MB. Maximum file size is ${maxSizeMB}MB.`);
   }

   // Resolve FFmpeg path
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
      durationSec = 20,
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

   const safeStart = Math.max(0, Math.floor(startSec));
   const safeDuration = Math.max(1, Math.min(20, Math.floor(durationSec)));
   const safeWidth = Math.min(width, 480);
   const safeHeight = Math.min(height, 480);
   const safeFps = Math.min(fps, 24);
   const safeCropWidth = Math.min(cropWidth, 480);
   const safeCropHeight = Math.min(cropHeight, 480);

   const tmpDir = os.tmpdir();
   const inputPath = path.join(tmpDir, `in_${Date.now()}.mp4`);
   const outputPath = path.join(tmpDir, `out_${Date.now()}.mjpeg`);

   try {
      // Write input file
      await fs.writeFile(inputPath, file.buffer);

      // Build video filter chain to match client-side
      const filters = [
         `fps=${safeFps}`,
         `scale=${safeWidth}:${safeHeight}:flags=${useLanczos ? "lanczos" : "bicubic"}`,
         `crop=${safeCropWidth}:${safeCropHeight}:${cropXOffset}:${cropYOffset}`,
         `transpose=${transpose}`
      ];
      const vf = filters.join(",");

      // FFmpeg arguments aligned with client-side
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

      // Execute FFmpeg with timeout
      await new Promise<void>((resolve, reject) => {
         const proc = spawn(ffmpegPath as string, args, {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"]
         });

         const timeoutMs = 5 * 60 * 1000; // 5 minutes
         const timer = setTimeout(() => {
            try {
               proc.kill("SIGKILL");
            } catch {}
            reject(new Error("FFmpeg conversion timed out"));
         }, timeoutMs);

         proc.stderr.on("data", (data) => console.error("[ffmpeg]", data.toString()));

         proc.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
         });

         proc.on("close", (code) => {
            clearTimeout(timer);
            code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`));
         });
      });

      // Read and update file object
      const converted = await fs.readFile(outputPath);
      const baseName = (file.originalname?.split(".").slice(0, -1).join(".") || "video").trim() || "video";

      file.buffer = converted;
      file.size = converted.length;
      file.originalname = `${baseName}.mjpeg`;
      file.mimetype = "video/x-mjpeg";
   } catch (error: any) {
      console.error("Video conversion error:", error);
      throw new Error(`Video conversion failed: ${error.message || "Unknown error"}`);
   } finally {
      // Clean up temporary files
      await Promise.allSettled([fs.unlink(inputPath).catch(() => {}), fs.unlink(outputPath).catch(() => {})]);
   }
}

export { convertToMJPEG, VideoConversionOptions };
