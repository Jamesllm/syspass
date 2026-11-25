<div align="center">

# SysPass

**Bóveda de credenciales multiempresa para equipos de TI y soporte**

Guarda los accesos de cada cliente —servidores, NAS, VPN, correos, plataformas— cifrados, con permisos por cliente y registro de quién vio cada contraseña.

[![Versión](https://img.shields.io/github/v/release/Jamesllm/syspass?label=versi%C3%B3n&color=0f766e)](https://github.com/Jamesllm/syspass/releases/latest)
[![Imagen Docker](https://img.shields.io/badge/imagen-ghcr.io%2Fjamesllm%2Fsyspass-0f766e?logo=docker&logoColor=white)](https://github.com/Jamesllm/syspass/pkgs/container/syspass)
[![Build](https://img.shields.io/github/actions/workflow/status/Jamesllm/syspass/release.yml?label=build)](https://github.com/Jamesllm/syspass/actions/workflows/release.yml)
![Plataformas](https://img.shields.io/badge/plataformas-amd64%20%7C%20arm64-555)

[Instalación](#instalación) · [Características](#características) · [Seguridad](#seguridad) · [Administración](#administración) · [Desarrollo](#desarrollo)

</div>

---

## Características

| | |
|---|---|
| **Multiempresa** | Cada empresa se registra en `/registro` y entra con su propio código. Sus datos, usuarios y llave de cifrado están aislados del resto. |
| **Marca propia** | Cada empresa usa su nombre, su logo y su color. El color se ajusta solo para mantener buen contraste en modo claro y oscuro. |
| **Clientes y recursos** | Organiza los accesos por cliente y tipo (servidor, NAS, VPN, hipervisor, correo, plataforma web…), con varias cuentas por recurso. |
| **Permisos** | Roles *administrador*, *editor* y *solo lectura*, con asignación de clientes por usuario. |
| **Auditoría** | Queda registrado cada inicio de sesión, cada contraseña vista o copiada y cada cambio, con usuario, fecha e IP. |
| **Revisión de seguridad** | Detecta contraseñas débiles, repetidas o sin cambiar en más de 180 días. |
| **Importación** | Convierte un archivo de texto con credenciales en clientes, recursos y cuentas cifradas, con vista previa. |
| **Móvil** | Diseño adaptado al teléfono, con navegación inferior y botones táctiles. Sin scroll horizontal. |
| **Panel de plataforma** | El dueño de la instalación ve todas las empresas registradas y puede suspenderlas o reactivarlas. |

---

## Instalación

### Requisitos

- Servidor **Linux** (Ubuntu 22.04+, Debian 12+, Rocky/Alma 9+) con **1 GB de RAM** y 5 GB de disco
- Acceso `sudo`
- Docker 24+ con Compose v2. Si no está instalado, el instalador ofrece instalarlo.
- *(Opcional)* Un dominio apuntando al servidor, para tener HTTPS

### Un comando

```bash
curl -fsSL https://github.com/Jamesllm/syspass/releases/latest/download/install.sh \
  | sudo SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest bash
```

El instalador:

1. Comprueba Docker y lo instala si falta.
2. Pregunta el **dominio** y el usuario dueño de la plataforma.
3. Genera la llave maestra de cifrado y la contraseña de la base de datos.
4. Levanta SysPass, PostgreSQL y, si hay dominio, Caddy con certificado HTTPS automático.
5. Muestra la dirección de acceso y una contraseña temporal para el dueño.

Todo queda en `/opt/syspass`.

### Con dominio o sin dominio

| | Con dominio | Sin dominio |
|---|---|---|
| Dirección | `https://vault.miempresa.com` | `http://IP-DEL-SERVIDOR` |
| Certificado | Let's Encrypt automático, con renovación | — |
| Puertos | 80 y 443 (Caddy) | 80, o el que elijas |
| Uso recomendado | Acceso desde internet | Red interna o VPN |

> [!WARNING]
> Sin dominio el tráfico viaja sin cifrar (HTTP). Úsalo solo dentro de la red de la empresa o a través de una VPN.

> [!TIP]
> Para que el dominio funcione, crea antes un registro DNS **A** apuntando a la IP pública del servidor y abre los puertos 80 y 443 en el firewall.

### Instalación sin preguntas

Todas las respuestas se pueden pasar como variables:

```bash
curl -fsSL https://github.com/Jamesllm/syspass/releases/latest/download/install.sh \
  | sudo SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest \
         DOMAIN=vault.miempresa.com ACME_EMAIL=ti@miempresa.com \
         OWNER_USER=admin OWNER_NAME="Equipo TI" bash
```

| Variable | Descripción | Por defecto |
|---|---|---|
| `SYSPASS_IMAGE` | Imagen a instalar | — |
| `DOMAIN` | Dominio público; vacío = acceso por IP | vacío |
| `ACME_EMAIL` | Correo para avisos del certificado | vacío |
| `APP_PORT` | Puerto web cuando no hay dominio | `80` |
| `OWNER_USER` / `OWNER_NAME` | Cuenta del dueño de la plataforma | `admin` |
| `SYSPASS_DIR` | Carpeta de instalación | `/opt/syspass` |

### Desde el código fuente

```bash
git clone https://github.com/Jamesllm/syspass.git && cd syspass
sudo ./deploy/install.sh
```

La imagen se construye en el propio servidor y `syspass upgrade` la reconstruye a partir de `git pull`.

### Primer ingreso

1. Abre la dirección que mostró el instalador.
2. Entra con la empresa **`syspass`**, tu usuario y la contraseña temporal. Te pedirá cambiarla.
3. Comparte `https://tu-dirección/registro` con las empresas que usarán la plataforma. Cada una crea su espacio y su primer administrador.

---

## Administración

El instalador deja el comando `syspass` disponible en el servidor:

| Comando | Qué hace |
|---|---|
| `syspass status` | Estado de los servicios y dirección pública |
| `syspass logs [app\|db\|caddy]` | Registros en vivo |
| `syspass start` · `stop` · `restart` | Controla los servicios |
| `syspass backup` | Respaldo de la base en `/opt/syspass/backups` |
| `syspass restore <archivo>` | Restaura un respaldo (antes hace uno del estado actual) |
| `syspass upgrade` | Respaldo, nueva versión y migraciones automáticas |
| `syspass admin <empresa> <usuario> "Nombre"` | Crea o restablece el administrador de una empresa |
| `syspass owner <usuario> "Nombre"` | Crea o restablece un dueño de la plataforma |
| `syspass uninstall [--purge]` | Detiene SysPass. Con `--purge` borra también los datos. |

### Respaldos

```bash
syspass backup
```

Para programarlo cada noche:

```bash
echo '0 2 * * * root /usr/local/bin/syspass backup' | sudo tee /etc/cron.d/syspass-backup
```

> [!IMPORTANT]
> Las contraseñas solo se pueden descifrar con la **`VAULT_KEY`** de `/opt/syspass/.env`. Guarda una copia fuera del servidor, por ejemplo en otro gestor o impresa en un sobre cerrado. Un respaldo sin esa llave no se puede recuperar, y la llave junto al respaldo da acceso a todo: guárdalos por separado.

### Actualizar

```bash
syspass upgrade
```

Hace un respaldo, descarga la imagen nueva, reinicia y aplica las migraciones pendientes.

---

## Seguridad

| Capa | Implementación |
|---|---|
| Cifrado de contraseñas | AES-256-GCM. Cada empresa tiene su **propia llave de datos**, envuelta con una llave derivada (HKDF) de `VAULT_KEY`. El id de la cuenta se usa como dato autenticado: un texto cifrado no sirve si se copia a otra fila. |
| Base de datos | Solo guarda texto cifrado. Un volcado sin `VAULT_KEY` no expone contraseñas. |
| Contraseñas de usuarios | scrypt (N = 32768) y contraseña temporal obligatoria de cambiar en el primer ingreso |
| Sesiones | Cookie `httpOnly` + `SameSite=Strict` (`Secure` con HTTPS). Cierre por inactividad a los 30 min y duración máxima de 12 h. |
| Aislamiento | Cada consulta se filtra por empresa. Usuarios y clientes son únicos dentro de su empresa. |
| Aplicación web | CSP estricta, cabecera anti‑CSRF propia, límite de 8 intentos de inicio de sesión cada 5 min por IP |
| Contenedor | Imagen mínima (Alpine) que corre con un usuario sin privilegios y tiene healthcheck |

> [!NOTE]
> El servidor necesita `VAULT_KEY` para descifrar. Quien tenga acceso de administrador al servidor **y** a `/opt/syspass/.env` puede leer la bóveda: limita ese acceso.

Para reportar una vulnerabilidad, abre un aviso privado en [Security advisories](https://github.com/Jamesllm/syspass/security/advisories/new). No uses un *issue* público.

---

## Arquitectura

```
            ┌──────────── servidor ────────────────────────────┐
 navegador ─┼─▶ Caddy :443 ──▶ SysPass :8080 ──▶ PostgreSQL 17 │
            │   (solo con dominio)  API + frontend   (volumen)  │
            └──────────────────────────────────────────────────┘
```

| Carpeta | Contenido |
|---|---|
| `server/` | API en Node.js 22, Fastify y PostgreSQL (`pg`, SQL directo con migraciones en `server/migrations`) |
| `web/` | Frontend en React 19, TypeScript y Vite, con componentes reutilizables en `web/src/components` |
| `deploy/` | Instalador y CLI `syspass` |
| `Dockerfile` | Imagen única que sirve la API y el frontend compilado, y migra al arrancar |

---

## Desarrollo

Requisitos: Node.js 22+ y PostgreSQL 15+.

```bash
npm install
cp .env.example .env            # completa DATABASE_URL y VAULT_KEY
npm run keygen                  # genera un valor para VAULT_KEY
npm run migrate
npm run platform:init -- admin "Tu nombre"
```

En dos terminales:

```bash
npm run dev:server              # API en http://localhost:8080
npm run dev:web                 # Frontend en http://localhost:5173
```

### Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL | — |
| `VAULT_KEY` | Llave maestra, 32 bytes en base64 (`npm run keygen`) | — |
| `PORT` / `HOST` | Dirección de escucha | `8080` / `0.0.0.0` |
| `SECURE_COOKIES` | `true` cuando se sirve por HTTPS | `false` |
| `TRUST_PROXY` | `true` detrás de un proxy inverso | `false` |
| `SESSION_IDLE_MINUTES` | Cierre por inactividad | `30` |
| `SESSION_MAX_HOURS` | Duración máxima de una sesión | `12` |
| `CORS_ORIGINS` | Orígenes permitidos si el frontend está en otro dominio | vacío |
| `SERVE_WEB` | `false` para no servir el frontend desde la API | `true` |

### Importar credenciales desde texto

En **Importar** (administrador de la empresa). El importador reconoce secciones en mayúsculas como `WINDOWS SERVER - CLIENTE`, elementos numerados (`1. NAS`) y líneas `usuario:`, `correo:`, `pass:`, `ip:`, `id:` y `enlace:`. Antes de guardar muestra una vista previa sin contraseñas.

### Publicar una versión

```bash
git tag v1.1.0 && git push --tags
```

El workflow [`release.yml`](.github/workflows/release.yml) construye la imagen para `amd64` y `arm64`, la publica en `ghcr.io/jamesllm/syspass` con las etiquetas `1.1.0`, `1.1` y `latest`, y adjunta `install.sh` a la versión.

### Windows

El instalador es solo para Linux. En Windows Server puedes usar Docker Desktop o WSL2 con el `docker-compose.yml` que genera el instalador, o la instalación con Node descrita en [Desarrollo](#desarrollo), ejecutando `npm run build` y `npm start` como servicio (por ejemplo con NSSM).
