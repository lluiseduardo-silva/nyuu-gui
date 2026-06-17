# Imagem de deploy via Docker. Ao contrário do deploy nativo (que assume nyuu/par2/
# mediainfo já instalados no host), aqui a imagem instala tudo.
FROM node:22-bookworm-slim

# Runtime: par2 + mediainfo. Toolchain (python3/make/g++) para compilar módulos
# nativos (yencode do nyuu e better-sqlite3) quando não houver prebuilt para a plataforma.
RUN apt-get update && apt-get install -y --no-install-recommends \
      par2 \
      mediainfo \
      ca-certificates \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# nyuu (poster Usenet) + ParPar (gerador de paridade PADRÃO, multi-thread) instalados
# globalmente -> ficam no PATH como `nyuu` e `parpar`. (par2cmdline fica como fallback.)
RUN npm install -g nyuu @animetosho/parpar

WORKDIR /app

# Instala dependências primeiro (aproveita cache de camada).
COPY package*.json ./
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm --prefix server ci && npm --prefix web ci

# Copia o código e builda o frontend (web/dist é servido pelo backend).
COPY . .
RUN npm run build

ENV PORT=8787 \
    DATA_DIR=/data \
    MOCK=0
VOLUME /data
EXPOSE 8787

CMD ["node", "server/src/index.js"]
