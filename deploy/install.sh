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
#  Sin preguntas (todo por variables), con PostgreSQL incorporado:
#    sudo DOMAIN=vault.miempresa.com ACME_EMAIL=ti@miempresa.com OWNER_USER=admin DB_MODE=builtin ./deploy/install.sh
#
#  Con un PostgreSQL que ya existe:
#    sudo DB_MODE=external DB_HOST=localhost DB_NAME=syspass DB_USER=syspass DB_PASSWORD=... ./deploy/install.sh
#
#  Desinstalar:
#    sudo syspass uninstall            (conserva los datos)
#    sudo syspass uninstall --purge    (borra todo)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SYSPASS_DIR="${SYSPASS_DIR:-/opt/syspass}"
SYSPASS_IMAGE="${SYSPASS_IMAGE:-}"
BIN_LINK="/usr/local/bin/syspass"
PG_PROBE_IMAGE="postgres:17-alpine"

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
ask_secret() {
  local var=$1 question=$2 answer=''
  if [ -n "${!var:-}" ]; then return; fi
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '    %s: ' "$question" > /dev/tty
    IFS= read -rs answer < /dev/tty || true
    printf '\n' > /dev/tty
  fi
  printf -v "$var" '%s' "$answer"
}
# Sí/no normalizado a s|n
ask_yn() {
  ask "$1" "$2 (s/n)" "$3"
  case "${!1}" in s|S|si|sí|Si|Sí|y|Y|yes) printf -v "$1" s ;; *) printf -v "$1" n ;; esac
}

rand_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
urlencode() {
  local LC_ALL=C s=$1 out='' c i
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case "$c" in [a-zA-Z0-9.~_-]) out+=$c ;; *) printf -v c '%%%02X' "'$c"; out+=$c ;; esac
  done
  printf '%s' "$out"
}
valid_ident() { [[ "$1" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "\"$1\" no es válido: usa minúsculas, números y guion bajo."; }
# Escribe KEY='valor' (literal para Docker Compose y para bash)
kv() {
  case "$2" in *"'"*|*$'\n'*) die "El valor de $1 no puede contener comillas simples ni saltos de línea." ;; esac
  printf "%s='%s'\n" "$1" "$2"
}

# Todo el instalador vive en main(): bash lee la función completa antes de ejecutarla.
# Así, con "curl … | bash", ningún comando puede "comerse" el resto del script desde la tubería.
main() {
# Las preguntas se leen de /dev/tty; nada más necesita la entrada estándar
exec </dev/null

# ── Desinstalar desde el propio instalador ───────────────────
if [ "${1:-}" = --uninstall ]; then
  shift
  [ -x "$BIN_LINK" ] || die "No hay una instalación de SysPass con el comando $BIN_LINK."
  exec "$BIN_LINK" uninstall "$@"
fi

printf '\n%sSysPass%s · instalación\n' "$B" "$N"

# ── 1. Requisitos ────────────────────────────────────────────
step 'Revisando el servidor'
[ "$(uname -s)" = Linux ] || die 'Este instalador es para Linux. En Windows o macOS usa Docker Desktop (ver README).'
[ "$(id -u)" -eq 0 ] || die 'Ejecútalo con sudo.'
[ -f "$SYSPASS_DIR/.env" ] && die "Ya hay una instalación en $SYSPASS_DIR. Para actualizar usa: syspass upgrade · para quitarla: syspass uninstall --purge"

if ! command -v docker >/dev/null 2>&1; then
  ask_yn INSTALL_DOCKER 'Docker no está instalado. ¿Instalarlo ahora?' s
  [ "$INSTALL_DOCKER" = s ] || die 'SysPass necesita Docker.'
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
CV="$(docker compose version --short 2>/dev/null | sed 's/^v//')" || true
[ -n "$CV" ] || die 'Falta Docker Compose v2 (el comando "docker compose").'
CV_MAJOR=${CV%%.*}; CV_MINOR=${CV#*.}; CV_MINOR=${CV_MINOR%%.*}
if [ "$CV_MAJOR" -lt 2 ] || { [ "$CV_MAJOR" -eq 2 ] && [ "$CV_MINOR" -lt 20 ]; }; then
  die "Docker Compose $CV es antiguo. SysPass necesita 2.20 o superior: actualiza Docker."
fi
info "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') · Compose $CV"

# Código fuente al lado del instalador = se puede construir la imagen aquí mismo
SRC_DIR=''
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/../Dockerfile" ]; then
  SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
[ -n "$SYSPASS_IMAGE" ] || [ -n "$SRC_DIR" ] || die 'Indica la imagen con SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest o ejecuta el instalador desde el código fuente.'

# ── 2. Acceso web ────────────────────────────────────────────
step 'Acceso web'
info 'Con dominio, SysPass obtiene HTTPS automático (Let’s Encrypt). El dominio debe apuntar a este servidor.'
ask DOMAIN 'Dominio (vacío para usar la IP del servidor)' ''
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
if [ -n "$DOMAIN" ]; then
  ask ACME_EMAIL 'Correo para avisos del certificado (opcional)' ''
  APP_BIND=127.0.0.1; APP_PORT=8080; WEB_PROFILE=https
  PUBLIC_URL="https://$DOMAIN"; SECURE_COOKIES=true; TRUST_PROXY=true
else
  ask APP_PORT 'Puerto web' '80'
  APP_BIND=0.0.0.0; WEB_PROFILE=''; ACME_EMAIL=''
  HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  PUBLIC_URL="http://${HOST_IP:-IP-DEL-SERVIDOR}$([ "$APP_PORT" = 80 ] || echo ":$APP_PORT")"
  SECURE_COOKIES=false; TRUST_PROXY=false
  warn 'Sin dominio el tráfico va sin cifrar. Úsalo solo dentro de la red interna o la VPN.'
fi

# ── 3. Base de datos ─────────────────────────────────────────
step 'Base de datos'
if [ -z "${DB_MODE:-}" ]; then
  info '1) PostgreSQL incorporado: se instala en un contenedor (recomendado)'
  info '2) PostgreSQL existente: en este servidor o en otro'
  ask DB_CHOICE 'Elige 1 o 2' '1'
  case "$DB_CHOICE" in 2) DB_MODE=external ;; *) DB_MODE=builtin ;; esac
fi
case "$DB_MODE" in builtin|external) ;; *) die 'DB_MODE debe ser builtin o external.' ;; esac

LOCAL_PG=no
# psql desde un contenedor temporal (no hace falta instalar el cliente en el servidor)
psql_as() {
  docker run --rm -i --add-host host.docker.internal:host-gateway \
    -e PGPASSWORD="$2" -e PGCONNECT_TIMEOUT=6 "$PG_PROBE_IMAGE" \
    psql -X -q -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$1" -d "$3" -tAc "$4"
}
pg_fail() {
  printf '\n%sNo pude conectar a PostgreSQL%s (%s@%s:%s/%s)\n' "$R" "$N" "$1" "${DB_HOST_SHOWN}" "$DB_PORT" "$2" >&2
  [ -s "$PG_ERR" ] && sed 's/^/    /' "$PG_ERR" | tail -n 3 >&2
  if [ "$LOCAL_PG" = yes ]; then
    cat >&2 <<HINT

    SysPass corre en Docker y llega a este servidor por la red interna de Docker.
    Si PostgreSQL está instalado aquí mismo, revisa:

      1. postgresql.conf   listen_addresses = 'localhost,172.17.0.1'   (o '*')
      2. pg_hba.conf       host  all  all  172.16.0.0/12  scram-sha-256
      3. sudo systemctl restart postgresql
      4. Si usas ufw:      sudo ufw allow from 172.16.0.0/12 to any port $DB_PORT proto tcp

    Después vuelve a ejecutar el instalador.
HINT
  fi
  exit 1
}

if [ "$DB_MODE" = builtin ]; then
  POSTGRES_PASSWORD="$(rand_hex 24)"
  DB_HOST=db; DB_PORT=5432; DB_NAME=syspass; DB_USER=syspass; DB_PASSWORD="$POSTGRES_PASSWORD"
  PG_CLIENT_IMAGE="$PG_PROBE_IMAGE"
  DATABASE_URL="postgres://syspass:$POSTGRES_PASSWORD@db:5432/syspass"
  info 'PostgreSQL 17 incorporado'
else
  POSTGRES_PASSWORD=''
  ask DB_HOST 'Host de PostgreSQL' 'localhost'
  ask DB_PORT 'Puerto' '5432'
  ask DB_NAME 'Base de datos para SysPass' 'syspass'
  ask DB_USER 'Usuario de la base' 'syspass'
  valid_ident "$DB_NAME"; valid_ident "$DB_USER"
  [[ "$DB_PORT" =~ ^[0-9]+$ ]] || die 'El puerto debe ser un número.'
  DB_HOST_SHOWN="$DB_HOST"
  case "$DB_HOST" in localhost|127.0.0.1|::1|"$(hostname)") DB_HOST=host.docker.internal; LOCAL_PG=yes ;; esac

  info "Descargando el cliente de PostgreSQL para probar la conexión…"
  docker pull -q "$PG_PROBE_IMAGE" >/dev/null
  PG_ERR="$(mktemp)"; trap 'rm -f "$PG_ERR"' EXIT

  ask_yn DB_CREATE '¿Creo la base y el usuario ahora? Necesito un superusuario de PostgreSQL' s
  if [ "$DB_CREATE" = s ]; then
    ask DB_ADMIN_USER 'Superusuario' 'postgres'
    ask_secret DB_ADMIN_PASSWORD "Contraseña de $DB_ADMIN_USER"
    psql_as "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD" postgres 'select 1' >/dev/null 2>"$PG_ERR" || pg_fail "$DB_ADMIN_USER" postgres
    DB_PASSWORD="${DB_PASSWORD:-$(rand_hex 24)}"
    SQL_PASS="${DB_PASSWORD//\'/\'\'}"
    if [ "$(psql_as "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD" postgres "select 1 from pg_roles where rolname = '$DB_USER'")" = 1 ]; then
      warn "El usuario $DB_USER ya existe: le asigno una contraseña nueva"
      psql_as "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD" postgres "alter role \"$DB_USER\" with login password '$SQL_PASS'" 2>"$PG_ERR" >/dev/null || pg_fail "$DB_ADMIN_USER" postgres
    else
      psql_as "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD" postgres "create role \"$DB_USER\" login password '$SQL_PASS'" 2>"$PG_ERR" >/dev/null || pg_fail "$DB_ADMIN_USER" postgres
      info "Usuario $DB_USER creado"
    fi
    if [ "$(psql_as "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD" postgres "select 1 from pg_database where datname = '$DB_NAME'")" = 1 ]; then
      warn "La base $DB_NAME ya existe: SysPass la usará y aplicará sus tablas"
      psql_as "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD" postgres "alter database \"$DB_NAME\" owner to \"$DB_USER\"" 2>"$PG_ERR" >/dev/null || pg_fail "$DB_ADMIN_USER" postgres
    else
      psql_as "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD" postgres "create database \"$DB_NAME\" owner \"$DB_USER\" encoding 'UTF8' template template0" 2>"$PG_ERR" >/dev/null || pg_fail "$DB_ADMIN_USER" postgres
      info "Base $DB_NAME creada"
    fi
    # En PostgreSQL 15+ el esquema public ya no es escribible por todos
    psql_as "$DB_ADMIN_USER" "$DB_ADMIN_PASSWORD" "$DB_NAME" "alter schema public owner to \"$DB_USER\"" 2>"$PG_ERR" >/dev/null || true
    unset DB_ADMIN_PASSWORD
  else
    ask_secret DB_PASSWORD "Contraseña de $DB_USER"
  fi

  PG_VER="$(psql_as "$DB_USER" "$DB_PASSWORD" "$DB_NAME" 'show server_version_num' 2>"$PG_ERR")" || pg_fail "$DB_USER" "$DB_NAME"
  [ "${PG_VER:-0}" -ge 130000 ] || die "SysPass necesita PostgreSQL 13 o superior (el servidor tiene $PG_VER)."
  CAN_CREATE="$(psql_as "$DB_USER" "$DB_PASSWORD" "$DB_NAME" "select has_schema_privilege('public', 'CREATE')" 2>"$PG_ERR")" || pg_fail "$DB_USER" "$DB_NAME"
  [ "$CAN_CREATE" = t ] || die "El usuario $DB_USER no puede crear tablas en $DB_NAME. Como superusuario ejecuta: ALTER DATABASE $DB_NAME OWNER TO $DB_USER; y en esa base: ALTER SCHEMA public OWNER TO $DB_USER;"
  PG_MAJOR=$((PG_VER / 10000))
  PG_CLIENT_IMAGE="postgres:${PG_MAJOR}-alpine"
  DATABASE_URL="postgres://$(urlencode "$DB_USER"):$(urlencode "$DB_PASSWORD")@$DB_HOST:$DB_PORT/$DB_NAME"
  info "Conectado a PostgreSQL $PG_MAJOR en $DB_HOST_SHOWN:$DB_PORT/$DB_NAME"
fi

# ── 4. Dueño de la plataforma ────────────────────────────────
step 'Cuenta del dueño'
ask OWNER_USER 'Usuario del dueño de la plataforma' 'admin'
ask OWNER_NAME 'Nombre del dueño' 'Administrador SysPass'

# ── 5. Archivos ──────────────────────────────────────────────
step "Creando $SYSPASS_DIR"
mkdir -p "$SYSPASS_DIR/backups"
cd "$SYSPASS_DIR"

[ -n "$SYSPASS_IMAGE" ] || SYSPASS_IMAGE='syspass:local'
VAULT_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
PROFILES="$( { [ "$DB_MODE" = builtin ] && printf 'db'; [ -n "$WEB_PROFILE" ] && [ "$DB_MODE" = builtin ] && printf ','; printf '%s' "$WEB_PROFILE"; } )"

umask 077
{
  echo "# SysPass · configuración generada el $(date '+%Y-%m-%d %H:%M')"
  echo '# Guarda una copia de VAULT_KEY fuera de este servidor: sin ella los respaldos no se pueden descifrar.'
  kv SYSPASS_IMAGE "$SYSPASS_IMAGE"
  kv SYSPASS_SOURCE "$SRC_DIR"
  kv COMPOSE_PROFILES "$PROFILES"
  kv PUBLIC_URL "$PUBLIC_URL"
  kv DOMAIN "$DOMAIN"
  kv APP_BIND "$APP_BIND"
  kv APP_PORT "$APP_PORT"
  echo
  echo '# Base de datos: builtin = contenedor incluido · external = PostgreSQL existente'
  kv DB_MODE "$DB_MODE"
  kv DB_HOST "$DB_HOST"
  kv DB_PORT "$DB_PORT"
  kv DB_NAME "$DB_NAME"
  kv DB_USER "$DB_USER"
  kv DB_PASSWORD "$DB_PASSWORD"
  kv POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  kv DATABASE_URL "$DATABASE_URL"
  kv PG_CLIENT_IMAGE "$PG_CLIENT_IMAGE"
  echo
  kv VAULT_KEY "$VAULT_KEY"
  kv SECURE_COOKIES "$SECURE_COOKIES"
  kv TRUST_PROXY "$TRUST_PROXY"
  kv SESSION_IDLE_MINUTES 30
  kv SESSION_MAX_HOURS 12
} > .env
umask 022

cat > docker-compose.yml <<'EOF'
# SysPass · generado por el instalador. Configuración en .env
name: syspass

services:
  # Solo con DB_MODE=builtin (perfil "db")
  db:
    image: postgres:17-alpine
    profiles: ["db"]
    restart: unless-stopped
    environment:
      POSTGRES_USER: syspass
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-sin-uso}
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
        required: false
    # Permite llegar a un PostgreSQL instalado en este mismo servidor
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      VAULT_KEY: ${VAULT_KEY}
      SECURE_COOKIES: ${SECURE_COOKIES:-false}
      TRUST_PROXY: ${TRUST_PROXY:-false}
      SESSION_IDLE_MINUTES: ${SESSION_IDLE_MINUTES:-30}
      SESSION_MAX_HOURS: ${SESSION_MAX_HOURS:-12}
    ports:
      - "${APP_BIND:-0.0.0.0}:${APP_PORT:-80}:8080"

  # Solo con dominio (perfil "https")
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

# ── CLI de administración ────────────────────────────────────
cat > syspass <<'CLI'
#!/usr/bin/env bash
# SysPass · administración del servidor
set -euo pipefail
DIR="${SYSPASS_DIR:-/opt/syspass}"
BIN_LINK=/usr/local/bin/syspass
[ -f "$DIR/.env" ] || { echo "No hay instalación de SysPass en $DIR" >&2; exit 1; }
# .env guarda la VAULT_KEY y solo root puede leerlo
[ -r "$DIR/.env" ] || { echo "Usa sudo: sudo syspass ${*:-help}" >&2; exit 1; }
cd "$DIR"
set -a; . ./.env; set +a
# Valores por defecto: las instalaciones v1.0.0 no tenían estas variables en .env
DB_MODE="${DB_MODE:-builtin}"
DB_HOST="${DB_HOST:-db}"; DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-syspass}"; DB_USER="${DB_USER:-syspass}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}"
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17-alpine}"
SYSPASS_SOURCE="${SYSPASS_SOURCE:-}"
SYSPASS_INSTALLER_URL="${SYSPASS_INSTALLER_URL:-https://github.com/Jamesllm/syspass/releases/latest/download/install.sh}"

dc() { docker compose --project-directory "$DIR" "$@"; }
need_root() { [ "$(id -u)" -eq 0 ] || { echo 'Este comando necesita sudo.' >&2; exit 1; }; }

# Ejecuta pg_dump / pg_restore / psql contra la base configurada
pg_tool() {
  local tool=$1; shift
  if [ "$DB_MODE" = external ]; then
    docker run --rm -i --add-host host.docker.internal:host-gateway -e PGPASSWORD="$DB_PASSWORD" \
      "$PG_CLIENT_IMAGE" "$tool" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$@"
  else
    dc exec -T db "$tool" -U syspass "$@"
  fi
}

# Con la base incorporada, asegura que el contenedor esté arriba
ensure_db() {
  [ "$DB_MODE" = builtin ] || return 0
  dc up -d db >/dev/null 2>&1
  for _ in $(seq 1 30); do dc exec -T db pg_isready -U syspass -d syspass >/dev/null 2>&1 && return 0; sleep 2; done
  echo 'La base de datos no respondió.' >&2; return 1
}

wait_healthy() {
  printf 'Esperando a SysPass'
  for _ in $(seq 1 90); do
    if dc exec -T app wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1; then echo ' listo'; return 0; fi
    printf '.'; sleep 2
  done
  echo; echo 'SysPass no respondió. Revisa: syspass logs' >&2; return 1
}

backup() {
  ensure_db
  mkdir -p backups
  local f="backups/syspass-$(date +%Y%m%d-%H%M%S).dump"
  pg_tool pg_dump -Fc "$DB_NAME" > "$f"
  echo "Respaldo: $DIR/$f ($(du -h "$f" | cut -f1))"
  LAST_BACKUP="$DIR/$f"
}

build_or_pull() {
  if [ -n "${SYSPASS_SOURCE:-}" ] && [ -f "$SYSPASS_SOURCE/Dockerfile" ]; then
    if [ -d "$SYSPASS_SOURCE/.git" ]; then git -C "$SYSPASS_SOURCE" pull --ff-only || true; fi
    docker build -t "$SYSPASS_IMAGE" "$SYSPASS_SOURCE"
  else
    dc pull app
  fi
}

ask_tty() { local a=''; [ -r /dev/tty ] && { read -r -p "$1" a < /dev/tty || true; }; printf '%s' "$a"; }

# Reemplaza este comando por el de la última versión del instalador.
# Se escribe en un archivo temporal y se mueve (mv es atómico), así no se rompe el script en ejecución.
self_update() {
  need_root
  local src tmp
  tmp="$(mktemp)"
  if [ -n "$SYSPASS_SOURCE" ] && [ -f "$SYSPASS_SOURCE/deploy/install.sh" ]; then
    src="$SYSPASS_SOURCE/deploy/install.sh"
  else
    src="$(mktemp)"
    curl -fsSL "$SYSPASS_INSTALLER_URL" -o "$src" || { echo 'No se pudo descargar el instalador.' >&2; rm -f "$tmp" "$src"; return 1; }
  fi
  sed -n "/^cat > syspass <<'CLI'\$/,/^CLI\$/p" "$src" | sed '1d;$d' > "$tmp"
  [ "$src" = "$SYSPASS_SOURCE/deploy/install.sh" ] || rm -f "$src"
  if [ ! -s "$tmp" ] || ! bash -n "$tmp"; then echo 'El comando descargado no es válido; se conserva el actual.' >&2; rm -f "$tmp"; return 1; fi
  if cmp -s "$tmp" "$DIR/syspass"; then echo 'El comando syspass ya está al día.'; rm -f "$tmp"; return 0; fi
  chmod 755 "$tmp"
  mv -f "$tmp" "$DIR/syspass"
  ln -sf "$DIR/syspass" "$BIN_LINK"
  echo 'Comando syspass actualizado.'
}

uninstall() {
  need_root
  local purge=no yes=no a
  for a in "$@"; do case "$a" in --purge) purge=yes ;; --yes|-y) yes=yes ;; *) echo "Opción desconocida: $a" >&2; exit 1 ;; esac; done

  if [ $purge = no ]; then
    dc down --remove-orphans
    cat <<MSG

SysPass detenido y sus contenedores eliminados.
Se conservan los datos, la configuración ($DIR/.env) y los respaldos.

  Volver a iniciarlo:   sudo syspass start
  Borrarlo todo:        sudo syspass uninstall --purge
MSG
    return
  fi

  echo 'Se eliminará SysPass por completo:'
  echo "  · contenedores e imágenes de SysPass"
  [ "$DB_MODE" = builtin ] && echo '  · la base de datos incorporada y los certificados HTTPS (volúmenes de Docker)'
  echo "  · la configuración y los respaldos en $DIR"
  echo "  · el comando $BIN_LINK"
  [ "$DB_MODE" = external ] && echo "  La base externa $DB_NAME en ${DB_HOST} NO se borra."
  echo

  local keep=s final=''
  [ $yes = yes ] || keep="$(ask_tty '¿Guardar un respaldo final y la configuración fuera de /opt? (S/n): ')"
  case "${keep:-s}" in n|N|no) keep=n ;; *) keep=s ;; esac

  if [ $yes = no ]; then
    [ "$(ask_tty 'Escribe DESINSTALAR para continuar: ')" = DESINSTALAR ] || { echo 'Cancelado'; exit 1; }
  fi

  if [ $keep = s ]; then
    final="/root/syspass-respaldo-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$final"; chmod 700 "$final"
    if backup; then
      mv "$LAST_BACKUP" "$final/"
    else
      echo 'No se pudo hacer el respaldo final de la base.' >&2
    fi
    cp -a .env "$final/syspass.env"
    cp -a backups "$final/" 2>/dev/null || true
  fi

  dc down -v --rmi all --remove-orphans || true
  docker image rm "$PG_CLIENT_IMAGE" >/dev/null 2>&1 || true
  rm -f "$BIN_LINK"
  cd /
  rm -rf "$DIR"

  echo
  echo 'SysPass se desinstaló.'
  if [ -n "$final" ]; then
    echo "Respaldo final y configuración en: $final"
    echo '  Contiene VAULT_KEY y la base cifrada: guárdalo en un lugar seguro o bórralo.'
  fi
  if [ "$DB_MODE" = external ]; then
    echo
    echo "Si también quieres borrar la base externa, como superusuario de PostgreSQL:"
    echo "  DROP DATABASE \"$DB_NAME\";"
    echo "  DROP ROLE \"$DB_USER\";"
  fi
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  start)    dc up -d && wait_healthy && echo "Abierto en $PUBLIC_URL" ;;
  stop)     dc stop ;;
  restart)  dc restart && wait_healthy ;;
  status)
    dc ps; echo
    echo "URL:            $PUBLIC_URL"
    if [ "$DB_MODE" = external ]; then echo "Base de datos:  PostgreSQL existente ($DB_USER@$DB_HOST:$DB_PORT/$DB_NAME)"
    else echo 'Base de datos:  PostgreSQL incorporado (contenedor db)'; fi ;;
  logs)     dc logs -f --tail=200 "${@:-app}" ;;
  backup)   backup; echo 'Recuerda: se descifra solo con la VAULT_KEY de .env' ;;
  restore)
    f="${1:-}"; [ -f "$f" ] || { echo 'Uso: syspass restore backups/archivo.dump' >&2; exit 1; }
    [ "$(ask_tty "Esto reemplaza TODOS los datos actuales con $f. Escribe RESTAURAR para continuar: ")" = RESTAURAR ] || { echo 'Cancelado'; exit 1; }
    backup
    dc stop app
    pg_tool pg_restore -d "$DB_NAME" --clean --if-exists --no-owner < "$f"
    dc start app && wait_healthy ;;
  upgrade)
    need_root
    echo 'Respaldo previo a la actualización'; backup
    old_image="$(docker image inspect -f '{{.Id}}' "$SYSPASS_IMAGE" 2>/dev/null || true)"
    build_or_pull
    dc up -d && wait_healthy
    # Borra solo la imagen anterior de SysPass (no toca imágenes de otros proyectos del servidor)
    new_image="$(docker image inspect -f '{{.Id}}' "$SYSPASS_IMAGE" 2>/dev/null || true)"
    if [ -n "$old_image" ] && [ "$old_image" != "$new_image" ]; then docker image rm "$old_image" >/dev/null 2>&1 || true; fi
    self_update || echo 'Aviso: no se pudo actualizar el comando syspass (la app sí se actualizó).' >&2
    echo 'SysPass actualizado (las migraciones se aplican solas)' ;;
  self-update) self_update ;;
  admin)
    [ $# -ge 2 ] || { echo 'Uso: syspass admin <codigo-empresa> <usuario> "Nombre"' >&2; exit 1; }
    dc exec -T app node dist/scripts/create-admin.js "$@" ;;
  owner)
    [ $# -ge 1 ] || { echo 'Uso: syspass owner <usuario> "Nombre"' >&2; exit 1; }
    dc exec -T app node dist/scripts/platform-init.js "$@" ;;
  url)       echo "$PUBLIC_URL" ;;
  uninstall) uninstall "$@" ;;
  *)
    cat <<'HELP'
SysPass · comandos

  syspass start | stop | restart | status
  syspass logs [app|db|caddy]
  syspass url                                  Dirección pública
  syspass backup                               Respaldo de la base en backups/
  syspass restore backups/archivo.dump         Restaurar un respaldo
  syspass upgrade                              Respaldo + nueva versión + migraciones + este comando
  syspass self-update                          Actualizar solo este comando
  syspass admin <empresa> <usuario> "Nombre"   Crear o restablecer el admin de una empresa
  syspass owner <usuario> "Nombre"             Crear o restablecer un dueño de la plataforma
  syspass uninstall                            Quitar los contenedores y conservar los datos
  syspass uninstall --purge [--yes]            Borrar todo (ofrece un respaldo final antes)
HELP
    ;;
esac
CLI
chmod 755 syspass
ln -sf "$SYSPASS_DIR/syspass" "$BIN_LINK"

# ── 6. Imagen ────────────────────────────────────────────────
if [ "$SYSPASS_IMAGE" = 'syspass:local' ]; then
  step 'Construyendo la imagen desde el código (unos minutos la primera vez)'
  docker build -t syspass:local "$SRC_DIR"
else
  step "Descargando $SYSPASS_IMAGE"
  docker compose --project-directory "$SYSPASS_DIR" pull
fi

# ── 7. Arranque ──────────────────────────────────────────────
step 'Iniciando SysPass'
SYSPASS_DIR="$SYSPASS_DIR" "$BIN_LINK" start || die 'SysPass no arrancó. Revisa: syspass logs'

step 'Creando la cuenta del dueño de la plataforma'
OWNER_OUT="$(docker compose --project-directory "$SYSPASS_DIR" exec -T app node dist/scripts/platform-init.js "$OWNER_USER" "$OWNER_NAME")"
TEMP_PASS="$(printf '%s\n' "$OWNER_OUT" | sed -n 's/^Contraseña temporal: //p')"

DB_LINE='PostgreSQL incorporado'
[ "$DB_MODE" = external ] && DB_LINE="PostgreSQL existente · $DB_USER@${DB_HOST_SHOWN:-$DB_HOST}:$DB_PORT/$DB_NAME"

cat <<EOF

${G}${B}SysPass está instalado${N}

  Dirección      ${B}$PUBLIC_URL${N}
  Empresa        ${B}syspass${N}
  Usuario        ${B}$OWNER_USER${N}
  Contraseña     ${B}$TEMP_PASS${N}  (temporal, te pedirá cambiarla)
  Base de datos  $DB_LINE

  Las empresas se registran en ${B}$PUBLIC_URL/registro${N}

  ${Y}Importante:${N} copia la línea VAULT_KEY de $SYSPASS_DIR/.env a un lugar
  seguro fuera de este servidor. Sin ella los datos no se pueden recuperar.

  Comandos: ${B}syspass status${N} · ${B}syspass logs${N} · ${B}syspass backup${N} · ${B}syspass upgrade${N} · ${B}syspass uninstall${N}
EOF
}

main "$@"
