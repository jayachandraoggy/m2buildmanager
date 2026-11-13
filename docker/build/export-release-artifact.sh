#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-apparel/magento-build:2.4.8}"
MAGENTO_ROOT="${MAGENTO_ROOT:-/var/www/html}"
OUT_DIR="${RELEASE_DIR:-release}"
STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"
TAG_SUFFIX="${IMAGE##*:}"
ARCHIVE_NAME="magento-release-${TAG_SUFFIX}-${STAMP}-${GIT_SHA}.tar.gz"

mkdir -p "${OUT_DIR}"
ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_NAME}"

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
    echo "Docker image not found: ${IMAGE}" >&2
    exit 1
fi

echo "Verifying ${IMAGE} has no app/etc/env.php..."
if ! docker run --rm "${IMAGE}" test ! -f "${MAGENTO_ROOT}/app/etc/env.php"; then
    echo "Refusing to export: image contains app/etc/env.php" >&2
    exit 1
fi

echo "Creating release archive (this may take several minutes)..."
docker run --rm "${IMAGE}" \
    tar -czf - \
    --exclude='./app/etc/env.php' \
    --exclude='./auth.json' \
    -C "${MAGENTO_ROOT}" \
    . > "${ARCHIVE_PATH}"

BYTES="$(wc -c < "${ARCHIVE_PATH}" | tr -d ' ')"
SHA256="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"

CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"
echo "${SHA256}  ${ARCHIVE_NAME}" > "${CHECKSUM_PATH}"

echo "Archive: ${ARCHIVE_PATH} ($(numfmt --to=iec-i --suffix=B "${BYTES}" 2>/dev/null || echo "${BYTES} bytes"))"
echo "SHA256:  ${SHA256}"
echo "Checksum file: ${CHECKSUM_PATH}"
