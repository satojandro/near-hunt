#!/bin/sh
# Scheduler wrapper: the cron `script` runner treats non-.sh files as Python, so keep this thin.
set -eu
cd "$(dirname "$0")/.."
exec node scripts/feed-watch.mjs
