import fs from 'node:fs';
import path from 'node:path';

/** Debian bookworm tags published for official PHP images (newest patch per minor). */
const SUPPORTED_MINORS = ['8.1', '8.2', '8.3', '8.4'];
const DEFAULT_PHP_IMAGE = 'php:8.3-cli-bookworm';
const DEBIAN_SUFFIX = '-cli-bookworm';

const PRODUCT_PACKAGE_RE = /^magento\/product-(community|enterprise)-edition$/;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function compareMinor(a, b) {
  const [am, ai] = a.split('.').map(Number);
  const [bm, bi] = b.split('.').map(Number);
  if (am !== bm) return am - bm;
  return ai - bi;
}

function maxMinor(minors) {
  let best = null;
  for (const m of minors) {
    if (!SUPPORTED_MINORS.includes(m)) continue;
    if (!best || compareMinor(m, best) > 0) best = m;
  }
  return best;
}

/**
 * Collect Composer `php` constraint strings from the Magento workspace.
 */
export function collectPhpConstraints(workspaceRoot) {
  const constraints = [];
  const composerPath = path.join(workspaceRoot, 'composer.json');
  const composer = readJson(composerPath);
  if (!composer) return constraints;

  if (composer.require?.php) {
    constraints.push(composer.require.php);
  }

  const platform = composer.config?.platform?.php;
  if (platform && typeof platform === 'string') {
    constraints.push(platform);
  }

  const lockPath = path.join(workspaceRoot, 'composer.lock');
  const lock = readJson(lockPath);
  if (!lock?.packages) return constraints;

  const productName = Object.keys(composer.require || {}).find((k) => PRODUCT_PACKAGE_RE.test(k));
  if (productName) {
    const product = lock.packages.find((p) => p.name === productName);
    if (product?.require?.php) constraints.push(product.require.php);
  }

  const framework = lock.packages.find((p) => p.name === 'magento/framework');
  if (framework?.require?.php) constraints.push(framework.require.php);

  return constraints;
}

function minorsFromTilde(part) {
  const m = part.match(/~(\d+)\.(\d+)/);
  if (!m) return [];
  const minor = `${m[1]}.${m[2]}`;
  return SUPPORTED_MINORS.includes(minor) ? [minor] : [];
}

function minorsFromCaret(part) {
  const m = part.match(/\^(\d+)\.(\d+)/);
  if (!m) return [];
  const major = Number(m[1]);
  const minMinor = Number(m[2]);
  return SUPPORTED_MINORS.filter((v) => {
    const [ma, mi] = v.split('.').map(Number);
    return ma === major && mi >= minMinor;
  });
}

function minorsFromGte(part) {
  const m = part.match(/>=\s*(\d+)\.(\d+)/);
  if (!m) return [];
  const major = Number(m[1]);
  const minMinor = Number(m[2]);
  return SUPPORTED_MINORS.filter((v) => {
    const [ma, mi] = v.split('.').map(Number);
    return ma > major || (ma === major && mi >= minMinor);
  });
}

function minorsFromExact(part) {
  const m = part.trim().match(/^(\d+)\.(\d+)(?:\.\d+)?$/);
  if (!m) return [];
  const minor = `${m[1]}.${m[2]}`;
  return SUPPORTED_MINORS.includes(minor) ? [minor] : [];
}

/**
 * Turn a Composer version constraint into supported PHP minor versions (e.g. "8.2").
 */
export function constraintToSupportedMinors(constraint) {
  if (!constraint || typeof constraint !== 'string') return [];
  if (/PHP 8\.0 or higher comes with attributes/i.test(constraint)) return [];

  const allowed = new Set();
  const parts = constraint.split(/\|\|/).map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    for (const m of minorsFromTilde(part)) allowed.add(m);
    for (const m of minorsFromCaret(part)) allowed.add(m);
    for (const m of minorsFromGte(part)) allowed.add(m);
    for (const m of minorsFromExact(part)) allowed.add(m);

    const bare = [...part.matchAll(/\b([78])\.\d+\b/g)].map((x) => {
      const seg = x[0].match(/^(\d+)\.(\d+)/);
      return seg ? `${seg[1]}.${seg[2]}` : null;
    }).filter(Boolean);
    for (const m of bare) {
      if (SUPPORTED_MINORS.includes(m)) allowed.add(m);
    }
  }

  return [...allowed];
}

/**
 * Pick the highest supported PHP minor allowed by any constraint in the list.
 */
export function pickPhpMinor(constraints) {
  const allowed = new Set();
  for (const c of constraints) {
    for (const m of constraintToSupportedMinors(c)) allowed.add(m);
  }
  return maxMinor([...allowed]);
}

/**
 * Resolve the Docker `php:*-cli-bookworm` image for a Magento workspace.
 */
export function resolvePhpDockerImage(workspaceRoot) {
  const constraints = collectPhpConstraints(workspaceRoot);
  const minor = pickPhpMinor(constraints);
  if (!minor) return DEFAULT_PHP_IMAGE;
  return `php:${minor}${DEBIAN_SUFFIX}`;
}
