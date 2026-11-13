function parseResponseBody(text, res) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    if (text.trimStart().startsWith('<!')) {
      const hint =
        res.status === 404
          ? ' API route not found (try restarting the m2buildmanager server).'
          : '';
      throw new Error(`Unexpected HTML response (HTTP ${res.status}).${hint}`);
    }
    throw new Error(text.slice(0, 240));
  }
}

/** Body for POST /builds from an existing build row (rebuild). */
export function createBuildBodyFromRecord(build) {
  const body = {
    sourceType: build.source_type,
    imageTag: build.image_tag,
    authProfileId: build.auth_profile_id,
  };
  if (build.docker_build_args) {
    try {
      const args = JSON.parse(build.docker_build_args);
      if (Array.isArray(args) && args.length) body.dockerBuildArgs = args;
    } catch {
      /* ignore invalid stored args */
    }
  }
  if (build.source_type === 'local') {
    body.projectPath = build.project_path;
  } else {
    body.gitRepoUrl = build.git_repo_url;
    body.gitRef = build.git_ref || 'main';
    if (build.ssh_key_profile_id) body.sshKeyProfileId = build.ssh_key_profile_id;
  }
  return body;
}

export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body:
      options.body !== undefined && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const data = parseResponseBody(text, res);
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}
