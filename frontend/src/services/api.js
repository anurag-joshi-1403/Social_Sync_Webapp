import axios from 'axios';

// Backend API base URL — change this in production
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ---------- Create Axios instance ----------
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30s — AI calls can take a few seconds
});

// ---------- Request interceptor: attach JWT ----------
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------- Response interceptor: handle 401 ----------
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If the server says 401 Unauthorized, clear session and redirect
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Only redirect if not already on login/register
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ---------- Helper: extract a friendly error message ----------
export const getErrorMessage = (error) => {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.message) return error.message;
  return 'Something went wrong. Please try again.';
};

export default api;