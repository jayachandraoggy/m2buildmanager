import { useState } from 'react';
import { api } from '../api.js';

export default function ConfigBuild() {
  const [mode, setMode] = useState('manager');
  const [workspacePath, setWorkspacePath] = useState('');
  const [buildId, setBuildId] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const managerBase = '/api/config-build/default';
  const workspaceBase = '/api/magento/config-build';

  function query() {
    const params = new URLSearchParams();
    if (buildId) params.set('buildId', buildId);
    else if (workspacePath) params.set('workspacePath', workspacePath);
    return params.toString();
  }

  function apiBase() {
    return mode === 'manager' ? managerBase : `${workspaceBase}?${query()}`;
  }

  async function load() {
    setError('');
    setMessage('');
    try {
      if (mode !== 'manager' && !buildId && !workspacePath) {
        throw new Error('Workspace path or build ID required');
      }
      const res = await fetch(apiBase());
      const text = await res.text();
      if (!res.ok) throw new Error(JSON.parse(text).error);
      setContent(text);
      setMessage('Loaded');
    } catch (e) {
      setError(e.message);
    }
  }

  async function save() {
    setError('');
    try {
      if (mode !== 'manager' && !buildId && !workspacePath) {
        throw new Error('Workspace path or build ID required');
      }
      await fetch(apiBase(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error);
      });
      setMessage(mode === 'manager' ? 'Saved manager default' : 'Saved in workspace');
    } catch (e) {
      setError(e.message);
    }
  }

  async function seed() {
    setError('');
    try {
      const url =
        mode === 'manager'
          ? `${managerBase}/from-template`
          : `${workspaceBase}/from-template?${query()}`;
      if (mode !== 'manager' && !buildId && !workspacePath) {
        throw new Error('Workspace path or build ID required');
      }
      const res = await fetch(url, { method: 'POST' });
      const text = await res.text();
      if (!res.ok) throw new Error(JSON.parse(text).error);
      setContent(text);
      setMessage('Created from template');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h2>config.php.build</h2>
      <p>
        <strong>Manager default</strong> is copied into each build workspace before Docker when the repo
        has no <code>app/etc/config.php.build</code>. GitHub clones are fresh each time — use manager
        default for Git-only projects.
      </p>
      <div className="toggle" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={mode === 'manager' ? 'active' : 'secondary'}
          onClick={() => setMode('manager')}
        >
          Manager default
        </button>
        <button
          type="button"
          className={mode === 'workspace' ? 'active' : 'secondary'}
          onClick={() => setMode('workspace')}
        >
          Workspace override
        </button>
      </div>
      <div className="card">
        {mode === 'workspace' && (
          <>
            <label>Workspace path (local)</label>
            <input value={workspacePath} onChange={(e) => setWorkspacePath(e.target.value)} placeholder="/path/to/magento" />
            <label>Or build ID</label>
            <input value={buildId} onChange={(e) => setBuildId(e.target.value)} placeholder="uuid" />
          </>
        )}
        <div>
          <button type="button" onClick={load}>Load</button>
          <button type="button" className="secondary" onClick={seed}>Create from template</button>
          <button type="button" onClick={save}>Save</button>
        </div>
        {message && <p>{message}</p>}
        {error && <p className="error">{error}</p>}
        <textarea value={content} onChange={(e) => setContent(e.target.value)} style={{ marginTop: '1rem' }} />
      </div>
    </div>
  );
}
