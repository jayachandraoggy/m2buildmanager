import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';

export function authJsonPath(profileId) {
  return path.join(PATHS.secretsAuth, profileId, 'auth.json');
}

export function writeAuthJson(profileId, content) {
  const dir = path.dirname(authJsonPath(profileId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(authJsonPath(profileId), content, { mode: 0o600 });
}

export function readAuthJson(profileId) {
  const p = authJsonPath(profileId);
  if (!fs.existsSync(p)) throw new Error('auth.json not found');
  return fs.readFileSync(p, 'utf8');
}

export function deleteAuthDir(profileId) {
  const dir = path.dirname(authJsonPath(profileId));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function buildAuthJsonFromBody(body) {
  if (body.rawJson) {
    const parsed = JSON.parse(body.rawJson);
    return JSON.stringify(parsed, null, 2);
  }
  const auth = {};
  if (body.httpBasic) {
    const { host, login, password } = body.httpBasic;
    auth['http-basic'] = auth['http-basic'] || {};
    auth['http-basic'][host] = { username: login, password };
  }
  if (body.githubOAuth?.token) {
    auth['github-oauth'] = { 'github.com': body.githubOAuth.token };
  }
  if (Object.keys(auth).length === 0) {
    throw new Error('Provide rawJson or httpBasic/githubOAuth fields');
  }
  return JSON.stringify(auth, null, 2);
}
