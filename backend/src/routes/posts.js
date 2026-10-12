const express = require('express');
const router = express.Router();
const {
  createPost,
  createMultiPost,
  getPosts,
  getStats,
  getPostById,
  updatePost,
  deletePost,
  deletePostGroup,
} = require('../controllers/postController');
const { protect } = require('../middleware/auth');

// All post routes require authentication
router.use(protect);

// IMPORTANT: fixed paths (/stats, /multi, /group) must be BEFORE /:id
router.get('/stats', getStats);
router.post('/multi', createMultiPost);
router.delete('/group/:groupId', deletePostGroup);

router.route('/')
  .get(getPosts)
  .post(createPost);

router.route('/:id')
  .get(getPostById)
  .put(updatePost)
  .delete(deletePost);

module.exports = router;