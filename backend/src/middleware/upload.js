const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const {
  VIDEO_TYPES,
  maxVideoBytes,
  userVideoDir,
} = require('../services/mediaService');

const storage = multer.diskStorage({
  // One folder per user, so a stored key always names its owner.
  destination: (req, file, cb) => {
    const dir = userVideoDir(req.user._id);
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  // A random name: the original file name is never trusted or reused.
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${VIDEO_TYPES[file.mimetype]}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (VIDEO_TYPES[file.mimetype]) return cb(null, true);
  const error = new Error('Only MP4, MOV and WebM videos are supported');
  error.statusCode = 400;
  cb(error);
};

// Accepts one file in the `video` field. Mount this AFTER `protect`, because
// the storage folder is keyed on req.user. Multer deletes any partly written
// file itself when an upload is rejected.
const uploadVideo = (req, res, next) => {
  const limit = maxVideoBytes();

  multer({ storage, fileFilter, limits: { fileSize: limit, files: 1 } }).single(
    'video'
  )(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Video is too large (${Math.round(limit / (1024 * 1024))}MB maximum)`
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Send one video in a form field named "video"'
            : err.message;
      return res.status(status).json({ success: false, message });
    }
    next(err);
  });
};

module.exports = { uploadVideo };
