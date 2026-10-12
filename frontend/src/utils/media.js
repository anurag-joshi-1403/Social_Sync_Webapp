import { API_BASE_URL } from '../services/api.js';

// Kept in step with the Post model's image cap and the 2mb express.json limit.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Kept in step with VIDEO_TYPES and the MAX_VIDEO_MB default in the backend's
// services/mediaService.js. The server enforces both; checking here just
// saves the user a long upload that would be refused.
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const MAX_VIDEO_MB = 100;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

// What the file picker offers.
export const MEDIA_ACCEPT = ['image/*', ...VIDEO_TYPES].join(',');

const toMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

export const mediaKind = (file) => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return null;
};

// Each returns a message for the user, or null when the file is acceptable.
export const imageProblem = (file) =>
  file.size > MAX_IMAGE_BYTES
    ? `Image is ${toMB(file.size)}MB — please choose one under 2MB.`
    : null;

export const videoProblem = (file) => {
  if (!VIDEO_TYPES.includes(file.type)) {
    return 'Only MP4, MOV and WebM videos are supported.';
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return `Video is ${toMB(file.size)}MB — please choose one under ${MAX_VIDEO_MB}MB.`;
  }
  return null;
};

export const formatBytes = (bytes) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${toMB(bytes)} MB`;
};

// The API returns stored media as a path (`/uploads/videos/...`) on its own
// origin, or as a full URL once storage moves to a CDN. Either way this gives
// something a <video src> can load from the SPA's origin.
export const resolveMediaUrl = (url, base = API_BASE_URL) =>
  url ? new URL(url, base).href : '';
