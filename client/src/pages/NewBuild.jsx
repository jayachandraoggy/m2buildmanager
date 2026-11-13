import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function NewBuild() {
  const navigate = useNavigate();
  const [sourceType, setSourceType] = useState('local');
  const [projectPath, setProjectPath] = useState('');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitRef, setGitRef] = useState('main');
  const [sshKeyProfileId, setSshKeyProfileId] = useState('');
  const [imageTag, setImageTag] = useState('apparel/magento-build:latest');
  const [authProfileId, setAuthProfileId] = useState('');
  const [dockerArgs, setDockerArgs] = useState('');
  const [authProfiles, setAuthProfiles] = useState([]);
  const [sshProfiles, setSshProfiles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api('/auth-profiles'), api('/ssh-key-profiles')])
      .then(([a, s]) => {
        setAuthProfiles(a);
        setSshProfiles(s);
        if (a[0]) setAuthProfileId(a[0].id);
        if (s[0]) setSshKeyProfileId(s[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = {
        sourceType,
        imageTag,
        authProfileId,
        dockerBuildArgs: dockerArgs
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      };
      if (sourceType === 'local') body.projectPath = projectPath;
      else {
        body.gitRepoUrl = gitRepoUrl;
        body.gitRef = gitRef;
        body.sshKeyProfileId = sshKeyProfileId || undefined;
      }
      const build = await api('/builds', { method: 'POST', body });
      navigate(`/builds/${build.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>New build</h2>
      <form className="card" onSubmit={submit}>
        <div className="toggle">
          <button
            type="button"
            className={sourceType === 'local' ? 'active' : 'secondary'}
            onClick={() => setSourceType('local')}
          >
            Local path
          </button>
          <button
            type="button"
            className={sourceType === 'github' ? 'active' : 'secondary'}
            onClick={() => setSourceType('github')}
          >
            GitHub (SSH)
          </button>
        </div>

        {sourceType === 'local' ? (
          <>
            <label htmlFor="projectPath">Magento project path</label>
            <input
              id="projectPath"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="/path/to/magento"
              required
            />
          </>
        ) : (
          <>
            <label htmlFor="gitRepoUrl">Git SSH URL</label>
            <input
              id="gitRepoUrl"
              value={gitRepoUrl}
              onChange={(e) => setGitRepoUrl(e.target.value)}
              placeholder="git@github.com:org/magento.git"
              required
            />
            <label htmlFor="gitRef">Branch / tag / SHA</label>
            <input id="gitRef" value={gitRef} onChange={(e) => setGitRef(e.target.value)} />
            <label htmlFor="sshKey">SSH key profile</label>
            <select id="sshKey" value={sshKeyProfileId} onChange={(e) => setSshKeyProfileId(e.target.value)}>
              <option value="">None (public repo)</option>
              {sshProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        )}

        <label htmlFor="imageTag">Docker image tag</label>
        <input id="imageTag" value={imageTag} onChange={(e) => setImageTag(e.target.value)} required />

        <label htmlFor="auth">Composer auth profile</label>
        <select id="auth" value={authProfileId} onChange={(e) => setAuthProfileId(e.target.value)} required>
          {authProfiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <label htmlFor="dockerArgs">Extra docker build args (one per line)</label>
        <textarea
          id="dockerArgs"
          value={dockerArgs}
          onChange={(e) => setDockerArgs(e.target.value)}
          rows={3}
          style={{ minHeight: '80px' }}
        />

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading || !authProfileId}>
          {loading ? 'Starting…' : 'Start build'}
        </button>
      </form>
    </div>
  );
}
