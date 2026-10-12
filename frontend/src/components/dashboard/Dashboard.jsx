import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePosts } from '../../context/PostsContext.jsx';
import { postsService } from '../../services/postsService.js';
import StatsCard from './StatsCard.jsx';
import MiniEngagementChart from './MiniEngagementChart.jsx';
import UpcomingPosts from './UpcomingPosts.jsx';
import MediaBadge from '../common/MediaBadge.jsx';

const EMPTY_STATS = { total: 0, scheduled: 0, published: 0, drafts: 0 };

const Dashboard = () => {
  const { user } = useAuth();
  const { posts, loading } = usePosts();
  const [serverStats, setServerStats] = useState(null);

  // Counts come from the API, which stays correct once /posts is paginated.
  // `posts` is refetched on every mutation, so it doubles as the trigger.
  useEffect(() => {
    let active = true;
    postsService
      .stats()
      .then((data) => {
        if (active) setServerStats(data.stats);
      })
      .catch(() => {
        if (active) setServerStats(null);
      });
    return () => {
      active = false;
    };
  }, [posts]);

  // Fall back to counting what is loaded until the request lands.
  const stats = useMemo(
    () =>
      serverStats || {
        ...EMPTY_STATS,
        total: posts.length,
        scheduled: posts.filter((p) => p.status === 'scheduled').length,
        published: posts.filter((p) => p.status === 'published').length,
        drafts: posts.filter((p) => p.status === 'draft').length,
      },
    [serverStats, posts]
  );

  const recentPosts = posts.slice(0, 5);

  const statusBadge = (status) => {
    const map = {
      published: 'success',
      scheduled: 'primary',
      draft: 'secondary',
      failed: 'danger',
    };
    return `badge bg-${map[status] || 'secondary'} text-capitalize`;
  };

  const formatDate = (post) => {
    if (!post.scheduledTime) return '—';
    return new Date(post.scheduledTime).toLocaleString();
  };

  return (
    <div>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center flex-wrap mb-4">
        <div>
          <h2 className="page-title mb-1">Welcome back, {user?.name} 👋</h2>
          <p className="page-subtitle mb-0">
            Here's a quick overview of your content activity.
          </p>
        </div>
        <Link to="/editor" className="btn btn-primary mt-3 mt-md-0">
          <i className="bi bi-plus-lg me-1"></i>
          Create New Post
        </Link>
      </div>
      {loading && posts.length === 0 && (
        <div className="alert alert-info small">
          <span className="spinner-border spinner-border-sm me-2" />
          Loading your posts...
        </div>
      )}

      {/* Stats Cards */}
      <div className="row g-3 mb-4">
        <StatsCard title="Total Posts" value={stats.total} icon="bi-collection" color="primary" />
        <StatsCard title="Scheduled" value={stats.scheduled} icon="bi-calendar-event" color="info" />
        <StatsCard title="Published" value={stats.published} icon="bi-check-circle" color="success" />
        <StatsCard title="Drafts" value={stats.drafts} icon="bi-pencil" color="warning" />
      </div>

      {/* Recent Posts */}
      <div className="card shadow-sm">
        <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
          <h5 className="mb-0 fw-semibold">Recent Posts</h5>
          <Link to="/schedule" className="btn btn-sm btn-outline-secondary">
            View All
          </Link>
        </div>

        {recentPosts.length === 0 ? (
          <div className="card-body text-center py-5 text-muted">
            <i className="bi bi-inbox fs-1 d-block mb-2"></i>
            <p className="mb-3">You haven't created any posts yet.</p>
            <Link to="/editor" className="btn btn-primary btn-sm">
              <i className="bi bi-plus-lg me-1"></i>
              Create your first post
            </Link>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Content</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentPosts.map((post) => (
                  <tr key={post.id}>
                    <td className="text-truncate" style={{ maxWidth: '280px' }}>
                      <div className="d-flex align-items-center">
                        <MediaBadge post={post} size={32} />
                        <span>{post.content}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-muted small text-capitalize">
                        {post.platform}
                      </span>
                    </td>
                    <td>
                      <span className={statusBadge(post.status)}>{post.status}</span>
                    </td>
                    <td className="text-muted small">{formatDate(post)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom row: Mini chart + Upcoming posts */}
      <div className="row g-3 mt-4">
        <div className="col-lg-7">
          <MiniEngagementChart />
        </div>
        <div className="col-lg-5">
          <UpcomingPosts />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;