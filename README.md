# CRM Belleza

CRM de ventas para una distribuidora de maquillaje (proyecto final de Programación Web).

- **Administradores y supervisores** usan el panel Laravel: gestionan cuentas, catálogo, asignación de clientes y reportes.
- **Vendedores** usan una SPA que consume una API REST en Express: gestionan su cartera, el embudo de oportunidades y las actividades de seguimiento.

Las tres piezas comparten una sola base de datos MySQL. La especificación completa está en [`docs/especificacion.md`](docs/especificacion.md) y el plan de trabajo en [`docs/plan.md`](docs/plan.md).

> **Estado de la entrega.** La API y la SPA del vendedor (Parte B) están implementadas. El panel Laravel, las migraciones, `VerificacionSeeder`, `SectorSeeder` y el resumen mensual (`GET /api/reportes/resumen` y su vista en la SPA) corresponden a la Parte A y están **pendientes**. Mientras tanto, la API y la SPA pueden probarse con el [modo demostración](#modo-demostración-sin-mysql).

## Tecnologías

| Pieza | Tecnologías |
|---|---|
| Base de datos | MySQL 8.4 en Docker (`docker-compose.yml`), UTC, utf8mb4 |
| Panel | Laravel 13 + Breeze (Blade), PHP 8.3 o superior |
| API REST | Node.js 24, Express 5, `mysql2/promise` (SQL con parámetros `?`, sin ORM), `jsonwebtoken` (HS256), `bcryptjs`, `cors` |
| SPA del vendedor | HTML, Bootstrap 5.3 y JavaScript con módulos (sin frameworks), patrón estado → render |
| Pruebas | `node:test`, Postman, script de concurrencia por HTTP |

## Estructura

```text
CRM-belleza/
├── api/                 API REST Express (Parte B)
│   ├── src/             app.js, server.js, config/, middleware/, rutas/, servicios/, utils/
│   ├── test/            pruebas node:test (simuladas e integración con MySQL)
│   ├── scripts/         prueba-concurrencia.js
│   └── demo/            servidor de demostración sobre la base simulada
├── frontend/            SPA del vendedor (Parte B; la vista de resumen es de la Parte A)
│   ├── js/              app.js, api.js, estado.js, acciones-*.js, vistas/, util/
│   └── test/            pruebas node:test de vistas y acciones
├── laravel/             panel de administración (Parte A)
├── docs/                especificación, plan, specs por fase, verificación, bitácora de IA y colección Postman
└── docker-compose.yml   MySQL 8.4
```

## Endpoints de la API

URL base: `http://localhost:3000/api`. Todo viaja en JSON. Todas las rutas exigen `Authorization: Bearer <token>`, salvo el inicio de sesión. Contrato completo y formas de respuesta: [`docs/especificacion.md` §8](docs/especificacion.md).

| Método | Ruta | Cuerpo o parámetros | Respuesta correcta | Errores |
|---|---|---|---|---|
| POST | `/auth/login` | `{ correo, clave }` | 200 `{ token, usuario }` | 400, 401, 403, 422 |
| GET | `/productos` | — | 200, productos activos | 400, 401 |
| GET | `/clientes` | `?q=` (nombre o NIT, máx. 100 caracteres) | 200, clientes de su cartera | 400, 401 |
| POST | `/clientes` | `{ nombre, nit, telefono, correo? }` | 201, el cliente | 400, 401, 409, 422 |
| GET | `/clientes/disponibles` | — | 200, `[{ id, nombre }]` | 400, 401 |
| POST | `/clientes/:id/tomar` | — | 200, el cliente | 401, 404, 409 |
| GET | `/clientes/:id` | — | 200, el cliente | 401, 404 |
| PATCH | `/clientes/:id` | campos que cambian | 200, el cliente | 400, 401, 404, 409, 422 |
| POST | `/clientes/:id/actividades` | `{ tipo, descripcion, vence_en? }` | 201, la actividad | 400, 401, 404, 422 |
| GET | `/actividades` | `?estado=pendiente\|completada` | 200, actividades de su cartera | 400, 401 |
| PATCH | `/actividades/:id` | `{ completada }` | 200, la actividad | 400, 401, 404, 422 |
| GET | `/oportunidades` | `?etapa=` | 200, resumen de sus oportunidades | 400, 401 |
| POST | `/oportunidades` | `{ cliente_id, titulo }` | 201, detalle en prospecto | 400, 401, 422 |
| GET | `/oportunidades/:id` | — | 200, detalle | 401, 404 |
| PATCH | `/oportunidades/:id` | `{ titulo }` | 200, detalle | 400, 401, 404, 409, 422 |
| PATCH | `/oportunidades/:id/etapa` | `{ etapa, motivo_perdida? }` | 200, detalle | 400, 401, 404, 409, 422 |
| POST | `/oportunidades/:id/productos` | `{ producto_id, cantidad }` | 201, detalle | 400, 401, 404, 409, 422 |
| PATCH | `/oportunidades/:id/productos/:lineaId` | `{ cantidad }` | 200, detalle | 400, 401, 404, 409, 422 |
| DELETE | `/oportunidades/:id/productos/:lineaId` | — | 204, sin cuerpo | 401, 404, 409 |
| GET | `/reportes/resumen` | `?mes=AAAA-MM` | 200, resumen del mes | 400, 401 |

`GET /reportes/resumen` lo implementa la Parte A (pendiente). Errores: `{ "error": "mensaje" }`; validación (422): `{ "errores": { "campo": "mensaje" } }`.

**Regla propia del sector (control de stock).** Al ganar una oportunidad (solo desde `negociacion`) se comprueba en una transacción el stock de todos los productos con inventario controlado. Si alcanza, se descuenta; si no, responde 409 y no cambia nada. `stock = NULL` significa sin control de inventario. Ver [`docs/especificacion.md` §10](docs/especificacion.md).

## Variables de entorno

Los archivos `.env` no se versionan. Cada pieza tiene un `.env.example` con los **nombres** de las variables: cópielo a `.env` y escriba sus propios valores. No reutilice valores de ejemplo ni publique contraseñas.

| Archivo | Variable | Uso |
|---|---|---|
| `.env` (raíz, Docker) | `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_PORT` | Contenedor MySQL. La base es `crm_belleza`. |
| `api/.env` | `PORT` | Puerto de la API (3000). |
| | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a MySQL (la misma base que Laravel). |
| | `JWT_SECRET` | Al menos 32 caracteres aleatorios. La API no arranca sin él. |
| | `JWT_EXPIRES_IN` | Duración del token: `8h`, `30m` o segundos (`3600`). |
| | `CORS_ORIGIN` | Origen exacto de la SPA, por ejemplo `http://127.0.0.1:5500`. Nunca `*`. |
| `laravel/.env` | — | Pendiente de documentar por la Parte A. |

Para generar un `JWT_SECRET` aleatorio:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Puesta en marcha desde cero

Requisitos: Git, Docker Desktop, Node.js 24, npm, PHP 8.3 o superior, Composer 2 y Python 3 (solo para servir la SPA).

### 1. MySQL (Docker)

Desde la raíz, con el `.env` de la raíz ya creado:

```bash
docker compose up -d
```

Levanta el contenedor `crm-mysql` (MySQL 8.4, zona horaria UTC) en el puerto `MYSQL_PORT` (por omisión 3306), con un volumen persistente `crm_mysql_data`.

### 2. Esquema y semillas (Laravel, Parte A)

> **Pendiente de la Parte A.** Las migraciones, `VerificacionSeeder` y `SectorSeeder` todavía no están en el repositorio. Esta sección se completará con los comandos que la Parte A compruebe.

Según el plan (`docs/plan.md`, fase A1), la base de **pruebas** se preparará con:

```bash
php artisan migrate:fresh --seeder=VerificacionSeeder
```

**`migrate:fresh` borra todas las tablas.** Úselo solo en una base de pruebas que se pueda restablecer, nunca en una base con datos que deban conservarse.

Todas las cuentas de `VerificacionSeeder` usan la contraseña pública `Ventas2026` (enunciado §11). Con esa semilla, Valeria López (`valeria@crm.test`) debe obtener en octubre de 2026: 2 ventas, Q9,250.00 de total vendido, Q2,512.88 de pronóstico y 3 de 10 clientes en cartera.

### 3. Panel Laravel (Parte A)

> **Pendiente de la Parte A**: instalación (`composer install`, `npm install`), configuración de `laravel/.env` y arranque del panel.

### 4. API Express

```bash
cd api
npm install
npm start
```

`npm start` lee `api/.env`. Para desarrollo, `npm run dev` reinicia la API al guardar. Al arrancar verifica `JWT_SECRET` y `CORS_ORIGIN`, y escucha en `http://localhost:3000/api`.

### 5. SPA del vendedor

La SPA son archivos estáticos: se sirven desde la carpeta `frontend/` en el origen configurado en `CORS_ORIGIN`.

```bash
python -m http.server 5500 --bind 127.0.0.1 --directory frontend
```

Abra `http://127.0.0.1:5500` (también sirve la extensión Live Server en ese puerto). La SPA llama a la API en `http://127.0.0.1:3000/api` (`URL_API` en `frontend/js/api.js`, permitido por la CSP de `index.html`). Solo los vendedores activos pueden entrar: administradores y supervisores reciben el mensaje del 403 y deben usar el panel.

### Modo demostración (sin MySQL)

Mientras no existan las migraciones y la semilla, la API real puede levantarse sobre la **base simulada en memoria** de las pruebas, con usuarios y clientes ficticios (no son la semilla oficial):

```bash
cd api
npm run demo
```

Escucha en `127.0.0.1:3000`, no lee `.env`, usa un `JWT_SECRET` aleatorio en cada arranque y marca cada respuesta con `X-CRM-Modo: demostracion-local`. Al arrancar muestra en la consola el correo y la contraseña de la vendedora de prueba (los datos están en `api/test/ayuda/bd-simulada.js`). Los datos se pierden al reiniciar. Se niega a arrancar con `NODE_ENV=production`.

## Pruebas

### API (`node:test`)

```bash
cd api
npm test
```

Ejecuta todas las pruebas con la base simulada, sin MySQL. Las de integración con MySQL se omiten con su motivo.

```bash
cd api
npm run test:bd
```

Ejecuta lo mismo leyendo `api/.env`. Así corren también las pruebas de integración, de solo lectura, contra MySQL con `VerificacionSeeder` cargado (requieren las migraciones de la Parte A). Variables opcionales:

- `CLAVE_SEMILLA`: la contraseña pública de la semilla, para los inicios de sesión reales (B2-01, B2-04 y B2-10).
- `CRM_BD_RESTABLECIBLE=si`: activa la prueba de revocación del JWT (B6-20), que desactiva y restaura una cuenta. Solo en una base de pruebas restablecible. Nunca se ejecuta si la base conectada es `crm_belleza`.

### SPA (`node:test`)

Desde la raíz:

```bash
node --test "frontend/test/*.test.js"
```

### Hooks de Claude Code

```bash
node --test .claude/hooks/pruebas/hooks.test.mjs
```

### Pruebas de concurrencia

`api/scripts/prueba-concurrencia.js` envía peticiones HTTP simultáneas (`fetch` + `Promise.all`) a una API en marcha y comprueba:

| Criterio | Escenario | Resultado esperado |
|---|---|---|
| B6-14 | Toma simultánea del mismo cliente disponible (10 peticiones) | 1×200 y 9×409 |
| B6-15 | Altas simultáneas con 9 clientes en cartera (3 peticiones) | 1×201 y 2×409, cartera en 10 |
| B6-16 | Altas simultáneas con el mismo NIT | 1×201 y 1×409 |
| B6-17 | Cambio simultáneo a la misma etapa | 1×200 y 1×409, un solo evento de historial |
| B6-18 | Dos ventas por la última unidad de un producto (si hay más, antes se vende el resto) | 1×200 y 1×409, stock 0 |

**El script crea clientes, oportunidades y ventas, y descuenta stock.** Por eso:

- sin `--confirmar-escritura` solo inicia sesión y lee;
- con `--confirmar-escritura` solo escribe contra el modo demostración o si se declara `CONCURRENCIA_BASE_RESTABLECIBLE=si` para una base de pruebas restablecible;
- no se conecta a MySQL.

Nunca lo ejecute contra la base compartida.

Contra la demostración, con la demo en marcha en otra terminal y las credenciales de dos vendedores (en PowerShell):

```powershell
cd api
$env:CONCURRENCIA_CORREO_A = "vendedora1@prueba.test"; $env:CONCURRENCIA_CLAVE_A = "<clave de la demo>"
$env:CONCURRENCIA_CORREO_B = "vendedor2@prueba.test";  $env:CONCURRENCIA_CLAVE_B = "<clave de la demo>"
npm run concurrencia -- --confirmar-escritura
```

Reinicie la demo antes de repetirlo: la segunda ejecución sobre los mismos datos marca como PENDIENTE lo que ya no puede preparar (código de salida 1). Otras variables:

- `CONCURRENCIA_URL` (por omisión `http://127.0.0.1:3000/api`);
- `CONCURRENCIA_PRODUCTO_ID` (producto con stock controlado para B6-18);
- `--json` (resumen legible por máquina).

Códigos de salida: 0 si todo se aprueba, 1 si algo falla o queda pendiente, y 2 si no se ejecutó.

Con MySQL real (después de I1), use dos vendedores activos de una base de pruebas restablecible y un producto con stock controlado, que prepara la Parte A. Los resultados contra la demo son **simulados**: no sustituyen la verificación con InnoDB.

## Colección de Postman

[`docs/api.postman_collection.json`](docs/api.postman_collection.json) tiene al menos una petición por endpoint, los errores principales (400, 401, 403, 404, 409 y 422) y la regla propia (RP-01 a RP-04), con aserciones en cada petición.

1. En Postman: **Import** → seleccione `docs/api.postman_collection.json`.
2. En las variables de la colección revise `baseUrl` (por omisión `http://localhost:3000/api`; para la demo, `http://127.0.0.1:3000/api`), `correo_vendedora`, `clave` (`Ventas2026`) y complete `correo_vendedor_b`, `correo_admin`, `correo_supervisor` y `correo_inactivo` con las cuentas de la semilla. Los valores para la demo están en la descripción de la colección.
3. Ejecute la colección completa con el **Runner**, en orden. La primera carpeta guarda los tokens (`{{token}}` y `{{token_b}}`) y las siguientes encadenan los ids que crean.

Las carpetas 01 a 04 solo leen. Las carpetas 05 a 08 **modifican datos**: ejecútelas solo contra la demo o contra una base de pruebas restablecible. La carpeta 04 (resumen mensual) depende de la Parte A y va antes de las que escriben, porque sus cifras de control solo valen con `VerificacionSeeder` recién cargado y sin cambios.

## Documentación del proceso

| Documento | Contenido |
|---|---|
| [`docs/especificacion.md`](docs/especificacion.md) | Requisitos, contrato de la API, decisiones de diseño y cifras de control |
| [`docs/plan.md`](docs/plan.md) | Fases A1–A7 y B1–B6, integraciones I1–I4 |
| [`docs/specs/`](docs/specs) | Criterios de aceptación de cada fase de la Parte B |
| [`docs/verificacion.md`](docs/verificacion.md) | Matriz de verificación y evidencias (se consolida entre ambas integrantes) |
| [`docs/bitacora-ia.md`](docs/bitacora-ia.md) | Errores reales del agente de IA y su corrección |
