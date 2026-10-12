const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// A post claimed for publishing but never finished (process killed mid-run)
// is released back to 'scheduled' after this long.
const STALE_CLAIM_MS = 10 * 60 * 1000;

const publishPost = async (post) => {
  try {
    const account = await SocialAccount.findOne({
      user: post.user,
      platform: post.platform,
    });

    if (!account) {
      post.status = 'failed';
      post.failureReason = `No connected ${post.platform} account`;
      await post.save();
      console.log(`   ❌ Failed: no ${post.platform} account connected`);
      return { success: false, reason: 'no account' };
    }

    await new Promise((resolve) => setTimeout(resolve, randomInt(100, 400)));

    const mockPlatformPostId = `mock-${post.platform}-${Date.now()}`;
    const mockEngagement = {
      likes: randomInt(5, 80),
      comments: randomInt(0, 15),
      shares: randomInt(0, 10),
      reach: randomInt(100, 800),
    };

    post.status = 'published';
    post.publishedTime = new Date();
    post.platformPostId = mockPlatformPostId;
    post.engagement = mockEngagement;
    post.failureReason = '';
    await post.save();

    console.log(`   ✅ Published to ${post.platform} (id: ${mockPlatformPostId})`);
    return { success: true, post };
  } catch (error) {
    console.error(`   ⚠️  Publish error: ${error.message}`);
    post.status = 'failed';
    post.failureReason = error.message;
    await post.save();
    return { success: false, reason: error.message };
  }
};

// Atomic claim: whoever flips 'scheduled' → 'publishing' owns the post. A
// concurrent tick, a second instance or a "Publish now" request racing the
// scheduler gets null and moves on, so a post is never published twice.
const claimPost = (_id) =>
  Post.findOneAndUpdate(
    { _id, status: 'scheduled' },
    { $set: { status: 'publishing' } },
    { new: true }
  );

// "Publish now": publishes the given posts immediately rather than waiting for
// the next tick. The platforms of a cross-post go out in parallel, so one
// slow platform does not hold up the others. Resolves to the posts in their
// final state, in the order of `ids`.
const publishPostsNow = (ids) =>
  Promise.all(
    ids.map(async (_id) => {
      const post = await claimPost(_id);
      // The scheduler claimed it first; report whatever state it is in now.
      if (!post) return Post.findById(_id);
      await publishPost(post);
      return post;
    })
  );

// Returns 'scheduled' to any post left mid-claim by a crashed or restarted run.
const releaseStaleClaims = async () => {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS);
  const { modifiedCount } = await Post.updateMany(
    { status: 'publishing', updatedAt: { $lte: cutoff } },
    { $set: { status: 'scheduled' } }
  );

  if (modifiedCount > 0) {
    console.log(`⏰ Released ${modifiedCount} stale publishing claim(s)`);
  }
  return modifiedCount;
};

const publishDuePosts = async () => {
  const now = new Date();

  const dueIds = await Post.find({
    status: 'scheduled',
    scheduledTime: { $lte: now },
  })
    .select('_id')
    .limit(50)
    .lean();

  if (dueIds.length === 0) return { published: 0, failed: 0, skipped: 0 };

  console.log(`\n⏰ Scheduler: ${dueIds.length} post(s) due`);

  let published = 0;
  let failed = 0;
  let skipped = 0;

  for (const { _id } of dueIds) {
    const post = await claimPost(_id);

    if (!post) {
      skipped++;
      continue;
    }

    console.log(`   → Publishing post ${post._id} (${post.platform})`);
    const result = await publishPost(post);
    if (result.success) published++;
    else failed++;
  }

  console.log(
    `⏰ Scheduler done: ${published} published, ${failed} failed, ${skipped} claimed elsewhere\n`
  );
  return { published, failed, skipped };
};

module.exports = {
  publishPost,
  publishDuePosts,
  publishPostsNow,
  releaseStaleClaims,
};
