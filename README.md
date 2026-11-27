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
| **Una empresa o multiempresa** | Para tu propia empresa, el equipo entra solo con usuario y contraseña. Como SaaS, cada empresa se registra en `/registro` y entra con su código, con datos, usuarios y llave de cifrado aislados. |
| **Marca propia** | Cada empresa usa su nombre, su logo y su color. El color se ajusta solo para mantener buen contraste en modo claro y oscuro. |
| **Clientes, grupos y recursos** | Organiza los accesos por cliente y por grupo editable (VPN, NAS, AnyDesk, correo…), con varias cuentas por recurso. Las cuentas se agregan una por una o en lista (`usuario;contraseña`). |
| **Permisos** | Casillas por usuario: ver, copiar, crear, editar, eliminar, administrar grupos, exportar, exportar con contraseñas, importar y ver historial. El rol solo marca las casillas por defecto; además se asignan los clientes de cada usuario. |
| **Historial** | Línea de tiempo por cuenta: quién la creó, cambió la contraseña o el usuario, y quién la vio o copió. Todos ven la fecha de modificación; quién la modificó, solo los administradores. |
| **Exportar a Excel** | Lo que estás viendo (cliente o grupo) o todo. Sin contraseñas por defecto; con contraseñas solo con permiso y queda en la auditoría. |
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
- Docker 24+ con Compose 2.20 o superior. Si no está instalado, el instalador ofrece instalarlo.
- *(Opcional)* Un PostgreSQL 13+ propio, si no quieres usar el incorporado
- *(Opcional)* Un dominio apuntando al servidor, para tener HTTPS

### Un comando

```bash
curl -fsSL https://github.com/Jamesllm/syspass/releases/latest/download/install.sh \
  | sudo SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest bash
```

El instalador:

1. Comprueba Docker y lo instala si falta.
2. Pregunta el **dominio**, la **base de datos** (incorporada o un PostgreSQL que ya tengas) y el usuario dueño de la plataforma.
3. Genera la llave maestra de cifrado y las contraseñas necesarias.
4. Levanta SysPass, PostgreSQL (si es el incorporado) y, si hay dominio, Caddy con certificado HTTPS automático.
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

### Una empresa o multiempresa

El instalador pregunta qué tipo de instalación quieres:

| | Una sola empresa | Multiempresa (SaaS) |
|---|---|---|
| Para quién | Tu propia empresa | Varias empresas en la misma instalación |
| Inicio de sesión | Usuario y contraseña | Código de empresa, usuario y contraseña |
| Registro en `/registro` | Cerrado | Abierto para que se registren empresas |
| Primera cuenta | Administrador de tu empresa | Dueño de la plataforma (empresa `syspass`) |
| Panel **Empresas** | No | Sí, para el dueño |

Se puede cambiar después sin reinstalar ni perder datos:

```bash
sudo syspass mode                     # ver el modo actual
sudo syspass mode single drago        # una sola empresa: la de código "drago"
sudo syspass mode multi               # volver a multiempresa
```

### Base de datos: incorporada o existente

| | PostgreSQL incorporado | PostgreSQL existente |
|---|---|---|
| Qué instala | Un contenedor PostgreSQL 17 con su volumen | Nada: usa tu servidor PostgreSQL |
| Dónde | Dentro de Docker | En este mismo servidor o en otro |
| Versión | 17 | 13 o superior |
| Respaldos `syspass backup` | Sí | Sí, con un cliente de la misma versión que tu servidor |
| Recomendado para | La mayoría de instalaciones | Equipos que ya administran PostgreSQL, con sus propias réplicas y respaldos |

Con un PostgreSQL existente, el instalador puede **crear la base y el usuario** si le das un superusuario (por ejemplo `postgres`), o usar unos que ya existan. Antes de continuar comprueba la conexión, la versión y que el usuario pueda crear tablas.

> [!IMPORTANT]
> **PostgreSQL en el mismo servidor.** SysPass corre en Docker y llega a tu PostgreSQL por la red interna de Docker (`host.docker.internal`), no por `localhost`. PostgreSQL debe aceptar esas conexiones:
>
> ```conf
> # postgresql.conf
> listen_addresses = 'localhost,172.17.0.1'
>
> # pg_hba.conf
> host  all  all  172.16.0.0/12  scram-sha-256
> ```
>
> Después: `sudo systemctl restart postgresql`. Si usas `ufw`: `sudo ufw allow from 172.16.0.0/12 to any port 5432 proto tcp`. Si la conexión falla, el instalador muestra estos mismos pasos.

### Instalación sin preguntas

Todas las respuestas se pueden pasar como variables:

```bash
curl -fsSL https://github.com/Jamesllm/syspass/releases/latest/download/install.sh \
  | sudo SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest \
         DOMAIN=vault.miempresa.com ACME_EMAIL=ti@miempresa.com \
         DB_MODE=builtin OWNER_USER=admin OWNER_NAME="Equipo TI" bash
```

Con un PostgreSQL existente:

```bash
curl -fsSL https://github.com/Jamesllm/syspass/releases/latest/download/install.sh \
  | sudo SYSPASS_IMAGE=ghcr.io/jamesllm/syspass:latest \
         DB_MODE=external DB_HOST=localhost DB_NAME=syspass DB_USER=syspass \
         DB_CREATE=s DB_ADMIN_USER=postgres DB_ADMIN_PASSWORD='…' bash
```

| Variable | Descripción | Por defecto |
|---|---|---|
| `SYSPASS_IMAGE` | Imagen a instalar | — |
| `DOMAIN` | Dominio público; vacío = acceso por IP | vacío |
| `ACME_EMAIL` | Correo para avisos del certificado | vacío |
| `APP_PORT` | Puerto web cuando no hay dominio | `80` |
| `SYSPASS_MODE` | `single` (una sola empresa) o `multi` (SaaS) | pregunta |
| `ORG_NAME` | Nombre de la empresa en modo `single` | pregunta |
| `DB_MODE` | `builtin` (incorporado) o `external` (existente) | pregunta |
| `DB_HOST` / `DB_PORT` | Servidor PostgreSQL existente | `localhost` / `5432` |
| `DB_NAME` / `DB_USER` | Base y usuario para SysPass | `syspass` |
| `DB_PASSWORD` | Contraseña del usuario. Si el instalador lo crea, se genera sola | — |
| `DB_CREATE` | `s` para crear la base y el usuario con un superusuario | pregunta |
| `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` | Superusuario para crearlos (no se guarda) | `postgres` |
| `OWNER_USER` / `OWNER_NAME` | Primera cuenta: administrador de tu empresa (`single`) o dueño de la plataforma (`multi`) | `admin` |
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
| `syspass mode [single <empresa> \| multi]` | Ver o cambiar el modo: una sola empresa o multiempresa |
| `syspass ui-update enable \| disable \| status` | Permitir actualizar desde la interfaz (botón «Actualizar ahora») |
| `syspass uninstall` | Quita los contenedores y **conserva** datos, configuración y respaldos |
| `syspass uninstall --purge` | Borra todo. Antes ofrece guardar un respaldo final |

### Desinstalar

```bash
sudo syspass uninstall            # quita los contenedores; vuelve con: sudo syspass start
sudo syspass uninstall --purge    # elimina SysPass por completo
```

Con `--purge` se eliminan los contenedores, las imágenes, la base incorporada, los certificados, `/opt/syspass` y el comando `syspass`. Antes ofrece guardar un **respaldo final con la configuración** (incluida `VAULT_KEY`) en `/root/syspass-respaldo-FECHA`, para poder restaurar en otra instalación. Pide escribir `DESINSTALAR` para confirmar; para hacerlo sin preguntas, agrega `--yes`.

Si usas un **PostgreSQL existente**, la desinstalación no toca tu base. Al final muestra el SQL para borrarla si también quieres eliminarla.

También se puede desinstalar con el mismo instalador: `sudo ./deploy/install.sh --uninstall --purge`.

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
sudo syspass upgrade
```

Hace un respaldo, descarga la imagen nueva, reinicia, aplica las migraciones pendientes y actualiza el propio comando `syspass`. Para actualizar solo el comando: `sudo syspass self-update`.

#### Desde la interfaz

En el menú, junto a la versión instalada (`v1.3.0`), aparece **Actualizar** cuando hay una versión nueva. Al hacer clic se abre el modal de novedades con lo que trae cada versión y el botón **Actualizar ahora**. SysPass hace el respaldo, descarga la versión, aplica las migraciones y se recarga solo. Después muestra una vez las novedades de la versión nueva.

Pueden actualizar los administradores de la empresa (modo una empresa) o el dueño de la plataforma (multiempresa). Hay que activarlo una vez en el servidor; el instalador lo ofrece en las instalaciones nuevas:

```bash
sudo syspass ui-update enable     # activar
sudo syspass ui-update status     # ver el estado y la última actualización
sudo syspass ui-update disable    # desactivar
```

> [!NOTE]
> La app **no** tiene acceso a Docker. El botón solo deja una solicitud en `/opt/syspass/control`; un servicio de systemd del servidor (o cron, si no hay systemd) la detecta y ejecuta `syspass upgrade`. Así, aunque alguien comprometiera la app web, no podría controlar el servidor.

#### Si instalaste la versión 1.0.0

El comando `syspass` de la 1.0.0 no sabe actualizarse a sí mismo. Reemplázalo una vez y después usa `upgrade` como siempre:

```bash
curl -fsSL https://github.com/Jamesllm/syspass/releases/latest/download/install.sh \
  | sed -n "/^cat > syspass <<'CLI'$/,/^CLI$/p" | sed '1d;$d' > /tmp/syspass \
  && bash -n /tmp/syspass && sudo install -m 755 /tmp/syspass /opt/syspass/syspass

sudo syspass upgrade
```

Tus datos, la configuración y la `VAULT_KEY` no cambian. La instalación sigue usando el PostgreSQL incorporado.

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
| `SYSPASS_MODE` | `single` (una sola empresa) o `multi` (SaaS) | `multi` |
| `SYSPASS_ORG` | Código de la empresa en modo `single`; vacío = se detecta si hay una sola | vacío |
| `SYSPASS_CONTROL_DIR` | Carpeta compartida para actualizar desde la interfaz (la configura `syspass ui-update enable`) | vacío |
| `SYSPASS_UPDATE_REPO` | Repositorio de GitHub donde se buscan versiones nuevas | `Jamesllm/syspass` |

### Importar credenciales desde texto

En **Importar** (administrador de la empresa). El importador reconoce secciones en mayúsculas como `WINDOWS SERVER - CLIENTE`, elementos numerados (`1. NAS`) y líneas `usuario:`, `correo:`, `pass:`, `ip:`, `id:` y `enlace:`. Antes de guardar muestra una vista previa sin contraseñas.

### Publicar una versión

1. Agrega la sección de la versión en [`CHANGELOG.md`](CHANGELOG.md) (`## 1.4.0 — AAAA-MM-DD` con `### Nuevo`, `### Arreglos`…) y sube `version` en los `package.json`.
2. Crea la etiqueta:

```bash
git tag v1.4.0 && git push --tags
```

El workflow [`release.yml`](.github/workflows/release.yml) construye la imagen para `amd64` y `arm64` con la versión grabada, la publica en `ghcr.io/jamesllm/syspass` con las etiquetas `1.4.0`, `1.4` y `latest`, y crea la versión en GitHub con `install.sh` y las notas tomadas del changelog. Esas mismas notas son las que ven los usuarios en el modal de novedades.

### Windows

El instalador es solo para Linux. En Windows Server puedes usar Docker Desktop o WSL2 con el `docker-compose.yml` que genera el instalador, o la instalación con Node descrita en [Desarrollo](#desarrollo), ejecutando `npm run build` y `npm start` como servicio (por ejemplo con NSSM).
