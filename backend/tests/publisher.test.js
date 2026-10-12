const mongoose = require('mongoose');

const Post = require('../src/models/Post');
const SocialAccount = require('../src/models/SocialAccount');
const {
  publishDuePosts,
  publishPostsNow,
  releaseStaleClaims,
} = require('../src/services/publisherService');
const { connect, clear, disconnect } = require('./setup');

beforeAll(connect);
afterEach(clear);
afterAll(disconnect);

const userId = () => new mongoose.Types.ObjectId();

const duePost = (user, overrides = {}) =>
  Post.create({
    user,
    content: 'Due post',
    platform: 'instagram',
    status: 'scheduled',
    scheduledTime: new Date(Date.now() - 60_000),
    ...overrides,
  });

describe('publishDuePosts', () => {
  it('publishes a due post when the platform account is connected', async () => {
    const user = userId();
    await SocialAccount.create({
      user,
      platform: 'instagram',
      username: 'demo',
      accessToken: 'token',
    });
    const post = await duePost(user);

    const result = await publishDuePosts();

    expect(result.published).toBe(1);
    const saved = await Post.findById(post._id);
    expect(saved.status).toBe('published');
    expect(saved.publishedTime).toBeTruthy();
  });

  it('marks a post failed when no account is connected', async () => {
    const post = await duePost(userId());

    const result = await publishDuePosts();

    expect(result.failed).toBe(1);
    const saved = await Post.findById(post._id);
    expect(saved.status).toBe('failed');
    expect(saved.failureReason).toMatch(/no connected instagram account/i);
  });

  it('leaves a post that is not yet due alone', async () => {
    const user = userId();
    await SocialAccount.create({
      user,
      platform: 'instagram',
      username: 'demo',
      accessToken: 'token',
    });
    const post = await duePost(user, {
      scheduledTime: new Date(Date.now() + 60 * 60 * 1000),
    });

    await publishDuePosts();

    expect((await Post.findById(post._id)).status).toBe('scheduled');
  });

  // The atomic claim is what makes a second server instance safe.
  it('publishes a post exactly once when two runs overlap', async () => {
    const user = userId();
    await SocialAccount.create({
      user,
      platform: 'instagram',
      username: 'demo',
      accessToken: 'token',
    });
    const post = await duePost(user);

    const [first, second] = await Promise.all([
      publishDuePosts(),
      publishDuePosts(),
    ]);

    // One run claims and publishes it; the other finds nothing left to claim.
    expect(first.published + second.published).toBe(1);
    expect(first.skipped + second.skipped).toBe(1);

    const saved = await Post.findById(post._id);
    expect(saved.status).toBe('published');
  });
});

describe('publishPostsNow', () => {
  // "Publish now" and a scheduler tick can land at the same moment.
  it('never publishes a post twice when racing the scheduler', async () => {
    const user = userId();
    await SocialAccount.create({
      user,
      platform: 'instagram',
      username: 'demo',
      accessToken: 'token',
    });
    const post = await duePost(user);

    // Count the claims that succeed: each one is a publish.
    const findOneAndUpdate = Post.findOneAndUpdate.bind(Post);
    let claims = 0;
    const spy = vi
      .spyOn(Post, 'findOneAndUpdate')
      .mockImplementation(async (...args) => {
        const doc = await findOneAndUpdate(...args);
        if (doc) claims++;
        return doc;
      });

    try {
      await Promise.all([publishPostsNow([post._id]), publishDuePosts()]);
    } finally {
      spy.mockRestore();
    }

    expect(claims).toBe(1);
    expect((await Post.findById(post._id)).status).toBe('published');
  });
});

describe('releaseStaleClaims', () => {
  it('returns a long-abandoned publishing post to scheduled', async () => {
    const post = await duePost(userId(), { status: 'publishing' });
    // Backdate updatedAt past the 10-minute staleness window.
    await Post.collection.updateOne(
      { _id: post._id },
      { $set: { updatedAt: new Date(Date.now() - 20 * 60 * 1000) } }
    );

    const released = await releaseStaleClaims();

    expect(released).toBe(1);
    expect((await Post.findById(post._id)).status).toBe('scheduled');
  });

  it('leaves a freshly claimed post alone', async () => {
    const post = await duePost(userId(), { status: 'publishing' });

    await releaseStaleClaims();

    expect((await Post.findById(post._id)).status).toBe('publishing');
  });
});
