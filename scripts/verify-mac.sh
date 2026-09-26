#!/usr/bin/env bash
# Runs, on a Mac, every check CI's macOS job runs, plus the checks only a Mac
# can do on the release build (signature, architecture, Gatekeeper, launch).
# Writes a summary to verify-mac-report.txt. Usage: bash scripts/verify-mac.sh
set -uo pipefail

cd "$(dirname "$0")/.."
REPORT="verify-mac-report.txt"
: > "$REPORT"
failed=0

step() {
  local name="$1"
  shift
  printf '\n=== %s ===\n' "$name"
  if "$@"; then
    printf 'PASS  %s\n' "$name" | tee -a "$REPORT"
  else
    printf 'FAIL  %s\n' "$name" | tee -a "$REPORT"
    failed=1
  fi
}

{
  echo "Postloom Mac checks - $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "Commit: $(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))"
  echo "macOS: $(sw_vers -productVersion) on $(uname -m)"
  echo "Node: $(node --version)  pnpm: $(pnpm --version)"
  echo
} >> "$REPORT"

step "Install dependencies" pnpm install --frozen-lockfile
step "Formatting" pnpm format:check
step "Lint" pnpm lint
step "Typecheck" pnpm typecheck
step "Unit tests with coverage" pnpm test:coverage
step "End-to-end tests" pnpm e2e
step "Performance budgets" pnpm e2e:perf

rm -rf apps/desktop/release
step "Package (unsigned, ad-hoc signed)" env CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package
step "Installer size budget" node scripts/check-installer-size.mjs apps/desktop/release

for app in apps/desktop/release/mac*/Postloom.app; do
  [ -d "$app" ] || continue
  arch="$(basename "$(dirname "$app")")"
  step "Signature intact ($arch)" codesign --verify --deep --strict --verbose=2 "$app"
  step "Signed ad-hoc ($arch)" bash -c "codesign -dv '$app' 2>&1 | grep -q 'Signature=adhoc'"
  binary="$app/Contents/MacOS/Postloom"
  expected="$([ "$arch" = mac-arm64 ] && echo arm64 || echo x86_64)"
  step "Architecture is $expected ($arch)" bash -c "lipo -archs '$binary' | grep -qw $expected"
  # Gatekeeper is expected to refuse an ad-hoc app (D10); the install guide's
  # "Open Anyway" steps are for exactly this. Recorded, not a failure.
  gatekeeper="$(spctl --assess --type execute "$app" 2>&1 || true)"
  echo "INFO  Gatekeeper ($arch): ${gatekeeper:-accepted}" | tee -a "$REPORT"
done

# The build for this Mac's own processor must start and keep running.
native="apps/desktop/release/mac$([ "$(uname -m)" = arm64 ] && echo -arm64)/Postloom.app"
# Installed builds ignore test settings, so this uses (and creates, if new) the
# normal Postloom data folder in ~/Library/Application Support.
launch() {
  "$native/Contents/MacOS/Postloom" > /tmp/postloom-launch.log 2>&1 &
  local pid=$!
  sleep 8
  if kill -0 "$pid" 2> /dev/null; then
    kill "$pid"
    wait "$pid" 2> /dev/null
    return 0
  fi
  cat /tmp/postloom-launch.log
  return 1
}
[ -d "$native" ] && step "Packaged app starts ($(uname -m))" launch

echo | tee -a "$REPORT"
if [ "$failed" -eq 0 ]; then
  echo "All Mac checks passed." | tee -a "$REPORT"
else
  echo "Some Mac checks failed - see above." | tee -a "$REPORT"
fi
echo "Report: $REPORT"
exit "$failed"
