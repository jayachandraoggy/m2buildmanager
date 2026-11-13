# M2 Build Manager

Web UI and API to build **Magento 2** Docker images, stream logs, export release artifacts, and manage Composer auth and GitHub SSH keys — without putting `Dockerfile` or `docker/` in your Magento repo.

## Requirements

- Node.js 20+
- `git` and `docker` on `PATH` with BuildKit (`DOCKER_BUILDKIT=1`, default in the build runner)
- Typical Magento build: **20–40 minutes**, 4GB+ PHP memory in image

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

- API: http://localhost:3847  
- UI (dev): http://localhost:5173 (proxies `/api`)

Production:

```bash
npm run build
npm start
```

Serves the built SPA from `client/dist` on the same port.

## Magento project expectations

Your tree (local path or GitHub clone) must include:

- `composer.json`, `app/etc/config.php`
- **`app/etc/config.php.build`** — optional in the Magento repo; the manager injects `data/config.php.build` or the bundled template before each Docker build (edit via **config.php.build** in the UI)
- **No** `app/etc/env.php` in the build context
- **No** `Dockerfile` / `docker/` required in the repo

Composer credentials come from **Composer auth** profiles in the UI (`auth.json` build secret).

## Build flow

1. **Local:** point at a filesystem path (optional `ALLOWED_PATH_PREFIXES` in `.env`).
2. **GitHub:** SSH URL + branch/tag/SHA + optional SSH key profile (deploy key).

The server clones into `data/workspaces/<buildId>/`, then runs BuildKit with `docker/Dockerfile` and the paired `docker/Dockerfile.dockerignore` (excludes `vendor/`, `env.php`, etc. from the Magento context):

```bash
DOCKER_BUILDKIT=1 docker build \
  -f docker/Dockerfile \
  --build-context m2buildkit=docker \
  --build-arg PHP_IMAGE=php:8.2-cli-bookworm \
  --secret id=composer_auth,src=<auth profile file> \
  -t <imageTag> \
  <workspace>
```

The build runner sets `PHP_IMAGE` automatically from the workspace `composer.json` / `composer.lock` (root `require.php`, `magento/product-*`, and `magento/framework`). It chooses the highest supported PHP minor that satisfies those constraints (e.g. Magento 2.4.6’s `~8.1.0||~8.2.0` → `php:8.2-cli-bookworm`). Override with extra `dockerBuildArgs` on the build if needed.

## Release artifacts

After a successful build, **Export release** writes `data/releases/<buildId>/magento-release-*.tar.gz` and a `.sha256` sidecar on the **manager host only** — not under the Magento tree. Download from the build detail page.

## Data layout (gitignored)

| Path | Purpose |
|------|---------|
| `data/builds.db` | SQLite history |
| `data/logs/` | Build logs |
| `data/workspaces/` | GitHub clones |
| `data/releases/` | Exported tarballs |
| `data/config.php.build` | Default build manifest (injected into clones) |
| `data/secrets/auth/` | Composer `auth.json` |
| `data/secrets/ssh/` | Git SSH private keys |
| `data/ssh/known_hosts` | GitHub host keys (seeded on first run) |

## Security

For trusted networks / local use. No login in v1. SSH keys and Composer auth never returned by API after save. Prefer repo-scoped deploy keys.

Refresh GitHub host keys if needed:

```bash
ssh-keyscan github.com >> data/ssh/known_hosts
```

## Manual verification

1. Create a Composer auth profile (Magento `repo.magento.com` keys).
2. Add an SSH key profile; **Test** against `git@github.com:org/repo.git`.
3. Start a **GitHub** build; confirm git + docker output in the log stream.
4. Start a **local** build against a path with `config.php.build`.
5. Export artifact; confirm files under `data/releases/<buildId>/` only.
6. Edit `config.php.build` in the UI; rebuild and check static deploy in logs.

See [docker/README.md](docker/README.md) for image internals.
