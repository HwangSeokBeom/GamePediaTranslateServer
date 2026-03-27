#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BRANCH_NAME="staging"
APP_NAME="translate-server-staging"
ENV_NAME="staging"

log() {
  printf '[deploy-staging] %s\n' "$1"
}

log "Moving to project directory: ${PROJECT_DIR}"
cd "${PROJECT_DIR}"

if [[ -n "$(git status --porcelain)" ]]; then
  log "Working tree is not clean. Aborting deployment."
  exit 1
fi

log "Fetching latest code from origin"
git fetch origin

log "Checking out ${BRANCH_NAME}"
git checkout "${BRANCH_NAME}"

log "Pulling latest ${BRANCH_NAME}"
git pull origin "${BRANCH_NAME}"

if [[ -f package-lock.json ]]; then
  log "Installing dependencies with npm ci"
  npm ci
else
  log "Installing dependencies with npm install"
  npm install
fi

if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  log "Restarting PM2 app ${APP_NAME}"
  pm2 restart ecosystem.config.js --only "${APP_NAME}" --env "${ENV_NAME}"
else
  log "Starting PM2 app ${APP_NAME}"
  pm2 start ecosystem.config.js --only "${APP_NAME}" --env "${ENV_NAME}"
fi

log "Saving PM2 process list"
pm2 save

log "Deployment completed successfully"
