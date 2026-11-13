import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
import { DATA_DIR, EXPORT_SCRIPT, PATHS } from './config.js';
import { assertPathUnderDataDir } from './paths.js';

export async function exportBuildArtifact(buildId) {
  const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId);
  if (!build) throw new Error('Build not found');
  if (build.status !== 'success') throw new Error('Build must succeed before export');

  const releaseDir = path.join(PATHS.releases, buildId);
  fs.mkdirSync(releaseDir, { recursive: true });
  assertPathUnderDataDir(releaseDir, DATA_DIR);

  const env = {
    RELEASE_DIR: releaseDir,
    GIT_SHA: build.git_sha || 'unknown',
  };

  await new Promise((resolve, reject) => {
    const proc = spawn('bash', [EXPORT_SCRIPT, build.image_tag], { env, stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `export script exit ${code}`));
    });
  });

  const files = fs.readdirSync(releaseDir).filter((f) => f.endsWith('.tar.gz'));
  if (files.length === 0) throw new Error('No archive produced');
  const archiveName = files.sort().at(-1);
  const artifactPath = path.join(releaseDir, archiveName);
  const bytes = fs.statSync(artifactPath).size;
  let sha256 = build.artifact_sha256;
  const checksumFile = `${artifactPath}.sha256`;
  if (fs.existsSync(checksumFile)) {
    sha256 = fs.readFileSync(checksumFile, 'utf8').split(/\s+/)[0];
  }

  const exportedAt = new Date().toISOString();
  db.prepare(
    `UPDATE builds SET artifact_path = ?, artifact_sha256 = ?, artifact_bytes = ?, exported_at = ? WHERE id = ?`,
  ).run(artifactPath, sha256, bytes, exportedAt, buildId);

  return db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId);
}
