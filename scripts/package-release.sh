#!/usr/bin/env bash
#
# Empacota um release self-contained (app + runtime Node embutido + web/dist).
# Uso: NODE_VERSION=22.12.0 bash scripts/package-release.sh <versao> <target>
#   target: linux-x64 | linux-arm64 | win-x64
#
# Requisitos no runner:
#   - linux: curl, tar (com xz)
#   - windows (git-bash): curl, cygpath, powershell
#
# IMPORTANTE: o Node embutido DEVE ser a mesma versão usada para rodar `npm ci`
# (ABI do better-sqlite3). Por isso NODE_VERSION é único e compartilhado.
set -euo pipefail

VERSION="${1:?uso: package-release.sh <versao> <target>}"
TARGET="${2:?uso: package-release.sh <versao> <target>}"
NODE_VERSION="${NODE_VERSION:?defina NODE_VERSION (ex: 22.12.0)}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REL="$ROOT/release"
STAGE="$REL/nyuu-gui"
DL="$REL/dl"
OUT="$REL/out"

rm -rf "$REL"
mkdir -p "$STAGE/server" "$STAGE/web" "$DL" "$OUT"

echo ">> Empacotando nyuu-gui ${VERSION} para ${TARGET} (Node ${NODE_VERSION})"

# --- 1. App (sem dev deps; só o necessário para rodar) ---
cp -r "$ROOT/server/src" "$STAGE/server/src"
cp "$ROOT/server/package.json" "$STAGE/server/package.json"
cp -r "$ROOT/server/node_modules" "$STAGE/server/node_modules"
cp -r "$ROOT/web/dist" "$STAGE/web/dist"
[ -f "$ROOT/README.md" ] && cp "$ROOT/README.md" "$STAGE/README.md" || true
[ -f "$ROOT/server/.env.example" ] && cp "$ROOT/server/.env.example" "$STAGE/.env.example" || true
[ -d "$ROOT/deploy" ] && cp -r "$ROOT/deploy" "$STAGE/deploy" || true

# --- 2. Runtime Node embutido (apenas o binário node) ---
case "$TARGET" in
  win-x64)     NODE_DIR="node-v${NODE_VERSION}-win-x64";   NODE_EXT="zip" ;;
  linux-x64)   NODE_DIR="node-v${NODE_VERSION}-linux-x64";  NODE_EXT="tar.xz" ;;
  linux-arm64) NODE_DIR="node-v${NODE_VERSION}-linux-arm64"; NODE_EXT="tar.xz" ;;
  *) echo "target desconhecido: $TARGET" >&2; exit 1 ;;
esac
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIR}.${NODE_EXT}"

echo ">> Baixando runtime: $NODE_URL"
if [ "$TARGET" = "win-x64" ]; then
  curl -fsSL "$NODE_URL" -o "$DL/node.zip"
  ZIP_W="$(cygpath -w "$DL/node.zip")"
  DEST_W="$(cygpath -w "$DL")"
  powershell -NoProfile -Command "Expand-Archive -Path '$ZIP_W' -DestinationPath '$DEST_W' -Force"
  mkdir -p "$STAGE/runtime"
  cp "$DL/$NODE_DIR/node.exe" "$STAGE/runtime/node.exe"
else
  curl -fsSL "$NODE_URL" -o "$DL/node.tar.xz"
  tar -xJf "$DL/node.tar.xz" -C "$DL"
  mkdir -p "$STAGE/runtime/bin"
  cp "$DL/$NODE_DIR/bin/node" "$STAGE/runtime/bin/node"
fi

# --- 3. Launchers ---
cat > "$STAGE/nyuu-gui.sh" <<'EOF'
#!/usr/bin/env bash
# Sobe o Nyuu GUI usando o Node embutido. Estado em ./data (sobrescreva com DATA_DIR).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DATA_DIR="${DATA_DIR:-$DIR/data}"
export PORT="${PORT:-8787}"
exec "$DIR/runtime/bin/node" "$DIR/server/src/index.js"
EOF
chmod +x "$STAGE/nyuu-gui.sh"

cat > "$STAGE/nyuu-gui.bat" <<'EOF'
@echo off
REM Sobe o Nyuu GUI usando o Node embutido. Estado em .\data (sobrescreva com DATA_DIR).
set "DIR=%~dp0"
if "%DATA_DIR%"=="" set "DATA_DIR=%DIR%data"
if "%PORT%"=="" set "PORT=8787"
"%DIR%runtime\node.exe" "%DIR%server\src\index.js"
EOF

# --- 4. Arquivar ---
NAME="nyuu-gui-${VERSION}-${TARGET}"
if [ "$TARGET" = "win-x64" ]; then
  ART="$OUT/${NAME}.zip"
  STAGE_W="$(cygpath -w "$STAGE")"
  ART_W="$(cygpath -w "$ART")"
  powershell -NoProfile -Command "Compress-Archive -Path '$STAGE_W' -DestinationPath '$ART_W' -Force"
else
  ART="$OUT/${NAME}.tar.xz"
  ( cd "$REL" && tar -cJf "$ART" "nyuu-gui" )
fi

# --- 5. Checksum (best-effort) ---
( cd "$OUT" && (sha256sum "$(basename "$ART")" 2>/dev/null || shasum -a 256 "$(basename "$ART")" 2>/dev/null) > "$(basename "$ART").sha256" ) || true

echo ">> Gerado: $ART"
ls -la "$OUT"
