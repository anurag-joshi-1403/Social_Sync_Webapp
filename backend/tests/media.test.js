const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/app');
const Post = require('../src/models/Post');
const { sweepOrphanVideos, uploadRoot } = require('../src/services/mediaService');
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

// The smallest bytes that pass the MP4 signature check: a box size, then `ftyp`.
const fakeMp4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.alloc(64),
]);

const upload = (token, body = fakeMp4, options = {}) =>
  request(app)
    .post('/api/media/video')
    .set('Authorization', `Bearer ${token}`)
    .attach('video', body, {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      ...options,
    });

const storedPath = (key) => path.join(uploadRoot(), 'videos', key);

describe('POST /api/media/video', () => {
  it('stores a video under the uploader and returns its key', async () => {
    const token = await signUp('a@example.com');

    const res = await upload(token);

    expect(res.status).toBe(201);
    expect(res.body.video.key).toMatch(/^[a-f0-9]{24}\/[0-9a-f-]{36}\.mp4$/);
    expect(res.body.video.url).toBe(`/uploads/videos/${res.body.video.key}`);
    expect(res.body.video.size).toBe(fakeMp4.length);
    expect(fs.existsSync(storedPath(res.body.video.key))).toBe(true);
  });

  it('serves the stored video cross-origin so the SPA can play it', async () => {
    const token = await signUp('a@example.com');
    const { body } = await upload(token);

    const res = await request(app).get(body.video.url);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/video\/mp4/);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/media/video')
      .attach('video', fakeMp4, { filename: 'clip.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(401);
  });

  it('rejects a file that is not a supported video type', async () => {
    const token = await signUp('a@example.com');

    const res = await upload(token, Buffer.from('hello'), {
      filename: 'notes.txt',
      contentType: 'text/plain',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/MP4, MOV and WebM/);
  });

  it('rejects and deletes a file whose bytes are not really a video', async () => {
    const token = await signUp('a@example.com');

    const res = await upload(token, Buffer.from('<script>alert(1)</script>'));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid/i);
    // Nothing of the spoofed upload is left on disk.
    const userDirs = fs.existsSync(path.join(uploadRoot(), 'videos'))
      ? fs.readdirSync(path.join(uploadRoot(), 'videos'))
      : [];
    const files = userDirs.flatMap((d) =>
      fs.readdirSync(path.join(uploadRoot(), 'videos', d))
    );
    expect(files).toHaveLength(0);
  });

  it('rejects a video over the size limit with 413', async () => {
    const token = await signUp('a@example.com');
    // MAX_VIDEO_MB is 1 in the test environment.
    const tooBig = Buffer.concat([fakeMp4, Buffer.alloc(1.5 * 1024 * 1024)]);

    const res = await upload(token, tooBig);

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/too large/i);
  });

  it('rejects a request with no file', async () => {
    const token = await signUp('a@example.com');

    const res = await request(app)
      .post('/api/media/video')
      .set('Authorization', `Bearer ${token}`)
      .field('note', 'no file here');

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/media/video/:owner/:file', () => {
  it('lets the owner discard an upload no post uses', async () => {
    const token = await signUp('a@example.com');
    const { body } = await upload(token);

    const res = await request(app)
      .delete(`/api/media/video/${body.video.key}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
    expect(fs.existsSync(storedPath(body.video.key))).toBe(false);
  });

  it("returns 404 for another user's video and leaves it alone", async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    const { body } = await upload(alice);

    const res = await request(app)
      .delete(`/api/media/video/${body.video.key}`)
      .set('Authorization', `Bearer ${bob}`);

    expect(res.status).toBe(404);
    expect(fs.existsSync(storedPath(body.video.key))).toBe(true);
  });

  it('keeps a video that a post still uses', async () => {
    const token = await signUp('a@example.com');
    const { body } = await upload(token);
    await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'With video', platform: 'instagram', videoKey: body.video.key });

    const res = await request(app)
      .delete(`/api/media/video/${body.video.key}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.removed).toBe(false);
    expect(fs.existsSync(storedPath(body.video.key))).toBe(true);
  });
});

describe('sweepOrphanVideos', () => {
  const backdate = (key) => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(storedPath(key), old, old);
  };

  it('removes old uploads no post uses and keeps attached or fresh ones', async () => {
    const token = await signUp('a@example.com');
    const orphan = (await upload(token)).body.video.key;
    const attached = (await upload(token)).body.video.key;
    const fresh = (await upload(token)).body.video.key;

    await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Uses a video', platform: 'instagram', videoKey: attached });
    backdate(orphan);
    backdate(attached);

    const removed = await sweepOrphanVideos();

    expect(removed).toBe(1);
    expect(fs.existsSync(storedPath(orphan))).toBe(false);
    expect(fs.existsSync(storedPath(attached))).toBe(true);
    expect(fs.existsSync(storedPath(fresh))).toBe(true);
    expect(await Post.countDocuments()).toBe(1);
  });
});
