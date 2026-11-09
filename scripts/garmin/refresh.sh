#!/bin/sh
# Même chose que « npm run garmin:refresh », sans avoir besoin de Node sur l'ordinateur (passe par Docker)
cd "$(dirname "$0")/../.." && exec docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":/app -w /app node:24-slim node scripts/garmin/pull.mjs "$@"
