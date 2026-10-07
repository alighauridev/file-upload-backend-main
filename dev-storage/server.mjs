import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

const root = "/data";
const token = process.env.STORAGE_TOKEN;
if (!token) throw new Error("STORAGE_TOKEN is required");

const types = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm", mjpeg: "video/x-mjpeg",
  mp3: "audio/mpeg", pdf: "application/pdf",
};

function objectFile(pathname) {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2 || parts.some((part) => part === "." || part === ".." || part.includes("/") || part.includes("\\"))) {
    return null;
  }
  return join(root, ...parts);
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Storage-Token");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.url === "/health") return res.writeHead(200).end("ok");

  let file;
  try {
    file = objectFile(new URL(req.url, "http://localhost").pathname);
  } catch {
    return res.writeHead(400).end("Invalid object path");
  }
  if (!file) return res.writeHead(400).end("Invalid object path");

  try {
    if (req.method === "GET" || req.method === "HEAD") {
      const info = await stat(file);
      res.setHeader("Content-Length", info.size);
      res.setHeader("Content-Type", types[file.split(".").pop()?.toLowerCase()] || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (req.method === "HEAD") return res.writeHead(200).end();
      return createReadStream(file).on("error", () => res.destroy()).pipe(res);
    }

    if (req.headers["x-storage-token"] !== token) return res.writeHead(401).end("Unauthorized");
    if (req.method === "PUT") {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await pipeline(req, createWriteStream(temporary));
        await rename(temporary, file);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
      return res.writeHead(201).end();
    }
    if (req.method === "DELETE") {
      await unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return res.writeHead(204).end();
    }
    res.writeHead(405).end("Method not allowed");
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.message);
  }
});

server.listen(9000, "0.0.0.0");
