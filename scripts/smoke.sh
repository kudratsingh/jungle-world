#!/usr/bin/env bash
# Post-deploy checks on the real origin (hosting study §5.4; synthesis §6.2), for the newest release the
# site serves: a .glb answers 200 gzipped with access-control-allow-origin: * and 206 for Range: bytes=0-99;
# a .ktx2 answers 206 for Range and 200 without content-encoding; credits.html answers 200. Pages edges can
# lag a deploy, so each check retries (8 attempts, 15 s apart, by default).
#
#   bash scripts/smoke.sh [https://kudratsingh.github.io/jungle-world]
set -uo pipefail
ORIGIN="${1:-https://kudratsingh.github.io/jungle-world}"
ATTEMPTS="${SMOKE_ATTEMPTS:-8}"
misses=0

# hdr URL HEADER [curl args]: one line, "HTTP <status> <header>: <value or none>", from a HEAD request.
hdr() {
  local url="$1" name="$2"
  shift 2
  curl -sSI "$@" "$url" | tr -d '\r' | awk -v name="$name" '
    NR == 1 { code = $2 }
    tolower($0) ~ "^" name ":" { sub(/^[^:]*:[ \t]*/, ""); value = $0 }
    END { printf "HTTP %s %s: %s\n", code, name, (value == "" ? "none" : value) }'
}

# check NAME COMMAND WANT: runs COMMAND (prints one value) until it matches WANT, ATTEMPTS times at most.
check() {
  local name="$1" cmd="$2" want="$3" got="" i
  for i in $(seq 1 "$ATTEMPTS"); do
    got="$(eval "$cmd" 2> /dev/null | tr -d '\r' | head -n 1)"
    if printf '%s' "$got" | grep -Eqi -- "$want"; then
      printf 'ok    %-40s %s\n' "$name" "$got"
      return
    fi
    [ "$i" -lt "$ATTEMPTS" ] && sleep 15
  done
  printf 'MISS  %-40s got "%s", want /%s/\n' "$name" "$got" "$want"
  misses=$((misses + 1))
}

check "credits.html" "curl -sS -o /dev/null -w 'HTTP %{http_code}' '$ORIGIN/credits.html'" "^HTTP 200$"
latest="$(curl -fsS "$ORIGIN/credits.json" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).releases[0]))')"
manifest="$(curl -fsS "$ORIGIN/releases/$latest.json")"
pick() { node -e 'const m=JSON.parse(process.argv[1]);const f=m.files.find((f)=>f.name.endsWith(process.argv[2]));if(f)console.log(process.argv[3]+"/files/"+f.name)' "$manifest" "$1" "$ORIGIN"; }
glb="$(pick .glb)"
ktx2="$(pick .ktx2)"
echo "release ${latest:-unknown} on $ORIGIN"

if [ -n "$glb" ]; then
  echo "glb   $glb"
  check "glb gzip (Accept-Encoding: gzip)" "hdr '$glb' content-encoding -H 'Accept-Encoding: gzip'" "^HTTP 200 content-encoding: gzip$"
  check "glb access-control-allow-origin" "hdr '$glb' access-control-allow-origin" "^HTTP 200 access-control-allow-origin: \\*$"
  check "glb Range: bytes=0-99" "curl -sS -o /dev/null -w '%{http_code} %{size_download} bytes' -H 'Range: bytes=0-99' '$glb'" "^206 100 bytes$"
else echo "skip  no .glb in ${latest:-the release}"; fi
if [ -n "$ktx2" ]; then
  echo "ktx2  $ktx2"
  check "ktx2 Range: bytes=0-99" "curl -sS -o /dev/null -w '%{http_code} %{size_download} bytes' -H 'Range: bytes=0-99' '$ktx2'" "^206 100 bytes$"
  check "ktx2 not encoded (Accept-Encoding: gzip)" "hdr '$ktx2' content-encoding -H 'Accept-Encoding: gzip'" "^HTTP 200 content-encoding: none$"
else echo "skip  no .ktx2 in ${latest:-the release}"; fi

if [ "$misses" -gt 0 ]; then echo "$misses checks missed"; exit 1; fi
echo "all checks passed"
