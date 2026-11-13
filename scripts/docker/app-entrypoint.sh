#!/bin/sh
# Entrypoint of the app image: takes the secrets docker compose generated, writes this install's
# public addresses into the build (apply-public-env.mjs), then runs the command.
set -e

if [ -f /run/lumvika/env.sh ]; then
    . /run/lumvika/env.sh
fi
node /app/scripts/docker/apply-public-env.mjs

exec "$@"
