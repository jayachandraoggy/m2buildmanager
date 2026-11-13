import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
import {
  DOCKER_DIR,
  DOCKERFILE,
  PATHS,
} from './config.js';
import { authJsonPath } from './auth-storage.js';
import { syncGithubWorkspace } from './git.js';
import {
  ensureConfigPhpBuild,
  resolveLocalProjectPath,
  validateMagentoWorkspace,
} from './paths.js';
import { resolvePhpDockerImage } from './composer-php.js';

let activeBuild = null;
let buildMutex = Promise.resolve();

function appendLog(logFile, chunk) {
  fs.appendFileSync(logFile, chunk);
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      ...options,
      env: { ...process.env, DOCKER_BUILDKIT: '1', ...options.env },
    });
    activeBuild = { proc, buildId: options.buildId };
    proc.stdout.on('data', (d) => options.onData?.(d));
    proc.stderr.on('data', (d) => options.onData?.(d));
    proc.on('close', (code) => {
      activeBuild = null;
      if (code === 0) resolve(code);
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

function gitSha(workspacePath) {
  return new Promise((resolve) => {
    const proc = spawn('git', ['-C', workspacePath, 'rev-parse', '--short', 'HEAD']);
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

async function resolveWorkspace(build) {
  const logFile = build.log_file;
  const onData = (d) => appendLog(logFile, d);

  if (build.source_type === 'local') {
    const wp = resolveLocalProjectPath(build.project_path);
    appendLog(logFile, `Using local workspace: ${wp}\n`);
    return validateMagentoWorkspace(wp);
  }

  const workspacePath = path.join(PATHS.workspaces, build.id);
  appendLog(logFile, `Cloning ${build.git_repo_url} (ref: ${build.git_ref || 'main'})...\n`);
  await syncGithubWorkspace({
    repoUrl: build.git_repo_url,
    gitRef: build.git_ref || 'main',
    sshKeyProfileId: build.ssh_key_profile_id,
    workspacePath,
    onData: (d) => onData(d),
  });
  appendLog(logFile, `Clone complete: ${workspacePath}\n`);
  return validateMagentoWorkspace(workspacePath);
}

async function dockerBuild(build, workspacePath) {
  const authPath = authJsonPath(build.auth_profile_id);
  if (!fs.existsSync(authPath)) {
    throw new Error('Composer auth profile not found');
  }

  const phpImage = resolvePhpDockerImage(workspacePath);
  const logFile = build.log_file;
  appendLog(logFile, `PHP base image: ${phpImage} (from composer constraints)\n`);

  const args = [
    'build',
    '-f',
    DOCKERFILE,
    '--build-context',
    `m2buildkit=${DOCKER_DIR}`,
    '--build-arg',
    `PHP_IMAGE=${phpImage}`,
    '--secret',
    `id=composer_auth,src=${authPath}`,
    '-t',
    build.image_tag,
    workspacePath,
  ];

  const extra = build.docker_build_args ? JSON.parse(build.docker_build_args) : [];
  for (const a of extra) {
    if (typeof a === 'string') args.push(a);
  }

  const onData = (d) => appendLog(logFile, d);
  appendLog(logFile, `Running: docker ${args.join(' ')}\n`);
  await runCommand('docker', args, { onData, buildId: build.id });
}

export function runBuild(buildId) {
  const next = buildMutex.then(() => _runBuild(buildId));
  buildMutex = next.catch(() => {});
  return next;
}

async function _runBuild(buildId) {
  const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId);
  if (!build) return;

  const started = new Date().toISOString();
  db.prepare(
    `UPDATE builds SET status = 'running', started_at = ? WHERE id = ?`,
  ).run(started, buildId);

  try {
    const workspacePath = await resolveWorkspace(build);
    db.prepare('UPDATE builds SET workspace_path = ? WHERE id = ?').run(workspacePath, buildId);

    const sha = await gitSha(workspacePath);
    if (sha) db.prepare('UPDATE builds SET git_sha = ? WHERE id = ?').run(sha, buildId);

    const logAppend = (msg) => appendLog(build.log_file, msg);
    ensureConfigPhpBuild(workspacePath, logAppend);

    await dockerBuild(build, workspacePath);

    const finished = new Date().toISOString();
    const duration = new Date(finished) - new Date(started);
    db.prepare(
      `UPDATE builds SET status = 'success', finished_at = ?, duration_ms = ? WHERE id = ?`,
    ).run(finished, duration, buildId);
  } catch (err) {
    appendLog(build.log_file, `\n[error] ${err.message}\n`);
    const finished = new Date().toISOString();
    const duration = build.started_at
      ? new Date(finished) - new Date(build.started_at)
      : null;
    db.prepare(
      `UPDATE builds SET status = 'failed', finished_at = ?, duration_ms = ?, error_summary = ? WHERE id = ?`,
    ).run(finished, duration, err.message, buildId);
  }
}

export function cancelBuild(buildId) {
  if (activeBuild?.buildId === buildId && activeBuild.proc) {
    activeBuild.proc.kill('SIGTERM');
    db.prepare(
      `UPDATE builds SET status = 'cancelled', finished_at = ?, error_summary = ? WHERE id = ?`,
    ).run(new Date().toISOString(), 'Cancelled by user', buildId);
    return true;
  }
  return false;
}

export function queueBuild(buildId) {
  setImmediate(() => {
    runBuild(buildId).catch(() => {});
  });
}
