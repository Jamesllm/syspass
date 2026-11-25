#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  SysPass · instalador para servidores Linux con Docker
#
#  Desde internet (imagen publicada):
#    curl -fsSL https://github.com/Jamesllm/syspass/releases/latest/download/install.sh | sudo SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest bash
#
#  Desde el código fuente (construye la imagen en el servidor):
#    sudo ./deploy/install.sh
#
#  Sin preguntas (todo por variables):
#    sudo DOMAIN=vault.miempresa.com ACME_EMAIL=ti@miempresa.com OWNER_USER=admin ./deploy/install.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SYSPASS_DIR="${SYSPASS_DIR:-/opt/syspass}"
SYSPASS_IMAGE="${SYSPASS_IMAGE:-}"
BIN_LINK="/usr/local/bin/syspass"

if [ -t 1 ]; then B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; N=$'\e[0m'; else B= D= G= R= Y= N=; fi
step() { printf '\n%s==>%s %s%s%s\n' "$G" "$N" "$B" "$*" "$N"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '%s  ! %s%s\n' "$Y" "$*" "$N"; }
die()  { printf '\n%sError:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

# Pregunta solo si la variable no vino ya definida. Lee de /dev/tty para funcionar con curl | bash.
ask() {
  local var=$1 question=$2 default=${3:-} answer=''
  if [ -n "${!var:-}" ]; then return; fi
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '    %s%s: ' "$question" "${default:+ ${D}[$default]${N}}" > /dev/tty
    IFS= read -r answer < /dev/tty || true
  fi
  printf -v "$var" '%s' "${answer:-$default}"
}

rand_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

printf '\n%sSysPass%s · instalación\n' "$B" "$N"

# ── 1. Requisitos ────────────────────────────────────────────
step 'Revisando el servidor'
[ "$(uname -s)" = Linux ] || die 'Este instalador es para Linux. En Windows o macOS usa Docker Desktop (ver README).'
[ "$(id -u)" -eq 0 ] || die 'Ejecútalo con sudo.'
[ -f "$SYSPASS_DIR/.env" ] && die "Ya hay una instalación en $SYSPASS_DIR. Para actualizar usa: syspass upgrade"

if ! command -v docker >/dev/null 2>&1; then
  ask INSTALL_DOCKER 'Docker no está instalado. ¿Instalarlo ahora? (s/n)' 's'
  case "$INSTALL_DOCKER" in s|S|si|sí|y|Y) ;; *) die 'SysPass necesita Docker.' ;; esac
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
docker compose version >/dev/null 2>&1 || die 'Falta Docker Compose v2 (el comando "docker compose").'
info "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') listo"

# Código fuente al lado del instalador = se puede construir la imagen aquí mismo
SRC_DIR=''
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/../Dockerfile" ]; then
  SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
[ -n "$SYSPASS_IMAGE" ] || [ -n "$SRC_DIR" ] || die 'Indica la imagen con SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest o ejecuta el instalador desde el código fuente.'

# ── 2. Preguntas ─────────────────────────────────────────────
step 'Configuración'
info 'Con dominio, SysPass obtiene HTTPS automático (Let’s Encrypt). El dominio debe apuntar a este servidor.'
ask DOMAIN 'Dominio (vacío para usar la IP del servidor)' ''
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
if [ -n "$DOMAIN" ]; then
  ask ACME_EMAIL 'Correo para avisos del certificado (opcional)' ''
  APP_BIND=127.0.0.1; APP_PORT=8080; PROFILES=https
  PUBLIC_URL="https://$DOMAIN"; SECURE_COOKIES=true; TRUST_PROXY=true
else
  ask APP_PORT 'Puerto web' '80'
  APP_BIND=0.0.0.0; PROFILES=''; ACME_EMAIL=''
  HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  PUBLIC_URL="http://${HOST_IP:-IP-DEL-SERVIDOR}$([ "$APP_PORT" = 80 ] || echo ":$APP_PORT")"
  SECURE_COOKIES=false; TRUST_PROXY=false
  warn 'Sin dominio el tráfico va sin cifrar. Úsalo solo dentro de la red interna o la VPN.'
fi
ask OWNER_USER 'Usuario del dueño de la plataforma' 'admin'
ask OWNER_NAME 'Nombre del dueño' 'Administrador SysPass'

# ── 3. Archivos ──────────────────────────────────────────────
step "Creando $SYSPASS_DIR"
mkdir -p "$SYSPASS_DIR/backups"
cd "$SYSPASS_DIR"

if [ -z "$SYSPASS_IMAGE" ]; then SYSPASS_IMAGE='syspass:local'; fi
VAULT_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
POSTGRES_PASSWORD="$(rand_hex 24)"

umask 077
cat > .env <<EOF
# SysPass · configuración generada el $(date '+%Y-%m-%d %H:%M')
# Guarda una copia de VAULT_KEY fuera de este servidor: sin ella los respaldos no se pueden descifrar.
SYSPASS_IMAGE=$SYSPASS_IMAGE
SYSPASS_SOURCE=$SRC_DIR
COMPOSE_PROFILES=$PROFILES
PUBLIC_URL=$PUBLIC_URL
DOMAIN=$DOMAIN
APP_BIND=$APP_BIND
APP_PORT=$APP_PORT
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
VAULT_KEY=$VAULT_KEY
SECURE_COOKIES=$SECURE_COOKIES
TRUST_PROXY=$TRUST_PROXY
SESSION_IDLE_MINUTES=30
SESSION_MAX_HOURS=12
EOF
umask 022

cat > docker-compose.yml <<'EOF'
# SysPass · generado por el instalador. Configuración en .env
name: syspass

services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: syspass
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: syspass
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U syspass -d syspass"]
      interval: 5s
      timeout: 5s
      retries: 20

  app:
    image: ${SYSPASS_IMAGE}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://syspass:${POSTGRES_PASSWORD}@db:5432/syspass
      VAULT_KEY: ${VAULT_KEY}
      SECURE_COOKIES: ${SECURE_COOKIES:-false}
      TRUST_PROXY: ${TRUST_PROXY:-false}
      SESSION_IDLE_MINUTES: ${SESSION_IDLE_MINUTES:-30}
      SESSION_MAX_HOURS: ${SESSION_MAX_HOURS:-12}
    ports:
      - "${APP_BIND:-0.0.0.0}:${APP_PORT:-80}:8080"

  caddy:
    image: caddy:2-alpine
    profiles: ["https"]
    restart: unless-stopped
    depends_on: [app]
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  pgdata:
  caddy_data:
  caddy_config:
EOF

if [ -n "$DOMAIN" ]; then
  {
    [ -n "$ACME_EMAIL" ] && printf '{\n\temail %s\n}\n\n' "$ACME_EMAIL"
    printf '%s {\n\tencode zstd gzip\n\treverse_proxy app:8080\n}\n' "$DOMAIN"
  } > Caddyfile
fi

# CLI de administración
cat > syspass <<'CLI'
#!/usr/bin/env bash
# SysPass · administración del servidor
set -euo pipefail
DIR="${SYSPASS_DIR:-/opt/syspass}"
[ -f "$DIR/.env" ] || { echo "No hay instalación en $DIR" >&2; exit 1; }
cd "$DIR"
set -a; . ./.env; set +a
dc() { docker compose --project-directory "$DIR" "$@"; }

wait_healthy() {
  printf 'Esperando a SysPass'
  for _ in $(seq 1 90); do
    if dc exec -T app wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1; then echo ' listo'; return 0; fi
    printf '.'; sleep 2
  done
  echo; echo 'SysPass no respondió. Revisa: syspass logs' >&2; return 1
}

backup() {
  mkdir -p backups
  local f="backups/syspass-$(date +%Y%m%d-%H%M%S).dump"
  dc exec -T db pg_dump -U syspass -Fc syspass > "$f"
  echo "Respaldo: $DIR/$f ($(du -h "$f" | cut -f1))"
  echo 'Recuerda: se descifra solo con la VAULT_KEY de .env'
}

build_or_pull() {
  if [ -n "${SYSPASS_SOURCE:-}" ] && [ -f "$SYSPASS_SOURCE/Dockerfile" ]; then
    if [ -d "$SYSPASS_SOURCE/.git" ]; then git -C "$SYSPASS_SOURCE" pull --ff-only || true; fi
    docker build -t "$SYSPASS_IMAGE" "$SYSPASS_SOURCE"
  else
    dc pull app
  fi
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  start)    dc up -d && wait_healthy && echo "Abierto en $PUBLIC_URL" ;;
  stop)     dc stop ;;
  restart)  dc restart && wait_healthy ;;
  status)   dc ps; echo; echo "URL: $PUBLIC_URL" ;;
  logs)     dc logs -f --tail=200 "${@:-app}" ;;
  backup)   backup ;;
  restore)
    f="${1:-}"; [ -f "$f" ] || { echo 'Uso: syspass restore backups/archivo.dump' >&2; exit 1; }
    read -r -p "Esto reemplaza TODOS los datos actuales con $f. Escribe RESTAURAR para continuar: " ok
    [ "$ok" = RESTAURAR ] || { echo 'Cancelado'; exit 1; }
    backup
    dc stop app
    dc exec -T db pg_restore -U syspass -d syspass --clean --if-exists --no-owner < "$f"
    dc start app && wait_healthy ;;
  upgrade)
    echo 'Respaldo previo a la actualización'; backup
    build_or_pull
    dc up -d && wait_healthy
    docker image prune -f >/dev/null 2>&1 || true
    echo 'SysPass actualizado (las migraciones se aplican solas)' ;;
  admin)
    [ $# -ge 2 ] || { echo 'Uso: syspass admin <codigo-empresa> <usuario> "Nombre"' >&2; exit 1; }
    dc exec -T app node dist/scripts/create-admin.js "$@" ;;
  owner)
    [ $# -ge 1 ] || { echo 'Uso: syspass owner <usuario> "Nombre"' >&2; exit 1; }
    dc exec -T app node dist/scripts/platform-init.js "$@" ;;
  url)      echo "$PUBLIC_URL" ;;
  uninstall)
    purge=no; [ "${1:-}" = --purge ] && purge=yes
    if [ $purge = yes ]; then
      read -r -p 'Se BORRARÁN la base de datos y los certificados. Escribe BORRAR para continuar: ' ok
      [ "$ok" = BORRAR ] || { echo 'Cancelado'; exit 1; }
      dc down -v; rm -f /usr/local/bin/syspass; echo "Datos borrados. Quedan los respaldos y .env en $DIR"
    else
      dc down; echo "SysPass detenido. Los datos siguen guardados; vuelve con: syspass start"
    fi ;;
  *)
    cat <<'HELP'
SysPass · comandos

  syspass start | stop | restart | status
  syspass logs [app|db|caddy]
  syspass url                              Dirección pública
  syspass backup                           Respaldo de la base en backups/
  syspass restore backups/archivo.dump     Restaurar un respaldo
  syspass upgrade                          Respaldo + nueva versión + migraciones
  syspass admin <empresa> <usuario> "Nombre"   Crear o restablecer el admin de una empresa
  syspass owner <usuario> "Nombre"         Crear o restablecer un dueño de la plataforma
  syspass uninstall [--purge]              Detener (o borrar todo con --purge)
HELP
    ;;
esac
CLI
chmod 755 syspass
ln -sf "$SYSPASS_DIR/syspass" "$BIN_LINK"

# ── 4. Imagen ────────────────────────────────────────────────
if [ "$SYSPASS_IMAGE" = 'syspass:local' ]; then
  step 'Construyendo la imagen desde el código (unos minutos la primera vez)'
  docker build -t syspass:local "$SRC_DIR"
else
  step "Descargando $SYSPASS_IMAGE"
  docker compose --project-directory "$SYSPASS_DIR" pull
fi

# ── 5. Arranque ──────────────────────────────────────────────
step 'Iniciando SysPass'
SYSPASS_DIR="$SYSPASS_DIR" "$BIN_LINK" start || die 'SysPass no arrancó. Revisa: syspass logs'

step 'Creando la cuenta del dueño de la plataforma'
OWNER_OUT="$(docker compose --project-directory "$SYSPASS_DIR" exec -T app node dist/scripts/platform-init.js "$OWNER_USER" "$OWNER_NAME")"
TEMP_PASS="$(printf '%s\n' "$OWNER_OUT" | sed -n 's/^Contraseña temporal: //p')"

cat <<EOF

${G}${B}SysPass está instalado${N}

  Dirección      ${B}$PUBLIC_URL${N}
  Empresa        ${B}syspass${N}
  Usuario        ${B}$OWNER_USER${N}
  Contraseña     ${B}$TEMP_PASS${N}  (temporal, te pedirá cambiarla)

  Las empresas se registran en ${B}$PUBLIC_URL/registro${N}

  ${Y}Importante:${N} copia la línea VAULT_KEY de $SYSPASS_DIR/.env a un lugar
  seguro fuera de este servidor. Sin ella los datos no se pueden recuperar.

  Comandos: ${B}syspass status${N} · ${B}syspass logs${N} · ${B}syspass backup${N} · ${B}syspass upgrade${N} · ${B}syspass help${N}
EOF
