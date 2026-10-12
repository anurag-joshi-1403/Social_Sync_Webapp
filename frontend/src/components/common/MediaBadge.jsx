// Placeholder for a post's media in list views, which load without the media
// itself (base64 images are left out of list responses). Renders nothing for a
// text-only post. Analytics rows carry `hasVideo`; posts carry `video`.
const MediaBadge = ({ post, size = 40 }) => {
  const isVideo = Boolean(post.video?.key || post.hasVideo);
  if (!isVideo && !post.hasImage) return null;

  return (
    <span
      className="me-2 rounded bg-light text-muted d-inline-flex align-items-center justify-content-center flex-shrink-0"
      style={{ width: size, height: size }}
      title={isVideo ? 'This post has a video' : 'This post has an image'}
    >
      <i
        className={`bi ${isVideo ? 'bi-camera-video' : 'bi-image'}${
          size < 36 ? ' small' : ''
        }`}
      ></i>
    </span>
  );
};

export default MediaBadge;
