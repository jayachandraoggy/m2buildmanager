import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GIT_CLONE_DEPTH, PATHS } from './config.js';
import { normalizeGitRepoUrl } from './paths.js';

function sshKeyPath(profileId) {
  const dir = path.join(PATHS.secretsSsh, profileId);
  const candidates = ['id_ed25519', 'id_rsa', 'private_key'];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('SSH private key file not found for profile');
}

export function gitSshEnv(sshKeyProfileId) {
  if (!sshKeyProfileId) {
    return { GIT_SSH_COMMAND: undefined };
  }
  const keyPath = sshKeyPath(sshKeyProfileId);
  const cmd = `ssh -i ${keyPath} -o IdentitiesOnly=yes -o UserKnownHostsFile=${PATHS.knownHosts} -o StrictHostKeyChecking=yes`;
  return { GIT_SSH_COMMAND: cmd };
}

function runGit(args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      ...options,
      env: { ...process.env, ...options.env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      options.onData?.(d);
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      options.onData?.(d);
    });
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `git exit ${code}`));
    });
  });
}

function isCommitSha(ref) {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}

export async function syncGithubWorkspace({
  repoUrl,
  gitRef,
  sshKeyProfileId,
  workspacePath,
  onData,
}) {
  const url = normalizeGitRepoUrl(repoUrl);
  const env = gitSshEnv(sshKeyProfileId);
  fs.mkdirSync(path.dirname(workspacePath), { recursive: true });
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }

  const ref = gitRef?.trim() || 'main';

  if (isCommitSha(ref)) {
    await runGit(['clone', url, workspacePath], { env, onData });
    await runGit(['checkout', ref], { cwd: workspacePath, env, onData });
    return;
  }

  try {
    const depth = GIT_CLONE_DEPTH > 0 ? ['--depth', String(GIT_CLONE_DEPTH)] : [];
    await runGit(['clone', ...depth, '--branch', ref, url, workspacePath], { env, onData });
  } catch (err) {
    onData?.(Buffer.from(`Branch clone failed (${ref}), trying full clone...\n`));
    await runGit(['clone', url, workspacePath], { env, onData });
    await runGit(['checkout', ref], { cwd: workspacePath, env, onData });
  }
}

export async function testRepoAccess({ repoUrl, sshKeyProfileId }) {
  const url = normalizeGitRepoUrl(repoUrl);
  const env = gitSshEnv(sshKeyProfileId);
  await runGit(['ls-remote', '--heads', url], { env });
}

export function derivePublicKey(privateKeyPem) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ssh-keygen', ['-y', '-f', '/dev/stdin'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err || 'Could not derive public key'));
    });
    proc.stdin.write(privateKeyPem);
    proc.stdin.end();
  });
}

export function getSshKeyDir(profileId) {
  return path.join(PATHS.secretsSsh, profileId);
}

export function saveSshPrivateKey(profileId, privateKeyPem) {
  const dir = getSshKeyDir(profileId);
  fs.mkdirSync(dir, { recursive: true });
  const keyPath = path.join(dir, 'id_ed25519');
  fs.writeFileSync(keyPath, privateKeyPem.trim() + '\n', { mode: 0o600 });
  return keyPath;
}
