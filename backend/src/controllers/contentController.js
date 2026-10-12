const { generateContent } = require('../services/openaiService');

// 'all' asks for one caption that works on every network, for cross-posts.
const VALID_PLATFORMS = ['instagram', 'facebook', 'twitter', 'linkedin', 'all'];
const VALID_TONES = ['casual', 'professional', 'promotional', 'inspirational', 'humorous'];

// ---------- @route   POST /api/content/generate ----------
// ---------- @access  Private ----------
const generate = async (req, res, next) => {
  try {
    const { topic, platform, tone } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Topic is required',
      });
    }

    if (topic.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Topic must be at least 5 characters',
      });
    }

    const safePlatform = VALID_PLATFORMS.includes(platform)
      ? platform
      : 'instagram';

    const safeTone = VALID_TONES.includes(tone) ? tone : 'casual';

    const options = await generateContent({
      topic: topic.trim(),
      platform: safePlatform,
      tone: safeTone,
    });

    res.status(200).json({
      success: true,
      count: options.length,
      options,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { generate };