import api, { getErrorMessage } from './api.js';

export const postsService = {
  // List posts (optional filters: ?status=&platform=)
  list: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.platform) params.append('platform', filters.platform);

      const query = params.toString();
      const url = query ? `/posts?${query}` : '/posts';

      const { data } = await api.get(url);
      return data; // { success, count, posts }
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },

  // Get post statistics (counts)
  stats: async () => {
    try {
      const { data } = await api.get('/posts/stats');
      return data; // { success, stats: { total, scheduled, ... } }
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },

  // Create a new post
  create: async (post) => {
    try {
      const { data } = await api.post('/posts', post);
      return data; // { success, post }
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },

  // Create one post per platform in `platforms` (cross-post). Accepts the
  // same fields as `create`, plus `publishNow: true` to publish immediately.
  createMulti: async (payload) => {
    try {
      const { data } = await api.post('/posts/multi', payload, {
        // Publishing now waits for every platform, which can take a while.
        timeout: 60000,
      });
      return data; // { success, groupId, count, posts }
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },

  // Get one post
  getById: async (id) => {
    try {
      const { data } = await api.get(`/posts/${id}`);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },

  // Update a post
  update: async (id, updates) => {
    try {
      const { data } = await api.put(`/posts/${id}`, updates);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },

  // Delete a post
  remove: async (id) => {
    try {
      const { data } = await api.delete(`/posts/${id}`);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },

  // Delete every platform's copy of a cross-post
  removeGroup: async (groupId) => {
    try {
      const { data } = await api.delete(`/posts/group/${groupId}`);
      return data;
    } catch (error) {
      throw new Error(getErrorMessage(error), { cause: error });
    }
  },
};