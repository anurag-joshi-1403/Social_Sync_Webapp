const fs = require('fs/promises');
const path = require('path');
const Post = require('../models/Post');

// Local-disk video storage. Everything that knows *where* videos live is in
// this file, so moving to S3 or Cloudinary means swapping these functions and
// nothing else.

// Accepted video types and the extension each is stored under. The extension
// always comes from this table, never from the uploaded file's name.
const VIDEO_TYPES = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

const DEFAULT_MAX_VIDEO_MB = 100;

// An upload nobody attached to a post within a day is treated as abandoned.
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// `<24-hex user id>/<uuid>.<ext>`: anything else is rejected before it can
// reach the filesystem, which rules out path traversal.
const KEY_PATTERN = /^[a-f0-9]{24}\/[0-9a-f-]{36}\.(mp4|mov|webm)$/;

// Read on every call (not at load) so tests can point them elsewhere.
const uploadRoot = () =>
  path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
const videoRoot = () => path.join(uploadRoot(), 'videos');
const maxVideoBytes = () =>
  (Number(process.env.MAX_VIDEO_MB) || DEFAULT_MAX_VIDEO_MB) * 1024 * 1024;

const userVideoDir = (userId) => path.join(videoRoot(), String(userId));

// Relative on purpose: the frontend prefixes whichever API origin it talks to.
// A cloud driver would return its absolute CDN URL here instead.
const videoUrl = (key) => `/uploads/videos/${key}`;

// MP4 and MOV are ISO-BMFF files: bytes 4-7 name the first box, normally
// `ftyp`. Older QuickTime files can open with another top-level atom.
const MP4_BOXES = ['ftyp'];
const MOV_BOXES = ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'];
// WebM is Matroska, which always starts with the EBML magic number.
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

// The MIME type in a multipart upload is whatever the client says it is, so
// check the file's first bytes actually match before keeping it.
const hasVideoSignature = async (filePath, mimeType) => {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    if (bytesRead < 8) return false;

    if (mimeType === 'video/webm') {
      return header.subarray(0, 4).equals(EBML_MAGIC);
    }
    const box = header.toString('latin1', 4, 8);
    if (mimeType === 'video/mp4') return MP4_BOXES.includes(box);
    if (mimeType === 'video/quicktime') return MOV_BOXES.includes(box);
    return false;
  } finally {
    await handle.close();
  }
};

// Turns a client-supplied key into stored video metadata, or null when the key
// is malformed, belongs to another user, or the file no longer exists.
const resolveVideo = async (userId, key) => {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) return null;
  if (!key.startsWith(`${userId}/`)) return null;

  try {
    const stat = await fs.stat(path.join(videoRoot(), key));
    const ext = path.extname(key);
    const mimeType = Object.keys(VIDEO_TYPES).find((t) => VIDEO_TYPES[t] === ext);
    return { key, url: videoUrl(key), mimeType, size: stat.size };
  } catch {
    return null;
  }
};

// Deletes a stored video unless a post still uses it. One upload can back
// several posts (a cross-post shares a single file), so the file goes only
// when the last of them does.
const removeVideoIfUnused = async (key) => {
  if (!key || !KEY_PATTERN.test(key)) return false;
  if (await Post.exists({ 'video.key': key })) return false;

  await fs.rm(path.join(videoRoot(), key), { force: true });
  return true;
};

// Removes uploads that were never attached to a post (the user picked a video
// and then abandoned the editor). Run periodically by the scheduler.
const sweepOrphanVideos = async (maxAgeMs = ORPHAN_MAX_AGE_MS) => {
  let userDirs;
  try {
    userDirs = await fs.readdir(videoRoot());
  } catch {
    return 0; // nothing has been uploaded yet
  }

  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (const dir of userDirs) {
    const files = await fs.readdir(path.join(videoRoot(), dir)).catch(() => []);
    for (const file of files) {
      const key = `${dir}/${file}`;
      const stat = await fs.stat(path.join(videoRoot(), key)).catch(() => null);
      if (!stat || stat.mtimeMs > cutoff) continue;
      if (await removeVideoIfUnused(key)) removed++;
    }
  }

  if (removed > 0) {
    console.log(`🧹 Removed ${removed} unused video upload(s)`);
  }
  return removed;
};

module.exports = {
  VIDEO_TYPES,
  uploadRoot,
  maxVideoBytes,
  userVideoDir,
  videoUrl,
  hasVideoSignature,
  resolveVideo,
  removeVideoIfUnused,
  sweepOrphanVideos,
};
