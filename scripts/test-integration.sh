#!/usr/bin/env bash
# Runs the backend integration tests against the local Supabase stack.
# Start it first with: npx supabase start
set -euo pipefail
status=$(npx supabase status -o json 2>/dev/null)
key() { node -e "process.stdout.write(JSON.parse(process.argv[1])[process.argv[2]])" "$status" "$1"; }
SUPABASE_TEST_URL=$(key API_URL) \
SUPABASE_TEST_ANON_KEY=$(key ANON_KEY) \
SUPABASE_TEST_SERVICE_KEY=$(key SERVICE_ROLE_KEY) \
  npx vitest run src/sync "$@"
