const fs = require('fs/promises');
const {
  hasVideoSignature,
  resolveVideo,
  removeVideoIfUnused,
  videoUrl,
} = require('../services/mediaService');

// ---------- @route   POST /api/media/video ----------
// ---------- @access  Private ----------
// multipart/form-data with one file in the `video` field. Returns a `key`
// the client then sends as `videoKey` when it creates the post(s).
const uploadVideo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video received. Send it in a form field named "video".',
      });
    }

    if (!(await hasVideoSignature(req.file.path, req.file.mimetype))) {
      await fs.rm(req.file.path, { force: true });
      return res.status(400).json({
        success: false,
        message: "That file doesn't look like a valid MP4, MOV or WebM video",
      });
    }

    const key = `${req.user._id}/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: 'Video uploaded successfully',
      video: {
        key,
        url: videoUrl(key),
        mimeType: req.file.mimetype,
        size: req.file.size,
        originalName: req.file.originalname,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------- @route   DELETE /api/media/video/:owner/:file ----------
// ---------- @access  Private ----------
// Lets the editor discard a video the user removed before saving. A video
// that a post already uses is kept; deleting the post releases it.
const deleteVideo = async (req, res, next) => {
  try {
    const key = `${req.params.owner}/${req.params.file}`;
    const video = await resolveVideo(req.user._id, key);

    if (!video) {
      return res
        .status(404)
        .json({ success: false, message: 'Video not found' });
    }

    const removed = await removeVideoIfUnused(key);

    res.status(200).json({
      success: true,
      removed,
      message: removed ? 'Video deleted' : 'Video is still used by a post',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadVideo, deleteVideo };
