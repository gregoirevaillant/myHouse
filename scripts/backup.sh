#!/bin/sh
# Sauvegarde cohérente du volume `data` (base SQLite, photos, clés VAPID) vers l'hôte.
# Usage : scripts/backup.sh   (BACKUP_DIR pour changer le dossier, ~/backups/maison par défaut)
# Rotation : 7 sauvegardes quotidiennes, 4 hebdomadaires (celles du dimanche).
set -eu
cd "$(dirname "$0")/.."
DEST="${BACKUP_DIR:-$HOME/backups/maison}"
mkdir -p "$DEST/daily" "$DEST/weekly"
FILE="$DEST/daily/maison-$(date +%F).tar.gz"

# .backup de sqlite3 copie la base sans la corrompre même si l'app écrit pendant ce temps
docker compose exec -T app sh -c '
  set -e
  rm -rf /tmp/bk && mkdir /tmp/bk
  sqlite3 /data/app.db ".backup /tmp/bk/app.db"
  [ -d /data/uploads ] && cp -r /data/uploads /tmp/bk/uploads
  [ -f /data/vapid.json ] && cp /data/vapid.json /tmp/bk/vapid.json
  tar -C /tmp/bk -czf - .
  rm -rf /tmp/bk
' > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

[ "$(date +%u)" = 7 ] && cp "$FILE" "$DEST/weekly/"
find "$DEST/daily" -name 'maison-*.tar.gz' -mtime +7 -delete
find "$DEST/weekly" -name 'maison-*.tar.gz' -mtime +28 -delete
echo "Sauvegarde : $FILE ($(du -h "$FILE" | cut -f1))"
