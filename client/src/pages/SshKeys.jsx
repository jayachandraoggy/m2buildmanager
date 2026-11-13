import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function SshKeys() {
  const [profiles, setProfiles] = useState([]);
  const [name, setName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [testRepo, setTestRepo] = useState('');
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');

  function load() {
    api('/ssh-key-profiles').then(setProfiles).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/ssh-key-profiles', { method: 'POST', body: { name, privateKey } });
      setName('');
      setPrivateKey('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function test(id) {
    setTestResult('');
    try {
      await api(`/ssh-key-profiles/${id}/test`, { method: 'POST', body: { repoUrl: testRepo } });
      setTestResult('Connection OK');
    } catch (err) {
      setTestResult(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Delete SSH profile?')) return;
    await api(`/ssh-key-profiles/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <h2>SSH key profiles</h2>
      <p>Use deploy keys for private GitHub repos. Public key is shown for GitHub setup.</p>
      <form className="card" onSubmit={create}>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
        <label>Private key (PEM)</label>
        <textarea value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" required />
        {error && <p className="error">{error}</p>}
        <button type="submit">Save key</button>
      </form>
      <div className="card">
        <label>Test repo URL</label>
        <input value={testRepo} onChange={(e) => setTestRepo(e.target.value)} placeholder="git@github.com:org/repo.git" />
        {testResult && <p>{testResult}</p>}
        <table>
          <thead>
            <tr><th>Name</th><th>Public key</th><th /></tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{p.publicKey}</td>
                <td>
                  <button type="button" onClick={() => test(p.id)}>Test</button>
                  <button type="button" className="secondary" onClick={() => remove(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
