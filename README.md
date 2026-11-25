# SysPass

Bóveda de credenciales multiempresa (SaaS). Cada empresa se registra, entra con su **código de empresa** y ve la plataforma con su propio nombre, logo y color.

- **backend/** → `server/`: Node.js 20+ · Fastify · PostgreSQL (`pg`, SQL directo)
- **frontend/** → `web/`: React · TypeScript · Vite

## Instalación en un servidor (1 comando)

Requisitos: Linux (Ubuntu, Debian, Rocky…) con 1 GB de RAM. Si no hay Docker, el instalador ofrece instalarlo.

**Con la imagen publicada** (después de crear una versión, ver más abajo):

```bash
curl -fsSL https://github.com/Jamesllm/syspass/releases/latest/download/install.sh \
  | sudo SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest bash
```

**Desde el código** (construye la imagen en el servidor):

```bash
git clone https://github.com/Jamesllm/syspass.git && cd syspass
sudo ./deploy/install.sh
```

El instalador pregunta el **dominio** (con dominio activa HTTPS automático con Let's Encrypt mediante Caddy; vacío usa la IP y el puerto 80) y el usuario dueño. Genera `VAULT_KEY` y la clave de PostgreSQL, levanta todo en `/opt/syspass` y muestra la dirección y la contraseña temporal del dueño. Para instalar sin preguntas: `DOMAIN=… ACME_EMAIL=… OWNER_USER=admin`.

### Administración

```bash
syspass status            # estado y dirección
syspass logs              # registros de la app (o: syspass logs db)
syspass backup            # respaldo de la base en /opt/syspass/backups
syspass restore archivo   # restaurar un respaldo
syspass upgrade           # respaldo + nueva versión + migraciones automáticas
syspass admin drago admin "Nombre"   # crear o restablecer el admin de una empresa
syspass owner admin "Nombre"         # crear o restablecer un dueño de la plataforma
syspass uninstall [--purge]
```

### Publicar una versión

El workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) construye la imagen para `amd64` y `arm64`, la publica en `ghcr.io/jamesllm/syspass` y adjunta `install.sh` a la versión:

```bash
git tag v1.0.0 && git push --tags
```

Después, en GitHub → Packages → syspass, marca el paquete como **público** para que los servidores puedan descargarlo sin credenciales.

### Windows Server o Docker Desktop

El instalador es solo para Linux. En Windows usa Docker Desktop (o WSL2) con el mismo `docker-compose.yml` que genera el instalador, o la instalación manual con Node que está más abajo.

## Multiempresa

| Pieza | Detalle |
|---|---|
| Registro | `/registro` es público: crea la empresa (nombre + código) y su primer administrador |
| Login | Empresa (código) + usuario + contraseña. El navegador recuerda la última empresa y muestra su marca |
| Marca | Menú **Empresa** (admin): nombre, logo (PNG/JPG/WEBP/SVG ≤ 200 KB) y color, ajustado solo a contraste 4.5:1 en claro y oscuro |
| Plataforma | La empresa con código `syspass` es la dueña: sus administradores ven el menú **Empresas** para revisar, suspender y reactivar |
| Aislamiento | Toda consulta filtra por empresa; usuarios y clientes son únicos por empresa |

## Cómo protege las contraseñas

| Capa | Detalle |
|---|---|
| Cifrado | AES-256-GCM por contraseña con la **llave propia de cada empresa** (envuelta con una llave derivada de `VAULT_KEY`). El id de la cuenta va como AAD |
| Base de datos | Solo guarda texto cifrado (`v2.iv.tag.ct`). Un volcado de la base sin `VAULT_KEY` no sirve |
| Usuarios | Contraseñas con scrypt; contraseña temporal obligatoria de cambiar al primer ingreso |
| Sesiones | Cookie `httpOnly` + `SameSite=Strict`, cierre por inactividad (30 min) y máximo 12 h |
| Permisos | `admin` todo · `editor` ve y edita sus clientes · `lector` ve y copia sus clientes |
| Auditoría | Cada inicio de sesión, contraseña vista/copiada y cambio queda registrado con usuario e IP |
| Red | CSP estricta, cabecera anti‑CSRF propia, límite de 8 intentos de login cada 5 min por IP |

> Los datos anteriores a la versión multiempresa (`v1`) se recifran solos con `npm run migrate`.

> El servidor puede descifrar (necesita `VAULT_KEY`). Quien tenga acceso root al servidor **y** al `.env` puede leer la bóveda: protege ese servidor y ese archivo.

## Desarrollo local

```powershell
npm install
copy .env.example .env      # completa DATABASE_URL y VAULT_KEY (npm run keygen)
npm run migrate
npm run platform:init -- admin "Nombre Apellido"   # empresa dueña "syspass"
npm run admin:create -- <codigo-empresa> <usuario> "Nombre"   # (re)crear admin de una empresa
```

En dos terminales:

```powershell
npm run dev:server   # API en http://localhost:8080
```

```powershell
npm run dev:web      # Frontend en http://localhost:5173 (redirige /api al backend)
```

## Despliegue en el servidor de la empresa

### 1. Base de datos (una sola vez)

```sql
create role dragovault login password 'UNA_CLAVE_LARGA';
create database dragovault owner dragovault encoding 'UTF8';
```

### 2. Aplicación

```bash
git clone <repo> /opt/drago-vault && cd /opt/drago-vault
npm ci
cp .env.example .env        # DATABASE_URL, VAULT_KEY nueva, HOST=127.0.0.1, SECURE_COOKIES=true, TRUST_PROXY=true
npm run build               # compila web/dist y server/dist
npm run migrate
npm run platform:init -- admin "Nombre Apellido"   # empresa dueña "syspass"
npm run admin:create -- <codigo-empresa> <usuario> "Nombre"   # (re)crear admin de una empresa
npm start                   # sirve API + frontend en el puerto 8080
```

**Frontend y backend separados:** por defecto el backend también sirve `web/dist` (un solo puerto). Para servirlos por separado, pon `SERVE_WEB=false`, publica `web/dist` con nginx/IIS y apunta `/api` al backend (mismo dominio). Si el frontend va en otro dominio, compila con `VITE_API_URL=https://api.dominio npm run build -w web` y define `CORS_ORIGINS` en el backend.

### 3. Servicio (Linux, systemd)

`/etc/systemd/system/drago-vault.service`

```ini
[Unit]
Description=DRAGO Vault
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/drago-vault
ExecStart=/usr/bin/npm start
Restart=always
User=dragovault
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now drago-vault
```

En Windows Server se puede usar [NSSM](https://nssm.cc) apuntando a `npm.cmd start` con el directorio del proyecto.

### 4. HTTPS con nginx (recomendado)

```nginx
server {
  listen 443 ssl;
  server_name vault.drago.pe;
  ssl_certificate     /etc/ssl/drago/fullchain.pem;
  ssl_certificate_key /etc/ssl/drago/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Lo ideal es que solo sea accesible desde la red interna o la VPN.

### 5. Respaldos

```bash
pg_dump -Fc dragovault > /respaldos/dragovault-$(date +%F).dump
```

Guarda **`VAULT_KEY` aparte** del respaldo (por ejemplo, impresa en sobre cerrado o en otro gestor). Sin esa llave el respaldo no se puede descifrar; con ella y el respaldo juntos, sí.

## Importar un archivo de texto

Menú **Importar** (admin de la empresa; importa en su propia empresa). Entiende secciones `TIPO - CLIENTE` en mayúsculas, elementos numerados (`1. NAS`) y líneas `usuario:`, `user:`, `correo:`, `pass:`, `ip:`, `id:`, `enlace:`. Muestra una vista previa sin contraseñas antes de guardar. Después de importar, borra el `.txt` original.
