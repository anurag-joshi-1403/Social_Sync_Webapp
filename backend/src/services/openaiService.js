const OpenAI = require('openai');

// Lazy-init: only create the client if a key is present
let client = null;

const getClient = () => {
  // Use GEMINI_API_KEY from your .env file
  if (!process.env.GEMINI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  }
  return client;
};

// ---------- Tone presets ----------
const TONE_INSTRUCTIONS = {
  casual: 'Write in a friendly, relaxed, conversational tone. Use emojis sparingly.',
  professional: 'Write in a polished, professional, business-appropriate tone. Avoid slang.',
  promotional: 'Write persuasively to drive action. Use urgency and benefit-driven language.',
  inspirational: 'Write in an uplifting, motivational tone that inspires the reader.',
  humorous: 'Write with light, witty humor. Keep it playful but not offensive.',
};

const PLATFORM_HINTS = {
  instagram: 'Instagram caption, max 2200 characters, heavy on hashtags and emojis.',
  facebook: 'Facebook post, conversational, 1-2 short paragraphs.',
  twitter: 'Tweet, max 280 characters, punchy and scannable.',
  linkedin: 'LinkedIn post, professional, insightful, 3-5 short paragraphs.',
  // A cross-post goes out unchanged everywhere, so it has to fit X's limit.
  all: 'One caption posted unchanged to several networks (Instagram, Facebook, X, LinkedIn). Keep caption plus hashtags under 280 characters and avoid platform-specific phrasing.',
};

const targetLabel = (platform) =>
  platform === 'all' ? 'cross-platform' : platform;

// ---------- Fallback content (no API key or API error) ----------
const buildFallbackOptions = ({ topic, platform, tone }) => {
  const fallbackCaptions = {
    casual: [
      `Hey! Just wanted to share — ${topic}. Come check it out! ✨`,
      `${topic}. So excited to share this with you all! 🎉`,
      `Real talk: ${topic}. You don't want to miss this. 💫`,
    ],
    professional: [
      `We're pleased to announce: ${topic}. Learn more at the link below.`,
      `Exciting update — ${topic}. We look forward to sharing more.`,
      `${topic}. Our team is committed to delivering excellence.`,
    ],
    promotional: [
      `🔥 Limited time! ${topic}. Don't wait — grab yours today!`,
      `${topic}. Special offer just dropped — shop now!`,
      `Big news: ${topic}. Tap to shop and save this week only.`,
    ],
    inspirational: [
      `Believe in yourself. ${topic}. Small steps lead to big change. ✨`,
      `Progress, not perfection. ${topic}. Keep going — you've got this.`,
      `Dream big. ${topic}. Every journey starts with a single step.`,
    ],
    humorous: [
      `Warning: ${topic} may cause extreme happiness. Proceed with caution 😄`,
      `Adulting is hard. But ${topic}? That's easy.`,
      `${topic}. Because why not? Life's too short for boring.`,
    ],
  };

  const platformTags = {
    instagram: ['#InstaGood', '#Explore', '#Viral', '#Trending', '#InstaDaily'],
    facebook: ['#Facebook', '#Community', '#Trending', '#Discover', '#FollowUs'],
    twitter: ['#NowTrending', '#X', '#Trending', '#News', '#Viral'],
    linkedin: ['#LinkedIn', '#Career', '#Professional', '#Growth', '#Networking'],
    all: ['#Trending', '#Community', '#Discover'],
  };

  const topicTags = (topic || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 2)
    .map((w) => `#${w.replace(/[^a-z0-9]/g, '')}`)
    .filter((h) => h.length > 3);

  const tags = [...topicTags, ...(platformTags[platform] || platformTags.instagram)]
    .slice(0, 6)
    .join(' ');

  const templates = fallbackCaptions[tone] || fallbackCaptions.casual;
  return templates.map((caption, i) => ({
    id: `opt-fallback-${Date.now()}-${i}`,
    caption,
    hashtags: tags,
  }));
};

// ---------- Main generation function ----------
const generateContent = async ({ topic, platform, tone }) => {
  const ai = getClient();

  // If no API key, return fallback
  if (!ai) {
    console.warn('⚠️  No GEMINI_API_KEY set — using fallback content');
    return buildFallbackOptions({ topic, platform, tone });
  }

  const toneHint = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.casual;
  const platformHint = PLATFORM_HINTS[platform] || PLATFORM_HINTS.instagram;

  const systemPrompt = `You are a social media copywriter. You write engaging, high-quality posts that drive engagement.
${toneHint}
Target platform: ${targetLabel(platform)}. ${platformHint}
Always end with relevant hashtags (${platform === 'all' ? '3-4' : '5-7'} total).`;

  const userPrompt = `Generate 3 different caption options for a ${targetLabel(platform)} post about: "${topic}".
Tone: ${tone}.
Return ONLY valid JSON in this exact format (no markdown fences, no extra text):
{
  "options": [
    { "caption": "first option text", "hashtags": "#tag1 #tag2 #tag3" },
    { "caption": "second option text", "hashtags": "#tag1 #tag2 #tag3" },
    { "caption": "third option text", "hashtags": "#tag1 #tag2 #tag3" }
  ]
}`;

  try {
    const completion = await ai.chat.completions.create({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 800,
    });

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);

    if (!parsed.options || !Array.isArray(parsed.options)) {
      throw new Error('Invalid response shape from Gemini');
    }

    return parsed.options.map((opt, i) => ({
      id: `opt-${Date.now()}-${i}`,
      caption: opt.caption || '',
      hashtags: opt.hashtags || '',
    }));
  } catch (error) {
    console.error('Gemini error:', error.message);
    // Graceful fallback so the app never breaks
    return buildFallbackOptions({ topic, platform, tone });
  }
};

module.exports = { generateContent };