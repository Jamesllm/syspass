# Novedades de SysPass

Cada versión publicada toma sus notas de este archivo. La app las muestra en el modal de novedades.

## 1.4.1 — 2026-11-27

### Nuevo
- Botón «Agregar cuenta» al pie de cada recurso: agrega una cuenta o varias en lista sin abrir el editor del recurso
- Orden de las cuentas de cada recurso (nombre A→Z o Z→A, usuario o más recientes); se guarda en el servidor y lo ven todos
- Orden natural de nombres: TC-LAP-2 va antes que TC-LAP-10

### Arreglos
- La búsqueda muestra solo las cuentas que coinciden dentro de cada recurso, con la opción «Ver todas»

## 1.4.0 — 2026-11-27

### Nuevo
- Grupos editables (VPN, NAS, AnyDesk…): crea, renombra o borra grupos con su color; los tipos anteriores pasan a ser grupos
- Al crear un recurso se elige primero el grupo y luego se agregan las cuentas
- Agregar cuentas en lista: una por línea con el formato usuario;contraseña (también se puede pegar desde Excel)
- Editar cada cuenta por separado con el lápiz de la cuenta
- Exportar a Excel lo que estás viendo (cliente o grupo) o todo; con contraseñas solo con permiso y queda en la auditoría
- Permisos por usuario con casillas: ver, copiar, crear, editar, eliminar, grupos, exportar, importar e historial
- Historial de cada cuenta en una línea de tiempo: quién la creó, cambió la contraseña o el usuario, y quién la vio o copió
- Cada cuenta muestra su fecha de modificación; los administradores ven también quién la modificó

## 1.3.0 — 2026-11-26

### Nuevo
- Actualiza SysPass desde la interfaz con el botón «Actualizar ahora», sin entrar al servidor
- Modal de novedades: muestra qué trae cada versión y avisa cuando hay una nueva
- La versión instalada se ve en el menú
- Tema claro, oscuro o según el sistema, a elección de cada usuario

### Servidor
- Nuevo comando `syspass ui-update enable` para permitir las actualizaciones desde la interfaz

## 1.2.1 — 2026-11-26

### Arreglos
- «Nuevo recurso» ya funciona al entrar por HTTP con la IP del servidor
- Sin HTTPS ya no aparecen avisos de cabeceras de seguridad en la consola

## 1.2.0 — 2026-11-26

### Nuevo
- Modo una sola empresa: el equipo entra solo con usuario y contraseña, sin código de empresa
- El instalador pregunta si la instalación es para una empresa o multiempresa
- Comando `syspass mode` para cambiar de modo sin reinstalar

## 1.1.2 — 2026-11-26

### Arreglos
- El instalador con `curl | bash` ya no se corta después de probar la base de datos
- `syspass upgrade` solo borra imágenes viejas de SysPass, no las de otros proyectos del servidor
- Aviso claro «Usa sudo» cuando el comando no tiene permisos

## 1.1.1 — 2026-11-26

### Nuevo
- Comando `syspass self-update`; `syspass upgrade` también actualiza el comando

### Arreglos
- El comando nuevo funciona con instalaciones de la versión 1.0.0

## 1.1.0 — 2026-11-26

### Nuevo
- Opción de usar un PostgreSQL existente (en el mismo servidor o en otro) en lugar del incorporado
- Desinstalación completa con `syspass uninstall --purge`, con respaldo final opcional

## 1.0.0 — 2026-11-25

### Nuevo
- Bóveda de credenciales multiempresa con contraseñas cifradas por empresa
- Permisos por cliente, auditoría y revisión de seguridad
- Importación desde archivos de texto
- Instalación con un solo comando
