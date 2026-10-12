const express = require('express');
const router = express.Router();
const { uploadVideo, deleteVideo } = require('../controllers/mediaController');
const { uploadVideo: receiveVideo } = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimit');

// All media routes require authentication. The limiter and the upload
// middleware both key on req.user, so they run after `protect`.
router.use(protect);

router.post('/video', uploadLimiter, receiveVideo, uploadVideo);
router.delete('/video/:owner/:file', deleteVideo);

module.exports = router;
