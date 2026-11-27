# Novedades de SysPass

Cada versión publicada toma sus notas de este archivo. La app las muestra en el modal de novedades.

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
