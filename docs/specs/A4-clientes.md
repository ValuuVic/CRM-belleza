# A4 — Clientes y asignaciones

**Proyecto:** CRM Belleza  
**Responsable:** Parte A  
**Rama:** `a/clientes`  
**Estado:** Aprobada por la Parte A (decisiones DA4-1 a DA4-9, P1 a P4); D2–D4 pendientes de confirmación de la Parte B en `docs/especificacion.md` (P1)  
**Referencia:** `docs/especificacion.md` (`spec-v1`) §3.1, §3.2, §4.3, §4.8, §4.9, R2, R3, R4, L4, L5, L7, S5, S7, S8, D2, D3, D4, D16, D17; `docs/plan.md` A4  
**Dependencias:** A1 (tablas y semillas), A2 (middlewares `cuenta.vigente` y `rol`, base `crm_belleza_test`). Reglas de la API (solo lectura): `api/src/utils/validaciones.js`, `api/src/servicios/vendedores.js`, `api/src/rutas/clientes.js`.

## 1. Objetivo

Dar al administrador y al supervisor la gestión de clientes que les corresponde: lista con búsqueda y filtros, alta, edición, asignación, reasignación y liberación, y eliminación solo para el administrador. Se aplican las mismas reglas de NIT, teléfono, duplicados y cartera que la API, con el mismo orden de bloqueos (D17), para que el panel y la API puedan escribir a la vez sin romperlas.

## 2. Alcance

### Funcionalidades incluidas

- Visibilidad por rol: el administrador ve todos los clientes; el supervisor, los de los vendedores de su equipo (activos o no) y los disponibles. Un cliente ajeno responde 404.
- Lista con búsqueda por nombre o NIT y filtro por vendedor o «Sin asignar»; muestra la cartera «n de 10» y «vendedor inactivo».
- Alta y edición con `App\Support\Nit` y `App\Support\Telefono`, traducción literal de `normalizarNit` y `normalizarTelefono`.
- Asignar un cliente disponible, reasignar y liberar, con la cartera máxima de 10 y las decisiones D2, D3 y D4.
- Eliminar (solo el administrador) un cliente sin oportunidades; sus actividades se borran en cascada.
- Traducir 1062 (NIT o teléfono repetido) y 1451 (cliente con oportunidades) a mensajes en el formulario, nunca 500.
- Pruebas de cada criterio.

### Fuera del alcance

- Página del equipo del supervisor con cartera y ventas del mes (L5-03), oportunidades y reportes del panel (A5).
- Cambios en `api/` o `frontend/`.
- Cambios de esquema: A4 usa las columnas de A1 sin migraciones nuevas.
- Reasignación automática de los clientes de un vendedor desactivado (D4: se reasignan a mano).

## 3. Restricciones técnicas

- Eloquent o constructor de consultas; nunca `DB::raw` con datos del usuario. La búsqueda escapa `%`, `_` y `\` antes de usar `LIKE`.
- Validación en FormRequest con mensajes en español, tratando de usted; al fallar se vuelve al formulario con `old()`.
- Solo `validated()` llega al modelo: `vendedor_id` nunca se acepta desde el formulario de datos del cliente, solo desde el de asignación (DA4-2).
- Blade con `{{ }}`; nunca `{!! !!}` con datos del usuario (S7).
- **Orden de bloqueos (D17, DA4-6).** Toda escritura ocurre dentro de `DB::transaction`, y su **primera lectura** es el bloqueo de las filas de vendedor (`users`) por id ascendente. Después se bloquea el cliente y, por último, sus oportunidades abiertas. La cartera se cuenta con la fila del vendedor ya bloqueada.
- La visibilidad del supervisor se vuelve a comprobar con el cliente ya bloqueado: si mientras tanto pasó a otro equipo, responde 404.
- Los índices únicos son el árbitro final de NIT y teléfono: una `QueryException` 1062 vuelve con el error en el campo correspondiente (según el índice `clientes_nit_unique` o `clientes_telefono_unique`).
- Las pruebas corren contra `crm_belleza_test` con `VerificacionSeeder`; las que usan el equipo de Lucía cargan además `SectorSeeder` en la propia prueba.

## 4. Decisiones de esta fase

| Id | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| DA4-1 | El alcance del supervisor es `clientes.vendedor_id IS NULL` o el vendedor tiene `supervisor_id` = el supervisor, sin importar si está activo. Se aplica en la consulta: fuera de él, la ruta responde 404 (R2, S5) | Política que responde 403 | R2: un registro ajeno responde 404 y no confirma que exista |
| DA4-2 | El formulario de datos (nombre, NIT, teléfono, correo) no cambia el vendedor. La asignación es una acción aparte: asignar o reasignar con `PUT /clientes/{cliente}/asignacion` y liberar con `DELETE /clientes/{cliente}/asignacion` | Elegir el vendedor dentro del formulario de edición | Cada acción tiene sus propias reglas (cartera, D2, D3) y sus propios bloqueos |
| DA4-3 | `App\Support\Nit::normalizar()` y `App\Support\Telefono::normalizar()` devuelven `['valido' => bool, 'nit'/'telefono' => ?string]`, igual que la API, y pasan los mismos casos de `api/test/validaciones.test.js` (B1-06, B1-07). Los mensajes de error son los mismos de `validarCliente` | Reglas propias del panel | L4-02: mismas reglas que la API; un cliente válido en una puerta debe serlo en la otra |
| DA4-4 | Nombre: obligatorio, de 1 a 150 caracteres tras recortar. Correo: opcional, formato básico, hasta 150; vacío = NULL (D16) | — | D16 |
| DA4-5 | Destino de una asignación: cuenta con rol vendedor y activa. Para el supervisor, además, de su equipo | Permitir asignar a un vendedor inactivo | §4.1 y L5-02 |
| DA4-6 | Bloqueos: primero las filas `users` del vendedor anterior y del nuevo, por id ascendente (`whereIn … orderBy('id') … lockForUpdate()`, primera lectura); después el cliente con `lockForUpdate()`; después las oportunidades abiertas del cliente con `lockForUpdate()` | Bloquear en el orden en que se necesita cada fila | D17: el mismo orden que la API evita interbloqueos |
| DA4-7 | El vendedor anterior se lee antes de la transacción. Si con el cliente ya bloqueado su `vendedor_id` resulta distinto, se rechaza con «El cliente cambió mientras usted trabajaba. Recargue la página e inténtelo de nuevo.», sin reintentar | Reintentar solo | Los vendedores a bloquear dependen del dueño actual; si este cambió, lo que la persona vio ya no vale |
| DA4-8 | Búsqueda `q` de hasta 100 caracteres (D16): nombre que contiene `q` (sin distinguir mayúsculas ni acentos, por la colación) o NIT que contiene `q` compactado como en `Nit` (sin espacios ni guiones, en mayúsculas, sin ceros a la izquierda). Filtro `vendedor`: el id de un vendedor visible o `sin_asignar`; un id fuera del alcance da una lista vacía. 25 clientes por página, con los filtros conservados | Paginación del lado del cliente | Hay 33 clientes con las dos semillas y la cifra crece |
| DA4-9 | Se elimina con `DELETE /clientes/{cliente}` (solo el administrador), con confirmación en la interfaz. Con oportunidades, se rechaza; además, el 1451 se traduce al mismo mensaje por si una oportunidad se crea durante el borrado | Solo comprobar con una consulta previa | Una oportunidad creada por la API a la vez haría fallar el `DELETE` con 1451 |

## 5. Rutas

| Método | Ruta | Nombre | Middleware | Acción |
|---|---|---|---|---|
| GET | `/clientes` | `clientes.index` | `auth`, `cuenta.vigente`, `rol:administrador,supervisor` | Lista, búsqueda y filtros |
| GET | `/clientes/crear` | `clientes.create` | ídem | Formulario |
| POST | `/clientes` | `clientes.store` | ídem | Crear (vendedor opcional, P4) |
| GET | `/clientes/{cliente}/editar` | `clientes.edit` | ídem | Datos y asignación |
| PUT | `/clientes/{cliente}` | `clientes.update` | ídem | Guardar datos |
| PUT | `/clientes/{cliente}/asignacion` | `clientes.asignacion.update` | ídem | Asignar o reasignar |
| DELETE | `/clientes/{cliente}/asignacion` | `clientes.asignacion.destroy` | ídem | Liberar |
| DELETE | `/clientes/{cliente}` | `clientes.destroy` | `auth`, `cuenta.vigente`, `rol:administrador` | Eliminar |

Para el supervisor, `{cliente}` se resuelve dentro de su alcance (DA4-1): fuera de él, todas las rutas con `{cliente}` responden 404.

## 6. Reglas de los formularios

| Campo | Regla | Mensaje de error (ejemplo) |
|---|---|---|
| nombre | Obligatorio, 1 a 150 caracteres tras recortar | «Ingrese el nombre del cliente.» / «El nombre no debe superar los 150 caracteres.» |
| nit | Obligatorio; `Nit::normalizar()`; «CF» → NULL; único entre los NIT no nulos | «Ingrese el NIT o CF para consumidor final.» / «El NIT no es válido; revise el número y el dígito verificador, o use CF.» / «Ya existe un cliente con ese NIT.» |
| telefono | Obligatorio; `Telefono::normalizar()`; único | «Ingrese el teléfono del cliente.» / «El teléfono debe tener 8 dígitos y comenzar con un dígito del 2 al 9.» / «Ya existe un cliente con ese teléfono.» |
| correo | Opcional; formato básico; hasta 150; vacío = NULL | «Ingrese un correo electrónico válido o deje el campo vacío.» |
| vendedor_id (asignación y alta, P4) | Vendedor activo; para el supervisor, de su equipo (DA4-5); cartera < 10 | «Elija un vendedor activo.» / «Elija un vendedor activo de su equipo.» / «La cartera de Carlos Ajú está llena (10 de 10). Libere o reasigne uno de sus clientes primero.» |

## 7. Criterios de aceptación

**Semilla `VerificacionSeeder`.**
- Cuentas: Alicia (administradora); Sergio, supervisor de Valeria (clientes 1-3) y Diego (4-5); Sandra, supervisora de Carlos (6-14, 9 de 10) e Iván (15, Hotel Los Pinos, vendedor desactivado).
- Disponibles: clientes 16-21.
- Oportunidades:
  - Cliente 1, Comercial El Quetzal: op. 1 ganada, op. 4 en negociación y op. 7 en prospecto. Actividad 1.
  - Cliente 3, María Coyoy: op. 3 ganada y op. 6 perdida (solo cerradas).
  - Cliente 7, Panadería La Esperanza: sin oportunidades ni actividades.

**Semilla `SectorSeeder`** (se carga en la prueba cuando se indica). Lucía Mendoza es supervisora de Andrea Chávez (5 clientes, entre ellos Salón Belleza Divina) y de Kevin Pac (4 clientes). Hay además 3 disponibles: Boutique Encanto, Karla Sic y Barbería y Salón Los Altos.

### Visibilidad

#### A4-01 — El administrador ve todos

**Dada** Alicia, **cuando** abre `/clientes`, **entonces** ve los 21 clientes de la semilla (33 con `SectorSeeder`), con nombre, NIT («CF» si es NULL), teléfono, correo y vendedor.

#### A4-02 — El supervisor ve su equipo y los disponibles (R2)

**Dado** Sergio, **cuando** abre `/clientes`, **entonces** ve los clientes 1 a 5 y los disponibles 16 a 21 (con `SectorSeeder`, también los 3 disponibles del sector), y ningún cliente de Carlos, Iván, Andrea ni Kevin; **dada** Sandra, **entonces** ve los clientes 6 a 15, incluido Hotel Los Pinos de Iván, y los disponibles.

#### A4-03 — Cliente de otro equipo: 404 (L5-01, S5)

**Dado** Sergio, **cuando** escribe a mano `/clientes/6/editar` (Carlos) o envía `PUT /clientes/6`, `PUT /clientes/6/asignacion` o `DELETE /clientes/6/asignacion`, **entonces** recibe 404 y el cliente no cambia; **con `SectorSeeder`**, **cuando** Sergio pide el cliente Salón Belleza Divina (Andrea) o Lucía pide `/clientes/1/editar`, **entonces** recibe 404.

#### A4-04 — Sin sesión y cliente inexistente

**Dado** alguien sin sesión, **cuando** pide cualquier ruta `/clientes…`, **entonces** se le envía a `/login`; **dada** Alicia, **cuando** pide `/clientes/999/editar`, **entonces** recibe 404.

### Lista, búsqueda y filtros

#### A4-05 — Búsqueda por nombre o NIT (L4-01)

**Dada** Alicia, **cuando** busca «quetzal», **entonces** ve Comercial El Quetzal; **cuando** busca «4521817-k» o «452 1817K», **entonces** ve el mismo cliente; **cuando** busca «%» o «_», **entonces** no recibe todos los clientes (los comodines se escapan); una búsqueda de más de 100 caracteres vuelve con un mensaje.

#### A4-06 — Filtros por vendedor y «Sin asignar» (L4-01)

**Dada** Alicia, **cuando** filtra por Carlos, **entonces** ve sus 9 clientes; **cuando** elige «Sin asignar», **entonces** ve los 6 disponibles; **dado** Sergio, **cuando** el filtro solo le ofrece a Valeria y Diego y escribe a mano `?vendedor=6`, **entonces** la lista sale vacía; la búsqueda y el filtro se combinan y se conservan al cambiar de página.

#### A4-07 — Cartera y vendedor inactivo

**Dada** Alicia, **cuando** abre la lista, **entonces** junto al vendedor ve su cartera («Carlos Ajú · 9 de 10», «Valeria López · 3 de 10») y Hotel Los Pinos aparece con la marca «vendedor inactivo».

### Alta y edición

#### A4-08 — Mismas reglas que la API (L4-02)

**Dada** Alicia, **cuando** crea un cliente con NIT `0-450` y teléfono `+502 4444-1234`, **entonces** se guarda con `nit = 450` y `telefono = 44441234`; con NIT `cf`, **entonces** se guarda NULL y varios clientes CF conviven.

#### A4-09 — Traducción literal de la API

**Dados** `App\Support\Nit` y `App\Support\Telefono`, **cuando** se ejecutan con todos los casos de B1-06 y B1-07 de `api/test/validaciones.test.js` (por ejemplo `4521817K`, `123456789016`, `1234567890120`, `00-1234567890-16`, `450`, `C-F`, `45218170`; `+502 5555 1234`, `50212345`, `+5025555123`), **entonces** devuelven exactamente lo mismo que `normalizarNit` y `normalizarTelefono`.

#### A4-10 — NIT o teléfono inválido

**Dado** el formulario, **cuando** se envía el NIT vacío, `45218170` (verificador incorrecto) o `1234567890120` (13 caracteres), o el teléfono vacío, `15551234` o `5555123`, **entonces** vuelve con el mensaje de la §6 junto al campo y no se guarda nada.

#### A4-11 — NIT o teléfono repetido (R4, L4-02)

**Dada** Alicia, **cuando** crea un cliente con NIT `4521817-k` o teléfono `+502 5555-1234` (los de Comercial El Quetzal), o edita Ferretería Xela con esos valores, **entonces** vuelve con «Ya existe un cliente con ese NIT.» o «…ese teléfono.» y no se crea ni cambia nada; editar Comercial El Quetzal conservando su NIT y teléfono sí se acepta.

#### A4-12 — El índice único decide el duplicado

**Dado** un NIT o un teléfono que pasa la validación, **cuando** otro cliente con el mismo valor se inserta antes del guardado (por ejemplo, desde la API) y MySQL responde 1062, **entonces** el formulario vuelve con el error en el campo que corresponde al índice (`nit` o `telefono`), conserva lo escrito y no responde 500.

#### A4-13 — Nombre y correo (D16)

**Dado** el formulario, **cuando** se envía sin nombre, con solo espacios o con 151 caracteres, o con el correo `no-es-correo` o de 151 caracteres, **entonces** vuelve con el mensaje junto al campo; con 150 caracteres y el correo vacío (NULL), se acepta.

#### A4-14 — El supervisor crea y edita en su alcance

**Dado** Sergio, **cuando** crea un cliente disponible o de Valeria (P4), edita los datos de Comercial El Quetzal o los de Agencia Cuatro Caminos (16, disponible; P2), **entonces** se acepta; **cuando** crea un cliente para Carlos, **entonces** se rechaza con «Elija un vendedor activo de su equipo.».

#### A4-15 — Mensajes, datos conservados y campos fuera del formulario (L7)

**Dado** cualquier rechazo de A4-10 a A4-13, **cuando** vuelve el formulario, **entonces** los mensajes están en español, tratan de usted y se conserva lo escrito; **dado** un `PUT /clientes/1` que incluye `vendedor_id`, `id` o `created_at`, **entonces** esos campos se ignoran y el vendedor no cambia (DA4-2).

#### A4-16 — Texto escapado (S7)

**Dado** un cliente llamado `<script>alert(1)</script>` con correo `<b>x</b>@y.test`, **cuando** se abre la lista o el formulario, **entonces** se muestran como texto literal.

### Asignar, reasignar y liberar

#### A4-17 — Asignar un cliente disponible

**Dada** Alicia, **cuando** asigna Agencia Cuatro Caminos (16) a Valeria, **entonces** `vendedor_id = 4`, la cartera de Valeria pasa a 4 de 10 y `GET /api/clientes` de Valeria lo incluye.

#### A4-18 — Cartera llena (R3, L4-03)

**Dado** Carlos con 9 de 10, **cuando** Alicia le asigna el cliente 16, **entonces** queda en 10 de 10; **cuando** intenta asignarle el 17 o reasignarle el cliente 1, **entonces** se rechaza con el mensaje de cartera llena, Carlos sigue en 10 y el cliente no cambia.

#### A4-19 — Solo vendedores activos; el supervisor solo en su equipo (L5-02)

**Dada** Sandra, **cuando** asigna el cliente 16 a Iván (desactivado), **entonces** se rechaza con «Elija un vendedor activo de su equipo.»; **dado** Sergio, **cuando** asigna el 16 a Carlos o reasigna el cliente 1 a Carlos, **entonces** se rechaza igual; **dada** Alicia, **cuando** asigna a Iván, a una cuenta supervisora o a un id inexistente, **entonces** se rechaza con «Elija un vendedor activo.».

#### A4-20 — Reasignar (D2)

**Dada** Alicia, **cuando** reasigna Comercial El Quetzal (1) de Valeria a Diego, **entonces**:
- El cliente pasa a Diego (3 de 10) y Valeria queda en 2 de 10.
- Las oportunidades abiertas 4 y 7 pasan a `vendedor_id = 5`; la oportunidad ganada 1 conserva `vendedor_id = 4`.
- La actividad 1 conserva `vendedor_id = 4`, y Diego la ve en `GET /api/actividades` porque sigue al cliente.
- Las cifras quedan así: Valeria, octubre de 2026, 2 ventas por Q9,250.00 con pronóstico Q450.00; Diego, 1 venta por Q6,000.00 con pronóstico Q2,175.38. Reasignar al mismo vendedor se rechaza con «El cliente ya está asignado a ese vendedor.».

#### A4-21 — Liberar (D3)

**Dada** Alicia, **cuando** libera Comercial El Quetzal (con las oportunidades abiertas 4 y 7), **entonces** se rechaza con «El cliente tiene oportunidades abiertas. Reasígnelo o cierre sus oportunidades antes de liberarlo.» y nada cambia; **cuando** libera María Coyoy (3, solo cerradas), **entonces** `vendedor_id` queda NULL, Valeria pasa a 2 de 10, las oportunidades 3 y 6 conservan `vendedor_id = 4` y las ventas de Valeria en octubre siguen en 2 por Q9,250.00.

#### A4-22 — Vendedor desactivado (D4)

**Dado** Iván (desactivado) con Hotel Los Pinos, **cuando** Sandra abre la lista, **entonces** lo ve con «vendedor inactivo»; **cuando** lo reasigna a Carlos, **entonces** se acepta (Carlos 10 de 10) y las oportunidades abiertas del cliente, si las hubiera, pasan a Carlos; los clientes de Iván no se mueven solos.

### Eliminar

#### A4-23 — Solo el administrador y sin oportunidades (L4-04)

**Dada** Alicia, **cuando** elimina Panadería La Esperanza (7), **entonces** el cliente desaparece y Carlos pasa a 8 de 10; **cuando** intenta eliminar Comercial El Quetzal (1), **entonces** se rechaza con «No se puede eliminar: el cliente tiene oportunidades registradas.» y nada cambia; **dado** Sergio o Sandra, **cuando** envían `DELETE /clientes/{id}`, **entonces** reciben 403 y la lista no les muestra la acción.

#### A4-24 — Actividades en cascada

**Dado** un cliente sin oportunidades con dos actividades (creadas en la prueba), **cuando** Alicia lo elimina, **entonces** sus actividades también se borran.

#### A4-25 — 1451 sin 500

**Dado** un cliente sin oportunidades al comprobarlo, **cuando** se le crea una oportunidad antes del `DELETE` y MySQL responde 1451, **entonces** se vuelve a la lista con el mensaje de A4-23, sin 500, y el cliente sigue existiendo.

### Concurrencia (S8, D17)

#### A4-26 — Orden de bloqueos

**Dada** una reasignación de Valeria (4) a Diego (5), **cuando** se ejecuta, **entonces** el registro de consultas muestra, dentro de la transacción y como primera lectura, el `SELECT … FROM users … FOR UPDATE` con los ids 4 y 5 ordenados de forma ascendente; después el `SELECT … FROM clientes … FOR UPDATE`, después el `SELECT … FROM oportunidades … FOR UPDATE` y después los `UPDATE`. El conteo de la cartera ocurre después del bloqueo del vendedor; asignar, liberar, crear con vendedor y eliminar siguen el mismo orden con sus filas.

#### A4-27 — El cliente cambió mientras se trabajaba (DA4-7)

**Dada** Alicia con el formulario del cliente 16 abierto (disponible), **cuando** Valeria lo toma con la API y Alicia lo asigna a Diego, **entonces** se rechaza con «El cliente cambió mientras usted trabajaba. Recargue la página e inténtelo de nuevo.» y el cliente sigue siendo de Valeria; lo mismo si se reasigna o libera un cliente cuyo dueño cambió.

#### A4-28 — Cartera bajo concurrencia

**Dado** Carlos con 9 de 10, **cuando** el panel le asigna un cliente mientras la API le crea o le hace tomar otro, **entonces** Carlos termina con 10 como máximo y la operación que llega segunda se rechaza (en el panel, con el mensaje de cartera llena).

#### A4-29 — Suite y semilla intactas

**Dado** `php artisan test`, **cuando** se ejecuta, **entonces** la suite completa (A1 a A4) pasa contra `crm_belleza_test`, y `VerificacionSeeder` y `crm_belleza` no cambian.

## 8. Decisiones sobre las preguntas abiertas

Aprobadas por la Parte A el 2026-11-09, junto con DA4-1 a DA4-9.

| Id | Pregunta | Decisión | Criterio |
|---|---|---|---|
| P1 | ¿Se adoptan D2, D3 y D4 (§14, en estado «Propuesta»)? | Sí, con estos detalles. Al reasignar se mueven solo las oportunidades abiertas; las cerradas conservan su vendedor y las actividades no se tocan, porque siguen al cliente. Liberar con oportunidades abiertas se rechaza. Los clientes de un vendedor desactivado se quedan con él hasta reasignarlos a mano. **Falta la confirmación de la Parte B** para marcar D2–D4 como «Decidida» en `docs/especificacion.md`, con una etiqueta `spec-v1.1` (§16.1) | A4-20, A4-21, A4-22 |
| P2 | ¿El supervisor puede editar los datos de un cliente disponible? | Sí: §3.2 le permite crearlos y asignarlos, y R2 dice que los ve | A4-14 |
| P3 | ¿El supervisor ve el NIT, el teléfono y el correo de los disponibles? | Sí: la restricción de R3 a `id` y `nombre` es solo para la lista de disponibles de la API para vendedores | A4-02 |
| P4 | ¿Al crear un cliente se puede elegir el vendedor? | Sí, es opcional: si se deja vacío, nace disponible. El supervisor solo puede elegir uno de su equipo, y el alta bloquea al vendedor y cuenta su cartera como una asignación | A4-08, A4-14, A4-18 |

## 9. Archivos previstos

- Crear:
  - `app/Support/Nit.php` y `app/Support/Telefono.php`.
  - `app/Http/Controllers/ClienteController.php` y `app/Http/Controllers/AsignacionClienteController.php`.
  - `app/Http/Requests/ClienteStoreRequest.php`, `ClienteUpdateRequest.php` y `AsignacionClienteRequest.php`.
  - `resources/views/clientes/{index,create,edit,_form}.blade.php`.
  - `tests/Unit/NitTest.php`, `tests/Unit/TelefonoTest.php` y `tests/Feature/A4ClientesTest.php`.
- Editar:
  - `routes/web.php`.
  - `resources/views/layouts/navigation.blade.php` (menú «Clientes»).
  - `app/Models/Cliente.php`: un scope de visibilidad, si hace falta.

No crear archivos adicionales que no sean necesarios ni migraciones nuevas.

## 10. Estrategia de pruebas

- **Pruebas unitarias:** `Nit` y `Telefono`, con los casos copiados uno a uno de B1-06 y B1-07 (A4-09).
- **Pruebas Feature por criterio**, con `VerificacionSeeder`; `SectorSeeder` se carga con `$this->seed()` en A4-02 y A4-03.
- **Duplicados por índice (A4-12):** un evento `creating` o `updating` inserta el duplicado justo antes del guardado. **Borrado con 1451 (A4-25):** un evento `deleting` inserta una oportunidad.
- **Cambio entre la lectura y la escritura (A4-27):** se cambia `vendedor_id` con `DB::table` entre el GET del formulario y el envío.
- **Orden de bloqueos (A4-26):** se registra cada consulta con `DB::listen`, igual que A2-28 y A3-26.
- **Cifras (A4-20, A4-21):** con la consulta de A1-14.
- **Integración real de punta a punta** (como en A3): el panel y la API contra `crm_belleza_test`. Cubre la reasignación y la visibilidad de actividades y clientes en la API (A4-17, A4-20), la carrera entre la toma de la API y la asignación del panel (A4-27) y la cartera bajo concurrencia, con peticiones lanzadas a la vez (A4-28).
- **Resultados reales** en `docs/verificacion.md`.

## 11. Condiciones de finalización

A4 se considerará terminada cuando:

- D2–D4 estén confirmadas por la Parte B en `docs/especificacion.md` (P1).
- El panel cumpla los criterios A4-01 a A4-29.
- La suite de Laravel se ejecute completa, sin errores, y sus resultados queden registrados.
- No se hayan modificado archivos de la Parte B (`api/`, `frontend/`).
- Cada tarea tenga su commit, con Conventional Commits en español.
