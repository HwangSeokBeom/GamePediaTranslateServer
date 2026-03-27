#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BRANCH_NAME="main"
REMOTE_NAME="origin"

log() {
  printf '[deploy] %s\n' "$1"
}

log "Moving to project directory: ${PROJECT_DIR}"
cd "${PROJECT_DIR}"

if [[ -n "$(git status --porcelain)" ]]; then
  log "Working tree is not clean. Aborting deployment."
  exit 1
fi

log "Fetching latest code from ${REMOTE_NAME}"
git fetch "${REMOTE_NAME}"

log "Checking out ${BRANCH_NAME}"
git checkout "${BRANCH_NAME}"

log "Pulling latest ${BRANCH_NAME}"
git pull --ff-only "${REMOTE_NAME}" "${BRANCH_NAME}"

if [[ -f package-lock.json ]]; then
  log "Installing dependencies with npm ci"
  npm ci
else
  log "Installing dependencies with npm install"
  npm install
fi

log "Restarting PM2 with production environment"
pm2 startOrReload ecosystem.config.js --env production --only translate-server --update-env

log "Saving PM2 process list"
pm2 save

log "Deployment completed successfully"
