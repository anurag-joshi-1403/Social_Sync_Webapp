import { useEffect, useRef, useState } from 'react';
import { mediaService } from '../../services/mediaService.js';
import { imageProblem, mediaKind, videoProblem } from '../../utils/media.js';

// The image or video attached to the post being written. An image is read
// into a base64 data URL, as before. A video uploads straight away, so that
// saving the post later only has to send its key.
export const useMediaAttachment = ({ onError }) => {
  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  // { name, progress } while a video is uploading.
  const [upload, setUpload] = useState(null);
  const abortRef = useRef(null);

  // Leaving the editor mid-upload cancels the request.
  useEffect(() => () => abortRef.current?.abort(), []);

  const cancelUpload = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setUpload(null);
  };

  // Drops whatever is attached. Pass `keepFile` once a saved post uses the
  // video, so the server copy stays. Otherwise the upload is discarded; if
  // that request fails, the server's hourly sweep removes the file later.
  const clear = ({ keepFile = false } = {}) => {
    cancelUpload();
    if (video && !keepFile) {
      mediaService.removeVideo(video.key).catch(() => {});
    }
    setVideo(null);
    setImage(null);
  };

  const attachImage = (file) => {
    const problem = imageProblem(file);
    if (problem) return onError(problem);

    const reader = new FileReader();
    reader.onloadend = () => {
      clear();
      setImage(reader.result);
    };
    reader.onerror = () => onError('Could not read that image. Please try another.');
    reader.readAsDataURL(file);
  };

  const attachVideo = async (file) => {
    const problem = videoProblem(file);
    if (problem) return onError(problem);

    clear();
    const controller = new AbortController();
    abortRef.current = controller;
    setUpload({ name: file.name, progress: 0 });

    try {
      const uploaded = await mediaService.uploadVideo(file, {
        signal: controller.signal,
        onProgress: (progress) => setUpload({ name: file.name, progress }),
      });
      if (!controller.signal.aborted) setVideo(uploaded);
    } catch (err) {
      if (!controller.signal.aborted) {
        onError(err.message || 'Video upload failed. Please try again.');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setUpload(null);
      }
    }
  };

  const attach = (file) => {
    const kind = mediaKind(file);
    if (kind === 'image') return attachImage(file);
    if (kind === 'video') return attachVideo(file);
    onError('Please choose an image (JPG, PNG, WebP) or a video (MP4, MOV, WebM).');
  };

  return { image, video, upload, attach, clear };
};
