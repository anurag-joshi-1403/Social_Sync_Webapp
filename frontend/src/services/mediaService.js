import api, { getErrorMessage } from './api.js';

export const mediaService = {
  // Upload one video. Resolves to { key, url, mimeType, size, originalName };
  // pass `key` as `videoKey` when creating the post(s).
  uploadVideo: async (file, { onProgress, signal } = {}) => {
    const form = new FormData();
    form.append('video', file);
    try {
      const { data } = await api.post('/media/video', form, {
        // The instance default is JSON, under which axios would serialise the
        // FormData to JSON and drop the file. The browser fills in the
        // multipart boundary itself.
        headers: { 'Content-Type': 'multipart/form-data' },
        // Big files on slow connections outlast the 30s default.
        timeout: 0,
        signal,
        onUploadProgress: (event) => {
          if (onProgress && event.total) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      return data.video;
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },

  // Discard an upload the user removed before saving. The key already has the
  // form `<owner>/<file>`, which is the route's shape.
  removeVideo: async (key) => {
    try {
      const { data } = await api.delete(`/media/video/${key}`);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },
};
