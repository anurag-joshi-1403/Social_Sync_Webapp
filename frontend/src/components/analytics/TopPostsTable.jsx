import { PLATFORMS } from '../../constants/platforms.js';
import MediaBadge from '../common/MediaBadge.jsx';

const TopPostsTable = ({ posts }) => {
  if (!posts || posts.length === 0) {
    return (
      <div className="card shadow-sm">
        <div className="card-header bg-white py-3">
          <h5 className="mb-0 fw-semibold">Top Performing Posts</h5>
        </div>
        <div className="card-body text-center py-5 text-muted">
          <i className="bi bi-bar-chart fs-1 d-block mb-2"></i>
          <p className="mb-0">
            Create and publish posts to see performance here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-semibold">
          <i className="bi bi-trophy me-2 text-warning"></i>
          Top Performing Posts
        </h5>
        <small className="text-muted">Ranked by total engagement</small>
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Post</th>
              <th>Platform</th>
              <th className="text-end">Likes</th>
              <th className="text-end">Comments</th>
              <th className="text-end">Shares</th>
              <th className="text-end">Reach</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post, i) => {
              const platform =
                PLATFORMS.find((p) => p.id === post.platform) || PLATFORMS[0];
              const key = post.id || post._id || i;

              return (
                <tr key={key}>
                  <td>
                    <span
                      className={`badge ${
                        i === 0
                          ? 'bg-warning text-dark'
                          : 'bg-light text-dark border'
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="text-truncate" style={{ maxWidth: '300px' }}>
                    <div className="d-flex align-items-center">
                      <MediaBadge post={post} size={36} />
                      <span className="small">{post.content}</span>
                    </div>
                  </td>
                  <td>
                    <i
                      className={`bi ${platform.icon} me-1`}
                      style={{ color: platform.color }}
                    ></i>
                    <span className="small text-muted">{platform.name}</span>
                  </td>
                  <td className="text-end fw-semibold">{post.likes || 0}</td>
                  <td className="text-end fw-semibold">
                    {post.comments || 0}
                  </td>
                  <td className="text-end fw-semibold">{post.shares || 0}</td>
                  <td className="text-end text-muted">{post.reach || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TopPostsTable;