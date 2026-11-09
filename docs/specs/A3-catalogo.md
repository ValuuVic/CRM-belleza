# A3 — Catálogo de productos

**Proyecto:** CRM Belleza  
**Responsable:** Parte A  
**Rama:** `a/catalogo`  
**Estado:** Aprobada (decisiones DA3-1 a DA3-5, P1 y P2)  
**Referencia:** `docs/especificacion.md` (`spec-v1`) §3.1, §3.2, §4.2, §4.5, §4.9, R6, L3, L7, §10 (RP), §13; `docs/plan.md` A3  
**Dependencias:** A1 (tabla `productos` con `stock`, `VerificacionSeeder`), A2 (middlewares `cuenta.vigente` y `rol`, base `crm_belleza_test`).

## 1. Objetivo

Dar al administrador la gestión del catálogo (listar, crear, editar, desactivar y reactivar productos, y administrar su stock) sin borrado, con las mismas reglas que la base de datos (§4.9) y sin alterar los precios guardados en las oportunidades ni las cifras de control.

## 2. Alcance

### Funcionalidades incluidas

- Lista de productos activos e inactivos, con precio en quetzales y stock que distingue «Sin control» de «0 existencias»; el supervisor la ve en solo lectura (P1).
- Control de concurrencia optimista del stock con `stock_original` (P2).
- Crear y editar productos con FormRequest y mensajes en español, tratando de usted.
- Desactivar y reactivar productos desde el formulario de edición (campo `activo`), sin ruta de borrado.
- Administrar el stock: vacío = NULL (sin control) o entero ≥ 0.
- Traducir el error 1062 del índice único a un error en el campo `nombre`.
- Pruebas de cada criterio.

### Fuera del alcance

- Cambios en `api/` o `frontend/`: `GET /api/productos` ya oculta los inactivos y el descuento de stock al ganar es de la Parte B (B4).
- Qué pasa al ganar una oportunidad que tiene líneas de un producto ya desactivado (comportamiento de la API, B4).
- Reportes del panel (A5) y `GET /api/reportes/resumen` (A6).
- Cambios de esquema: A3 usa las columnas de A1 sin migraciones nuevas.
- Datos del sector en `SectorSeeder`.

## 3. Restricciones técnicas

- Eloquent o constructor de consultas; nunca `DB::raw` con datos del usuario.
- Validación en FormRequest con `messages()` y `attributes()` en español, tratando de usted; al fallar se vuelve al formulario con `old()`.
- Solo `validated()` llega al modelo; campos como `id`, `created_at` o `precio_unitario` se ignoran.
- Blade con `{{ }}`; nunca `{!! !!}` con datos del usuario.
- El panel nunca escribe en `oportunidad_productos`.
- El índice único es el árbitro final de los nombres: una `QueryException` con código 1062 vuelve al formulario con el error en `nombre`, nunca un 500.
- Las pruebas corren contra `crm_belleza_test` con `VerificacionSeeder`; `crm_belleza` no cambia.

## 4. Decisiones de esta fase

| Id | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| DA3-1 | Desactivar y reactivar se hace con el campo `activo` del formulario de edición (`PUT /productos/{producto}`) | Rutas propias `/desactivar` y `/activar` | Mismo patrón que A2 (`cuentas.update` incluye `activo`) |
| DA3-2 | El nombre se compara como lo hace el índice (`utf8mb4_unicode_ci`): sin distinguir mayúsculas, acentos ni espacios finales; los espacios de los extremos se recortan | Comparación exacta en PHP | La regla del FormRequest y el índice deciden lo mismo; si no, «Plan basico» pasaría la validación y fallaría en la base |
| DA3-3 | Precio: numérico, `> 0`, como máximo 2 decimales y `≤ 99 999 999.99` (límite de DECIMAL(10,2)); se guarda con 2 decimales («2750.5» → 2750.50) | Aceptar más decimales y redondear | L3: «como máximo dos decimales»; redondear en silencio cambia el monto |
| DA3-4 | Stock: vacío → NULL; si no, entero entre 0 y 2 147 483 647 (INT) | Vacío = 0 | §4.2: NULL significa sin control; 0 significa sin existencias |
| DA3-5 | Un producto inexistente responde 404 y una ruta de borrado, 405 | — | Igual que A2-22 y A2-24 |

## 5. Rutas

| Método | Ruta | Nombre | Middleware | Acción |
|---|---|---|---|---|
| GET | `/productos` | `productos.index` | `auth`, `cuenta.vigente`, `rol:administrador,supervisor` (P1) | Lista; el supervisor, en solo lectura |
| GET | `/productos/crear` | `productos.create` | `auth`, `cuenta.vigente`, `rol:administrador` | Formulario |
| POST | `/productos` | `productos.store` | ídem | Crear |
| GET | `/productos/{producto}/editar` | `productos.edit` | ídem | Formulario |
| PUT | `/productos/{producto}` | `productos.update` | ídem | Guardar (incluye `activo` y `stock`) |
| DELETE | `/productos/{producto}` | — | — | No existe: 405 |

## 6. Reglas del formulario de productos

| Campo | Regla | Mensaje de error (ejemplo) |
|---|---|---|
| nombre | Obligatorio, texto, máx. 120, único en `productos` sin distinguir mayúsculas ni acentos (DA3-2); al editar ignora el propio producto | «Escriba el nombre del producto.» / «El nombre no debe superar los 120 caracteres.» / «Ya existe un producto con ese nombre.» |
| precio | Obligatorio, numérico, mayor que 0, máx. 2 decimales, ≤ 99 999 999.99 (DA3-3) | «Escriba el precio del producto.» / «El precio debe ser mayor que cero.» / «El precio admite como máximo dos decimales.» / «El precio no puede superar Q99,999,999.99.» |
| stock | Opcional; vacío = NULL (sin control); si se escribe, entero ≥ 0 y ≤ 2 147 483 647 (DA3-4) | «Las existencias deben ser un número entero mayor o igual a cero. Déjelo vacío si no controla inventario.» |
| activo | Booleano; por omisión, activo al crear | — |
| stock_original | Solo al editar; campo oculto con el stock que mostró el formulario (vacío = NULL). Al guardar, dentro de `DB::transaction` y con el producto bloqueado con `lockForUpdate()`, si el stock actual no es igual a `stock_original` (NULL solo es igual a NULL) se rechaza y no se guarda nada (P2). No se guarda en la base | «El stock cambió mientras usted editaba (ahora hay 7). Revise y guarde de nuevo.» |

## 7. Criterios de aceptación

Productos de `VerificacionSeeder`: 1 Plan básico (Q1,200.00), 2 Plan avanzado (Q2,750.50), 3 Instalación (Q450.00), 4 Soporte anual (Q3,600.00) y 5 Licencia anterior (Q999.99, inactivo); todos con stock NULL. Cuentas: Alicia Morales (administradora), Sergio Ruiz (supervisor) y Valeria López (vendedora).

### Acceso

#### A3-01 — Catálogo administrado solo por el administrador (§3.1, §3.2)

**Dada** Alicia con sesión abierta, **cuando** abre el menú, **entonces** ve «Productos», entra a `/productos` y ve los botones de crear y editar; **dado** alguien sin sesión, **cuando** pide cualquier ruta `/productos…`, **entonces** se le envía a `/login`.

#### A3-24 — Supervisor en solo lectura (P1)

**Dado** Sergio con sesión abierta, **cuando** abre «Productos», **entonces** ve la misma lista que A3-02 sin botones de crear ni editar; **cuando** pide `/productos/crear`, `/productos/2/editar`, `POST /productos` o `PUT /productos/2` (o los escribe a mano), **entonces** recibe 403 y el producto no cambia.

### Lista

#### A3-02 — Lista completa

**Dada** Alicia, **cuando** abre `/productos`, **entonces** ve los 5 productos, incluido «Licencia anterior» marcado como inactivo, con el precio en formato `Q2,750.50` y el stock de los cinco como «Sin control».

#### A3-03 — «Sin control» frente a «0 existencias»

**Dados** un producto con stock NULL y otro con stock 0, **cuando** Alicia abre la lista o el formulario de edición, **entonces** el primero se muestra como «Sin control» (campo vacío en el formulario) y el segundo como «0 existencias» (campo con 0); nunca se muestran iguales.

### Crear y editar

#### A3-04 — Crear sin control de inventario

**Dada** Alicia, **cuando** crea «Base líquida mate» a Q185.00 con el stock vacío, **entonces** se guarda activo, con `precio = 185.00` y `stock` NULL.

#### A3-05 — Crear con inventario

**Dada** Alicia, **cuando** crea un producto con stock 0 y otro con stock 25, **entonces** se guardan con `stock = 0` y `stock = 25`, respectivamente (no NULL).

#### A3-06 — Editar el stock

**Dado** un producto con stock NULL, **cuando** Alicia escribe 10 y guarda, **entonces** `stock = 10`; **cuando** después vacía el campo y guarda, **entonces** vuelve a NULL (deja de controlar inventario).

#### A3-07 — Nombre obligatorio y largo máximo

**Dado** el formulario, **cuando** se envía sin nombre, con solo espacios o con 121 caracteres, **entonces** vuelve con el mensaje junto a `nombre` y no se guarda nada; con 120 caracteres se acepta.

#### A3-08 — Nombre repetido

**Dada** Alicia, **cuando** crea «Plan avanzado», «PLAN AVANZADO», «plan avanzado » o «Plan básico» escrito como «Plan basico», o edita «Instalación» para llamarlo «plan avanzado», **entonces** el formulario vuelve con «Ya existe un producto con ese nombre.» y no se crea ni cambia nada; editar «Plan avanzado» conservando su propio nombre sí se acepta (DA3-2).

#### A3-09 — El índice único decide el duplicado

**Dado** un nombre que pasa la validación, **cuando** otro producto con el mismo nombre se inserta antes del guardado (carrera entre dos administradores) y MySQL responde 1062, **entonces** el formulario vuelve con «Ya existe un producto con ese nombre.» junto a `nombre`, conserva lo escrito y no responde 500; queda un solo producto con ese nombre.

#### A3-10 — Precio inválido (L3-02)

**Dado** el formulario, **cuando** se envía el precio vacío, 0, -5, 10.999, «abc» o 100000000.00, **entonces** vuelve con el mensaje correspondiente junto a `precio` y no se guarda nada.

#### A3-11 — Precio válido en los límites

**Dado** el formulario, **cuando** se envía 0.01, 99999999.99 o 2750.5, **entonces** se acepta y se guarda como 0.01, 99999999.99 y 2750.50.

#### A3-12 — Stock inválido

**Dado** el formulario, **cuando** se envía el stock -1, 2.5, «abc» o 2147483648, **entonces** vuelve con el mensaje junto a `stock` y el producto no cambia; la base nunca recibe un stock negativo.

#### A3-13 — Mensajes y datos conservados (L7)

**Dado** cualquier rechazo de A3-07 a A3-12, **cuando** vuelve el formulario, **entonces** los mensajes están en español, tratan de usted, aparecen junto a cada campo, y el nombre, el precio, el stock y el estado escritos se conservan.

#### A3-14 — Campos fuera del formulario

**Dado** un `POST` o `PUT` que además incluye `id`, `created_at` o `precio_unitario`, **cuando** se procesa, **entonces** esos campos se ignoran y solo cambian `nombre`, `precio`, `activo` y `stock`.

#### A3-15 — Producto inexistente

**Dada** Alicia, **cuando** pide `/productos/999/editar` o envía `PUT /productos/999`, **entonces** recibe 404.

#### A3-16 — Texto escapado

**Dado** un producto llamado `<b>Rubor</b>`, **cuando** Alicia abre la lista, **entonces** el nombre se muestra como texto literal, sin interpretarse como HTML.

### Desactivar y borrar

#### A3-17 — Desactivar (L3-01)

**Dada** Alicia, **cuando** desactiva «Instalación», **entonces** `activo` queda falso, el producto sigue existiendo y `GET /api/productos`, con el token de Valeria, ya no lo incluye; las líneas que ya lo tenían (líneas 2, 6 y 11) conservan su producto, su cantidad y su precio.

#### A3-18 — Reactivar

**Dado** «Licencia anterior» (inactivo), **cuando** Alicia lo reactiva, **entonces** `activo` queda verdadero y aparece en `GET /api/productos` con `precio` 999.99 y `stock` null.

#### A3-19 — Sin borrado

**Dado** cualquier producto, **cuando** se envía `DELETE /productos/{id}`, **entonces** responde 405, el producto sigue existiendo y la lista no muestra ninguna acción de borrar.

### Precio histórico

#### A3-20 — Cambiar el precio no altera las líneas (L3-03, R6)

**Dada** la semilla, **cuando** Alicia cambia «Plan avanzado» de Q2,750.50 a Q3,000.00, **entonces** `productos.precio = 3000.00`; la línea 1 de «Renovación de planes» sigue en `precio_unitario = 2600.00` (y así la devuelve `GET /api/oportunidades/1` a Valeria), las líneas 5 y 13 siguen en 2750.50 y ninguna fila de `oportunidad_productos` cambia; una línea nueva que se agregue después desde la API copia 3000.00.

#### A3-21 — Las cifras de control se conservan (CA-09, §13.3)

**Dado** el cambio de A3-20, **cuando** se calculan las cifras de Valeria para octubre de 2026 (rango UTC de octubre en `America/Guatemala`), **entonces** siguen siendo 2 ventas, Q9,250.00 de total y Q2,512.88 de pronóstico. Mientras A5 y A6 no existan, se comprueba con la suma de `cantidad × precio_unitario` de sus líneas; al implementar A5 y A6 se repite con el reporte del panel y con `GET /api/reportes/resumen`.

### Concurrencia de stock

#### A3-22 — El panel no pisa un descuento de la API (P2)

**Dado** «Plan avanzado» con stock 10, **cuando** Alicia abre el formulario (`stock_original = 10`), Valeria gana en la SPA una oportunidad que descuenta 3 (la base queda en 7) y Alicia guarda el 10 que ve en pantalla, **entonces** el formulario vuelve con «El stock cambió mientras usted editaba (ahora hay 7). Revise y guarde de nuevo.» junto a `stock`, conserva lo escrito y el producto no cambia: el stock sigue en 7 y tampoco se guardan el nombre, el precio ni el estado.

#### A3-25 — Guardado sin conflicto (P2)

**Dado** un producto cuyo stock no cambió desde que se abrió el formulario (10 y 10, o NULL y NULL), **cuando** Alicia guarda, **entonces** se aplican los cambios; **dado** que `stock_original` falta o no coincide con el stock actual (por ejemplo, NULL frente a 7), **entonces** se rechaza como en A3-22.

#### A3-26 — Bloqueo durante el guardado (P2, S8)

**Dado** el guardado de un producto, **cuando** se ejecuta, **entonces** la comparación con `stock_original` y el `UPDATE` ocurren en la misma `DB::transaction`, con el producto bloqueado con `lockForUpdate()`; un descuento de la API (que bloquea la fila con `FOR UPDATE`) espera a que termine o se aplica antes, y nunca entre la comparación y el guardado.

### Pruebas

#### A3-23 — Suite y semilla intactas

**Dado** `php artisan test`, **cuando** se ejecuta, **entonces** la suite completa (A1, A2 y A3) pasa contra `crm_belleza_test`, y `VerificacionSeeder` y `crm_belleza` no cambian.

## 8. Decisiones sobre las preguntas abiertas

Aprobadas por la Parte A el 2026-11-08, junto con DA3-1 a DA3-5.

| Id | Pregunta | Decisión | Alternativa descartada | Criterio |
|---|---|---|---|---|
| P1 | ¿El supervisor puede **ver** el catálogo, sin editarlo? | Sí, en solo lectura: `GET /productos` admite administrador y supervisor; crear, editar y guardar siguen solo para el administrador (403 para el supervisor). §3.2 solo prohíbe administrarlo, y le sirve para revisar las oportunidades de su equipo | 403 en todo `/productos…` | A3-01, A3-24 |
| P2 | ¿Cómo se evita que el administrador pise un stock que la API acaba de descontar? | Control de concurrencia optimista: el formulario manda oculto `stock_original` con el valor que mostró; al guardar, dentro de `DB::transaction` y con `lockForUpdate()` sobre el producto, si el stock actual ya no es igual a `stock_original` se rechaza con «El stock cambió mientras usted editaba (ahora hay 7). Revise y guarde de nuevo.» No toca el esquema | Guardar ajustes (+5/−2) en lugar de un valor absoluto: cambia más la interfaz | A3-22, A3-25, A3-26 |

## 9. Archivos previstos

- Editar: `routes/web.php`, `resources/views/layouts/navigation.blade.php` (menú «Productos»), `app/Models/Producto.php` (solo si hace falta).
- Crear: `app/Http/Controllers/ProductoController.php`, `app/Http/Requests/ProductoStoreRequest.php`, `app/Http/Requests/ProductoUpdateRequest.php`, `resources/views/productos/{index,create,edit,_form}.blade.php`, `tests/Feature/A3CatalogoTest.php`.

No crear archivos adicionales que no sean necesarios ni migraciones nuevas.

## 10. Estrategia de pruebas

- Pruebas Feature de Laravel por criterio, con `VerificacionSeeder` en `crm_belleza_test`.
- Acceso por rol, supervisor en solo lectura y rutas que no existen (A3-01, A3-15, A3-19, A3-24).
- Formularios válidos e inválidos con datos conservados (A3-04 a A3-14).
- A3-09: forzar el 1062 insertando el duplicado justo antes del guardado (por ejemplo, con un evento `creating` del modelo registrado en la prueba).
- Precio histórico y cifras (A3-20, A3-21): comparar `oportunidad_productos` antes y después, y calcular las cifras de Valeria con el rango UTC de octubre en Guatemala.
- Integración con la API (A3-17, A3-18, A3-20): `GET /api/productos` y `GET /api/oportunidades/1` con el token de Valeria, contra la base de pruebas.
- Concurrencia de stock (A3-22, A3-25): abrir el formulario, cambiar el stock en la base entre la lectura y el guardado (como lo haría la API) y comprobar el rechazo y que nada cambió; repetir sin cambio y con NULL.
- Bloqueo (A3-26): con una segunda conexión que tiene la fila bloqueada con `FOR UPDATE`, comprobar que el guardado del panel espera y después compara contra el stock ya descontado.
- Resultados reales en `docs/verificacion.md`.

## 11. Condiciones de finalización

A3 se considerará terminada cuando:

- El panel cumpla los criterios A3-01 a A3-26.
- La suite de Laravel se ejecute completa, sin errores, y sus resultados queden registrados.
- No se hayan modificado archivos de la Parte B (`api/`, `frontend/`).
- Cada tarea tenga su commit, con Conventional Commits en español.
