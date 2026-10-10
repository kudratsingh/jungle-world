#!/usr/bin/env bash
# Post-deploy checks on the real origin (hosting study section 5.4; synthesis section 6.2): a .glb is
# gzipped with ACAO * and honours Range with 206; a .ktx2 honours Range and is not encoded; the credits
# page answers 200. Pages edges can lag a deploy, so each check retries for up to about two minutes.
#
#   bash scripts/smoke.sh [https://kudratsingh.github.io/jungle-world]
set -uo pipefail
ORIGIN="${1:-https://kudratsingh.github.io/jungle-world}"
ATTEMPTS="${SMOKE_ATTEMPTS:-8}"
fail=0

latest="$(curl -fsS "$ORIGIN/credits.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).releases[0]))')" || { echo "FAIL credits.json not served"; exit 1; }
manifest="$(curl -fsS "$ORIGIN/releases/$latest.json")" || { echo "FAIL releases/$latest.json not served"; exit 1; }
pick() { node -e 'const m=JSON.parse(process.argv[1]);const f=m.files.find(f=>f.name.endsWith(process.argv[2]));if(f)console.log(m.base.replace(/^\/jungle-world/,"")+f.name)' "$manifest" "$1"; }
glb="$(pick .glb)"; ktx2="$(pick .ktx2)"

check() { # name, command that prints the observed value, expected regex
  local name="$1" cmd="$2" want="$3" got="" i
  for i in $(seq 1 "$ATTEMPTS"); do
    got="$(eval "$cmd" 2>/dev/null | tr -d '\r')"
    if printf '%s' "$got" | grep -Eqi -- "$want"; then echo "ok   $name: $(printf '%s' "$got" | head -n 1)"; return; fi
    sleep 15
  done
  echo "FAIL $name: got '$(printf '%s' "$got" | head -n 1)', want /$want/"; fail=1
}

echo "origin $ORIGIN, release $latest"
if [ -n "$glb" ]; then
  check "glb content-encoding" "curl -sSI -H 'Accept-Encoding: gzip' '$ORIGIN$glb' | grep -i '^content-encoding:'" "gzip"
  check "glb access-control-allow-origin" "curl -sSI '$ORIGIN$glb' | grep -i '^access-control-allow-origin:'" "\\*"
  check "glb Range bytes=0-99" "curl -sS -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-99' '$ORIGIN$glb'" "^206$"
else echo "skip glb: the latest release has none"; fi
if [ -n "$ktx2" ]; then
  check "ktx2 Range bytes=0-99" "curl -sS -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-99' '$ORIGIN$ktx2'" "^206$"
  check "ktx2 no content-encoding" "curl -sSI -H 'Accept-Encoding: gzip' '$ORIGIN$ktx2' | grep -ci '^content-encoding:'" "^0$"
else echo "skip ktx2: the latest release has none"; fi
check "credits.html" "curl -sS -o /dev/null -w '%{http_code}' '$ORIGIN/credits.html'" "^200$"
exit "$fail"
