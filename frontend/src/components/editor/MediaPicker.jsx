import { MEDIA_ACCEPT, MAX_VIDEO_MB, formatBytes } from '../../utils/media.js';

// File input plus the state of whatever is attached. Media is replaced by
// removing it first, so a post never holds an image and a video at once.
const MediaPicker = ({ image, video, upload, onSelect, onRemove }) => {
  const empty = !image && !video && !upload;

  return (
    <div className="mt-3">
      <label className="form-label" htmlFor="post-media">
        Attach image or video (optional)
      </label>

      {empty && (
        <>
          <input
            id="post-media"
            type="file"
            accept={MEDIA_ACCEPT}
            className="form-control"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSelect(file);
            }}
          />
          <small className="text-muted">
            Images up to 2MB · MP4, MOV or WebM videos up to {MAX_VIDEO_MB}MB
          </small>
        </>
      )}

      {upload && (
        <div className="border rounded p-2 small">
          <div className="d-flex justify-content-between mb-1 gap-2">
            <span className="text-truncate">
              <i className="bi bi-cloud-arrow-up me-1"></i>
              Uploading {upload.name}
            </span>
            <span className="fw-semibold">{upload.progress}%</span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label="Video upload progress"
            aria-valuenow={upload.progress}
            aria-valuemin="0"
            aria-valuemax="100"
            style={{ height: 6 }}
          >
            <div
              className="progress-bar progress-bar-striped progress-bar-animated"
              style={{ width: `${upload.progress}%` }}
            ></div>
          </div>
          <button
            type="button"
            className="btn btn-link btn-sm text-danger p-0 mt-1"
            onClick={onRemove}
          >
            Cancel upload
          </button>
        </div>
      )}

      {image && (
        <div className="d-flex align-items-start gap-2">
          <img
            src={image}
            alt="Attached"
            className="rounded"
            style={{ maxHeight: '120px' }}
          />
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={onRemove}
            title="Remove image"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      )}

      {video && (
        <div className="d-flex align-items-center gap-2 border rounded p-2 small">
          <i className="bi bi-camera-video-fill text-primary fs-5"></i>
          <div className="flex-grow-1 min-w-0">
            <div className="fw-semibold text-truncate">{video.originalName}</div>
            <div className="text-muted">
              {formatBytes(video.size)} · uploaded
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={onRemove}
            title="Remove video"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default MediaPicker;
