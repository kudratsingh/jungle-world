#!/usr/bin/env bash
# Post-deploy checks on the real origin (hosting study §5.4; synthesis §6.2). Fails closed: an unreadable
# credits.json or manifest, no release, or a release without a .glb and a .ktx2 is a miss.
#
#   1. credits.json names the newest release (EXPECTED_TAG, when set: retried until it is that release),
#      and releases/<tag>.json parses and lists a .glb and a .ktx2;
#   2. the .glb answers 200 gzipped with access-control-allow-origin: * and 206 for Range: bytes=0-99;
#   3. the .ktx2 answers 206 for the same range and 200 with no content encoding;
#   4. credits.html answers 200.
# Pages edges can lag a deploy, so everything retries (SMOKE_ATTEMPTS, default 8, 15 s apart).
#
#   EXPECTED_TAG=world-0 bash scripts/smoke.sh [https://kudratsingh.github.io/jungle-world]
set -uo pipefail
ORIGIN="${1:-https://kudratsingh.github.io/jungle-world}"
EXPECTED="${EXPECTED_TAG:-}"
ATTEMPTS="${SMOKE_ATTEMPTS:-8}"
PAUSE="${SMOKE_PAUSE:-15}"
NAME_RE='^[a-z0-9][a-z0-9_-]*\.[0-9a-f]{12}\.(glb|gltf|bin|ktx2|hdr)$'
misses=0

ok() { printf 'ok    %-40s %s\n' "$1" "$2"; }
miss() { printf 'MISS  %-40s %s\n' "$1" "$2"; misses=$((misses + 1)); }

# The newest release in credits.json (a world-<n> tag), or nothing.
newest() {
  curl -fsS "$ORIGIN/credits.json" 2> /dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { const r = JSON.parse(s).releases; if (Array.isArray(r) && /^world-\d+$/.test(r[0])) process.stdout.write(r[0]); } catch {}
    })'
}
# Two lines from a manifest: the first .glb and the first .ktx2 names (validated); nothing if unparseable.
assets_of() {
  curl -fsS "$ORIGIN/releases/$1.json" 2> /dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const files = JSON.parse(s).files, re = new RegExp(process.argv[1]);
        const pick = (ext) => files.find((f) => typeof f.name === "string" && re.test(f.name) && f.name.endsWith(ext));
        const glb = pick(".glb"), ktx2 = pick(".ktx2");
        if (glb && ktx2) process.stdout.write(`${glb.name}\n${ktx2.name}\n`);
      } catch {}
    })' "$NAME_RE"
}

latest=""; glb=""; ktx2=""
for i in $(seq 1 "$ATTEMPTS"); do
  latest="$(newest)"
  if [ -n "$latest" ] && { [ -z "$EXPECTED" ] || [ "$latest" = "$EXPECTED" ]; }; then
    names="$(assets_of "$latest")"
    glb="$(printf '%s\n' "$names" | sed -n 1p)"
    ktx2="$(printf '%s\n' "$names" | sed -n 2p)"
    [ -n "$glb" ] && [ -n "$ktx2" ] && break
  fi
  [ "$i" -lt "$ATTEMPTS" ] && sleep "$PAUSE"
done
if [ -z "$latest" ]; then miss "credits.json" "unreadable or names no release"; exit 1; fi
if [ -n "$EXPECTED" ] && [ "$latest" != "$EXPECTED" ]; then miss "newest release" "$latest, expected $EXPECTED"; exit 1; fi
if [ -z "$glb" ] || [ -z "$ktx2" ]; then miss "releases/$latest.json" "unreadable, or lists no .glb and .ktx2"; exit 1; fi
ok "newest release" "$latest"

# head_line URL HEADER [curl args]: "HTTP <status> <header>: <value or none>" from a HEAD request.
head_line() {
  local url="$1" name="$2"
  shift 2
  curl -sSI "$@" "$url" 2> /dev/null | tr -d '\r' | awk -v name="$name" '
    NR == 1 { code = $2 }
    tolower($0) ~ "^" name ":" { sub(/^[^:]*:[ \t]*/, ""); value = $0 }
    END { printf "HTTP %s %s: %s\n", code, name, (value == "" ? "none" : value) }'
}
range_line() { curl -sS -o /dev/null -w '%{http_code} %{size_download} bytes' -H 'Range: bytes=0-99' "$1" 2> /dev/null; }
status_line() { curl -sS -o /dev/null -w 'HTTP %{http_code}' "$1" 2> /dev/null; }

# expect NAME WANT_REGEX FUNCTION ARGS...: calls FUNCTION directly (no eval) until its output matches.
expect() {
  local name="$1" want="$2" got="" i
  shift 2
  for i in $(seq 1 "$ATTEMPTS"); do
    got="$("$@")"
    if printf '%s' "$got" | grep -Eq -- "$want"; then ok "$name" "$got"; return; fi
    [ "$i" -lt "$ATTEMPTS" ] && sleep "$PAUSE"
  done
  miss "$name" "got \"$got\", want /$want/"
}

echo "glb   $ORIGIN/files/$glb"
expect "glb gzip (Accept-Encoding: gzip)" '^HTTP 200 content-encoding: gzip$' head_line "$ORIGIN/files/$glb" content-encoding -H 'Accept-Encoding: gzip'
expect "glb access-control-allow-origin" '^HTTP 200 access-control-allow-origin: \*$' head_line "$ORIGIN/files/$glb" access-control-allow-origin
expect "glb Range: bytes=0-99" '^206 100 bytes$' range_line "$ORIGIN/files/$glb"
echo "ktx2  $ORIGIN/files/$ktx2"
expect "ktx2 Range: bytes=0-99" '^206 100 bytes$' range_line "$ORIGIN/files/$ktx2"
expect "ktx2 not encoded (Accept-Encoding: gzip)" '^HTTP 200 content-encoding: none$' head_line "$ORIGIN/files/$ktx2" content-encoding -H 'Accept-Encoding: gzip'
expect "credits.html" '^HTTP 200$' status_line "$ORIGIN/credits.html"

if [ "$misses" -gt 0 ]; then echo "$misses checks missed"; exit 1; fi
echo "all checks passed"
