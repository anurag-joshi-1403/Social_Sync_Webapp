const Post = require('../models/Post');

const VALID_RANGES = [7, 14, 30];

// Local-date key (YYYY-MM-DD) so buckets line up with what the user sees.
const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

// ---------- @route   GET /api/analytics?range=7|14|30 ----------
// ---------- @access  Private ----------
const getAnalytics = async (req, res, next) => {
  try {
    const range = VALID_RANGES.includes(Number(req.query.range))
      ? Number(req.query.range)
      : 30;

    const since = new Date();
    since.setDate(since.getDate() - (range - 1));
    since.setHours(0, 0, 0, 0);

    const posts = await Post.find({
      user: req.user._id,
      status: 'published',
      publishedTime: { $gte: since },
    })
      .select('-image')
      .sort({ publishedTime: 1 });

    // Pre-seed every day in the range so the chart has no gaps.
    const buckets = new Map();
    for (let i = 0; i < range; i++) {
      const date = new Date(since);
      date.setDate(since.getDate() + i);
      buckets.set(dayKey(date), {
        date: dayKey(date),
        label: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0,
      });
    }

    const totals = { likes: 0, comments: 0, shares: 0, reach: 0, engagement: 0 };
    const byPlatform = new Map();

    for (const post of posts) {
      const e = post.engagement || {};
      const likes = e.likes || 0;
      const comments = e.comments || 0;
      const shares = e.shares || 0;
      const reach = e.reach || 0;
      const engagement = likes + comments + shares;

      const bucket = buckets.get(dayKey(new Date(post.publishedTime)));
      if (bucket) {
        bucket.likes += likes;
        bucket.comments += comments;
        bucket.shares += shares;
        bucket.reach += reach;
      }

      totals.likes += likes;
      totals.comments += comments;
      totals.shares += shares;
      totals.reach += reach;
      totals.engagement += engagement;

      byPlatform.set(post.platform, (byPlatform.get(post.platform) || 0) + engagement);
    }

    // Top posts by total engagement.
    const topPosts = posts
      .map((post) => {
        const e = post.engagement || {};
        return {
          id: post._id,
          content: post.content,
          platform: post.platform,
          hasImage: post.hasImage,
          hasVideo: Boolean(post.video?.key),
          likes: e.likes || 0,
          comments: e.comments || 0,
          shares: e.shares || 0,
          reach: e.reach || 0,
          engagement: (e.likes || 0) + (e.comments || 0) + (e.shares || 0),
        };
      })
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5);

    res.status(200).json({
      success: true,
      range,
      postsTracked: posts.length,
      daily: Array.from(buckets.values()),
      totals,
      platforms: Array.from(byPlatform, ([platform, engagement]) => ({
        platformId: platform,
        value: engagement,
      })).sort((a, b) => b.value - a.value),
      topPosts,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAnalytics };
