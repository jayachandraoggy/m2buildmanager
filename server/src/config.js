import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const PORT = Number(process.env.PORT || 3847);
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(REPO_ROOT, 'data'));
export const RELEASES_DIR = path.resolve(process.env.RELEASES_DIR || path.join(DATA_DIR, 'releases'));
export const GIT_CLONE_DEPTH = Number(process.env.GIT_CLONE_DEPTH || 1);
export const ALLOWED_PATH_PREFIXES = (process.env.ALLOWED_PATH_PREFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const DOCKER_DIR = path.join(REPO_ROOT, 'docker');
export const DOCKERFILE = path.join(DOCKER_DIR, 'Dockerfile');
export const CONFIG_BUILD_TEMPLATE = path.join(DOCKER_DIR, 'templates', 'config.php.build.example');
export const EXPORT_SCRIPT = path.join(DOCKER_DIR, 'build', 'export-release-artifact.sh');

export const PATHS = {
  db: path.join(DATA_DIR, 'builds.db'),
  logs: path.join(DATA_DIR, 'logs'),
  configBuildDefault: path.join(DATA_DIR, 'config.php.build'),
  workspaces: path.join(DATA_DIR, 'workspaces'),
  releases: RELEASES_DIR,
  secretsAuth: path.join(DATA_DIR, 'secrets', 'auth'),
  secretsSsh: path.join(DATA_DIR, 'secrets', 'ssh'),
  knownHosts: path.join(DATA_DIR, 'ssh', 'known_hosts'),
  bundledKnownHosts: path.join(__dirname, '../resources/github_known_hosts'),
};
