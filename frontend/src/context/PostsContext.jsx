import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext.jsx';
import { postsService } from '../services/postsService.js';

const PostsContext = createContext();

export const usePosts = () => useContext(PostsContext);

export const PostsProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ---------- Fetch all posts for the current user ----------
  const fetchPosts = useCallback(async (filters = {}) => {
    if (!localStorage.getItem('token')) {
      setPosts([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await postsService.list(filters);
      // Normalize: MongoDB uses _id, frontend uses id
      const normalized = (data.posts || []).map((p) => ({
        ...p,
        id: p._id || p.id,
      }));
      setPosts(normalized);
    } catch (err) {
      setError(err.message || 'Failed to load posts');
      console.error('fetchPosts error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ---------- Load posts when user changes ----------
  // Fetching external data keyed on auth state is exactly what effects are
  // for; the lint rule guards against cascading *render* state, which a
  // request kickoff and a logout reset are not.
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchPosts();
    } else {
      setPosts([]);
    }
  }, [user, authLoading, fetchPosts]);

  // ---------- Create a new post ----------
  const addPost = async (postData) => {
    setError('');
    try {
      const data = await postsService.create(postData);
      const newPost = {
        ...data.post,
        id: data.post._id || data.post.id,
      };
      setPosts((prev) => [newPost, ...prev]);
      return newPost;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // ---------- Create one post per platform (cross-post) ----------
  const addPosts = async (payload) => {
    setError('');
    try {
      const data = await postsService.createMulti(payload);
      const created = (data.posts || []).map((p) => ({
        ...p,
        id: p._id || p.id,
      }));
      setPosts((prev) => [...created, ...prev]);
      return created;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // ---------- Update a post ----------
  const updatePost = async (id, updates) => {
    setError('');
    try {
      const data = await postsService.update(id, updates);
      const updated = {
        ...data.post,
        id: data.post._id || data.post.id,
      };
      setPosts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // ---------- Delete a post ----------
  const deletePost = async (id) => {
    setError('');
    try {
      await postsService.remove(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // ---------- Delete every copy of a cross-post ----------
  const deleteGroup = async (groupId) => {
    setError('');
    try {
      await postsService.removeGroup(groupId);
      setPosts((prev) => prev.filter((p) => p.groupId !== groupId));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // ---------- Manual refresh ----------
  const refresh = () => fetchPosts();

  const value = {
    posts,
    loading,
    error,
    addPost,
    addPosts,
    updatePost,
    deletePost,
    deleteGroup,
    refresh,
  };

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
};