import { spawn } from "child_process";
import { promises as fs } from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import ffprobe from "ffprobe";
// @ts-ignore
import ffprobeStatic from "ffprobe-static";

interface VideoConversionOptions {
   fps?: number;
   quality?: number;
   transpose?: number;
   pixFmt?: string;
   cropWidth?: number;
   cropHeight?: number;
   cropXOffset?: string;
   cropYOffset?: string;
   useLanczos?: boolean;
   mjpegQuality?: number;
}

async function convertToMP3(file: Express.Multer.File): Promise<Express.Multer.File> {
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
   const outputPath = path.join(os.tmpdir(), `backend_audio_${Date.now()}.mp3`);

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
         "-q:a",
         "9",
         "-vn",
         "-y",
         outputPath
      ];

      console.log("[BACKEND AUDIO] FFmpeg command:", ffmpegPath, args.join(" "));

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
               console.log("[BACKEND AUDIO] FFmpeg conversion completed");
               resolve();
            } else {
               reject(new Error(`Backend Audio FFmpeg exited with code ${code}: ${stderrData}`));
            }
         });
      });

      const converted = await fs.readFile(outputPath);
      const baseName = (file.originalname?.split(".").slice(0, -1).join(".") || "audio").trim() || "audio";

      console.log("[BACKEND AUDIO] Conversion complete:", {
         inputBytes: file.size,
         outputBytes: converted.length
      });

      try {
         await fs.unlink(outputPath);
      } catch (cleanupError) {
         console.warn(`[BACKEND AUDIO] Failed to clean up temp file: ${outputPath}`, cleanupError);
      }

      const audioFile: Express.Multer.File = {
         fieldname: "audio",
         originalname: `${baseName}.mp3`,
         encoding: "7bit",
         mimetype: "audio/mpeg",
         size: converted.length,
         destination: "",
         filename: `${baseName}.mp3`,
         path: "",
         buffer: converted,
         stream: null as any
      };

      return audioFile;
   } catch (error: any) {
      console.error("[BACKEND AUDIO] Conversion error:", error);
      throw new Error(`Backend audio conversion failed: ${error.message || "Unknown error"}`);
   }
}

async function convertToMJPEG(file: Express.Multer.File, options: VideoConversionOptions = {}): Promise<void> {
   const fileSizeMB = file.size / (1024 * 1024);
   const maxSizeMB = 30;
   if (fileSizeMB > maxSizeMB) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(1)}MB. Maximum: ${maxSizeMB}MB`);
   }
   console.log("[BACKEND VIDEO] Raw options received:", options);

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
      transpose = 0,
      pixFmt = "yuvj420p",
      cropWidth = 320,
      cropHeight = 240,
      cropXOffset = "(iw-ow)/2",
      cropYOffset = "(ih-oh)/2",
      useLanczos = false
   } = options;

   const safeFps = Math.min(Number(fps), 24);
   const safeQuality = Number(quality) || 25;
   const safeCropWidth = Number(cropWidth) || 320;
   const safeCropHeight = Number(cropHeight) || 240;

   // ffmpeg has no "no rotation" transpose value (0-3 are all 90 deg rotations),
   // so 0 means "skip the filter" here rather than being passed to ffmpeg.
   const requestedTranspose = Number(transpose) || 0;
   const safeTranspose = requestedTranspose >= 1 && requestedTranspose <= 3 ? requestedTranspose : 0;

   console.log("[BACKEND VIDEO] Conversion params:", {
      fps: safeFps,
      quality: safeQuality,
      transpose: safeTranspose,
      rotates: safeTranspose !== 0,
      cropWidth: safeCropWidth,
      cropHeight: safeCropHeight
   });

   const inputPath = file.path;
   const outputPath = path.join(os.tmpdir(), `backend_out_${Date.now()}.mjpeg`);

   try {
      try {
         const inputData = await ffprobe(inputPath, { path: ffprobeStatic.path });
         const stream = inputData.streams?.[0];
         if (stream) {
            console.log("[BACKEND VIDEO] Input dimensions:", `${stream.width}x${stream.height}`);
         }
      } catch (probeError) {
         console.warn("[BACKEND VIDEO] Could not probe input dimensions:", probeError);
      }

      const filters = [`fps=${safeFps}`, `crop=${safeCropWidth}:${safeCropHeight}:${cropXOffset}:${cropYOffset}`];

      // Any transpose swaps width/height, so only apply it when a rotation was actually requested.
      if (safeTranspose !== 0) {
         filters.push(`transpose=${safeTranspose}`);
      }

      const vf = filters.join(",");
      console.log("[BACKEND VIDEO] Filter chain:", vf);

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

      console.log("[BACKEND VIDEO] FFmpeg command:", ffmpegPath, args.join(" "));

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
               console.log("[BACKEND VIDEO] FFmpeg conversion completed");
               resolve();
            } else {
               reject(new Error(`Backend FFmpeg exited with code ${code}: ${stderrData}`));
            }
         });
      });

      const converted = await fs.readFile(outputPath);
      const baseName = (file.originalname?.split(".").slice(0, -1).join(".") || "video").trim() || "video";

      try {
         const outputData = await ffprobe(outputPath, { path: ffprobeStatic.path });
         const stream = outputData.streams?.[0];
         if (stream) {
            const expectedWidth = safeTranspose === 0 ? safeCropWidth : safeCropHeight;
            const expectedHeight = safeTranspose === 0 ? safeCropHeight : safeCropWidth;
            const matches = stream.width === expectedWidth && stream.height === expectedHeight;

            console.log("[BACKEND VIDEO] Output dimensions:", {
               actual: `${stream.width}x${stream.height}`,
               expected: `${expectedWidth}x${expectedHeight}`,
               matches
            });

            if (!matches) {
               console.warn("[BACKEND VIDEO] Output does not match the requested resolution");
            }
         }
      } catch (probeError) {
         console.warn("[BACKEND VIDEO] Could not probe output dimensions:", probeError);
      }

      console.log("[BACKEND VIDEO] Conversion complete:", {
         inputBytes: file.size,
         outputBytes: converted.length
      });

      try {
         await fs.unlink(outputPath);
      } catch (cleanupError) {
         console.warn(`[BACKEND VIDEO] Failed to clean up temp file: ${outputPath}`, cleanupError);
      }

      file.buffer = converted;
      file.size = converted.length;
      file.originalname = `${baseName}.mjpeg`;
      file.mimetype = "video/x-mjpeg";
   } catch (error: any) {
      console.error("[BACKEND VIDEO] Conversion error:", error);
      throw new Error(`Backend video conversion failed: ${error.message || "Unknown error"}`);
   }
}
export { convertToMJPEG, convertToMP3, VideoConversionOptions };
