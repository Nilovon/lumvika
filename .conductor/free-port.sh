#!/usr/bin/env bash
# Frees the given TCP ports before a cloud action starts its server on them.
#
# A cloud workspace has no CONDUCTOR_PORT, so every action listens on a fixed port. A server left
# behind by an earlier run, by "everything", or by `pnpm verify:ui` holds the port and the action dies
# on EADDRINUSE. The VM serves this single workspace, so whatever listens there is ours to stop.
#
# `engine` stands for the LUMVIKA_PORT of apps/engine/.env, which differs from one checkout to another.
set -uo pipefail

cd "$(dirname "$0")/.."

engine_port() {
  local port
  port=$(sed -n 's/^LUMVIKA_PORT=//p' apps/engine/.env 2>/dev/null | tail -1 | tr -d '"'\'' \r')
  echo "${port:-3000}"
}

for port in "$@"; do
  [ "$port" = engine ] && port=$(engine_port)
  pids=$(fuser -n tcp "$port" 2>/dev/null | tr -s ' ' | sed 's/^ //')
  [ -z "$pids" ] && continue

  for pid in $pids; do
    echo "[port] $port is held by pid $pid: $(ps -o args= -p "$pid" 2>/dev/null | cut -c1-80), stopping it"
  done
  fuser -k -TERM -n tcp "$port" >/dev/null 2>&1

  for _ in $(seq 1 20); do
    fuser -n tcp "$port" >/dev/null 2>&1 || break
    sleep 0.5
  done

  if fuser -n tcp "$port" >/dev/null 2>&1; then
    fuser -k -KILL -n tcp "$port" >/dev/null 2>&1
    sleep 1
  fi

  if fuser -n tcp "$port" >/dev/null 2>&1; then
    echo "[port] $port is still taken, stop the process holding it: fuser -v -n tcp $port"
    exit 1
  fi
done
