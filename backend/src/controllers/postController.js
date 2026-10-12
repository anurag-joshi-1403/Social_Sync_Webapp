const mongoose = require('mongoose');
const Post = require('../models/Post');
const { resolveVideo, removeVideoIfUnused } = require('../services/mediaService');
const { publishPostsNow } = require('../services/publisherService');

const VALID_PLATFORMS = ['instagram', 'facebook', 'twitter', 'linkedin'];

// Validates the fields a single post and a cross-post share. Resolves to
// `{ error }` with a client-facing message, or `{ fields }` ready for
// Post.create — everything except `platform`.
const buildPostFields = async (req, { publishNow = false } = {}) => {
  const {
    content,
    hashtags,
    tone,
    image,
    videoKey,
    status,
    scheduledTime,
    aiGenerated,
  } = req.body;

  if (!content || !content.trim()) {
    return { error: 'Post content is required' };
  }

  // A new post can only start as a draft or a scheduled post; 'published'
  // and 'failed' are set by the publisher, never by the client.
  const requestedStatus = status || 'draft';
  if (!publishNow && !['draft', 'scheduled'].includes(requestedStatus)) {
    return { error: "status must be either 'draft' or 'scheduled'" };
  }

  let parsedSchedule = null;
  if (publishNow) {
    // Due immediately, so the future-time rule below does not apply.
    parsedSchedule = new Date();
  } else if (requestedStatus === 'scheduled') {
    if (!scheduledTime) {
      return { error: 'scheduledTime is required when status is scheduled' };
    }
    parsedSchedule = new Date(scheduledTime);
    if (isNaN(parsedSchedule.getTime())) {
      return { error: 'Invalid scheduledTime format' };
    }
    if (parsedSchedule <= new Date()) {
      return { error: 'scheduledTime must be in the future' };
    }
  }

  if (image && videoKey) {
    return { error: 'A post can have an image or a video, not both' };
  }

  // The client sends only the key from POST /api/media/video. The URL, type
  // and size are looked up here so they can't be forged, and a key that
  // belongs to another user resolves to nothing.
  let video;
  if (videoKey) {
    video = await resolveVideo(req.user._id, videoKey);
    if (!video) {
      return { error: 'Video not found. Please upload it again.' };
    }
  }

  return {
    fields: {
      user: req.user._id,
      content: content.trim(),
      hashtags: hashtags || '',
      tone: tone || 'casual',
      image: image || '',
      video,
      status: publishNow ? 'scheduled' : requestedStatus,
      scheduledTime: parsedSchedule,
      aiGenerated: Boolean(aiGenerated),
    },
  };
};

// Frees a post's video file once no post uses it any more. A failure only
// leaves a file behind, so it is logged rather than failing the request.
const releaseVideo = (post) => {
  if (!post.video?.key) return Promise.resolve();
  return removeVideoIfUnused(post.video.key).catch((error) =>
    console.error(`⚠️  Could not remove video ${post.video.key}: ${error.message}`)
  );
};

// ---------- @route   POST /api/posts ----------
// ---------- @access  Private ----------
const createPost = async (req, res, next) => {
  try {
    const { platform } = req.body;

    if (!platform) {
      return res
        .status(400)
        .json({ success: false, message: 'Platform is required' });
    }

    const { error, fields } = await buildPostFields(req);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const post = await Post.create({ ...fields, platform });

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post,
    });
  } catch (error) {
    next(error);
  }
};

// ---------- @route   POST /api/posts/multi ----------
// ---------- @access  Private ----------
// One submit, many platforms. Body is the same as POST /api/posts, except
// `platforms` (an array) replaces `platform`, and `publishNow: true` may
// replace `status`/`scheduledTime` to publish straight away.
//
// Each platform gets its own Post, linked by a shared groupId. That keeps the
// scheduler, analytics and calendar unchanged, and lets one platform fail or
// be edited without touching the others.
const createMultiPost = async (req, res, next) => {
  try {
    const { platforms } = req.body;
    const publishNow = req.body.publishNow === true;

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Choose at least one platform' });
    }

    const unique = [...new Set(platforms)];
    const unknown = unique.filter((p) => !VALID_PLATFORMS.includes(p));
    if (unknown.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Unknown platform(s): ${unknown.join(', ')}. Use: ${VALID_PLATFORMS.join(', ')}`,
      });
    }

    const { error, fields } = await buildPostFields(req, { publishNow });
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const groupId = unique.length > 1 ? new mongoose.Types.ObjectId() : null;

    // insertMany validates every document before writing any, so a bad field
    // can't leave half a cross-post behind.
    let posts = await Post.insertMany(
      unique.map((platform) => ({ ...fields, platform, groupId }))
    );

    if (publishNow) {
      posts = await publishPostsNow(posts.map((p) => p._id));
    }

    const published = posts.filter((p) => p.status === 'published').length;
    const message = publishNow
      ? `Published to ${published} of ${posts.length} platform(s)`
      : `Created ${posts.length} post(s)`;

    res.status(201).json({
      success: true,
      message,
      groupId,
      count: posts.length,
      posts,
    });
  } catch (error) {
    next(error);
  }
};

// ---------- @route   GET /api/posts ----------
// ---------- @access  Private ----------
const getPosts = async (req, res, next) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.platform) filter.platform = req.query.platform;

    // `image` holds base64 payloads — excluded here so list views stay small.
    // Clients read the full image from GET /api/posts/:id when they need it.
    const posts = await Post.find(filter)
      .select('-image')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: posts.length,
      posts,
    });
  } catch (error) {
    next(error);
  }
};

// ---------- @route   GET /api/posts/stats ----------
// ---------- @access  Private ----------
const getStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [total, scheduled, published, drafts, failed] = await Promise.all([
      Post.countDocuments({ user: userId }),
      Post.countDocuments({ user: userId, status: 'scheduled' }),
      Post.countDocuments({ user: userId, status: 'published' }),
      Post.countDocuments({ user: userId, status: 'draft' }),
      Post.countDocuments({ user: userId, status: 'failed' }),
    ]);

    res.status(200).json({
      success: true,
      stats: { total, scheduled, published, drafts, failed },
    });
  } catch (error) {
    next(error);
  }
};

// ---------- @route   GET /api/posts/:id ----------
// ---------- @access  Private ----------
const getPostById = async (req, res, next) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Post not found' });
    }

    res.status(200).json({ success: true, post });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res
        .status(404)
        .json({ success: false, message: 'Post not found' });
    }
    next(error);
  }
};

// ---------- @route   PUT /api/posts/:id ----------
// ---------- @access  Private ----------
const updatePost = async (req, res, next) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Post not found' });
    }

    // `status` is handled separately below and `engagement` is owned by the
    // publisher — neither may be set directly by a client.
    const allowed = [
      'content',
      'hashtags',
      'platform',
      'tone',
      'image',
      'scheduledTime',
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        post[field] = req.body[field];
      }
    });

    // Only these transitions are a user's to make. Reaching 'published' or
    // 'failed' is the publisher's job, so both are rejected here.
    const ALLOWED_TRANSITIONS = {
      draft: ['draft', 'scheduled'],
      scheduled: ['scheduled', 'draft'],
      failed: ['failed', 'scheduled'],
      published: ['published'],
    };

    if (req.body.status !== undefined && req.body.status !== post.status) {
      const permitted = ALLOWED_TRANSITIONS[post.status] || [];
      if (!permitted.includes(req.body.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change status from '${post.status}' to '${req.body.status}'`,
        });
      }
      post.status = req.body.status;
    }

    if (post.status === 'scheduled') {
      if (!post.scheduledTime) {
        return res.status(400).json({
          success: false,
          message: 'scheduledTime required for scheduled posts',
        });
      }
      if (new Date(post.scheduledTime) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'scheduledTime must be in the future',
        });
      }
    }

    await post.save();

    res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      post,
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res
        .status(404)
        .json({ success: false, message: 'Post not found' });
    }
    next(error);
  }
};

// ---------- @route   DELETE /api/posts/:id ----------
// ---------- @access  Private ----------
const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Post not found' });
    }

    await releaseVideo(post);

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res
        .status(404)
        .json({ success: false, message: 'Post not found' });
    }
    next(error);
  }
};

// ---------- @route   DELETE /api/posts/group/:groupId ----------
// ---------- @access  Private ----------
// Deletes every platform's copy of a cross-post.
const deletePostGroup = async (req, res, next) => {
  try {
    const filter = { groupId: req.params.groupId, user: req.user._id };
    const posts = await Post.find(filter).select('video');

    if (posts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Post group not found' });
    }

    const { deletedCount } = await Post.deleteMany(filter);

    // Every copy shares one file, so a single release covers the group.
    await releaseVideo(posts[0]);

    res.status(200).json({
      success: true,
      message: `Deleted ${deletedCount} post(s)`,
      count: deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPost,
  createMultiPost,
  getPosts,
  getStats,
  getPostById,
  updatePost,
  deletePost,
  deletePostGroup,
};