import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, createBuildBodyFromRecord } from '../api.js';

function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{status}</span>;
}

export default function BuildDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [build, setBuild] = useState(null);
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const logRef = useRef(null);

  const refresh = useCallback(() => {
    api(`/builds/${id}`).then(setBuild).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const terminal = new Set(['success', 'failed', 'cancelled']);
    if (build && terminal.has(build.status)) {
      fetch(`/api/builds/${id}/logs`)
        .then((r) => r.text())
        .then(setLog);
      return;
    }
    const es = new EventSource(`/api/builds/${id}/logs/stream`);
    es.onmessage = (ev) => {
      setLog((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + ev.data + '\n');
    };
    es.addEventListener('done', () => {
      es.close();
      refresh();
    });
    return () => es.close();
  }, [id, build?.status, refresh]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  async function onExport() {
    setError('');
    try {
      const updated = await api(`/builds/${id}/export`, { method: 'POST', body: {} });
      setBuild(updated);
    } catch (e) {
      setError(e.message);
    }
  }

  async function onCancel() {
    try {
      await api(`/builds/${id}/cancel`, { method: 'POST', body: {} });
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onRebuild() {
    setError('');
    try {
      const created = await api('/builds', {
        method: 'POST',
        body: createBuildBodyFromRecord(build),
      });
      navigate(`/builds/${created.id}`);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!build) return <p>Loading…</p>;

  return (
    <div>
      <p><Link to="/">← Builds</Link></p>
      <h2>Build {build.image_tag}</h2>
      <div className="card">
        <p><StatusBadge status={build.status} /> {build.error_summary && <span className="error">{build.error_summary}</span>}</p>
        <p><strong>Source:</strong> {build.source_type === 'github' ? `${build.git_repo_url} @ ${build.git_ref}` : build.project_path}</p>
        {build.workspace_path && <p><strong>Workspace:</strong> <code>{build.workspace_path}</code></p>}
        <p><strong>Git SHA:</strong> {build.git_sha || '—'}</p>
        {build.artifact_path && (
          <p>
            <strong>Artifact:</strong> {(build.artifact_bytes / 1024 / 1024).toFixed(2)} MiB — SHA256 {build.artifact_sha256}
            {' '}
            <a href={`/api/builds/${id}/artifact`}>Download tar.gz</a>
          </p>
        )}
        <div>
          {build.status === 'running' && (
            <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          )}
          {build.status === 'failed' && (
            <button type="button" onClick={onRebuild}>Rebuild</button>
          )}
          {build.status === 'success' && (
            <button type="button" onClick={onExport}>
              {build.artifact_path ? 'Re-export release' : 'Export release'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <h3>Log</h3>
      <div className="log" ref={logRef}>{log || 'Waiting for output…'}</div>
    </div>
  );
}
