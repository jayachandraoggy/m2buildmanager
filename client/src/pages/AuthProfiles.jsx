import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function AuthProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [name, setName] = useState('');
  const [rawJson, setRawJson] = useState('{\n  "http-basic": {}\n}');
  const [host, setHost] = useState('repo.magento.com');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('form');
  const [error, setError] = useState('');

  function load() {
    api('/auth-profiles').then(setProfiles).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const body = { name };
      if (mode === 'raw') body.rawJson = rawJson;
      else body.httpBasic = { host, login, password };
      await api('/auth-profiles', { method: 'POST', body });
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this auth profile?')) return;
    await api(`/auth-profiles/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <h2>Composer auth profiles</h2>
      <p>Stored on the server as <code>auth.json</code> for Docker build secrets. Never shown again after save.</p>
      <form className="card" onSubmit={create}>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="toggle">
          <button type="button" className={mode === 'form' ? 'active' : 'secondary'} onClick={() => setMode('form')}>Magento keys</button>
          <button type="button" className={mode === 'raw' ? 'active' : 'secondary'} onClick={() => setMode('raw')}>Paste JSON</button>
        </div>
        {mode === 'form' ? (
          <>
            <label>Host</label>
            <input value={host} onChange={(e) => setHost(e.target.value)} />
            <label>Username</label>
            <input value={login} onChange={(e) => setLogin(e.target.value)} />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : (
          <>
            <label>auth.json</label>
            <textarea value={rawJson} onChange={(e) => setRawJson(e.target.value)} />
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit">Save profile</button>
      </form>
      <div className="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Secret</th><th /></tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.hasSecret ? 'stored' : 'missing'}</td>
                <td><button type="button" className="secondary" onClick={() => remove(p.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
