#!/usr/bin/env bash
#
# Instalador do Nyuu GUI para Linux (Debian/Ubuntu, etc.).
# Baixa o archive self-contained (Node embutido), instala em /opt/nyuu-gui,
# tenta instalar par2/mediainfo via apt e cria/ativa o serviço systemd.
#
# Uso (como root):
#   curl -fsSL https://raw.githubusercontent.com/lluiseduardo-silva/nyuu-gui/main/scripts/install.sh | sudo bash
#
# Variáveis (opcionais):
#   VERSION=v0.1.0        # versão específica (default: última release)
#   PREFIX=/opt/nyuu-gui  # onde instalar o app
#   DATA_DIR=/var/lib/nyuu-gui
#   PORT=8787
#   SERVICE_USER=root     # usuário do serviço
set -euo pipefail

REPO="${REPO:-lluiseduardo-silva/nyuu-gui}"
PREFIX="${PREFIX:-/opt/nyuu-gui}"
DATA_DIR="${DATA_DIR:-/var/lib/nyuu-gui}"
PORT="${PORT:-8787}"
SERVICE_USER="${SERVICE_USER:-root}"
VERSION="${VERSION:-latest}"

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (use sudo)." >&2; exit 1; }

case "$(uname -m)" in
  x86_64|amd64)  ARCH=linux-x64 ;;
  aarch64|arm64) ARCH=linux-arm64 ;;
  *) echo "Arquitetura não suportada: $(uname -m)" >&2; exit 1 ;;
esac

# Resolve a tag da release.
if [ "$VERSION" = "latest" ]; then
  TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -oP '"tag_name":\s*"\K[^"]+' || true)"
else
  TAG="$VERSION"
fi
[ -n "${TAG:-}" ] || { echo "Não consegui resolver a versão (rate limit da API? tente VERSION=vX.Y.Z)." >&2; exit 1; }

VER="${TAG#v}"
ASSET="nyuu-gui-${VER}-${ARCH}.tar.xz"
URL="https://github.com/$REPO/releases/download/${TAG}/${ASSET}"

echo ">> Instalando nyuu-gui ${TAG} (${ARCH})"

# par2 + mediainfo via apt (se disponível).
if command -v apt-get >/dev/null 2>&1; then
  echo ">> Instalando par2 e mediainfo (apt)..."
  apt-get update -qq || true
  apt-get install -y --no-install-recommends par2 mediainfo >/dev/null \
    || echo "!! Falha ao instalar par2/mediainfo via apt — instale manualmente."
fi

# Download + extração.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo ">> Baixando $URL"
curl -fL -o "$TMP/app.tar.xz" "$URL"
tar -xJf "$TMP/app.tar.xz" -C "$TMP"   # cria $TMP/nyuu-gui

# Instala em PREFIX (substitui só o app; DATA_DIR fica separado e é preservado).
systemctl stop nyuu-gui 2>/dev/null || true
rm -rf "$PREFIX"
mkdir -p "$(dirname "$PREFIX")"
mv "$TMP/nyuu-gui" "$PREFIX"
echo "$TAG" > "$PREFIX/.version"
mkdir -p "$DATA_DIR"

# Usuário do serviço.
if [ "$SERVICE_USER" != "root" ] && ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER" || true
fi
chown -R "$SERVICE_USER":"$SERVICE_USER" "$PREFIX" "$DATA_DIR" 2>/dev/null || true

# Unit do systemd.
cat > /etc/systemd/system/nyuu-gui.service <<EOF
[Unit]
Description=Nyuu GUI — backups Usenet
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PREFIX
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA_DIR
Environment=MOCK=0
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$PREFIX/runtime/bin/node $PREFIX/server/src/index.js
Restart=on-failure
RestartSec=3
User=$SERVICE_USER

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now nyuu-gui

echo ""
echo ">> Pronto! Serviço nyuu-gui ativo."
systemctl --no-pager status nyuu-gui | head -n 4 || true

if ! command -v nyuu >/dev/null 2>&1; then
  echo ""
  echo "!! ATENÇÃO: 'nyuu' não está no PATH."
  echo "   Instale com: npm i -g nyuu   (requer node/npm + build-essential python3)"
  echo "   Ou rode via Docker, que já traz nyuu/par2/mediainfo."
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo ">> UI: http://${IP:-<ip-da-lxc>}:$PORT"
