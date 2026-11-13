import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import db from './db.js';
import {
  authJsonPath,
  buildAuthJsonFromBody,
  deleteAuthDir,
  writeAuthJson,
} from './auth-storage.js';
import { cancelBuild, queueBuild } from './build-runner.js';
import { exportBuildArtifact } from './export.js';
import {
  derivePublicKey,
  getSshKeyDir,
  saveSshPrivateKey,
  testRepoAccess,
} from './git.js';
import {
  CONFIG_BUILD_TEMPLATE,
  PATHS,
} from './config.js';
import {
  configBuildPath,
  managerConfigBuildPath,
  resolveLocalProjectPath,
  validateMagentoWorkspace,
} from './paths.js';

const router = express.Router();

function now() {
  return new Date().toISOString();
}

// Auth profiles
router.get('/auth-profiles', (_req, res) => {
  const rows = db.prepare('SELECT id, name, created_at, updated_at FROM auth_profiles').all();
  res.json(
    rows.map((r) => ({
      ...r,
      hasSecret: fs.existsSync(authJsonPath(r.id)),
    })),
  );
});

router.post('/auth-profiles', (req, res) => {
  try {
    const id = uuid();
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const content = buildAuthJsonFromBody(req.body);
    JSON.parse(content);
    writeAuthJson(id, content);
    const ts = now();
    db.prepare(
      'INSERT INTO auth_profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(id, name, ts, ts);
    res.status(201).json({ id, name, hasSecret: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/auth-profiles/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM auth_profiles WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const content = buildAuthJsonFromBody(req.body);
    JSON.parse(content);
    writeAuthJson(req.params.id, content);
    const name = req.body.name || row.name;
    db.prepare('UPDATE auth_profiles SET name = ?, updated_at = ? WHERE id = ?').run(
      name,
      now(),
      req.params.id,
    );
    res.json({ id: req.params.id, name, hasSecret: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/auth-profiles/:id', (req, res) => {
  deleteAuthDir(req.params.id);
  db.prepare('DELETE FROM auth_profiles WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// SSH key profiles
router.get('/ssh-key-profiles', (_req, res) => {
  const rows = db.prepare('SELECT * FROM ssh_key_profiles').all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      publicKey: r.public_key,
      hasPrivateKey: fs.existsSync(path.join(getSshKeyDir(r.id), 'id_ed25519')),
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  );
});

router.post('/ssh-key-profiles', async (req, res) => {
  try {
    const { name, privateKey } = req.body;
    if (!name || !privateKey) return res.status(400).json({ error: 'name and privateKey required' });
    const id = uuid();
    saveSshPrivateKey(id, privateKey);
    const publicKey = await derivePublicKey(privateKey);
    const ts = now();
    db.prepare(
      'INSERT INTO ssh_key_profiles (id, name, public_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, name, publicKey, ts, ts);
    res.status(201).json({ id, name, publicKey, hasPrivateKey: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/ssh-key-profiles/:id', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM ssh_key_profiles WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    let publicKey = row.public_key;
    if (req.body.privateKey) {
      saveSshPrivateKey(req.params.id, req.body.privateKey);
      publicKey = await derivePublicKey(req.body.privateKey);
    }
    const name = req.body.name || row.name;
    db.prepare(
      'UPDATE ssh_key_profiles SET name = ?, public_key = ?, updated_at = ? WHERE id = ?',
    ).run(name, publicKey, now(), req.params.id);
    res.json({ id: req.params.id, name, publicKey });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/ssh-key-profiles/:id', (req, res) => {
  const dir = getSshKeyDir(req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  db.prepare('DELETE FROM ssh_key_profiles WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.post('/ssh-key-profiles/:id/test', async (req, res) => {
  try {
    await testRepoAccess({
      repoUrl: req.body.repoUrl,
      sshKeyProfileId: req.params.id,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Project profiles
router.get('/project-profiles', (_req, res) => {
  res.json(db.prepare('SELECT * FROM project_profiles').all());
});

router.post('/project-profiles', (req, res) => {
  const b = req.body;
  const id = uuid();
  const ts = now();
  db.prepare(
    `INSERT INTO project_profiles (
      id, name, source_type, project_path, git_repo_url, git_ref,
      ssh_key_profile_id, default_image_tag, auth_profile_id, reuse_workspace, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    b.name,
    b.source_type,
    b.project_path || null,
    b.git_repo_url || null,
    b.git_ref || null,
    b.ssh_key_profile_id || null,
    b.default_image_tag || null,
    b.auth_profile_id || null,
    b.reuse_workspace ? 1 : 0,
    ts,
    ts,
  );
  res.status(201).json(db.prepare('SELECT * FROM project_profiles WHERE id = ?').get(id));
});

router.put('/project-profiles/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM project_profiles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = { ...row, ...req.body };
  db.prepare(
    `UPDATE project_profiles SET
      name = ?, source_type = ?, project_path = ?, git_repo_url = ?, git_ref = ?,
      ssh_key_profile_id = ?, default_image_tag = ?, auth_profile_id = ?, reuse_workspace = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    b.name,
    b.source_type,
    b.project_path,
    b.git_repo_url,
    b.git_ref,
    b.ssh_key_profile_id,
    b.default_image_tag,
    b.auth_profile_id,
    b.reuse_workspace ? 1 : 0,
    now(),
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM project_profiles WHERE id = ?').get(req.params.id));
});

router.delete('/project-profiles/:id', (req, res) => {
  db.prepare('DELETE FROM project_profiles WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Builds
router.get('/builds', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db
    .prepare('SELECT * FROM builds ORDER BY created_at DESC LIMIT ?')
    .all(limit);
  res.json(rows);
});

router.post('/builds', (req, res) => {
  try {
    const {
      imageTag,
      authProfileId,
      sourceType,
      projectPath,
      gitRepoUrl,
      gitRef,
      sshKeyProfileId,
      dockerBuildArgs,
    } = req.body;

    if (!imageTag || !authProfileId) {
      return res.status(400).json({ error: 'imageTag and authProfileId required' });
    }
  if (!fs.existsSync(authJsonPath(authProfileId))) {
      return res.status(400).json({ error: 'Invalid authProfileId' });
    }

    const id = uuid();
    const logFile = path.join(PATHS.logs, `${id}.log`);
    fs.writeFileSync(logFile, '');
    const ts = now();

    if (sourceType === 'local') {
      resolveLocalProjectPath(projectPath);
    } else if (sourceType === 'github') {
      if (!gitRepoUrl) return res.status(400).json({ error: 'gitRepoUrl required' });
    } else {
      return res.status(400).json({ error: 'sourceType must be local or github' });
    }

    db.prepare(
      `INSERT INTO builds (
        id, source_type, project_path, git_repo_url, git_ref, ssh_key_profile_id,
        workspace_path, image_tag, auth_profile_id, status, log_file, docker_build_args, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    ).run(
      id,
      sourceType,
      projectPath || null,
      gitRepoUrl || null,
      gitRef || null,
      sshKeyProfileId || null,
      null,
      imageTag,
      authProfileId,
      logFile,
      dockerBuildArgs ? JSON.stringify(dockerBuildArgs) : null,
      ts,
    );

    queueBuild(id);
    res.status(201).json(db.prepare('SELECT * FROM builds WHERE id = ?').get(id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/builds/:id/rebuild', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM builds WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed builds can be rebuilt' });
    }
    if (!fs.existsSync(authJsonPath(existing.auth_profile_id))) {
      return res.status(400).json({ error: 'Composer auth profile no longer exists' });
    }
    if (existing.source_type === 'local') {
      resolveLocalProjectPath(existing.project_path);
    }

    const id = uuid();
    const logFile = path.join(PATHS.logs, `${id}.log`);
    fs.writeFileSync(logFile, '');
    const ts = now();

    db.prepare(
      `INSERT INTO builds (
        id, source_type, project_path, git_repo_url, git_ref, ssh_key_profile_id,
        workspace_path, image_tag, auth_profile_id, status, log_file, docker_build_args, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    ).run(
      id,
      existing.source_type,
      existing.project_path,
      existing.git_repo_url,
      existing.git_ref,
      existing.ssh_key_profile_id,
      null,
      existing.image_tag,
      existing.auth_profile_id,
      logFile,
      existing.docker_build_args,
      ts,
    );

    queueBuild(id);
    res.status(201).json(db.prepare('SELECT * FROM builds WHERE id = ?').get(id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/builds/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.get('/builds/:id/logs', (req, res) => {
  const row = db.prepare('SELECT log_file FROM builds WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!fs.existsSync(row.log_file)) return res.type('text/plain').send('');
  res.type('text/plain').send(fs.readFileSync(row.log_file, 'utf8'));
});

router.get('/builds/:id/logs/stream', (req, res) => {
  const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(req.params.id);
  if (!build) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let position = 0;
  const terminal = new Set(['success', 'failed', 'cancelled']);

  const send = () => {
    if (!fs.existsSync(build.log_file)) return;
    const stat = fs.statSync(build.log_file);
    if (stat.size > position) {
      const stream = fs.createReadStream(build.log_file, {
        start: position,
        end: stat.size - 1,
      });
      stream.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line) res.write(`data: ${line}\n\n`);
        }
      });
      position = stat.size;
    }
    const current = db.prepare('SELECT status FROM builds WHERE id = ?').get(req.params.id);
    if (terminal.has(current.status)) {
      res.write(`event: done\ndata: ${current.status}\n\n`);
      clearInterval(timer);
      res.end();
    }
  };

  const timer = setInterval(send, 500);
  req.on('close', () => clearInterval(timer));
  send();
});

router.post('/builds/:id/cancel', (req, res) => {
  const ok = cancelBuild(req.params.id);
  if (!ok) return res.status(400).json({ error: 'No active build process' });
  res.json({ cancelled: true });
});

router.post('/builds/:id/export', async (req, res) => {
  try {
    const build = await exportBuildArtifact(req.params.id);
    res.json(build);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/builds/:id/artifact', (req, res) => {
  const build = db.prepare('SELECT artifact_path FROM builds WHERE id = ?').get(req.params.id);
  if (!build?.artifact_path || !fs.existsSync(build.artifact_path)) {
    return res.status(404).json({ error: 'Artifact not found' });
  }
  const name = path.basename(build.artifact_path);
  res.download(build.artifact_path, name);
});

router.get('/builds/:id/artifact/checksum', (req, res) => {
  const build = db.prepare('SELECT artifact_path FROM builds WHERE id = ?').get(req.params.id);
  if (!build?.artifact_path) return res.status(404).json({ error: 'Not found' });
  const checksum = `${build.artifact_path}.sha256`;
  if (!fs.existsSync(checksum)) return res.status(404).json({ error: 'Checksum not found' });
  res.type('text/plain').send(fs.readFileSync(checksum, 'utf8'));
});

function resolveWorkspaceFromQuery(req) {
  if (req.query.buildId) {
    const build = db.prepare('SELECT workspace_path, project_path, source_type FROM builds WHERE id = ?').get(
      req.query.buildId,
    );
    if (!build) throw new Error('Build not found');
    if (build.workspace_path) return build.workspace_path;
    if (build.source_type === 'local' && build.project_path) {
      return resolveLocalProjectPath(build.project_path);
    }
    throw new Error('Workspace not ready; wait for clone or use local path');
  }
  if (req.query.workspacePath) {
    return validateMagentoWorkspace(resolveLocalProjectPath(req.query.workspacePath));
  }
  throw new Error('buildId or workspacePath query required');
}

router.get('/config-build/default', (req, res) => {
  try {
    const file = managerConfigBuildPath();
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: 'No manager default; create from template' });
    }
    res.type('text/plain').send(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/config-build/default', (req, res) => {
  try {
    const file = managerConfigBuildPath();
    const content = typeof req.body === 'string' ? req.body : req.body.content;
    if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
    res.json({ ok: true, path: file });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/config-build/default/from-template', (req, res) => {
  try {
    const file = managerConfigBuildPath();
    if (fs.existsSync(file)) return res.status(409).json({ error: 'File already exists' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(CONFIG_BUILD_TEMPLATE, file);
    res.status(201).type('text/plain').send(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/magento/config-build', (req, res) => {
  try {
    const root = resolveWorkspaceFromQuery(req);
    const file = configBuildPath(root);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'config.php.build not found' });
    res.type('text/plain').send(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/magento/config-build', (req, res) => {
  try {
    const root = resolveWorkspaceFromQuery(req);
    const file = configBuildPath(root);
    const content = typeof req.body === 'string' ? req.body : req.body.content;
    if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
    res.json({ ok: true, path: file });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/magento/config-build/from-template', (req, res) => {
  try {
    const root = resolveWorkspaceFromQuery(req);
    const file = configBuildPath(root);
    if (fs.existsSync(file)) return res.status(409).json({ error: 'File already exists' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(CONFIG_BUILD_TEMPLATE, file);
    res.status(201).type('text/plain').send(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
