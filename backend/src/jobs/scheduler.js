const cron = require('node-cron');
const {
  publishDuePosts,
  releaseStaleClaims,
} = require('../services/publisherService');
const { sweepOrphanVideos } = require('../services/mediaService');

let task = null;
let sweepTask = null;
let running = false;

function startScheduler() {
  if (task) return task; // avoid double-start

  // Recover anything a previous process left mid-publish.
  releaseStaleClaims().catch((error) =>
    console.error('❌ Stale claim sweep failed:', error.message)
  );

  task = cron.schedule(
    '* * * * *',
    async () => {
      // A slow run must not overlap the next tick.
      if (running) {
        console.log('⏰ Previous scheduler run still in progress — skipping tick');
        return;
      }
      running = true;
      try {
        await publishDuePosts();
      } catch (error) {
        console.error('❌ Scheduler error:', error.message);
      } finally {
        running = false;
      }
    },
    {
      scheduled: true,
      recoverMissedExecutions: false, // ← stops the "missed execution" warnings
    }
  );

  // Hourly: delete video uploads that were never attached to a post.
  sweepTask = cron.schedule('0 * * * *', () =>
    sweepOrphanVideos().catch((error) =>
      console.error('❌ Video sweep failed:', error.message)
    )
  );

  console.log('⏰ Scheduler started — checking every minute for due posts');
  return task;
}

function stopScheduler() {
  if (task) {
    task.stop();
    task = null;
    sweepTask?.stop();
    sweepTask = null;
    console.log('⏰ Scheduler stopped');
  }
}

module.exports = { startScheduler, stopScheduler };