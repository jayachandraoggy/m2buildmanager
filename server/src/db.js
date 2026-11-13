import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DATA_DIR, PATHS } from './config.js';

function ensureDirs() {
  const dirs = [
    DATA_DIR,
    PATHS.logs,
    PATHS.workspaces,
    PATHS.releases,
    PATHS.secretsAuth,
    PATHS.secretsSsh,
    path.dirname(PATHS.knownHosts),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(PATHS.knownHosts)) {
    fs.copyFileSync(PATHS.bundledKnownHosts, PATHS.knownHosts);
  }
}

ensureDirs();

const db = new Database(PATHS.db);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS auth_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ssh_key_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    public_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    project_path TEXT,
    git_repo_url TEXT,
    git_ref TEXT,
    ssh_key_profile_id TEXT,
    default_image_tag TEXT,
    auth_profile_id TEXT,
    reuse_workspace INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS builds (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    project_path TEXT,
    git_repo_url TEXT,
    git_ref TEXT,
    ssh_key_profile_id TEXT,
    workspace_path TEXT,
    image_tag TEXT NOT NULL,
    auth_profile_id TEXT NOT NULL,
    status TEXT NOT NULL,
    git_sha TEXT,
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER,
    log_file TEXT,
    error_summary TEXT,
    docker_build_args TEXT,
    artifact_path TEXT,
    artifact_sha256 TEXT,
    artifact_bytes INTEGER,
    exported_at TEXT,
    created_at TEXT NOT NULL
  );
`);

export default db;
