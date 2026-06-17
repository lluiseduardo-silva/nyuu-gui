#!/usr/bin/env bash
#
# Atualizador do Nyuu GUI. Verifica a última release; se for mais nova que a
# instalada, baixa, substitui o app em PREFIX (preservando DATA_DIR) e reinicia.
# Mantém a unit do systemd existente (não a recria).
#
# Uso (como root):
#   curl -fsSL https://raw.githubusercontent.com/lluiseduardo-silva/nyuu-gui/main/scripts/update.sh | sudo bash
#
# Variáveis (opcionais):
#   VERSION=v0.2.0        # força uma versão específica (default: última)
#   PREFIX=/opt/nyuu-gui
set -euo pipefail

REPO="${REPO:-lluiseduardo-silva/nyuu-gui}"
PREFIX="${PREFIX:-/opt/nyuu-gui}"
VERSION="${VERSION:-latest}"

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (use sudo)." >&2; exit 1; }
[ -d "$PREFIX" ] || { echo "Instalação não encontrada em $PREFIX. Rode o install.sh primeiro." >&2; exit 1; }

case "$(uname -m)" in
  x86_64|amd64)  ARCH=linux-x64 ;;
  aarch64|arm64) ARCH=linux-arm64 ;;
  *) echo "Arquitetura não suportada: $(uname -m)" >&2; exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -oP '"tag_name":\s*"\K[^"]+' || true)"
else
  TAG="$VERSION"
fi
[ -n "${TAG:-}" ] || { echo "Não consegui resolver a versão." >&2; exit 1; }

CURRENT="$(cat "$PREFIX/.version" 2>/dev/null || echo 'desconhecida')"
if [ "$TAG" = "$CURRENT" ]; then
  echo ">> Já está na versão mais recente ($TAG). Nada a fazer."
  exit 0
fi
echo ">> Atualizando: $CURRENT -> $TAG"

VER="${TAG#v}"
ASSET="nyuu-gui-${VER}-${ARCH}.tar.xz"
URL="https://github.com/$REPO/releases/download/${TAG}/${ASSET}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo ">> Baixando $URL"
curl -fL -o "$TMP/app.tar.xz" "$URL"
tar -xJf "$TMP/app.tar.xz" -C "$TMP"

# Descobre o usuário do serviço para preservar o ownership.
OWNER="$(grep -oP '^User=\K.*' /etc/systemd/system/nyuu-gui.service 2>/dev/null || echo root)"

systemctl stop nyuu-gui 2>/dev/null || true
rm -rf "$PREFIX"
mv "$TMP/nyuu-gui" "$PREFIX"
echo "$TAG" > "$PREFIX/.version"
chown -R "$OWNER":"$OWNER" "$PREFIX" 2>/dev/null || true
systemctl start nyuu-gui

echo ">> Atualizado para $TAG."
systemctl --no-pager status nyuu-gui | head -n 4 || true

# A partir do v0.1.4 o algoritmo de paridade PADRÃO é o ParPar (binário `parpar`, via npm).
# Instalações antigas (DATA_DIR preservado, sem `parity` salvo) passam a usá-lo por padrão —
# então garante/avisa para o job não falhar no início com "binário 'parpar' não encontrado".
if ! command -v parpar >/dev/null 2>&1; then
  echo ""
  echo ">> 'parpar' (algoritmo de paridade PADRÃO desde v0.1.4) não está no PATH."
  if command -v npm >/dev/null 2>&1; then
    echo ">> Instalando via npm (npm i -g @animetosho/parpar)..."
    npm i -g @animetosho/parpar >/dev/null 2>&1 \
      && echo ">> parpar instalado." \
      || echo "!! Falha ao instalar parpar via npm (faltam toolchain/prebuilds? tente manualmente)."
  else
    echo "!! npm não encontrado — instale Node/npm e rode: npm i -g @animetosho/parpar"
  fi
  if ! command -v parpar >/dev/null 2>&1; then
    echo "!! ATENÇÃO: sem 'parpar', em Geral → Algoritmo de paridade troque para 'par2cmdline'"
    echo "   (o par2 já deve estar instalado), ou instale o parpar — o serviço o acha sem restart."
  fi
fi
