# B3 — Clientes y cartera

**Proyecto:** CRM Belleza  
**Responsable:** Parte B  
**Rama:** `b/clientes`  
**Especificación general:** `docs/especificacion.md` (`spec-v1`)  
**Requisitos que cubre:** A3, F2, R3, R4, S3, S5 y S8.  
**Dependencias:** B1 y B2. Para las pruebas de integración reales, I1 de la Parte A.

## 1. Objetivo

Implementar la gestión de clientes y cartera de los vendedores mediante la API Express y la SPA.

Cada vendedor debe poder consultar, buscar, registrar, editar y tomar clientes disponibles, respetando un límite máximo de diez clientes asignados.

Todas las operaciones deben respetar la identidad del vendedor autenticado, las validaciones de datos y las reglas de seguridad del CRM.

## 2. Fuera de alcance

- Crear o administrar usuarios y vendedores.
- Liberar o reasignar clientes desde el panel administrativo.
- Administrar supervisores.
- Registrar oportunidades o ventas.
- Gestionar productos y stock.
- Registrar actividades de clientes.
- Implementar reportes.
- Modificar Laravel, migraciones o seeders.
- Cambiar el contrato de autenticación de B2.

La liberación y reasignación administrativa de clientes pertenecen a la Parte A. Las actividades corresponden a B5.

## 3. Contrato de la API

Todas las rutas utilizan el prefijo `/api` y requieren autenticación JWT válida de un vendedor activo.

| Método y ruta | Cuerpo | Éxito | Errores |
|---|---|---|---|
| `GET /api/clientes?q=` | Sin cuerpo | 200, arreglo de clientes propios | 400, 401 |
| `GET /api/clientes/disponibles` | Sin cuerpo | 200, arreglo de `{ id, nombre }` | 401 |
| `GET /api/clientes/:id` | Sin cuerpo | 200, cliente propio | 401, 404 |
| `POST /api/clientes` | `{ nombre, nit, telefono, correo? }` | 201, cliente creado | 400, 401, 409, 422 |
| `PATCH /api/clientes/:id` | Campos editables opcionales | 200, cliente actualizado | 400, 401, 404, 409, 422 |
| `POST /api/clientes/:id/tomar` | Sin cuerpo | 200, cliente asignado | 401, 404, 409 |

### 3.1. Formato de cliente

Las respuestas de clientes deben utilizar la siguiente estructura:

```json
{
  "id": 1,
  "nombre": "Comercial El Quetzal",
  "nit": "4521817K",
  "telefono": "55551234",
  "correo": "compras@elquetzal.test"
}
```

Reglas:

- `nit` debe devolver `"CF"` cuando se encuentre almacenado como `NULL`.
- `correo` puede ser `null`.
- No se expone `vendedor_id` en la respuesta.
- No se devuelven columnas internas que no pertenezcan al contrato.
- `GET /api/clientes` devuelve un arreglo plano, igual que en B2.
- `GET /api/clientes/disponibles` devuelve exclusivamente `id` y `nombre`.

### 3.2. Creación de clientes

Ejemplo de cuerpo:

```json
{
  "nombre": "Distribuidora Bella",
  "nit": "CF",
  "telefono": "55551234",
  "correo": "contacto@distribuidora.test"
}
```

El correo es opcional. Los demás campos son obligatorios.

El identificador del vendedor se obtiene exclusivamente de la sesión JWT verificada, nunca de un dato enviado por el navegador.

### 3.3. Edición parcial

`PATCH /api/clientes/:id` permite actualizar únicamente los campos editables proporcionados.

Si se envía solo `telefono`, los valores de `nombre`, `nit` y `correo` deben permanecer sin cambios.

No se permite modificar `vendedor_id` desde este endpoint.

## 4. Datos utilizados

Se utilizarán las tablas existentes definidas en la especificación general.

### Tabla `clientes`

- `id`
- `vendedor_id`
- `nombre`
- `nit`
- `telefono`
- `correo`
- `created_at`
- `updated_at`

### Tabla `users`

- `id`, para identificar y bloquear la fila del vendedor durante las operaciones de cartera.
- Los campos de autenticación y estado ya utilizados en B2.

No se deben crear nuevas tablas ni columnas desde Express.

## 5. Reglas de negocio

### R3 — Límite de cartera

- Cada vendedor puede tener como máximo diez clientes asignados.
- El límite aplica tanto al registrar clientes como al tomar clientes disponibles.
- Si el vendedor ya tiene diez clientes, la operación debe rechazarse mediante HTTP 409.
- La comprobación debe ejecutarse dentro de una transacción.
- Las operaciones simultáneas no deben permitir superar el límite.

### R4 — Normalización de datos

- El NIT debe validarse y normalizarse utilizando las funciones reutilizables de B1.
- El valor `CF` se almacena como `NULL` y se presenta como `"CF"`.
- El teléfono debe normalizarse al formato establecido por la especificación.
- Los valores duplicados de NIT o teléfono deben resolverse mediante las restricciones únicas de MySQL.
- Los campos desconocidos del cuerpo no deben utilizarse para modificar columnas internas.

### S3 — Consultas seguras

- Todas las consultas SQL deben utilizar parámetros `?`.
- No se permite concatenar directamente valores proporcionados por el usuario.
- Las búsquedas deben ejecutarse exclusivamente sobre la cartera del vendedor autenticado.

### S5 — Protección de recursos ajenos

- Un vendedor únicamente puede consultar y editar clientes que le pertenecen.
- Si solicita el identificador de un cliente ajeno, la API debe devolver HTTP 404.
- La respuesta no debe revelar si el cliente existe y pertenece a otro vendedor.

### S8 — Operaciones concurrentes

- Registrar y tomar clientes deben ser operaciones atómicas.
- Se debe utilizar la utilidad de transacciones existente en B1.
- El sistema debe bloquear la fila del vendedor mediante `SELECT ... FOR UPDATE`.
- Debe contar los clientes asignados antes de insertar o tomar uno.
- Una operación fallida debe realizar rollback sin modificar la cartera.

## 6. Criterios de aceptación

### B3-01 — Consultar cartera propia

**Dado** el estado inicial de `VerificacionSeeder`, donde Valeria tiene tres clientes asignados, **cuando** realiza `GET /api/clientes` con su token, **entonces** recibe HTTP 200 con sus tres clientes, sin incluir clientes de otros vendedores.

### B3-02 — Representación de NIT CF

**Dado** un cliente cuyo NIT está almacenado como `NULL`, **cuando** aparece en una respuesta de la API, **entonces** el campo `nit` contiene `"CF"`.

### B3-03 — Búsqueda segura

**Dado** un vendedor autenticado, **cuando** realiza `GET /api/clientes?q=` con un nombre o NIT, **entonces** recibe únicamente clientes de su cartera que coincidan con el filtro.

Si utiliza un valor como `' OR 1=1 --`, la consulta no debe devolver clientes ajenos ni ejecutar SQL inyectado.

La búsqueda se realiza en el servidor con consultas parametrizadas.

### B3-04 — Clientes disponibles

**Dado** el estado inicial de `VerificacionSeeder`, **cuando** Valeria consulta `GET /api/clientes/disponibles`, **entonces** recibe HTTP 200 con los seis clientes disponibles definidos en la semilla.

Cada elemento contiene únicamente `id` y `nombre`.

### B3-05 — Protección de clientes ajenos

**Dado** un cliente asignado a Diego, **cuando** Valeria consulta su identificador mediante `GET /api/clientes/:id`, **entonces** recibe HTTP 404 sin acceder a sus datos.

El mismo principio se aplica a las modificaciones.

### B3-06 — Identificador inválido

**Dado** un vendedor autenticado, **cuando** consulta `GET /api/clientes/abc`, **entonces** recibe HTTP 404 y no un error interno 500.

### B3-07 — NIT inválido

**Dado** un formulario de creación, **cuando** el vendedor envía un NIT inválido como `4521817-1`, **entonces** recibe HTTP 422 con un mensaje en `errores.nit`.

### B3-08 — NIT duplicado

**Dado** que ya existe un cliente con un NIT determinado, **cuando** el vendedor intenta registrar otro cliente con el mismo NIT escrito en un formato equivalente, **entonces** recibe HTTP 409.

La API debe detectar el conflicto a partir del índice único de MySQL, sin realizar una consulta previa insegura o susceptible a condiciones de carrera.

### B3-09 — Normalización al registrar

**Dado** un vendedor con espacio disponible en su cartera, **cuando** registra un cliente con `nit` igual a `"cf"` y `telefono` igual a `"+502 5555 1234"`, **entonces** recibe HTTP 201 con `nit` igual a `"CF"` y `telefono` igual a `"55551234"`.

En la base de datos, el NIT se almacena como `NULL`.

### B3-10 — Protección de identidad

**Dado** un vendedor autenticado, **cuando** registra un cliente e incluye `"vendedor_id": 99` en el cuerpo, **entonces** el servidor ignora ese campo y asigna el cliente al vendedor identificado mediante JWT.

### B3-11 — Tomar un cliente disponible

**Dado** un cliente sin vendedor asignado, **cuando** Valeria ejecuta `POST /api/clientes/:id/tomar`, **entonces** recibe HTTP 200 y el cliente queda asignado a su cartera.

Si otro vendedor intenta tomar nuevamente el mismo cliente, la operación devuelve HTTP 409 sin realizar cambios adicionales.

### B3-12 — Límite de diez clientes

**Dado** Carlos con nueve clientes asignados, **cuando** registra correctamente un cliente adicional, **entonces** recibe HTTP 201 y su cartera llega a diez.

**Cuando** intenta registrar otro, **entonces** recibe HTTP 409 y la cartera permanece en diez.

### B3-13 — Edición parcial

**Dado** un cliente propio, **cuando** el vendedor realiza `PATCH /api/clientes/:id` enviando únicamente `telefono`, **entonces** recibe HTTP 200 y solamente se actualiza ese campo.

Los demás valores permanecen sin modificaciones.

### B3-14 — Validaciones visibles en la SPA

**Dado** un formulario de creación o edición, **cuando** la API responde HTTP 422, **entonces** la SPA presenta los mensajes debajo de los campos correspondientes, conservando los valores que el usuario introdujo.

### B3-15 — Escapado de contenido

**Dado** un cliente cuyo nombre contiene código HTML, **cuando** la SPA lo muestra, **entonces** el contenido se presenta como texto y no se ejecutan scripts.

La SPA debe reutilizar las funciones de escapado implementadas en B2.

## 7. Criterios de concurrencia

### B3-C1 — Dos vendedores toman el mismo cliente

**Dado** un cliente disponible, **cuando** se realizan diez peticiones simultáneas para tomarlo desde Valeria y Diego, **entonces** exactamente una petición debe lograr la asignación.

Las demás deben recibir una respuesta de conflicto y el cliente debe quedar asignado a un solo vendedor.

### B3-C2 — Creaciones simultáneas cerca del límite

**Dado** Carlos con nueve clientes asignados, **cuando** se realizan tres creaciones válidas simultáneamente, **entonces** exactamente una debe finalizar con HTTP 201 y las otras dos con HTTP 409 por límite de cartera.

Al finalizar, Carlos debe tener exactamente diez clientes.

## 8. Requisitos de la SPA

La vista de cartera implementada en B2 debe ampliarse para permitir:

- Consultar los clientes propios.
- Buscar por nombre o NIT mediante un formulario.
- Mostrar el contador «X de 10».
- Registrar nuevos clientes.
- Editar clientes propios.
- Consultar clientes disponibles.
- Tomar un cliente disponible.
- Mostrar errores de validación debajo de los campos.
- Mostrar mensajes de conflicto HTTP 409.
- Actualizar las listas después de las operaciones.
- Mantener el diseño adaptable a dispositivos móviles.
- Escapar todo texto proveniente de la API.

La búsqueda debe ejecutarse al enviar el formulario, no después de cada tecla.

No se deben incorporar frameworks adicionales.

## 9. Pruebas

### Pruebas automatizadas con `node:test`

Se deben cubrir todos los criterios B3-01 a B3-15 y B3-C1 a B3-C2 según corresponda.

Mientras no exista I1, las pruebas que lo permitan utilizarán una base de datos simulada, manteniendo el comportamiento SQL parametrizado y las transacciones.

Las pruebas simuladas no sustituyen las verificaciones de bloqueo y concurrencia contra MySQL real.

### Pruebas de integración pendientes de I1

Una vez disponibles las migraciones y `VerificacionSeeder` de la Parte A, comprobar:

- La cartera inicial de Valeria.
- Los clientes disponibles.
- La consulta y edición de clientes propios.
- La protección de clientes ajenos.
- El registro con NIT y teléfono normalizados.
- Los errores de duplicados.
- El límite de diez clientes.
- Las operaciones concurrentes de creación y toma.
- El funcionamiento de la SPA contra la API y MySQL reales.

Las pruebas de integración deben ser reproducibles y no alterar permanentemente los datos oficiales de verificación.

## 10. Archivos previstos

### API

- Ampliar `api/src/rutas/clientes.js`.
- Reutilizar `api/src/utils/validaciones.js`.
- Reutilizar `api/src/utils/transaccion.js`.
- Reutilizar el middleware JWT de B2.
- Añadir o ampliar las pruebas de clientes.
- Preparar las pruebas de concurrencia e integración.

### Frontend

- Ampliar `frontend/js/vistas/cartera.js`.
- Reutilizar `frontend/js/api.js`.
- Reutilizar `frontend/js/estado.js`.
- Reutilizar `frontend/js/util/escape.js`.
- Incorporar las pruebas necesarias de la SPA.

No duplicar componentes ni utilidades existentes.

## 11. Condiciones para finalizar B3

B3 estará lista para integración cuando:

- Se implementen todos los endpoints de clientes.
- Se cumplan los criterios B3-01 a B3-15.
- La SPA permita administrar la cartera.
- Las pruebas automatizadas disponibles pasen.
- Los subagentes revisen contrato y seguridad.
- No se modifiquen los archivos reservados para la Parte A.
- Los cambios queden documentados y revisados.

La **finalización definitiva de B3** requiere ejecutar las pruebas de integración y concurrencia contra el esquema real de MySQL proporcionado en I1.

## 12. Preguntas abiertas

- Confirmar en `docs/especificacion.md` el tratamiento de parámetros de consulta desconocidos en `GET /api/clientes`; la guía menciona HTTP 400, por lo que no debe ignorarse esta regla si el contrato general ya la establece.
- Verificar que los campos editables, límites y formatos de error coincidan exactamente con la versión aprobada `spec-v1`.
- Verificar que la migración de la Parte A implemente los índices únicos de NIT y teléfono necesarios para las pruebas de duplicados.

Si existe alguna contradicción con `docs/especificacion.md`, prevalece la especificación general aprobada. No modificarla unilateralmente: registrar la discrepancia antes de programar.