#!/usr/bin/env bash
# Runs the backend integration tests against the local Supabase stack.
# Start it first with: npx supabase start
set -euo pipefail
status=$(npx supabase status -o json 2>/dev/null)
key() { node -e "process.stdout.write(JSON.parse(process.argv[1])[process.argv[2]])" "$status" "$1"; }

# Serve edge functions for the notification tests (stopped again on exit).
log=$(mktemp)
npx supabase functions serve --no-verify-jwt >"$log" 2>&1 &
serve_pid=$!
trap 'kill $serve_pid 2>/dev/null || true; rm -f "$log"' EXIT
for _ in $(seq 1 60); do grep -q "Serving functions" "$log" && break; sleep 1; done

# The edge runtime runs in Docker; it reaches the test's mock push service via the network gateway.
gateway=$(docker network inspect "$(docker network ls --format '{{.Name}}' | grep -m1 '^supabase_network_')" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')

SUPABASE_TEST_URL=$(key API_URL) \
SUPABASE_TEST_ANON_KEY=$(key ANON_KEY) \
SUPABASE_TEST_SERVICE_KEY=$(key SERVICE_ROLE_KEY) \
SUPABASE_TEST_HOST_FROM_FUNCTIONS=$gateway \
  npx vitest run src/sync "$@"
