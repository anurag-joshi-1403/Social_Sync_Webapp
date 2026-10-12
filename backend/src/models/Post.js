const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Post content is required'],
      trim: true,
      maxlength: [2200, 'Post content too long'], // Twitter's limit
    },
    hashtags: {
      type: String,
      default: '',
    },
    platform: {
      type: String,
      required: true,
      enum: ['instagram', 'facebook', 'twitter', 'linkedin'],
    },
    tone: {
      type: String,
      enum: ['casual', 'professional', 'promotional', 'inspirational', 'humorous'],
      default: 'casual',
    },
    image: {
      type: String, // base64 data URL or remote URL
      default: '',
      // ~2MB of base64 ≈ 2.8M characters. Keeps a single document well clear
      // of MongoDB's 16MB ceiling and matches the express.json body limit.
      maxlength: [2_800_000, 'Image is too large (2MB maximum)'],
    },
    // Lets list endpoints project `image` out while the UI still knows whether
    // to show a thumbnail placeholder.
    hasImage: {
      type: Boolean,
      default: false,
    },
    // Videos are too big for the document, so the file lives in storage (see
    // services/mediaService.js) and the post keeps a reference. Several posts
    // may share one key: a cross-post uploads the video once.
    video: {
      key: { type: String, default: '' },
      url: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      size: { type: Number, default: 0 },
    },
    // Shared by the per-platform copies created from one cross-post submit.
    // Null for a post that went to a single platform.
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    status: {
      type: String,
      // 'publishing' is a short-lived lock the scheduler claims a post with.
      enum: ['draft', 'scheduled', 'publishing', 'published', 'failed'],
      default: 'draft',
      index: true,
    },
    scheduledTime: {
      type: Date,
      default: null,
      index: true,
    },
    publishedTime: {
      type: Date,
      default: null,
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    engagement: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
    },
    failureReason: {
      type: String,
      default: '',
    },
    platformPostId: {
      type: String, // ID returned by platform after publishing
      default: '',
    },
  },
  { timestamps: true }
);

// Compound index for scheduler: find due posts fast
postSchema.index({ status: 1, scheduledTime: 1 });

// Platforms take one kind of media per post, so an image and a video together
// is refused rather than one silently winning.
postSchema.pre('validate', function (next) {
  if (this.image && this.video?.key) {
    this.invalidate('video', 'A post can have an image or a video, not both');
  }
  next();
});

// Keep `hasImage` in step with `image` however the document was modified.
postSchema.pre('save', function (next) {
  if (this.isModified('image')) {
    this.hasImage = Boolean(this.image);
  }
  next();
});

module.exports = mongoose.model('Post', postSchema);