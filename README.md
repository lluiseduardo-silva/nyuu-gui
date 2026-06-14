# Nyuu GUI

Wrapper com interface web para fazer backups da sua biblioteca na **Usenet** usando o
[`nyuu`](https://github.com/animetosho/Nyuu). É o seu `post.sh` + `upload_curupira.sh`
transformados em uma fila persistente com progresso, editor de configuração e integração
com o indexador.

## O que faz

1. **Fila de backup persistente** — sobrevive a restarts (estado em SQLite). Cada job passa
   pelas etapas **NFO → par2 → post (nyuu) → indexação (Curupira)**, com progresso ao vivo,
   logs por job, reordenação, pausar/retomar e repostar.
2. **Editor JSON da config do nyuu** — uma tela dedicada que edita o `nyuu.json`
   (host, usuário, senha, conexões, grupos, SSL, etc.) direto pela web.
3. **Integração com indexador (extensível)** — depois de postar, envia o `.nzb` (+ `.nfo` +
   categoria) para o seu indexador. Começa com o **Curupira**, mas os providers são plugáveis
   via _factory_ (veja [Adicionando um provider](#adicionando-um-provider-de-indexador)).

Por que chamar o `nyuu` como subprocesso e não via API? O nyuu é um binário CLI e **não expõe
uma API programática estável**. Chamar o CLI (a interface documentada) isola crashes e é
muito mais robusto. O `par2` e o `mediainfo` também são binários externos — o nyuu não gera
par2 sozinho (a integração com ParPar ainda é "planned feature").

## Arquitetura

```
web/      Frontend React (Vite). Em produção é buildado para web/dist.
server/   Backend Node (Fastify + better-sqlite3).
          ├─ exec/       runner de subprocessos + binários (nyuu/par2/mediainfo) + mocks
          ├─ providers/  factory de indexadores (curupira.js, ...) — plugável
          ├─ queue/      worker da fila + pipeline das etapas
          ├─ store/      jobs (SQLite), settings, nyuu.json
          └─ routes/     REST + SSE (/events)
scripts/  dev.mjs — sobe server + web juntos em dev
```

O estado fica em `server/data/` (ou no `DATA_DIR` que você definir): banco SQLite,
`nyuu.json`, logs (`logs/job-<id>.log`) e a saída padrão de NZB/NFO (`out/`).

## Modo MOCK

Para desenvolver/testar **sem** ter `nyuu`/`par2`/`mediainfo` instalados (ex: no Windows),
existe o **modo mock**: ele simula as etapas com progresso fake. Liga sozinho no Windows;
controle com a variável `MOCK=1`/`MOCK=0` ou pelo toggle em **Configurações**.

## Desenvolvimento

```bash
npm run install:all      # instala server/ e web/
npm run dev              # server (:8787) + Vite (:5173, com proxy /api e /events)
```

Abra **http://localhost:5173**. No Windows o mock já vem ligado.

> **Nota de segurança (somente dev):** o `npm audit` do `web/` aponta um aviso *high* do
> `esbuild`/Vite. Ele afeta **apenas o dev-server** do Vite e o único fix disponível hoje
> (Vite 8) troca o bundler para o `rolldown`, que ainda não builda de forma estável aqui.
> **A produção não roda esbuild/vite** — o Fastify serve arquivos estáticos já buildados,
> então o aviso não afeta o deploy. Travamos no Vite 7 de propósito.

## Produção — Linux nativo (LXC Debian 13)

No deploy nativo a aplicação **assume que `nyuu`, `par2` e `mediainfo` já estão instalados**
no host e disponíveis no PATH (não instala nada). Pré-requisitos: `node` >= 20.19 (o build do
Vite exige 20.19+; o runtime roda em 20.x).

```bash
git clone <repo> /opt/nyuu-gui && cd /opt/nyuu-gui
npm run install:all
npm run build                      # gera web/dist
DATA_DIR=/var/lib/nyuu-gui PORT=8787 MOCK=0 npm start
```

O backend passa a servir a UI buildada em `http://<servidor>:8787` (mesma porta da API).

### systemd

`/etc/systemd/system/nyuu-gui.service`:

```ini
[Unit]
Description=Nyuu GUI
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/nyuu-gui
Environment=PORT=8787
Environment=DATA_DIR=/var/lib/nyuu-gui
Environment=MOCK=0
# garanta que nyuu/par2/mediainfo estão no PATH (ajuste se necessário):
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/usr/bin/node server/src/index.js
Restart=on-failure
User=nyuu

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nyuu-gui
```

## Produção — Docker

Diferente do deploy nativo, **a imagem Docker já instala `nyuu`, `par2` e `mediainfo`**.

```bash
docker compose up -d --build
```

Edite o `docker-compose.yml` para **montar sua biblioteca de mídia** dentro do container — os
caminhos que você escolhe na UI são os caminhos _de dentro_ do container. O estado (banco,
`nyuu.json`, logs, NZBs) fica no volume `nyuu-data`.

## Instalação/atualização rápida (script)

Para Linux, há scripts que baixam o archive da última release, instalam em `/opt/nyuu-gui`,
tentam instalar `par2`/`mediainfo` via apt e criam/ativam o serviço systemd:

```bash
# instalar (ou reinstalar)
curl -fsSL https://raw.githubusercontent.com/lluiseduardo-silva/nyuu-gui/main/scripts/install.sh | sudo bash

# atualizar para a última release (preserva DATA_DIR)
curl -fsSL https://raw.githubusercontent.com/lluiseduardo-silva/nyuu-gui/main/scripts/update.sh | sudo bash
```

Variáveis opcionais: `VERSION=vX.Y.Z`, `PORT=8787`, `DATA_DIR=/var/lib/nyuu-gui`,
`PREFIX=/opt/nyuu-gui`, `SERVICE_USER=root`. O `nyuu` ainda precisa estar no PATH
(`npm i -g nyuu`) — ou use a imagem Docker, que já o inclui.

## Telas

A configuração é dividida por assunto (sem uma tela única gigante):

- **Geral** — pasta de saída, workdir do par2, caminhos dos binários, padrões de par2
  (redundância/volumes), subpastas, concorrência e o toggle de **mock**.
- **Indexador** — liga/desliga o envio, escolhe o **provider** (factory) e configura
  dinamicamente os campos que ele exige + a lista de categorias.
- **Config nyuu** — editor JSON puro do `nyuu.json` (lido pelo nyuu via `-C`).

Senha do nyuu e segredos dos providers (API keys) são mascarados na interface e nunca
retornam em texto puro pela API.

## Adicionando um provider de indexador

Os providers ficam em `server/src/providers/`. Para adicionar um novo (ex: `nzbgeek`):

1. Crie `server/src/providers/nzbgeek.js` exportando o contrato:

   ```js
   export const id = 'nzbgeek'
   export const label = 'NZBgeek'
   export const configSchema = [
     { key: 'apiUrl', label: 'API URL', type: 'url' },
     { key: 'apiKey', label: 'API Key', type: 'password', secret: true },
   ]
   export const defaultConfig = { apiUrl: '', apiKey: '' }
   export const defaultCategories = [/* { id, label }, ... */]

   // Contrato UNIVERSAL: todo provider recebe nzb + nfo + categoria.
   export async function upload({ nzbPath, nfoPath, categoryId, name, config, onLine, signal }) {
     // ...faça o upload do jeito desse indexador...
     return { ok: true, status: 201, body: {} }
   }
   ```

2. Registre no `server/src/providers/index.js` (importe e adicione ao `REGISTRY`).

Pronto — ele aparece automaticamente no seletor da tela **Indexador**, com seus campos e
categorias. Nada mais no app precisa mudar.

## Releases & CI/CD (GitHub Actions)

- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — em cada push/PR: instala,
  builda o frontend, checa sintaxe e faz um smoke test de boot em modo mock.
- **Release** ([`.github/workflows/release.yml`](.github/workflows/release.yml)) — ao criar uma
  tag `vX.Y.Z`:
  - gera **archives self-contained** (app + **runtime Node embutido** + `web/dist`) para
    `linux-x64`, `linux-arm64` e `win-x64`, anexados ao GitHub Release;
  - builda e publica a **imagem Docker** em `ghcr.io/<owner>/<repo>:<versão>` e `:latest`.

Para disparar:

```bash
git remote add origin git@github.com:<owner>/<repo>.git
git add -A && git commit -m "primeira versão"
git push -u origin main
git tag v0.1.0 && git push origin v0.1.0     # dispara o release
```

Os archives **não precisam de Node instalado** — só do `nyuu`/`par2`/`mediainfo` no PATH
(no Windows, idem; ou use a imagem Docker, que já traz tudo). Para rodar um archive:

```bash
tar -xJf nyuu-gui-0.1.0-linux-x64.tar.xz && cd nyuu-gui
./nyuu-gui.sh                 # Windows: nyuu-gui.bat
```

> A imagem no GHCR nasce **privada**; torne-a pública nas settings do pacote, ou autentique
> com `docker login ghcr.io` antes do `docker pull`.

## Observações

- **Restart no meio de um job:** ao reiniciar o servidor, jobs que estavam rodando voltam
  para a fila e **reprocessam do começo** (o post recomeça do zero — os artigos parciais
  anteriores ficam órfãos na Usenet). Isso é seguro para backup, só desperdiça um pouco de
  upload.
- **Pausar** um job em execução mata o `nyuu`/`par2`; para continuar use **retomar** (que
  reenfileira do início da pipeline).
- Categorias do Curupira que já vêm configuradas: `2040` Movies/HD, `2045` Movies/UHD,
  `5040` TV/HD, `5045` TV/UHD.
