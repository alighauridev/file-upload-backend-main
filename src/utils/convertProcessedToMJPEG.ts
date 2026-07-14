import { spawn } from "child_process";
import { promises as fs } from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import ffprobe from "ffprobe";
// @ts-ignore
import ffprobeStatic from "ffprobe-static";

interface ProcessedVideoOptions {
   quality?: number;
   pixFmt?: string;
}

function resolveFfmpegPath(): string {
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

   return ffmpegPath;
}

async function probeDimensions(filePath: string): Promise<string> {
   try {
      const data = await ffprobe(filePath, { path: ffprobeStatic.path });
      const stream = data.streams?.[0];
      return stream ? `${stream.width}x${stream.height}` : "unknown";
   } catch {
      return "unknown";
   }
}

/**
 * The client already delivered the exact target resolution, fps and lanczos scaling,
 * so this only re-encodes to MJPEG. Adding scale/crop/fps/transpose here would
 * double-apply them (a transpose in particular would swap width and height).
 */
async function convertProcessedToMJPEG(
   file: Express.Multer.File,
   options: ProcessedVideoOptions = {}
): Promise<void> {
   const { quality = 9, pixFmt = "yuvj420p" } = options;
   const safeQuality = Math.max(2, Math.min(31, Number(quality) || 9));

   const ffmpegPath = resolveFfmpegPath();
   const inputPath = file.path;
   const outputPath = path.join(os.tmpdir(), `v2_out_${Date.now()}.mjpeg`);

   console.log("[BACKEND V2] Input dimensions:", await probeDimensions(inputPath));
   console.log("[BACKEND V2] MJPEG params:", { quality: safeQuality, pixFmt });

   try {
      const args = [
         "-hide_banner",
         "-loglevel",
         "error",
         "-i",
         inputPath,
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

      console.log("[BACKEND V2] FFmpeg command:", ffmpegPath, args.join(" "));

      await new Promise<void>((resolve, reject) => {
         const proc = spawn(ffmpegPath, args, {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"]
         });

         const timer = setTimeout(
            () => {
               proc.kill("SIGKILL");
               reject(new Error("FFmpeg MJPEG conversion timed out"));
            },
            2 * 60 * 1000
         );

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
               resolve();
            } else {
               reject(new Error(`FFmpeg exited with code ${code}: ${stderrData}`));
            }
         });
      });

      const converted = await fs.readFile(outputPath);
      const baseName = (file.originalname?.split(".").slice(0, -1).join(".") || "video").trim() || "video";

      console.log("[BACKEND V2] Output dimensions:", await probeDimensions(outputPath));
      console.log("[BACKEND V2] MJPEG complete:", {
         inputBytes: file.size,
         outputBytes: converted.length
      });

      try {
         await fs.unlink(outputPath);
      } catch (cleanupError) {
         console.warn(`[BACKEND V2] Failed to clean up temp file: ${outputPath}`, cleanupError);
      }

      file.buffer = converted;
      file.size = converted.length;
      file.originalname = `${baseName}.mjpeg`;
      file.mimetype = "video/x-mjpeg";
   } catch (error: any) {
      console.error("[BACKEND V2] MJPEG conversion error:", error);
      throw new Error(`MJPEG conversion failed: ${error.message || "Unknown error"}`);
   }
}

/**
 * The client already encoded the final MP3, so it is read straight off disk
 * into a buffer without re-encoding. StorageService requires a buffer-backed file.
 */
async function loadAudioAsMulterFile(file: Express.Multer.File): Promise<Express.Multer.File> {
   const buffer = await fs.readFile(file.path);
   const baseName = (file.originalname?.split(".").slice(0, -1).join(".") || "audio").trim() || "audio";

   console.log("[BACKEND V2] Audio passthrough (no re-encode):", { bytes: buffer.length });

   return {
      fieldname: "audio",
      originalname: `${baseName}.mp3`,
      encoding: "7bit",
      mimetype: "audio/mpeg",
      size: buffer.length,
      destination: "",
      filename: `${baseName}.mp3`,
      path: "",
      buffer,
      stream: null as any
   };
}

export { convertProcessedToMJPEG, loadAudioAsMulterFile, ProcessedVideoOptions };
