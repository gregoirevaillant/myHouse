#!/bin/sh
# Restaure une sauvegarde dans le volume `data` (REMPLACE les données actuelles).
# Usage : scripts/restore.sh ~/backups/maison/daily/maison-AAAA-MM-JJ.tar.gz
# Pour essayer sans risque : VOLUME=essai_data scripts/restore.sh <archive>
set -eu
cd "$(dirname "$0")/.."
ARCHIVE="$(realpath "$1")"
VOLUME="${VOLUME:-myhouse_data}"
[ "$VOLUME" = myhouse_data ] && docker compose stop app
docker run --rm -v "$VOLUME":/data -v "$ARCHIVE":/backup.tar.gz:ro node:24-slim sh -c '
  set -e
  rm -rf /data/uploads /data/app.db /data/app.db-journal /data/app.db-wal /data/app.db-shm
  tar -C /data -xzf /backup.tar.gz
  ls -la /data'
[ "$VOLUME" = myhouse_data ] && docker compose start app
echo "Restauration terminée dans le volume $VOLUME"
