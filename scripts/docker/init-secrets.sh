#!/bin/sh
# The `secrets` service of docker-compose.yml: generates the secrets of this install once, into the
# `secrets` volume, so `docker compose up` needs no .env. A value set in .env always wins over the
# generated one (env.sh). The engine gets a volume of its own holding only its key: its coworkers run
# shell commands, and must never read the database password or the session secret.
set -eu

SECRETS_DIR=/run/lumvika
ENGINE_DIR=/run/lumvika-engine
GENERATED="$SECRETS_DIR/generated.env"

random_hex() {
    od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'
}

umask 077
if [ ! -s "$GENERATED" ]; then
    {
        for key in POSTGRES_PASSWORD BETTER_AUTH_SECRET LUMVIKA_ENGINE_API_KEY STEWARD_HUB_TOKEN_SECRET \
            BOARD_IMAGE_SECRET UNSUBSCRIBE_SECRET PUBLISHED_ACCESS_SECRET MOBILE_OAUTH_TICKET_SECRET; do
            printf 'GENERATED_%s=%s\n' "$key" "$(random_hex 32)"
        done
        # S3-compatible stores cap a secret key at 40 characters.
        printf 'GENERATED_S3_SECRET_ACCESS_KEY=%s\n' "$(random_hex 20)"
    } > "$GENERATED.tmp"
    mv "$GENERATED.tmp" "$GENERATED"
    echo "Generated the secrets of this install."
fi

# Postgres, RustFS and the engine run as their own users and read these files.
umask 022
chmod 644 "$GENERATED"
cp /app/scripts/docker/env.sh "$SECRETS_DIR/env.sh"

. "$GENERATED"
printf ': "${LUMVIKA_API_KEY:=%s}"\nexport LUMVIKA_API_KEY\n' "$GENERATED_LUMVIKA_ENGINE_API_KEY" > "$ENGINE_DIR/engine.env.tmp"
mv "$ENGINE_DIR/engine.env.tmp" "$ENGINE_DIR/engine.env"
