# B5 — Gestión de actividades comerciales

**Proyecto:** CRM Belleza  
**Responsable:** Parte B  
**Rama:** `b/actividades`  
**Especificación general:** `docs/especificacion.md` (`spec-v1`)  
**Requisitos que cubre:** A5, F4 y R8, con las reglas de autenticación y autorización aplicables.  
**Dependencias:** B1, B2 y B3; I1 de la Parte A para las pruebas reales con MySQL.

## 1. Objetivo

Implementar el módulo de actividades comerciales del CRM Belleza mediante la API Express y la SPA.

Cada vendedor podrá consultar actividades de los clientes de su cartera, registrar nuevas actividades de tipo llamada, reunión o tarea, establecer fechas de vencimiento opcionales y marcar las actividades como completadas.

Las actividades deberán respetar la pertenencia actual del cliente a la cartera del vendedor y utilizar fechas con zona horaria explícita.

## 2. Fuera de alcance

- Crear o modificar clientes, funcionalidad de B3.
- Crear o modificar oportunidades y productos, funcionalidad de B4.
- Administrar o reasignar vendedores desde la API.
- Implementar recordatorios automáticos, notificaciones o correos.
- Crear calendarios externos.
- Implementar reportes administrativos.
- Modificar Laravel, migraciones, seeders o estructura de MySQL.
- Cambiar el contrato de autenticación de B2.

## 3. Contrato de la API

Todos los endpoints de actividades requieren autenticación JWT válida de un vendedor activo.

| Método y ruta | Cuerpo o parámetro | Éxito | Errores principales |
|---|---|---|---|
| `GET /api/actividades?estado=` | `estado` opcional | 200, listado de actividades | 400, 401 |
| `POST /api/clientes/:id/actividades` | `{ tipo, descripcion, vence_en? }` | 201, actividad creada | 400, 401, 404, 422 |
| `PATCH /api/actividades/:id` | `{ completada }` | 200, actividad actualizada | 400, 401, 404, 422 |

Los nombres de los campos y las formas de respuesta definitivas deben respetar la sección correspondiente de `docs/especificacion.md`.

### 3.1. Consultar actividades

`GET /api/actividades` devuelve las actividades visibles para el vendedor autenticado.

El parámetro `estado` admite:

- `pendiente`: actividades no completadas.
- `completada`: actividades completadas.
- Ausente: todas las actividades accesibles.

Cualquier otro valor de `estado` devuelve HTTP 400.

Las actividades se ordenan de acuerdo con el contrato, priorizando las pendientes y las fechas de vencimiento.

### 3.2. Crear actividad

`POST /api/clientes/:id/actividades` recibe un objeto JSON como:

```json
{
  "tipo": "llamada",
  "descripcion": "Contactar al cliente para confirmar el pedido de maquillaje",
  "vence_en": "2026-12-01T10:00:00-06:00"
}
```

El cliente indicado en la ruta debe pertenecer a la cartera del vendedor autenticado.

La identidad del vendedor se obtiene del JWT verificado y nunca de un campo proporcionado por el navegador.

### 3.3. Marcar actividad como completada

`PATCH /api/actividades/:id` recibe:

```json
{
  "completada": true
}
```

`completada` debe ser un valor booleano JSON (`true` o `false`).

No se aceptan textos como `"si"`, `"true"` o valores numéricos como sustitutos de un booleano.

## 4. Datos utilizados

La implementación utilizará las tablas definidas en la especificación general.

### `actividades`

- `id`
- `cliente_id`
- `vendedor_id`
- `tipo`
- `descripcion`
- `vence_en`
- `completada`
- Campos de creación y actualización establecidos en el esquema.

### `clientes`

- `id`
- `vendedor_id`
- `nombre`

No se deben crear ni modificar tablas desde Express.

## 5. Reglas de negocio

### 5.1. Tipos de actividades

Se permiten exactamente los valores:

- `llamada`
- `reunion`
- `tarea`

Cualquier otro tipo es inválido y debe producir HTTP 422 con `errores.tipo`.

### 5.2. Descripción

La descripción es obligatoria y debe contener entre 1 y 500 caracteres, después de retirar los espacios sobrantes de los extremos.

Una descripción vacía o que supere el límite debe devolver HTTP 422 con `errores.descripcion`.

### 5.3. Fecha de vencimiento

`vence_en` es opcional.

Si se proporciona, debe utilizar un formato ISO 8601 válido con zona horaria explícita, mediante `Z` o un desplazamiento como `-06:00`.

Ejemplo válido:

`2026-12-01T10:00:00-06:00`

Ejemplo inválido:

`2026-12-01T10:00`

Una fecha sin zona horaria debe producir HTTP 422 con `errores.vence_en`.

La API debe trabajar con instantes normalizados a UTC. La SPA debe mostrarlos en la zona horaria `America/Guatemala`.

### 5.4. Estado de una actividad

Toda actividad tiene el indicador booleano `completada`.

Se considera vencida cuando se cumplen simultáneamente las condiciones:

- No está completada.
- Tiene una fecha de vencimiento.
- La fecha de vencimiento es anterior al instante actual.

Una actividad completada no debe aparecer como vencida.

### 5.5. Propiedad y acceso a las actividades

Las consultas deben relacionar `actividades` con `clientes` y filtrar por `clientes.vendedor_id`, utilizando la identidad del JWT.

Esto significa que, si un cliente cambia de vendedor, las actividades existentes serán visibles para el nuevo responsable de su cartera, conforme a la decisión de asignación del proyecto.

Un vendedor no debe consultar ni modificar actividades de clientes que no pertenecen actualmente a su cartera.

La falta de acceso debe responder HTTP 404 para recursos individuales, evitando revelar información ajena.

## 6. Criterios de aceptación

### B5-01 — Listar actividades propias

**Dado** un vendedor autenticado con clientes asignados, **cuando** consulta `GET /api/actividades`, **entonces** recibe HTTP 200 con las actividades de los clientes que pertenecen actualmente a su cartera.

No deben incluirse actividades de clientes ajenos.

### B5-02 — Filtrar actividades pendientes

**Dado** un vendedor con actividades pendientes y completadas, **cuando** consulta `GET /api/actividades?estado=pendiente`, **entonces** recibe HTTP 200 con únicamente actividades cuya propiedad `completada` sea `false`.

### B5-03 — Filtrar actividades completadas

**Dado** el mismo vendedor, **cuando** consulta `GET /api/actividades?estado=completada`, **entonces** recibe HTTP 200 con únicamente actividades cuya propiedad `completada` sea `true`.

### B5-04 — Filtro de estado inválido

**Cuando** el vendedor realiza `GET /api/actividades?estado=otra`, **entonces** la API devuelve HTTP 400.

Los parámetros desconocidos o repetidos deben tratarse conforme a la decisión D6 si esta ha sido formalmente aprobada.

### B5-05 — Crear llamada, reunión o tarea

**Dado** un cliente de la cartera del vendedor, **cuando** crea una actividad con un tipo permitido y una descripción válida, **entonces** recibe HTTP 201 y la actividad queda asociada al cliente.

El vendedor propietario debe obtenerse del token, no de la petición.

### B5-06 — Impedir tipos desconocidos

**Cuando** se intenta crear una actividad con `tipo` igual a `"visita"`, **entonces** devuelve HTTP 422 con `errores.tipo`.

### B5-07 — Validar descripción

**Cuando** se intenta crear una actividad sin descripción, con solo espacios o con más de 500 caracteres, **entonces** devuelve HTTP 422 con `errores.descripcion`.

### B5-08 — Fecha con zona horaria

**Cuando** se crea una actividad con:

`"vence_en": "2026-12-01T10:00:00-06:00"`

**Entonces** la fecha se interpreta correctamente y se representa en UTC como:

`2026-12-01T16:00:00.000Z`

### B5-09 — Rechazar fecha sin zona

**Cuando** se envía:

`"vence_en": "2026-12-01T10:00"`

**Entonces** la API devuelve HTTP 422 con `errores.vence_en`, sin crear la actividad.

### B5-10 — Proteger clientes ajenos

**Dado** un cliente de Diego, **cuando** Valeria intenta crearle una actividad, **entonces** recibe HTTP 404.

La respuesta no debe exponer información del cliente ajeno.

### B5-11 — Marcar actividad como completada

**Dada** una actividad de un cliente propio, **cuando** el vendedor envía:

```json
{
  "completada": true
}
```

**Entonces** recibe HTTP 200 y la actividad queda completada.

### B5-12 — Rechazar valores no booleanos

**Cuando** se envía `"completada": "si"` u otro valor no booleano, **entonces** devuelve HTTP 422 con `errores.completada`.

### B5-13 — Proteger actividades ajenas

**Dada** una actividad perteneciente a un cliente fuera de la cartera del vendedor, **cuando** este intenta modificarla, **entonces** recibe HTTP 404 y la actividad permanece sin cambios.

### B5-14 — Actividades vencidas

**Dada** una actividad pendiente con fecha de vencimiento anterior al instante actual, **cuando** se consulta, **entonces** su propiedad `vencida` es `true`.

Si está completada, no tiene fecha o todavía no vence, `vencida` es `false`.

### B5-15 — Reasignación de clientes

**Dado** un cliente reasignado desde Valeria a Diego por el panel administrativo, **cuando** ambos consultan sus actividades, **entonces** Diego puede visualizar las actividades del cliente y Valeria deja de tener acceso a ellas.

No deben duplicarse ni modificarse las actividades por esa reasignación.

### B5-16 — Vista de actividades

**Dado** un vendedor autenticado, **cuando** ingresa al módulo de actividades de la SPA, **entonces** puede visualizar sus actividades organizadas en pendientes y completadas.

### B5-17 — Crear actividades en la SPA

**Cuando** el vendedor abre el formulario de actividades, **entonces** puede seleccionar un cliente de su cartera, elegir el tipo de actividad, ingresar una descripción y establecer opcionalmente una fecha de vencimiento.

La fecha seleccionada en el navegador debe enviarse con la zona horaria correcta de Guatemala.

### B5-18 — Mostrar vencimientos

**Dada** una actividad vencida, **cuando** aparece en la SPA, **entonces** se identifica visualmente como vencida mediante una etiqueta o indicador.

Las fechas se muestran utilizando `America/Guatemala`.

### B5-19 — Completar desde la SPA

**Dada** una actividad pendiente, **cuando** el vendedor selecciona «Completar», **entonces** la SPA solicita la actualización a la API y refleja su nuevo estado después de una respuesta exitosa.

### B5-20 — Seguridad y errores de interfaz

La SPA debe:

- Escapar todos los textos proporcionados por la API.
- Mostrar errores de validación.
- Mostrar errores de conexión.
- Mantener la sesión y autorización de B2.
- Reutilizar el estado y los componentes existentes.
- Mantener el diseño adaptable a dispositivos móviles.

## 7. Estructura de respuesta

Las actividades deben incluir los datos establecidos por el contrato aprobado, particularmente:

- `id`
- `cliente`, con identificador y nombre
- `tipo`
- `descripcion`
- `vence_en`
- `completada`
- `vencida`

Las fechas deben serializarse en formato ISO UTC con `Z`.

La forma exacta del JSON debe contrastarse con `docs/especificacion.md` antes de programar. No se deben agregar campos arbitrarios.

## 8. Seguridad

- Utilizar exclusivamente SQL parametrizado.
- Obtener el vendedor desde el middleware JWT de B2.
- Filtrar actividades según el propietario actual del cliente.
- No confiar en identificadores de vendedor enviados por el navegador.
- Devolver HTTP 404 al intentar modificar actividades ajenas.
- Validar tipos, descripción, fechas y valores booleanos.
- No permitir la ejecución de scripts a través de contenido renderizado en la SPA.

## 9. Pruebas automatizadas

Se deben crear o ampliar pruebas con `node:test` para verificar B5-01 a B5-20.

Las pruebas deben cubrir los filtros, tipos, descripciones, zonas horarias, actividades vencidas, protección de recursos ajenos y cambios de estado.

Deben utilizarse fechas controladas en las pruebas para evitar resultados dependientes de la hora real.

### Integración real pendiente

Cuando la Parte A entregue I1, realizar las pruebas sobre MySQL con:

- Clientes reales de `VerificacionSeeder`.
- Actividades de clientes propios y ajenos.
- Fechas guardadas y recuperadas correctamente.
- Operaciones de creación y actualización.
- Reasignación de clientes y acceso a actividades.

Las pruebas que modifican datos deben ejecutarse únicamente sobre una base de pruebas restablecible y autorizada.

## 10. SPA

La interfaz deberá contener:

- Una vista de actividades comerciales.
- Pestañas Pendientes y Completadas.
- Formulario de creación.
- Selector de clientes propios.
- Selector de tipo: llamada, reunión o tarea.
- Descripción.
- Fecha de vencimiento opcional mediante `datetime-local`.
- Botón para marcar actividades como completadas.
- Indicadores visuales de actividades vencidas.
- Mensajes de carga, error y confirmación.

Reutilizar los módulos de estado, Fetch API, formato de fechas, escapado HTML y componentes de formulario implementados en las fases anteriores.

## 11. Archivos previstos

### API

- Rutas de actividades.
- Ampliación de las rutas de clientes para registrar actividades.
- Validaciones de fecha y actividades.
- Pruebas automatizadas.
- Pruebas de integración pendientes de I1.

### Frontend

- Vista de actividades.
- Funciones HTTP para consultar, crear y completar actividades.
- Ampliación del estado y del enrutador.
- Pruebas de interfaz.

Claude Code debe inspeccionar la estructura actual antes de decidir los nombres y ubicaciones exactos.

## 12. Preguntas abiertas

Antes de implementar, comprobar:

1. La estructura exacta de respuesta de cada actividad en el contrato general.
2. El comportamiento de `vence_en` cuando está ausente o es `null`.
3. El tratamiento de `PATCH` con el mismo valor actual de `completada`.
4. La decisión D6 para parámetros desconocidos o repetidos.
5. Las reglas exactas de visibilidad de actividades después de una reasignación.
6. Las restricciones y nombres reales de las columnas que entregará la Parte A.

No introducir decisiones nuevas silenciosamente. Si algo contradice `docs/especificacion.md`, prevalece el contrato aprobado y se registra la discrepancia.

## 13. Condiciones de finalización

B5 estará implementada cuando:

- Se cumplan los criterios B5-01 a B5-20.
- Funcionen los endpoints de actividades.
- La SPA permita consultar, registrar y completar actividades.
- Pasen las pruebas automatizadas disponibles.
- Los revisores de contrato y seguridad no reporten errores pendientes dentro del alcance.
- Se respete la separación entre Parte A y Parte B.
- Se registren los errores reales detectados durante la implementación.

La fase no estará completamente verificada hasta ejecutar las pruebas reales de integración con MySQL y el esquema oficial de la Parte A.