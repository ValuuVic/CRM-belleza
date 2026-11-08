# B4 — Oportunidades, productos, etapas y control de stock

**Proyecto:** CRM Belleza  
**Responsable:** Parte B  
**Rama:** `b/oportunidades`  
**Especificación general:** `docs/especificacion.md` (`spec-v1`)  
**Requisitos:** A4, F3, R5, S5, S8 y RP-1 a RP-3  
**Dependencias:** B1, B2, B3 e I1 de la Parte A para integración real.

## 1. Objetivo

Implementar el módulo de oportunidades comerciales del CRM Belleza.

Los vendedores podrán registrar oportunidades para sus clientes, agregar productos del catálogo, modificar cantidades, consultar importes e historial, y avanzar oportunidades entre las etapas permitidas.

Cuando una oportunidad pase a ganada, el sistema deberá verificar el inventario y descontar las cantidades correspondientes mediante una transacción atómica.

## 2. Fuera de alcance

- Crear o modificar productos desde la API de vendedores.
- Modificar precios del catálogo.
- Administrar inventario manualmente.
- Registrar actividades comerciales (B5).
- Implementar reportes administrativos (Parte A).
- Modificar Laravel, migraciones o seeders.
- Implementar pagos, facturación o envíos.
- Cambiar las reglas de reasignación de clientes del contrato general.

## 3. Etapas de oportunidades

Una oportunidad puede encontrarse en las siguientes etapas:

| Etapa | Probabilidad |
|---|---:|
| prospecto | 10 % |
| calificado | 25 % |
| propuesta | 50 % |
| negociacion | 75 % |
| ganada | 100 % |
| perdida | 0 % |

### Transiciones permitidas

Las etapas abiertas son `prospecto`, `calificado`, `propuesta` y `negociacion`.

- Entre etapas abiertas se permite avanzar o retroceder únicamente una etapa.
- Una oportunidad puede pasar a `perdida` desde cualquier etapa abierta.
- Solo puede pasar a `ganada` desde `negociacion`.
- Una oportunidad cerrada no puede cambiar nuevamente de etapa.
- No se permite repetir la misma etapa como transición.
- Toda transición exitosa registra un evento en `historial_etapas`.

## 4. Contrato de API

Todos los endpoints de vendedores requieren JWT válido.

### Oportunidades

- `GET /api/oportunidades`: listado del vendedor autenticado.
- `GET /api/oportunidades/:id`: detalle de una oportunidad propia.
- `POST /api/oportunidades`: crea una oportunidad.
- `PATCH /api/oportunidades/:id`: actualiza el título de una oportunidad abierta.
- `PATCH /api/oportunidades/:id/etapa`: modifica su etapa conforme a las reglas.

### Productos

- `GET /api/productos`: consulta del catálogo autorizado para vendedores.
- `POST /api/oportunidades/:id/productos`: agrega una línea de producto a una oportunidad.
- Actualización de cantidad y eliminación de líneas: utilizar exactamente los métodos y las rutas establecidos en `docs/especificacion.md`, sin inventar un contrato alternativo.

### Códigos HTTP

- `200`: consulta o modificación exitosa.
- `201`: creación exitosa.
- `400`: petición mal formada, según contrato.
- `401`: autenticación inválida o ausente.
- `404`: oportunidad o recurso inexistente o ajeno.
- `409`: conflicto de estado, producto duplicado o stock insuficiente.
- `422`: valores inválidos o transición no permitida.

Las formas exactas de respuesta y los campos deben conservar el contrato general aprobado.

## 5. Datos utilizados

Se utilizarán las tablas ya definidas en la especificación general:

- `oportunidades`
- `oportunidad_productos`
- `productos`
- `historial_etapas`
- `clientes`
- `users`

No se deben crear tablas ni columnas desde Express.

El propietario de la oportunidad se determina a partir de la identidad autenticada.

Las oportunidades se consultan usando el vendedor propietario de la oportunidad, conforme a las reglas de reasignación del contrato general.

## 6. Regla específica de stock

**RP-1 — Verificación de disponibilidad**

Antes de marcar una oportunidad como `ganada`, el sistema debe comprobar que todos los productos con inventario controlado tengan unidades suficientes para cubrir las cantidades solicitadas.

Si cualquier producto tiene stock insuficiente, se debe devolver HTTP 409, sin cerrar la oportunidad, descontar inventario ni agregar historial.

**RP-2 — Descuento automático**

Si todos los productos tienen disponibilidad suficiente, al cambiar una oportunidad a `ganada` el sistema debe descontar automáticamente las cantidades correspondientes.

El descuento del inventario, el cambio de etapa y el registro del historial deben realizarse dentro de la misma transacción.

**RP-3 — Productos sin límite de stock**

Si un producto tiene `stock = NULL`, se considera que no tiene un límite numérico de inventario para esta regla.

La oportunidad puede ganarse sin descontar ese producto y su valor debe continuar siendo `NULL`.

Estas reglas deberán cotejarse literalmente con RP-1 a RP-3 de `docs/especificacion.md`, sin modificar unilateralmente su redacción contractual.

## 7. Criterios de aceptación

### B4-01 — Consultar catálogo

**Dado** un vendedor autenticado, **cuando** consulta `GET /api/productos`, **entonces** recibe el catálogo de productos permitido por el contrato, sin acceder a funciones administrativas de modificación.

### B4-02 — Consultar oportunidades propias

**Dado** un vendedor con oportunidades registradas, **cuando** consulta `GET /api/oportunidades`, **entonces** recibe únicamente las oportunidades que le pertenecen.

### B4-03 — Proteger oportunidades ajenas

**Dada** una oportunidad perteneciente a Diego, **cuando** Valeria intenta consultar su detalle, **entonces** recibe HTTP 404 sin visualizar información privada.

### B4-04 — Crear oportunidad

**Dado** un cliente válido de la cartera del vendedor, **cuando** se crea una oportunidad con `cliente_id` y `titulo`, **entonces** recibe HTTP 201.

La oportunidad inicia en `prospecto`, con probabilidad del 10 %, y se registra su primer evento de historial dentro de la misma transacción.

### B4-05 — Impedir clientes no autorizados

**Dado** un cliente ajeno o inexistente, **cuando** el vendedor intenta crear una oportunidad asociada a él, **entonces** se rechaza la operación sin revelar información del cliente ajeno.

### B4-06 — Agregar productos

**Dada** una oportunidad abierta propia, **cuando** el vendedor agrega un producto activo y una cantidad válida, **entonces** recibe HTTP 201 y se almacena una línea de producto.

El precio unitario se copia del catálogo en el momento de agregarlo.

### B4-07 — Evitar manipulación de precios

**Dado** un producto con precio definido en el catálogo, **cuando** se agrega una línea enviando un `precio_unitario` diferente en el cuerpo, **entonces** el servidor ignora ese precio y utiliza el del catálogo.

### B4-08 — Producto duplicado o inactivo

**Dada** una oportunidad que ya contiene un producto, **cuando** se intenta agregar nuevamente el mismo producto, **entonces** devuelve HTTP 409.

Si el producto no está activo, la API devuelve HTTP 422 con el error correspondiente.

### B4-09 — Validación de cantidades

**Cuando** el vendedor agrega o modifica una línea, **entonces** la cantidad debe ser un número entero entre 1 y 999.

Los valores fuera de ese rango deben devolver HTTP 422.

### B4-10 — Editar y quitar líneas

**Dada** una oportunidad abierta propia, **cuando** el vendedor modifica la cantidad de una línea o la elimina, **entonces** el sistema actualiza su detalle y total.

La operación debe comprobar que la línea pertenece a la oportunidad indicada.

### B4-11 — Actualizar título

**Dada** una oportunidad abierta, **cuando** el vendedor modifica su título conforme a las validaciones del contrato, **entonces** recibe HTTP 200.

Si la oportunidad está cerrada, devuelve HTTP 409.

### B4-12 — Transiciones permitidas

**Dada** una oportunidad en una etapa abierta, **cuando** el vendedor solicita avanzar o retroceder una sola etapa, **entonces** se actualiza correctamente y se registra el historial.

### B4-13 — Transiciones inválidas

**Dada** una oportunidad en `prospecto`, **cuando** se intenta cambiar directamente a `propuesta` o `ganada`, **entonces** devuelve HTTP 422 con `errores.etapa`.

La oportunidad y su historial permanecen sin cambios.

### B4-14 — Cerrar como perdida

**Dada** una oportunidad abierta, **cuando** el vendedor solicita marcarla como `perdida`, **entonces** debe proporcionar `motivo_perdida` válido de 1 a 255 caracteres.

Si el motivo está ausente o es inválido, se devuelve HTTP 422.

Si es válido, se cierra la oportunidad, se registra la fecha de cierre y se agrega el evento de historial.

### B4-15 — Ganar sin productos

**Dada** una oportunidad en `negociacion` sin líneas de productos, **cuando** se intenta marcar como `ganada`, **entonces** devuelve HTTP 422.

No debe modificar el estado ni agregar historial.

### B4-16 — Stock insuficiente (RP-1)

**Dada** una oportunidad en `negociacion` con una línea de cantidad 3 y un producto con stock 2, **cuando** se intenta ganar, **entonces** devuelve HTTP 409.

La oportunidad continúa en `negociacion`, el stock permanece en 2 y el historial no cambia.

### B4-17 — Descuento automático (RP-2)

**Dada** una oportunidad en `negociacion` con cantidad 3 de un producto cuyo stock es 5, **cuando** se marca como `ganada`, **entonces** devuelve HTTP 200.

La oportunidad queda ganada, el stock se reduce a 2 y se agrega exactamente un evento al historial.

### B4-18 — Stock NULL (RP-3)

**Dada** una oportunidad en `negociacion` que contiene un producto cuyo stock es `NULL`, **cuando** se marca como `ganada` y se cumplen las demás condiciones, **entonces** recibe HTTP 200.

El stock de ese producto permanece en `NULL`.

### B4-19 — Oportunidades cerradas

**Dada** una oportunidad `ganada` o `perdida`, **cuando** se intenta modificar el título, las líneas o la etapa, **entonces** se devuelve HTTP 409 sin realizar cambios.

### B4-20 — Total calculado

**Dada** una oportunidad con productos y cantidades, **cuando** se consulta su detalle, **entonces** el total se calcula a partir de la cantidad y el precio unitario almacenado de cada línea.

No debe aceptarse el total calculado por el navegador como autoridad.

### B4-21 — Historial de etapas

**Dada** una oportunidad con transiciones realizadas, **cuando** se consulta su detalle, **entonces** se devuelve el historial correspondiente, incluyendo las etapas anteriores y nuevas, el usuario y la fecha, según el contrato.

### B4-22 — Interfaz del embudo

**Dado** un vendedor autenticado, **cuando** abre el módulo de oportunidades en la SPA, **entonces** visualiza un tablero organizado por las cuatro etapas abiertas y una sección de oportunidades cerradas.

### B4-23 — Detalle de oportunidad

**Cuando** el vendedor abre una oportunidad propia, **entonces** puede consultar sus productos, cantidades, precios almacenados, subtotales, total e historial.

Los importes se muestran en quetzales y las fechas conforme a la zona horaria de Guatemala.

### B4-24 — Acciones válidas en SPA

**Cuando** el vendedor consulta una oportunidad, **entonces** la SPA muestra únicamente las acciones de transición permitidas.

La API debe volver a validar cualquier transición, independientemente de lo que muestre la interfaz.

### B4-25 — Mensajes de error

**Cuando** la API devuelve HTTP 409 por inventario insuficiente, **entonces** la SPA muestra el mensaje de error y mantiene el estado previo de la oportunidad.

Al marcar como perdida, debe presentar un formulario o modal para introducir el motivo.

## 8. Concurrencia y transacciones

### B4-C1 — Dos cambios simultáneos de etapa

**Dada** una oportunidad abierta, **cuando** dos peticiones intentan realizar simultáneamente la misma transición, **entonces** solo una debe actualizar el estado y registrar el evento de historial.

La segunda debe rechazarse según el contrato, sin duplicar registros.

### B4-C2 — Dos ventas compiten por el mismo stock

**Dados** dos pedidos que necesitan la última unidad de un producto con inventario controlado, **cuando** ambas operaciones intentan marcarse como ganadas simultáneamente, **entonces** solo una puede finalizar con éxito.

La otra debe devolver HTTP 409 y el inventario nunca debe quedar negativo.

### B4-C3 — Atomicidad al ganar

**Dada** una oportunidad con varios productos, **cuando** uno de ellos carece de stock suficiente o falla la transacción, **entonces** no debe descontarse ningún producto, cerrarse la oportunidad ni registrarse un nuevo historial.

### Orden de la transacción

Al cambiar de etapa:

1. Bloquear la oportunidad mediante `SELECT ... FOR UPDATE`.
2. Verificar la pertenencia del vendedor y el estado actual.
3. Validar la transición solicitada.
4. Si se gana, consultar y bloquear los productos en un orden consistente por identificador.
5. Verificar la disponibilidad de todos los productos.
6. Aplicar los descuentos correspondientes cuando proceda.
7. Actualizar la oportunidad.
8. Registrar el cambio en `historial_etapas`.
9. Confirmar la transacción o revertirla completamente si ocurre un error.

Las pruebas simuladas no sustituyen las pruebas reales de bloqueo con InnoDB.

## 9. Requisitos de la SPA

La interfaz debe incluir:

- Tablero de oportunidades por etapa.
- Sección de oportunidades cerradas.
- Creación de oportunidades asociadas a clientes propios.
- Vista de detalle.
- Catálogo de productos disponibles.
- Formularios para agregar, modificar y quitar líneas.
- Visualización de precios, subtotales y total.
- Controles para transiciones permitidas.
- Modal o formulario de motivo de pérdida.
- Historial de cambios.
- Mensajes de validación y conflictos de stock.
- Indicadores de carga y errores de conexión.
- Diseño responsive.
- Escapado de todo texto externo antes de insertarlo en HTML.

Reutilizar los módulos y componentes existentes de B1, B2 y B3.

## 10. Pruebas

Las pruebas automatizadas deberán cubrir:

- Propiedad de las oportunidades.
- Creación y consulta.
- Reglas del embudo.
- Historial.
- Precio copiado del catálogo.
- Productos activos e inactivos.
- Cantidades válidas e inválidas.
- Modificación de líneas.
- Cálculo de totales.
- Stock suficiente e insuficiente.
- Stock `NULL`.
- Oportunidades cerradas.
- Atomicidad y concurrencia.
- Renderización segura de la SPA.

Todos los criterios deberán estar vinculados a una prueba identificable.

### Dependencia I1

Mientras la Parte A no entregue las migraciones y `VerificacionSeeder`:

- Utilizar pruebas simuladas independientes de MySQL real.
- Mantener las pruebas de integración reales pendientes.
- No crear tablas o datos oficiales ficticios en MySQL.
- No considerar verificada la concurrencia real de InnoDB.

### Integración I3

Cuando la Parte A tenga su panel y reportes:

- Registrar una venta ganada desde la SPA.
- Verificar que aparezca en el reporte mensual del panel.
- Comprobar que los importes calculados coincidan entre ambas aplicaciones.

## 11. Archivos previstos

### API

- Servicios de etapas.
- Servicios de detalle de oportunidades.
- Rutas de oportunidades.
- Rutas de productos.
- Rutas de líneas de productos.
- Pruebas unitarias, integración y concurrencia.

### SPA

- Vista de tablero.
- Vista de detalle de oportunidades.
- Integración con el cliente HTTP existente.
- Ampliación del estado y del enrutador.
- Componentes reutilizables para formularios y presentación.

Los nombres y ubicaciones definitivos deberán decidirse después de inspeccionar la estructura existente.

## 12. Preguntas abiertas

Antes de implementar, comprobar contra `docs/especificacion.md`:

1. Los métodos y rutas exactos para modificar o eliminar líneas de productos.
2. Los campos obligatorios y opcionales en los cuerpos de creación y edición.
3. Las estructuras JSON exactas de los listados y detalles.
4. Las reglas de productos inactivos cuando ya están asociados a oportunidades.
5. La aplicación literal de RP-1, RP-2 y RP-3.
6. Las condiciones de reasignación de oportunidades cuando cambia la cartera.
7. Las decisiones generales pendientes de aprobación entre ambas integrantes.

Si existe una discrepancia, prevalece `docs/especificacion.md` aprobado en `spec-v1`. No se debe alterar el contrato general unilateralmente.

## 13. Condiciones de finalización

B4 podrá considerarse implementada cuando:

- Se cumplan los criterios B4-01 a B4-25.
- Se implementen los escenarios B4-C1 a B4-C3.
- Las pruebas automatizadas disponibles pasen.
- La SPA permita gestionar oportunidades.
- Los subagentes revisen contrato y seguridad.
- No se modifique código reservado a la Parte A.
- Se mantengan identificadas las pruebas pendientes de integración.

La aprobación definitiva de las operaciones transaccionales requiere pruebas con MySQL real, migraciones y datos oficiales de I1. La integración I3 también requiere los reportes de la Parte A.