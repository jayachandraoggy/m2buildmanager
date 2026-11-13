# Magento build image (managed by m2buildmanager)

Production-oriented **build** image: `composer install`, `setup:di:compile`, and `setup:static-content:deploy` without a database or `app/etc/env.php` in the final image.

These files live in **m2buildmanager** and are injected at build time; Magento projects do not need their own `Dockerfile` or `docker/` folder.

## Prerequisites

- Docker with BuildKit (`DOCKER_BUILDKIT=1`)
- Composer `auth.json` via the manager UI (build secret)
- `app/etc/config.php.build` — optional in Magento; manager injects `data/config.php.build` or the template before build
- `app/etc/env.php` must **not** be in the build context

## Manual CLI (equivalent to UI)

From the manager repo root, with a Magento tree at `$MAGENTO_ROOT`:

```bash
export DOCKER_BUILDKIT=1

docker build \
  -f docker/Dockerfile \
  --build-context m2buildkit=docker \
  --secret id=composer_auth,src=./auth.json \
  -t apparel/magento-build:2.4.8 \
  "$MAGENTO_ROOT"
```

## Related files

| Path | Role |
|------|------|
| `Dockerfile` | PHP 8.3 CLI, Composer, injected build scripts |
| `Dockerfile.dockerignore` | Build context excludes (paired with `-f docker/Dockerfile`) |
| `build/magento-build.sh` | Compile + static deploy |
| `build/export-release-artifact.sh` | Export tar.gz from build image |
| `templates/config.php.build.example` | Starter build manifest |
