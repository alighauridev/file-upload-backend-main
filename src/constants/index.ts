import bytes from "bytes";
import { env } from "../env";

const CACHE_KEY_PREFIX = {
   users: "users"
};

const FileStatusType = {
   ACTIVE: "active",
   ARCHIVED: "archived",
   TRASHED: "trashed"
} as const;

const AvailableFileStatus = Object.values(FileStatusType);

const FileType = {
   IMAGE: "image",
   VIDEO: "video"
} as const;

const AvailableFileType = Object.values(FileType);

const GLOBAL_USER_STORAGE_LIMIT = bytes(env.USER_STORAGE_LIMIT) as number;

const VIDEO_MIME_TYPES = [
   "video/mp4",
   "video/webm",
   "video/quicktime",
   "video/x-msvideo",
   "video/x-ms-wmv",
   "video/x-matroska",
   "video/3gpp",
   "video/3gpp2",
   "video/x-flv",
   "video/x-m4v",
   "video/x-mjpeg"
];

const IMAGE_MIME_TYPES = [
   "image/jpeg",
   "image/jpg",
   "image/png",
   "image/gif",
   "image/webp",
   "image/svg+xml",
   "image/avif",
   "image/apng",
   "image/tiff",
   "image/bmp"
];

export {
   FileStatusType,
   AvailableFileStatus,
   FileType,
   AvailableFileType,
   CACHE_KEY_PREFIX,
   GLOBAL_USER_STORAGE_LIMIT,
   VIDEO_MIME_TYPES,
   IMAGE_MIME_TYPES
};
