import fs from 'node:fs';
import path from 'node:path';
import { ALLOWED_PATH_PREFIXES, CONFIG_BUILD_TEMPLATE, DATA_DIR, PATHS } from './config.js';

export function resolveLocalProjectPath(projectPath) {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('projectPath is required for local source');
  }
  const resolved = fs.realpathSync(path.resolve(projectPath));
  if (ALLOWED_PATH_PREFIXES.length > 0) {
    const allowed = ALLOWED_PATH_PREFIXES.some((prefix) => {
      const p = fs.realpathSync(path.resolve(prefix));
      return resolved === p || resolved.startsWith(p + path.sep);
    });
    if (!allowed) {
      throw new Error('projectPath is not under ALLOWED_PATH_PREFIXES');
    }
  }
  return resolved;
}

export function validateMagentoWorkspace(workspacePath) {
  const root = fs.realpathSync(workspacePath);
  const composer = path.join(root, 'composer.json');
  if (!fs.existsSync(composer)) {
    throw new Error('composer.json not found in workspace');
  }
  const envPhp = path.join(root, 'app/etc/env.php');
  if (fs.existsSync(envPhp)) {
    throw new Error('app/etc/env.php must not exist in build context');
  }
  return root;
}

export function configBuildPath(workspaceRoot) {
  const target = path.join(workspaceRoot, 'app/etc/config.php.build');
  const resolved = path.resolve(target);
  const base = path.resolve(workspaceRoot);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('Invalid config path');
  }
  return resolved;
}

export function managerConfigBuildPath() {
  return assertPathUnderDataDir(PATHS.configBuildDefault, DATA_DIR);
}

/**
 * Ensures app/etc/config.php.build exists in the workspace before docker build.
 * Prefers file in workspace (repo or prior UI save), else manager data/config.php.build, else template.
 */
export function ensureConfigPhpBuild(workspaceRoot, onLog) {
  const target = configBuildPath(workspaceRoot);
  if (fs.existsSync(target)) {
    onLog?.('Using app/etc/config.php.build from workspace\n');
    return target;
  }

  const sources = [
    [PATHS.configBuildDefault, 'manager data/config.php.build'],
    [CONFIG_BUILD_TEMPLATE, 'm2buildmanager template'],
  ];

  for (const [src, label] of sources) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(src, target);
      onLog?.(`Injected app/etc/config.php.build from ${label}\n`);
      return target;
    }
  }

  throw new Error('No config.php.build source; save one in the manager UI or add data/config.php.build');
}

export function assertPathUnderDataDir(filePath, dataDir) {
  const resolved = path.resolve(filePath);
  const base = path.resolve(dataDir);
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error('Path must stay under DATA_DIR');
  }
  return resolved;
}

export function normalizeGitRepoUrl(url) {
  const trimmed = url.trim();
  if (/^https:\/\//i.test(trimmed)) {
    throw new Error('Only SSH git URLs are supported (git@github.com:org/repo.git)');
  }
  if (!/^git@/i.test(trimmed) && !/^ssh:\/\//i.test(trimmed)) {
    throw new Error('Invalid git SSH URL');
  }
  return trimmed.endsWith('.git') ? trimmed : `${trimmed}.git`;
}
