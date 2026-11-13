import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, createBuildBodyFromRecord } from '../api.js';

function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{status}</span>;
}

function formatSource(b) {
  if (b.source_type === 'github') {
    return `${b.git_repo_url}@${b.git_ref || 'main'}`;
  }
  return b.project_path || '—';
}

export default function Builds() {
  const navigate = useNavigate();
  const [builds, setBuilds] = useState([]);
  const [error, setError] = useState('');
  const [rebuildingId, setRebuildingId] = useState(null);

  function loadBuilds() {
    api('/builds')
      .then(setBuilds)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadBuilds();
  }, []);

  async function onRebuild(buildRow) {
    setError('');
    setRebuildingId(buildRow.id);
    try {
      const created = await api('/builds', {
        method: 'POST',
        body: createBuildBodyFromRecord(buildRow),
      });
      navigate(`/builds/${created.id}`);
    } catch (err) {
      setError(err.message);
      setRebuildingId(null);
    }
  }

  return (
    <div>
      <h2>Build history</h2>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Image</th>
              <th>Source</th>
              <th>Git</th>
              <th>Duration</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {builds.map((b) => (
              <tr key={b.id}>
                <td><StatusBadge status={b.status} /></td>
                <td>{b.image_tag}</td>
                <td style={{ fontSize: '0.85rem' }}>{formatSource(b)}</td>
                <td>{b.git_sha || '—'}</td>
                <td>{b.duration_ms != null ? `${Math.round(b.duration_ms / 1000)}s` : '—'}</td>
                <td>
                  <Link to={`/builds/${b.id}`}>View</Link>
                  {b.status === 'failed' && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="link"
                        disabled={rebuildingId === b.id}
                        onClick={() => onRebuild(b)}
                      >
                        {rebuildingId === b.id ? 'Rebuilding…' : 'Rebuild'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {builds.length === 0 && <p>No builds yet.</p>}
      </div>
    </div>
  );
}
