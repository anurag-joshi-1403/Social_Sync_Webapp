import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { usePosts } from '../../context/PostsContext.jsx';
import { useAccounts } from '../../context/AccountsContext.jsx';
import { PLATFORMS } from '../../constants/platforms.js';
import { contentService } from '../../services/contentService.js';
import { minScheduleValue, fromLocalInputValue } from '../../utils/datetime.js';
import { resolveMediaUrl } from '../../utils/media.js';
import ContentOptionCard from './ContentOptionCard.jsx';
import MediaPicker from './MediaPicker.jsx';
import { useMediaAttachment } from './useMediaAttachment.js';

const platformName = (id) => PLATFORMS.find((p) => p.id === id)?.name || id;
const platformNames = (posts) => posts.map((p) => platformName(p.platform)).join(', ');

const PostEditor = () => {
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      topic: '',
      tone: 'casual',
    },
  });

  const navigate = useNavigate();
  const { accounts } = useAccounts();
  const { addPosts } = usePosts();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [finalCaption, setFinalCaption] = useState('');
  const [finalHashtags, setFinalHashtags] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  // null until the user touches the platform picker.
  const [picked, setPicked] = useState(null);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setErrorMsg('');
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  const showError = (msg) => {
    setErrorMsg(msg);
    setSuccessMsg('');
    setTimeout(() => setErrorMsg(''), 4000);
  };

  const media = useMediaAttachment({ onError: showError });

  const topicValue = watch('topic');

  // ---------- Platforms ----------
  // Only connected platforms can be chosen. Until the user picks, the first
  // connected one is selected, as the old single-platform dropdown did. A
  // platform disconnected meanwhile drops out of the selection on its own.
  const connected = PLATFORMS.filter((p) =>
    accounts.some((a) => a.platform === p.id)
  );
  const chosen =
    picked === null
      ? connected.slice(0, 1).map((p) => p.id)
      : picked.filter((id) => connected.some((p) => p.id === id));
  const chosenPlatforms = connected.filter((p) => chosen.includes(p.id));
  const allChosen = connected.length > 0 && chosen.length === connected.length;

  const togglePlatform = (id) =>
    setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  const toggleAll = () => setPicked(allChosen ? [] : connected.map((p) => p.id));

  // What the platform will count: the caption, a space, then the hashtags.
  const postLength =
    finalCaption.length + (finalHashtags.trim() ? finalHashtags.trim().length + 1 : 0);
  const tooLongFor = chosenPlatforms.filter((p) => postLength > p.maxChars);

  // ---------- AI Generation ----------
  const onGenerate = async (data) => {
    if (chosen.length === 0) {
      showError('Choose at least one platform.');
      return;
    }
    setLoading(true);
    setOptions([]);
    setSelectedOption(null);
    setFinalCaption('');
    setFinalHashtags('');
    try {
      const result = await contentService.generate({
        topic: data.topic,
        // 'all' asks for one caption that fits every network.
        platform: chosen.length > 1 ? 'all' : chosen[0],
        tone: data.tone,
      });
      setOptions(result.options);
    } catch (err) {
      console.error(err);
      showError(err.message || 'Failed to generate content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (option) => {
    setSelectedOption(option);
    setFinalCaption(option.caption);
    setFinalHashtags(option.hashtags);
  };

  // ---------- Save (one post per chosen platform) ----------
  // Resolves to the created posts, or null after showing why it couldn't.
  const submit = async (extra) => {
    if (!finalCaption.trim()) {
      showError('Please add caption content first.');
      return null;
    }
    if (chosen.length === 0) {
      showError('Choose at least one platform.');
      return null;
    }
    if (media.upload) {
      showError('Please wait for the video to finish uploading.');
      return null;
    }

    setSaving(true);
    try {
      return await addPosts({
        platforms: chosen,
        content: finalCaption,
        hashtags: finalHashtags,
        tone: getValues('tone'),
        image: media.image || '',
        videoKey: media.video?.key,
        ...extra,
      });
    } catch (err) {
      showError(err.message || 'Failed to save the post');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    const posts = await submit({ status: 'draft', scheduledTime: null });
    if (!posts) return;
    showSuccess(`Draft saved for ${platformNames(posts)}.`);
    resetForm();
  };

  const handleSchedulePost = async () => {
    if (!scheduleTime) {
      showError('Please choose a date and time for the post.');
      return;
    }
    const scheduledDate = fromLocalInputValue(scheduleTime);
    if (!scheduledDate || scheduledDate <= new Date()) {
      showError('Please choose a future date and time.');
      return;
    }
    const posts = await submit({
      status: 'scheduled',
      scheduledTime: scheduledDate.toISOString(),
    });
    if (!posts) return;
    showSuccess(`Scheduled for ${platformNames(posts)}!`);
    resetForm();
    setTimeout(() => navigate('/schedule'), 1200);
  };

  const handlePublishNow = async () => {
    const posts = await submit({ publishNow: true });
    if (!posts) return;
    resetForm();

    const failed = posts.filter((p) => p.status === 'failed');
    if (failed.length === 0) {
      showSuccess(`Published to ${platformNames(posts)}!`);
      setTimeout(() => navigate('/schedule'), 1200);
      return;
    }
    const reasons = failed
      .map((p) => `${platformName(p.platform)} (${p.failureReason || 'unknown error'})`)
      .join(', ');
    showError(
      `Published to ${posts.length - failed.length} of ${posts.length} platforms. Failed: ${reasons}.`
    );
  };

  // After a save the posts own the video, so the uploaded file is kept.
  const resetForm = () => {
    reset();
    setOptions([]);
    setSelectedOption(null);
    setFinalCaption('');
    setFinalHashtags('');
    media.clear({ keepFile: true });
    setScheduleTime('');
  };

  // Nothing was saved, so an uploaded video is discarded too.
  const handleStartOver = () => {
    media.clear();
    resetForm();
  };

  const busy = saving || Boolean(media.upload);

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h2 className="page-title mb-1">Create Post</h2>
        <p className="page-subtitle mb-0">
          Describe your topic, pick one or more platforms and a tone, and let
          AI draft your content.
        </p>
      </div>

      {/* Warning: no accounts connected */}
      {accounts.length === 0 && (
        <div className="alert alert-warning d-flex align-items-center">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          <div>
            You haven't connected any social accounts yet.{' '}
            <Link to="/accounts" className="alert-link">
              Connect one now
            </Link>{' '}
            to start creating posts.
          </div>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success d-flex align-items-center">
          <i className="bi bi-check-circle-fill me-2"></i>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="alert alert-danger d-flex align-items-center">
          <i className="bi bi-exclamation-circle-fill me-2"></i>
          {errorMsg}
        </div>
      )}

      <div className="row g-4">
        {/* Left column */}
        <div className="col-lg-8">
          {/* Step 1 — Input form */}
          <div className="card shadow-sm mb-4">
            <div className="card-body">
              <h5 className="fw-semibold mb-3">
                <i className="bi bi-magic me-2 text-primary"></i>
                1. Tell AI what you want
              </h5>

              <form onSubmit={handleSubmit(onGenerate)}>
                <div className="mb-3">
                  <label className="form-label">Topic / Keywords</label>
                  <textarea
                    rows="2"
                    className={`form-control ${errors.topic ? 'is-invalid' : ''}`}
                    placeholder="e.g., New coffee shop opening this weekend with cozy ambience"
                    {...register('topic', {
                      required: 'Please enter a topic',
                      minLength: { value: 5, message: 'Topic is too short' },
                    })}
                  />
                  {errors.topic && (
                    <div className="invalid-feedback">{errors.topic.message}</div>
                  )}
                  <small className="text-muted">
                    Tip: Include specific details for better results.
                  </small>
                </div>

                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="form-label mb-0" id="platforms-label">
                      Platforms
                    </span>
                    {connected.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0"
                        onClick={toggleAll}
                      >
                        {allChosen ? 'Clear all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  {connected.length === 0 ? (
                    <p className="text-muted small mb-0">No accounts connected.</p>
                  ) : (
                    <div
                      className="d-flex flex-wrap gap-2"
                      role="group"
                      aria-labelledby="platforms-label"
                    >
                      {connected.map((p) => (
                        <div key={p.id}>
                          <input
                            type="checkbox"
                            className="btn-check"
                            id={`platform-${p.id}`}
                            autoComplete="off"
                            checked={chosen.includes(p.id)}
                            onChange={() => togglePlatform(p.id)}
                          />
                          <label
                            className="btn btn-sm btn-outline-secondary"
                            htmlFor={`platform-${p.id}`}
                            style={{
                              '--bs-btn-active-bg': p.color,
                              '--bs-btn-active-border-color': p.color,
                              '--bs-btn-active-color': '#fff',
                            }}
                          >
                            <i className={`bi ${p.icon} me-1`}></i>
                            {p.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  {chosen.length > 1 && (
                    <small className="text-muted d-block mt-2">
                      One post will go to all {chosen.length} platforms at the
                      same time, each tracked separately.
                    </small>
                  )}
                </div>

                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Tone</label>
                    <select className="form-select" {...register('tone')}>
                      <option value="casual">Casual</option>
                      <option value="professional">Professional</option>
                      <option value="promotional">Promotional</option>
                      <option value="inspirational">Inspirational</option>
                      <option value="humorous">Humorous</option>
                    </select>
                  </div>
                </div>

                <MediaPicker
                  image={media.image}
                  video={media.video}
                  upload={media.upload}
                  onSelect={media.attach}
                  onRemove={() => media.clear()}
                />

                <button
                  type="submit"
                  className="btn btn-primary mt-3"
                  disabled={loading || !topicValue || chosen.length === 0}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-stars me-2"></i>
                      Generate Content
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Step 2 — AI options */}
          {options.length > 0 && (
            <div className="card shadow-sm mb-4">
              <div className="card-body">
                <h5 className="fw-semibold mb-3">
                  <i className="bi bi-list-stars me-2 text-primary"></i>
                  2. Pick an AI-generated option
                </h5>
                <div className="row g-3">
                  {options.map((opt) => (
                    <div className="col-md-4" key={opt.id}>
                      <ContentOptionCard
                        option={opt}
                        selected={selectedOption?.id === opt.id}
                        onSelect={handleSelectOption}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Refine & save */}
          {selectedOption && (
            <div className="card shadow-sm">
              <div className="card-body">
                <h5 className="fw-semibold mb-3">
                  <i className="bi bi-pencil-square me-2 text-primary"></i>
                  3. Refine & schedule
                </h5>

                <div className="mb-3">
                  <label className="form-label">Caption</label>
                  <textarea
                    rows="4"
                    className="form-control"
                    value={finalCaption}
                    onChange={(e) => setFinalCaption(e.target.value)}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Hashtags</label>
                  <input
                    type="text"
                    className="form-control"
                    value={finalHashtags}
                    onChange={(e) => setFinalHashtags(e.target.value)}
                  />
                </div>

                {/* Length check per chosen platform */}
                {chosenPlatforms.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mb-2 small">
                    {chosenPlatforms.map((p) => {
                      const over = postLength > p.maxChars;
                      return (
                        <span
                          key={p.id}
                          className={`badge ${
                            over ? 'bg-danger' : 'bg-light text-dark border'
                          }`}
                        >
                          <i className={`bi ${p.icon} me-1`}></i>
                          {postLength.toLocaleString()}/{p.maxChars.toLocaleString()}
                        </span>
                      );
                    })}
                  </div>
                )}
                {tooLongFor.length > 0 && (
                  <div className="alert alert-warning py-2 small">
                    <i className="bi bi-exclamation-triangle me-1"></i>
                    Too long for {tooLongFor.map((p) => p.name).join(', ')}.
                    Shorten the caption or untick{' '}
                    {tooLongFor.length > 1 ? 'those platforms' : 'that platform'}.
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label">
                    <i className="bi bi-calendar-event me-1"></i>
                    Schedule Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    min={minScheduleValue()}
                  />
                  <small className="text-muted">
                    Choose a future date and time to schedule, or publish now.
                  </small>
                </div>

                {chosenPlatforms.length > 0 && (
                  <p className="small text-muted mb-2">
                    <i className="bi bi-send me-1"></i>
                    Posting to{' '}
                    <strong>{chosenPlatforms.map((p) => p.name).join(', ')}</strong>
                  </p>
                )}

                <div className="d-flex gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={handleSaveDraft}
                    disabled={busy}
                  >
                    <i className="bi bi-save me-2"></i>
                    Save as Draft
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleSchedulePost}
                    disabled={busy}
                  >
                    <i className="bi bi-calendar-plus me-2"></i>
                    Schedule Post
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handlePublishNow}
                    disabled={busy}
                  >
                    {saving ? (
                      <span className="spinner-border spinner-border-sm me-2" />
                    ) : (
                      <i className="bi bi-send-fill me-2"></i>
                    )}
                    Publish Now
                  </button>
                  <button
                    type="button"
                    className="btn btn-link ms-auto"
                    onClick={handleStartOver}
                  >
                    Start Over
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column — Live Preview */}
        <div className="col-lg-4">
          <div className="card shadow-sm sticky-top" style={{ top: '1rem' }}>
            <div className="card-body">
              <h6 className="fw-semibold mb-3 text-muted text-uppercase small">
                <i className="bi bi-eye me-1"></i>Live Preview
              </h6>
              <div className="preview-card border rounded p-3">
                <div className="d-flex align-items-center mb-3">
                  <div
                    className="user-avatar me-2"
                    style={{ width: 32, height: 32, fontSize: '0.8rem' }}
                  >
                    {(topicValue || 'P').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-grow-1">
                    <div className="fw-semibold small">Your Brand</div>
                    <div className="text-muted small">
                      {scheduleTime
                        ? `Scheduled: ${new Date(
                            scheduleTime
                          ).toLocaleString()}`
                        : 'Just now'}
                    </div>
                  </div>
                  <div className="d-flex gap-1" aria-label="Posting to">
                    {chosenPlatforms.map((p) => (
                      <i
                        key={p.id}
                        className={`bi ${p.icon}`}
                        style={{ color: p.color }}
                        title={p.name}
                      ></i>
                    ))}
                  </div>
                </div>
                {media.image && (
                  <img
                    src={media.image}
                    alt="preview"
                    className="img-fluid rounded mb-3"
                  />
                )}
                {media.video && (
                  <video
                    src={resolveMediaUrl(media.video.url)}
                    controls
                    preload="metadata"
                    className="w-100 rounded mb-3"
                  />
                )}
                <p className="small mb-2">
                  {finalCaption || (
                    <span className="text-muted fst-italic">
                      Your caption will appear here...
                    </span>
                  )}
                </p>
                {finalHashtags && (
                  <p className="small text-primary mb-0">{finalHashtags}</p>
                )}
              </div>
              <small className="text-muted d-block mt-3">
                <i className="bi bi-info-circle me-1"></i>
                Preview is approximate. Actual rendering varies by platform.
              </small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostEditor;
