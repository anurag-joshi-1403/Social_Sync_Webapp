const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/app');
const Post = require('../src/models/Post');
const { uploadRoot } = require('../src/services/mediaService');
const { connect, clear, disconnect } = require('./setup');

beforeAll(connect);
afterEach(async () => {
  await clear();
  fs.rmSync(uploadRoot(), { recursive: true, force: true });
});
afterAll(disconnect);

const signUp = async (email) => {
  const { body } = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'secret123' });
  return body.token;
};

const connectAccount = (token, platform) =>
  request(app)
    .post('/api/accounts/connect')
    .set('Authorization', `Bearer ${token}`)
    .send({ platform, username: 'demo', accessToken: 'token' });

const fakeMp4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.alloc(64),
]);

const uploadVideo = async (token) => {
  const { body } = await request(app)
    .post('/api/media/video')
    .set('Authorization', `Bearer ${token}`)
    .attach('video', fakeMp4, { filename: 'clip.mp4', contentType: 'video/mp4' });
  return body.video.key;
};

const multi = (token, body) =>
  request(app)
    .post('/api/posts/multi')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

const futureISO = (minutes = 60) =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();

const base = { content: 'Launch day!', hashtags: '#launch' };

describe('POST /api/posts/multi', () => {
  it('creates one post per platform, linked by a shared groupId', async () => {
    const token = await signUp('a@example.com');

    const res = await multi(token, {
      ...base,
      platforms: ['instagram', 'twitter', 'linkedin'],
      status: 'scheduled',
      scheduledTime: futureISO(),
    });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(3);
    expect(res.body.posts.map((p) => p.platform).sort()).toEqual([
      'instagram',
      'linkedin',
      'twitter',
    ]);
    expect(res.body.groupId).toBeTruthy();
    expect(res.body.posts.every((p) => p.groupId === res.body.groupId)).toBe(true);
    expect(res.body.posts.every((p) => p.status === 'scheduled')).toBe(true);
    // All copies share one scheduled time, so they publish on the same tick.
    expect(new Set(res.body.posts.map((p) => p.scheduledTime)).size).toBe(1);
  });

  it('leaves groupId empty when only one platform is chosen', async () => {
    const token = await signUp('a@example.com');

    const res = await multi(token, { ...base, platforms: ['facebook'] });

    expect(res.status).toBe(201);
    expect(res.body.groupId).toBeNull();
    expect(res.body.posts[0].status).toBe('draft');
  });

  it('creates one post per platform even if a platform is repeated', async () => {
    const token = await signUp('a@example.com');

    const res = await multi(token, {
      ...base,
      platforms: ['instagram', 'instagram', 'facebook'],
    });

    expect(res.body.count).toBe(2);
  });

  it('rejects an empty or unknown platform list without creating anything', async () => {
    const token = await signUp('a@example.com');

    const empty = await multi(token, { ...base, platforms: [] });
    const unknown = await multi(token, { ...base, platforms: ['instagram', 'myspace'] });

    expect(empty.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toMatch(/myspace/);
    expect(await Post.countDocuments()).toBe(0);
  });

  it('applies the single-post rules: no past schedules, no client-set published', async () => {
    const token = await signUp('a@example.com');

    const past = await multi(token, {
      ...base,
      platforms: ['instagram', 'facebook'],
      status: 'scheduled',
      scheduledTime: new Date(Date.now() - 60_000).toISOString(),
    });
    const published = await multi(token, {
      ...base,
      platforms: ['instagram'],
      status: 'published',
    });

    expect(past.status).toBe(400);
    expect(past.body.message).toMatch(/future/i);
    expect(published.status).toBe(400);
    expect(await Post.countDocuments()).toBe(0);
  });
});

describe('cross-posting a video', () => {
  it('attaches one uploaded video to every platform copy', async () => {
    const token = await signUp('a@example.com');
    const videoKey = await uploadVideo(token);

    const res = await multi(token, {
      ...base,
      platforms: ['instagram', 'facebook'],
      videoKey,
    });

    expect(res.status).toBe(201);
    for (const post of res.body.posts) {
      expect(post.video.key).toBe(videoKey);
      expect(post.video.url).toBe(`/uploads/videos/${videoKey}`);
      expect(post.video.mimeType).toBe('video/mp4');
      expect(post.video.size).toBe(fakeMp4.length);
    }
  });

  it("refuses another user's video", async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    const aliceVideo = await uploadVideo(alice);

    const res = await multi(bob, {
      ...base,
      platforms: ['instagram'],
      videoKey: aliceVideo,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/video not found/i);
    expect(await Post.countDocuments()).toBe(0);
  });

  it('refuses a key that tries to escape the upload folder', async () => {
    const token = await signUp('a@example.com');

    const res = await multi(token, {
      ...base,
      platforms: ['instagram'],
      videoKey: '../../../.env',
    });

    expect(res.status).toBe(400);
  });

  it('refuses an image and a video on the same post', async () => {
    const token = await signUp('a@example.com');
    const videoKey = await uploadVideo(token);

    const res = await multi(token, {
      ...base,
      platforms: ['instagram'],
      image: 'data:image/png;base64,AAAA',
      videoKey,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/image or a video/i);
  });

  it('also works through the single-post endpoint', async () => {
    const token = await signUp('a@example.com');
    const videoKey = await uploadVideo(token);

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, platform: 'twitter', videoKey });

    expect(res.status).toBe(201);
    expect(res.body.post.video.key).toBe(videoKey);
  });
});

describe('publishNow', () => {
  it('publishes every connected platform at once and reports the rest as failed', async () => {
    const token = await signUp('a@example.com');
    await connectAccount(token, 'instagram');
    await connectAccount(token, 'twitter');

    const res = await multi(token, {
      ...base,
      platforms: ['instagram', 'twitter', 'linkedin'],
      publishNow: true,
    });

    expect(res.status).toBe(201);
    const byPlatform = Object.fromEntries(res.body.posts.map((p) => [p.platform, p]));
    expect(byPlatform.instagram.status).toBe('published');
    expect(byPlatform.twitter.status).toBe('published');
    expect(byPlatform.linkedin.status).toBe('failed');
    expect(byPlatform.linkedin.failureReason).toMatch(/no connected linkedin/i);
    expect(res.body.message).toMatch(/2 of 3/);
  });

  it('ignores a past scheduledTime, since the post goes out now', async () => {
    const token = await signUp('a@example.com');
    await connectAccount(token, 'facebook');

    const res = await multi(token, {
      ...base,
      platforms: ['facebook'],
      publishNow: true,
      scheduledTime: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.posts[0].status).toBe('published');
  });
});

describe('deleting cross-posts', () => {
  it('keeps the shared video until the last copy is deleted', async () => {
    const token = await signUp('a@example.com');
    const videoKey = await uploadVideo(token);
    const file = path.join(uploadRoot(), 'videos', videoKey);
    const { body } = await multi(token, {
      ...base,
      platforms: ['instagram', 'facebook'],
      videoKey,
    });
    const [first, second] = body.posts;

    await request(app)
      .delete(`/api/posts/${first._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(fs.existsSync(file)).toBe(true);

    await request(app)
      .delete(`/api/posts/${second._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('deletes every copy, and the video, through the group route', async () => {
    const token = await signUp('a@example.com');
    const videoKey = await uploadVideo(token);
    const { body } = await multi(token, {
      ...base,
      platforms: ['instagram', 'facebook', 'linkedin'],
      videoKey,
    });

    const res = await request(app)
      .delete(`/api/posts/group/${body.groupId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(await Post.countDocuments()).toBe(0);
    expect(fs.existsSync(path.join(uploadRoot(), 'videos', videoKey))).toBe(false);
  });

  it("will not delete another user's group", async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    const { body } = await multi(alice, {
      ...base,
      platforms: ['instagram', 'facebook'],
    });

    const res = await request(app)
      .delete(`/api/posts/group/${body.groupId}`)
      .set('Authorization', `Bearer ${bob}`);

    expect(res.status).toBe(404);
    expect(await Post.countDocuments()).toBe(2);
  });
});
