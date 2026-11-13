#!/usr/bin/env bash
set -euo pipefail

MAGENTO_ROOT="${MAGENTO_ROOT:-/var/www/html}"
cd "${MAGENTO_ROOT}"

if [[ -f app/etc/env.php ]]; then
    echo "Refusing to build: app/etc/env.php must not exist in the build context" >&2
    exit 1
fi

export MAGE_MODE=production

PHP_MEMORY_LIMIT="${PHP_MEMORY_LIMIT:-4G}"

echo "Applying build scopes from config.php.build..."
export MAGENTO_ROOT
php docker/build/apply-build-config.php

echo "Running setup:di:compile..."
php -d "memory_limit=${PHP_MEMORY_LIMIT}" bin/magento setup:di:compile

echo "Running static content deploy from config.php.build..."
export MAGENTO_ROOT
php docker/build/read-deploy-config.php

if [[ -f app/etc/env.php ]]; then
    echo "Note: removing app/etc/env.php created during CLI (not included in build image)." >&2
    rm -f app/etc/env.php
fi

if [[ -f app/etc/env.php ]]; then
    echo "Refusing to finish: could not remove app/etc/env.php" >&2
    exit 1
fi

echo "Build complete (no env.php, no DB)."
