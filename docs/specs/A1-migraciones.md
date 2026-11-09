# A1 — Migraciones y semilla de verificación

**Proyecto:** CRM Belleza  
**Responsable:** Parte A  
**Rama:** `a/migraciones`  
**Estado:** Pendiente de aprobación  
**Referencia:** `docs/especificacion.md` (`spec-v1`) §4, §10, §13; enunciado §6 y §11; `docs/plan.md` A1

## 1. Objetivo

Crear con migraciones de Laravel el esquema de la sección 4 (tablas, llaves foráneas, índices únicos y restricciones CHECK, más la columna `stock` de la regla propia) y la semilla `VerificacionSeeder` con los datos exactos de la sección 11 del enunciado, de modo que `php artisan migrate:fresh --seeder=VerificacionSeeder` deje la base lista para la integración I1.

## 2. Alcance

### Funcionalidades incluidas

- Migración nueva que agrega `rol`, `supervisor_id` y `activo` a `users`.
- Migraciones de `productos`, `clientes`, `oportunidades`, `oportunidad_productos`, `historial_etapas` y `actividades`.
- Migración nueva que agrega `productos.stock` con su CHECK.
- Llaves foráneas, cascadas, índices únicos y restricciones CHECK (con `DB::statement`).
- `VerificacionSeeder` y su llamada desde `DatabaseSeeder`, seguida de `SectorSeeder` (vacío en esta fase).
- Modelos Eloquent de las 7 tablas con sus relaciones y casts (`decimal:2`, `boolean`, `datetime`); `HistorialEtapa` con `UPDATED_AT = null`.

### Fuera del alcance

- El contenido de `SectorSeeder` (spec propia).
- Políticas, FormRequest y vistas del panel (A2 en adelante).
- Cualquier archivo de `api/` o `frontend/`.
- Editar las migraciones originales de Laravel (`0001_01_01_*`).

## 3. Restricciones técnicas

- Laravel 13 sobre MySQL 8.4 (`DB_CONNECTION=mysql`), conexión con `'timezone' => '+00:00'`.
- Montos en DECIMAL(10,2), nunca FLOAT.
- CHECK con `DB::statement('ALTER TABLE … ADD CONSTRAINT chk_<tabla>_<regla> CHECK (…)')`, con nombre explícito.
- Ninguna migración versionada se edita: los cambios posteriores llegan con migraciones nuevas.
- Contraseñas con `Hash::make('Ventas2026')`; `Ventas2026` solo aparece en la semilla.
- La semilla usa el constructor de consultas (`DB::table`) con id explícitos, en el orden de las tablas de la sección 6.

## 4. Decisiones de esta fase (propuestas)

`docs/especificacion.md` no fija estos puntos. Requieren la aprobación de ambas integrantes antes de implementar.

| Id | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| DA1-1 | `rol`, `etapa`, `etapa_anterior`, `etapa_nueva` y `tipo` son VARCHAR con CHECK de valores | ENUM | Un valor inválido da errno 3819 (→ 422 en la API); un ENUM en modo estricto da 1265 |
| DA1-2 | Las tablas nuevas usan `datetimes()` (DATETIME) | `timestamps()` (TIMESTAMP) | El enunciado define DATETIME; el valor no depende de la zona de la sesión (mysql2 no fija `time_zone`). `users` conserva lo de Laravel |
| DA1-3 | Las FKs sin cascada indicada son RESTRICT | SET NULL o CASCADE | Cuentas y productos no se borran; un cliente con oportunidades no se borra (L4-04) |
| DA1-4 | `stock` se agrega con su propia migración | Incluirlo en `create_productos` | Separa la regla propia del núcleo |
| DA1-5 | `created_at`/`updated_at` de cuentas, productos, clientes y actividades: `2026-08-01 15:00:00` UTC; oportunidades y líneas: fecha del primer registro de historial (`updated_at` = último) | `now()` | Semilla reproducible |

## 5. Esquema

Orden de migraciones (fecha `2026_11_08`, sufijos consecutivos):

1. `add_rol_supervisor_activo_to_users_table`
2. `create_productos_table`
3. `create_clientes_table`
4. `create_oportunidades_table`
5. `create_oportunidad_productos_table`
6. `create_historial_etapas_table`
7. `create_actividades_table`
8. `add_stock_to_productos_table`

| Tabla | Columna | Tipo | Nulo / defecto | Restricción |
|---|---|---|---|---|
| users | rol | VARCHAR(20) | `'vendedor'` | `chk_users_rol`: IN ('administrador','supervisor','vendedor') |
| users | supervisor_id | BIGINT UNSIGNED | NULL | FK users.id RESTRICT |
| users | activo | BOOLEAN | `true` | — |
| productos | nombre | VARCHAR(120) | NOT NULL | UNIQUE |
| productos | precio | DECIMAL(10,2) | NOT NULL | `chk_productos_precio`: precio > 0 |
| productos | activo | BOOLEAN | `true` | — |
| productos | stock | INT | NULL | `chk_productos_stock`: stock IS NULL OR stock >= 0 |
| clientes | vendedor_id | BIGINT UNSIGNED | NULL | FK users.id RESTRICT |
| clientes | nombre | VARCHAR(150) | NOT NULL | — |
| clientes | nit | VARCHAR(12) | NULL | UNIQUE (admite varios NULL) |
| clientes | telefono | CHAR(8) | NOT NULL | UNIQUE; `chk_clientes_telefono`: REGEXP '^[2-9][0-9]{7}$' |
| clientes | correo | VARCHAR(150) | NULL | — |
| oportunidades | cliente_id | BIGINT UNSIGNED | NOT NULL | FK clientes.id RESTRICT |
| oportunidades | vendedor_id | BIGINT UNSIGNED | NOT NULL | FK users.id RESTRICT |
| oportunidades | titulo | VARCHAR(150) | NOT NULL | — |
| oportunidades | etapa | VARCHAR(20) | `'prospecto'` | `chk_oportunidades_etapa`: IN (6 etapas) |
| oportunidades | motivo_perdida | VARCHAR(255) | NULL | `chk_oportunidades_motivo`: (etapa = 'perdida') = (motivo_perdida IS NOT NULL) |
| oportunidades | fecha_cierre | DATETIME | NULL | `chk_oportunidades_cierre`: (etapa IN ('ganada','perdida')) = (fecha_cierre IS NOT NULL) |
| oportunidad_productos | oportunidad_id | BIGINT UNSIGNED | NOT NULL | FK oportunidades.id CASCADE |
| oportunidad_productos | producto_id | BIGINT UNSIGNED | NOT NULL | FK productos.id RESTRICT; UNIQUE (oportunidad_id, producto_id) |
| oportunidad_productos | cantidad | SMALLINT UNSIGNED | NOT NULL | `chk_oportunidad_productos_cantidad`: BETWEEN 1 AND 999 |
| oportunidad_productos | precio_unitario | DECIMAL(10,2) | NOT NULL | `chk_oportunidad_productos_precio`: precio_unitario > 0 |
| historial_etapas | oportunidad_id | BIGINT UNSIGNED | NOT NULL | FK oportunidades.id CASCADE |
| historial_etapas | usuario_id | BIGINT UNSIGNED | NOT NULL | FK users.id RESTRICT |
| historial_etapas | etapa_anterior | VARCHAR(20) | NULL | `chk_historial_etapas_etapa_anterior`: NULL o IN (6 etapas) |
| historial_etapas | etapa_nueva | VARCHAR(20) | NOT NULL | `chk_historial_etapas_etapa_nueva`: IN (6 etapas) |
| historial_etapas | created_at | DATETIME | NOT NULL | sin `updated_at` |
| actividades | cliente_id | BIGINT UNSIGNED | NOT NULL | FK clientes.id CASCADE |
| actividades | vendedor_id | BIGINT UNSIGNED | NOT NULL | FK users.id RESTRICT |
| actividades | tipo | VARCHAR(10) | NOT NULL | `chk_actividades_tipo`: IN ('llamada','reunion','tarea') |
| actividades | descripcion | VARCHAR(500) | NOT NULL | — |
| actividades | vence_en | DATETIME | NULL | — |
| actividades | completada | BOOLEAN | `false` | — |

Las 6 etapas son `prospecto`, `calificado`, `propuesta`, `negociacion`, `ganada` y `perdida`.

Todas las tablas nuevas tienen `id` y, salvo `historial_etapas`, `created_at` y `updated_at`.

La regla «el supervisor de un vendedor tiene rol supervisor y está activo» depende de otra fila: la cumple el FormRequest del panel (A2), no la base (§4.9).

Las columnas coinciden con las que ya usa el SQL de `api/src` (revisado antes de esta spec).

## 6. VerificacionSeeder

Datos de la sección 11 del enunciado. Contraseña de todas las cuentas: `Ventas2026`. Fechas en UTC.

### Cuentas (7)

| id | name | email | rol | supervisor_id | activo |
|---:|---|---|---|---|---|
| 1 | Alicia Morales | admin@crm.test | administrador | — | sí |
| 2 | Sergio Ruiz | sergio@crm.test | supervisor | — | sí |
| 3 | Sandra Pérez | sandra@crm.test | supervisor | — | sí |
| 4 | Valeria López | valeria@crm.test | vendedor | 2 | sí |
| 5 | Diego Castillo | diego@crm.test | vendedor | 2 | sí |
| 6 | Carlos Ajú | carlos@crm.test | vendedor | 3 | sí |
| 7 | Iván Toj | ivan@crm.test | vendedor | 3 | **no** |

### Productos (5, todos con `stock = NULL`)

| id | nombre | precio | activo |
|---:|---|---:|---|
| 1 | Plan básico | 1200.00 | sí |
| 2 | Plan avanzado | 2750.50 | sí |
| 3 | Instalación | 450.00 | sí |
| 4 | Soporte anual | 3600.00 | sí |
| 5 | Licencia anterior | 999.99 | no |

### Clientes (21)

| id | vendedor_id | nombre | nit | telefono | correo |
|---:|---|---|---|---|---|
| 1 | 4 (Valeria) | Comercial El Quetzal | 4521817K | 55551234 | compras@elquetzal.test |
| 2 | 4 (Valeria) | Ferretería Xela | 98765434 | 77612345 | NULL |
| 3 | 4 (Valeria) | María Coyoy | NULL (CF) | 41234567 | NULL |
| 4 | 5 (Diego) | Farmacia Los Altos | 34567895 | 77634567 | gerencia@losaltos.test |
| 5 | 5 (Diego) | Luis Tzul | NULL | 52345678 | NULL |
| 6 | 6 (Carlos) | Abarrotes San Juan | 12345679 | 77651001 | NULL |
| 7 | 6 (Carlos) | Panadería La Esperanza | NULL | 30001002 | NULL |
| 8 | 6 (Carlos) | Taller El Volcán | 22233342 | 77651003 | NULL |
| 9 | 6 (Carlos) | Ana Xicará | NULL | 30001004 | NULL |
| 10 | 6 (Carlos) | Librería Cantel | 55566677 | 77651005 | NULL |
| 11 | 6 (Carlos) | Pedro Batz | NULL | 30001006 | NULL |
| 12 | 6 (Carlos) | Tienda La Bendición | NULL | 30001007 | NULL |
| 13 | 6 (Carlos) | Distribuidora Occidente | 77788893 | 77651008 | NULL |
| 14 | 6 (Carlos) | Rosa Tax | NULL | 30001009 | NULL |
| 15 | 7 (Iván) | Hotel Los Pinos | 66655544 | 77661001 | NULL |
| 16 | NULL | Agencia Cuatro Caminos | NULL | 30002001 | NULL |
| 17 | NULL | Café Zunil | NULL | 30002002 | NULL |
| 18 | NULL | Clínica San Rafael | 8889990K | 77672003 | NULL |
| 19 | NULL | Constructora Altiplano | 44433328 | 77672004 | NULL |
| 20 | NULL | Escuela Futuro | NULL | 30002005 | NULL |
| 21 | NULL | Gimnasio Fuerza | NULL | 30002006 | NULL |

Nota: el ejemplo de §8.2 (`{ "id": 13, "nombre": "Hotel Los Pinos" }`) es ilustrativo. Con este orden, Hotel Los Pinos es el id 15 y pertenece a Iván, por lo que no aparece en disponibles.

### Oportunidades (11) y líneas (13)

Productos: 1 Plan básico, 2 Plan avanzado, 3 Instalación, 4 Soporte anual, 5 Licencia anterior. «L1» es el id de la línea; el formato es `producto_id × cantidad @ precio_unitario`.

| id | titulo | cliente_id | vendedor_id | etapa | fecha_cierre | motivo_perdida | Líneas |
|---:|---|---:|---:|---|---|---|---|
| 1 | Renovación de planes | 1 | 4 | ganada | 2026-10-05 16:00 | — | L1: 2 × 2 @ 2600.00; L2: 3 × 1 @ 450.00 |
| 2 | Equipo para sucursal | 2 | 4 | ganada | 2026-11-01 03:30 | — | L3: 1 × 3 @ 1200.00 |
| 3 | Soporte del hogar | 3 | 4 | ganada | 2026-11-01 06:30 | — | L4: 4 × 1 @ 3600.00 |
| 4 | Ampliación a bodega | 1 | 4 | negociacion | — | — | L5: 2 × 1 @ 2750.50 |
| 5 | Capacitación de personal | 2 | 4 | propuesta | — | — | L6: 3 × 2 @ 450.00 |
| 6 | Plan familiar | 3 | 4 | perdida | 2026-10-20 18:00 | Eligió a la competencia | L7: 1 × 1 @ 1200.00; L8: 5 × 1 @ 999.99 |
| 7 | Seguimiento anual | 1 | 4 | prospecto | — | — | sin líneas |
| 8 | Licencias de caja | 4 | 5 | ganada | 2026-10-10 15:00 | — | L9: 1 × 2 @ 1200.00; L10: 4 × 1 @ 3600.00 |
| 9 | Mantenimiento | 5 | 5 | calificado | — | — | L11: 3 × 1 @ 450.00 |
| 10 | Plan anual | 6 | 6 | ganada | 2026-10-15 20:00 | — | L12: 4 × 2 @ 3600.00 |
| 11 | Cotización de equipo | 8 | 6 | negociacion | — | — | L13: 2 × 2 @ 2750.50 |

«Renovación de planes» guarda el Plan avanzado a Q2,600.00, el precio al que se cotizó, no el actual del catálogo.

### Historial de etapas (43)

Un registro por cada etapa recorrida, hecho por el vendedor de la oportunidad: el de creación (`NULL → prospecto`) y uno por cada avance hasta la etapa actual. Las ganadas recorren prospecto → calificado → propuesta → negociacion → ganada; «Plan familiar» se perdió desde propuesta. Hay tres días entre registros; el último coincide con `fecha_cierre` o, si la oportunidad sigue abierta, es `2026-10-02 16:00` (sugerencia del enunciado).

| Oportunidad | Registros | Fechas (UTC, 2026) en orden |
|---:|---:|---|
| 1 | 5 | 09-23 16:00 · 09-26 · 09-29 · 10-02 · 10-05 16:00 (ganada) |
| 2 | 5 | 10-20 03:30 · 10-23 · 10-26 · 10-29 · 11-01 03:30 (ganada) |
| 3 | 5 | 10-20 06:30 · 10-23 · 10-26 · 10-29 · 11-01 06:30 (ganada) |
| 4 | 4 | 09-23 16:00 · 09-26 · 09-29 · 10-02 16:00 (negociacion) |
| 5 | 3 | 09-26 16:00 · 09-29 · 10-02 16:00 (propuesta) |
| 6 | 4 | 10-11 18:00 · 10-14 · 10-17 (propuesta) · 10-20 18:00 (perdida) |
| 7 | 1 | 10-02 16:00 (prospecto) |
| 8 | 5 | 09-28 15:00 · 10-01 · 10-04 · 10-07 · 10-10 15:00 (ganada) |
| 9 | 2 | 09-29 16:00 · 10-02 16:00 (calificado) |
| 10 | 5 | 10-03 20:00 · 10-06 · 10-09 · 10-12 · 10-15 20:00 (ganada) |
| 11 | 4 | 09-23 16:00 · 09-26 · 09-29 · 10-02 16:00 (negociacion) |

Las fechas sin hora conservan la hora del primer registro de su fila. Total: 5 × 5 + 4 + 3 + 4 + 1 + 2 + 4 = 43.

### Actividades (4)

| id | cliente_id | vendedor_id | tipo | descripcion | vence_en | completada |
|---:|---:|---:|---|---|---|---|
| 1 | 1 | 4 | llamada | Confirmar fecha de instalación | 2026-10-08 15:00 | sí |
| 2 | 2 | 4 | tarea | Enviar propuesta de capacitación | 2030-01-15 15:00 | no |
| 3 | 3 | 4 | reunion | Presentar opciones de soporte | 2026-09-01 15:00 | no |
| 4 | 4 | 5 | llamada | Renovación de licencias | 2030-02-01 15:00 | no |

## 7. Criterios de aceptación

### A1-01 — Migración de users sin editar la original

**Dado** el repositorio, **cuando** se revisa `git diff spec-v1 -- laravel/database/migrations/0001_01_01_000000_create_users_table.php`, **entonces** no hay cambios, y una migración nueva agrega `rol` (por defecto `vendedor`), `supervisor_id` (NULL, FK a users) y `activo` (por defecto verdadero), conservando `name`, `email` y `password`.

### A1-02 — Esquema completo desde cero

**Dada** una base vacía, **cuando** se ejecuta `php artisan migrate:fresh --seeder=VerificacionSeeder`, **entonces** termina sin errores ni pasos manuales y existen las 6 tablas con las columnas y tipos de la sección 5.

### A1-03 — Llaves foráneas y cascadas

**Dado** el esquema, **cuando** se consulta `information_schema.REFERENTIAL_CONSTRAINTS`, **entonces** `oportunidad_productos.oportunidad_id`, `historial_etapas.oportunidad_id` y `actividades.cliente_id` son `ON DELETE CASCADE` y las demás FKs son RESTRICT.

### A1-04 — Borrado en cascada

**Dada** una oportunidad con líneas e historial, **cuando** se borra, **entonces** desaparecen sus líneas y su historial.

**Dado** un cliente sin oportunidades y con actividades, **cuando** se borra, **entonces** desaparecen sus actividades.

**Dado** un cliente con oportunidades, **cuando** se intenta borrar, **entonces** MySQL lo rechaza (errno 1451).

### A1-05 — Índices únicos

**Dado** el esquema, **cuando** se inserta un producto con nombre repetido, un cliente con NIT o teléfono repetido, o la misma pareja (oportunidad, producto) dos veces, **entonces** MySQL responde errno 1062.

Dos clientes con `nit = NULL` se aceptan.

### A1-06 — Restricciones CHECK

**Dado** el esquema, **cuando** se inserta directamente en MySQL:

- un producto con precio 0;
- una línea con cantidad 0 o 1000, o con precio 0;
- un teléfono `12345678` o `5555123`;
- una etapa `cancelado`, un rol o un tipo inexistente;
- una oportunidad `perdida` sin motivo, una abierta con motivo o con `fecha_cierre`, o una `ganada` sin `fecha_cierre`;

**entonces** MySQL la rechaza con errno 3819 (L1-03).

### A1-07 — Stock

**Dado** el esquema, **cuando** se guarda `stock = NULL` o `stock = 0`, **entonces** se acepta; **cuando** se guarda `stock = -1`, **entonces** MySQL responde errno 3819.

`stock` llega en una migración propia, posterior a `create_productos`.

### A1-08 — Cuentas de la semilla

**Dada** la base recién sembrada, **cuando** se consulta `users`, **entonces** hay exactamente las 7 cuentas de la sección 6 con sus id, roles, supervisores y estado (Iván inactivo).

Ningún `password` está en texto plano: cada hash empieza con `$2y$` y `bcryptjs.compareSync('Ventas2026', hash)` es verdadero.

### A1-09 — Productos de la semilla

**Dada** la base recién sembrada, **cuando** se consulta `productos`, **entonces** hay 5, con los precios exactos, «Licencia anterior» inactivo y `stock` NULL en todos (RP-06).

### A1-10 — Clientes de la semilla

**Dada** la base recién sembrada, **cuando** se agrupan los clientes por vendedor, **entonces** hay 21: Valeria 3, Diego 2, Carlos 9, Iván 1 y 6 con `vendedor_id` NULL.

Los CF tienen `nit` NULL y todos los NIT pasan `normalizarNit` de la API sin cambiar.

### A1-11 — Oportunidades y líneas

**Dada** la base recién sembrada, **cuando** se consultan, **entonces** hay 11 oportunidades y 13 líneas como en la sección 6; «Renovación de planes» guarda el Plan avanzado a 2600.00 (no 2750.50) y «Plan familiar» tiene el motivo «Eligió a la competencia».

### A1-12 — Historial

**Dada** la base recién sembrada, **cuando** se consulta `historial_etapas`, **entonces** hay 43 registros; cada oportunidad tiene uno `NULL → prospecto`, su último registro llega a su etapa actual, el usuario es su vendedor y, en las cerradas, el último `created_at` es igual a `fecha_cierre`.

### A1-13 — Actividades

**Dada** la base recién sembrada, **cuando** se consulta `actividades`, **entonces** hay 4 como en la sección 6 y solo la primera está completada.

### A1-14 — Cifras de control

**Dada** la base cargada solo con `VerificacionSeeder`, **cuando** se calculan en SQL con el mes en hora de Guatemala por rango UTC `[AAAA-MM-01 06:00, mes siguiente-01 06:00)`, **entonces** se obtienen exactamente las cifras de §13.3:

| Ámbito | Mes | Ventas | Total | Pronóstico | Cartera |
|---|---|---:|---:|---:|---|
| Valeria | octubre 2026 | 2 | 9250.00 | 2512.88 | 3 de 10 |
| Valeria | noviembre 2026 | 1 | 3600.00 | 2512.88 | 3 de 10 |
| Diego | octubre 2026 | 1 | 6000.00 | 112.50 | 2 de 10 |
| Carlos | octubre 2026 | 1 | 7200.00 | 4125.75 | 9 de 10 |
| Equipo de Sergio | octubre 2026 | 3 | 15250.00 | 2625.38 | — |
| Equipo de Sandra | octubre 2026 | 1 | 7200.00 | 4125.75 | — |
| Empresa | octubre 2026 | 4 | 22450.00 | 6751.13 | — |

Por producto, en octubre de 2026:

| Producto | Unidades | Total |
|---|---:|---:|
| Plan básico | 5 | 6000.00 |
| Plan avanzado | 2 | 5200.00 |
| Instalación | 1 | 450.00 |
| Soporte anual | 3 | 10800.00 |

Si Valeria da 5650.00 en octubre, se agrupó en UTC; si da 9551.00, se usó el precio del catálogo en lugar del guardado en la línea.

### A1-15 — Repetible

**Dada** una base ya sembrada, **cuando** se vuelve a ejecutar `php artisan migrate:fresh --seeder=VerificacionSeeder`, **entonces** el resultado es idéntico (mismos id y cifras).

## 8. Archivos previstos

- `laravel/database/migrations/2026_11_08_00000{1..8}_*.php` (las 8 migraciones de la sección 5).
- `laravel/database/seeders/VerificacionSeeder.php`.
- `laravel/database/seeders/DatabaseSeeder.php` (llama a `VerificacionSeeder` y luego a `SectorSeeder`).
- `laravel/database/seeders/SectorSeeder.php` (vacío; se llena en su fase).
- `laravel/app/Models/`: `User.php` (se amplía), `Producto.php`, `Cliente.php`, `Oportunidad.php`, `OportunidadProducto.php`, `HistorialEtapa.php` y `Actividad.php`.

No crear archivos adicionales que no sean necesarios.

## 9. Estrategia de pruebas

En una base local de pruebas cuya información pueda eliminarse:

- `php artisan migrate:fresh --seeder=VerificacionSeeder` dos veces (A1-02, A1-15).
- Consultas a `information_schema` (columnas, FKs, índices y CHECK) para A1-01 a A1-03.
- Inserciones inválidas directas en MySQL dentro de una transacción con ROLLBACK, anotando el errno (A1-04 a A1-07).
- Conteos y consultas de la semilla (A1-08 a A1-13); verificación de hashes con `bcryptjs` desde `api/`.
- Consultas SQL de las cifras de control (A1-14); las pruebas `api/test/integracion-b*.test.js` dejan de omitirse en I1.
- Los resultados reales se registran en `docs/verificacion.md`.

## 10. Condiciones de finalización

A1 se considerará terminada cuando:

- El esquema y la semilla cumplan los criterios A1-01 a A1-15.
- Las pruebas correspondientes se ejecuten satisfactoriamente y sus resultados reales queden registrados.
- La migración original de `users` no haya cambiado.
- No se hayan modificado archivos de la Parte B (`api/`, `frontend/`).
- Cada tarea tenga su commit, con Conventional Commits en español.
