#!/bin/sh
# Hot-standby replica: base-backup from the primary, then start Postgres in
# recovery mode. `pg_basebackup -R` writes standby.signal + primary_conninfo.
set -e

echo "replica: waiting for primary..."
until pg_isready -h db-primary -U postgres -q; do sleep 1; done

rm -rf "$PGDATA"/*
PGPASSWORD=replicate pg_basebackup -h db-primary -U replicator -D "$PGDATA" -Fp -Xs -P -R
echo "replica: base backup complete, starting standby"

exec docker-entrypoint.sh postgres
