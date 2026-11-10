#!/usr/bin/env bash
# Holds a cloud action until the workspace setup has installed the dependencies.
#
# A cloud workspace shows up as ready while its setup is still running `pnpm install`, so an action
# started in the first minute fails on `Command "next" not found`. This waits for the install and
# the contracts build to finish. If they never ran (setup failed or skipped), it runs them itself
# after a grace period, so the action still starts.
set -uo pipefail

cd "$(dirname "$0")/.."

# Anchored on the pnpm process itself, so a shell whose command line merely mentions these steps
# (an action, an agent's Bash call) never counts as a running setup.
SETUP_STEPS='^(node \S*pnpm\S* |pnpm )(install|build:contracts|db:link|env:prod|--filter @rerun/contracts build)'
GRACE_SECONDS=30
TIMEOUT_SECONDS=900

dependencies_ready() {
  [ -x apps/ui/node_modules/.bin/next ] && [ -f packages/contracts/dist/index.js ]
}

setup_running() {
  pgrep -f "$SETUP_STEPS" >/dev/null
}

if dependencies_ready && ! setup_running; then
  exit 0
fi

echo "[setup] the workspace setup is still installing the dependencies, the action starts once it is done..."
waited=0
idle=0
while ! dependencies_ready || setup_running; do
  if setup_running; then
    idle=0
  else
    idle=$((idle + 2))
  fi

  if [ "$idle" -ge "$GRACE_SECONDS" ]; then
    echo "[setup] no setup running and the dependencies are missing, installing them now"
    pnpm install && pnpm build:contracts || exit 1
    break
  fi

  if [ "$waited" -ge "$TIMEOUT_SECONDS" ]; then
    echo "[setup] still not ready after ${TIMEOUT_SECONDS}s, run: pnpm install && pnpm build:contracts"
    exit 1
  fi

  sleep 2
  waited=$((waited + 2))
done
echo "[setup] dependencies ready after ${waited}s"
