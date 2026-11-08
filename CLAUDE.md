# CLAUDE.md — CRM Belleza

Proyecto: CRM de ventas para una distribuidora de maquillaje.

Arquitectura:

- Panel administrativo: Laravel 13 + Breeze Blade.
- API REST: Node.js 24 + Express 5.
- SPA: HTML, Bootstrap 5.3 y JavaScript con módulos.
- Base de datos compartida: MySQL 8.4 en Docker.

El proyecto se desarrolla entre dos integrantes mediante especificaciones, planificación, implementación y verificación.

## 1. Fuente de verdad

- El documento principal es `docs/especificacion.md`.
- `docs/plan.md` contiene las fases y tareas de implementación.
- `docs/verificacion.md` registra las pruebas y sus resultados.
- El enunciado del proyecto establece los requisitos obligatorios y el contrato de la API.
- Si `docs/especificacion.md` no fija la forma de una respuesta, se usa la del ejemplo del enunciado (sección 8): las pruebas automáticas del catedrático comparan contra ella.
- Si falta una decisión en la especificación, pregunta antes de implementarla.
- No inventes requisitos, tablas, columnas, endpoints ni reglas de negocio.
- No escribas código de implementación si no existe la etiqueta Git `spec-v1`.
- Si la especificación aprobada necesita cambios, ambas integrantes deben autorizarlos.

## 2. Responsabilidades

### Parte A — Laravel y base de datos

Responsable de:

- `laravel/`.
- Migraciones y seeders.
- Panel de administrador y supervisor.
- Gestión de cuentas y roles.
- Catálogo de productos.
- Asignación de clientes.
- Reportes del panel.
- `GET /api/reportes/resumen`.
- Vista de resumen mensual de la SPA.

### Parte B — API y SPA

Responsable de:

- `api/`, excepto el endpoint de resumen mensual asignado a la Parte A.
- `frontend/`, excepto la vista de resumen mensual asignada a la Parte A.
- Autenticación JWT.
- Clientes y cartera.
- Oportunidades y productos.
- Actividades y seguimiento.
- Validaciones y manejo de errores.
- Regla de descuento de stock.
- Pruebas con Postman.
- Pruebas de concurrencia.

### Reglas de colaboración

- No modifiques archivos de la otra integrante sin autorización.
- Los cambios en archivos compartidos deben coordinarse.
- No sobrescribas trabajo existente.
- Utiliza ramas separadas para desarrollar funcionalidades.
- Revisa los cambios antes de realizar un commit.
- No hagas push ni merges automáticamente sin autorización.

## 3. Esquema de base de datos

- Laravel es el único responsable de crear y modificar las tablas.
- Las modificaciones del esquema se realizan exclusivamente mediante migraciones de Laravel.
- La API no ejecuta `DROP` ni `TRUNCATE`.
- No cambies nombres, tipos ni restricciones de columnas sin autorización.
- Las migraciones existentes no se modifican; los cambios aprobados se realizan con nuevas migraciones.
- La tabla `users` conserva `name`, `email` y `password`.
- La API utiliza `name AS nombre` y `email AS correo`.
- Solo el administrador crea cuentas.
- No existe registro público.
- Laravel genera los hashes y la API verifica contraseñas mediante `bcryptjs`.

## 4. MySQL y Docker

- MySQL 8.4 se ejecuta mediante `docker-compose.yml`.
- Laravel y Express utilizan la misma base de datos.
- Las fechas se almacenan en UTC.
- Laravel utiliza zona horaria UTC.
- `mysql2` debe utilizar `timezone: 'Z'` y `decimalNumbers: true`.
- Los montos se almacenan como DECIMAL, nunca FLOAT.
- MySQL 1062 corresponde a HTTP 409.
- MySQL 3819 corresponde a HTTP 422.
- Los reportes mensuales se calculan según la zona horaria `America/Guatemala`, utilizando rangos UTC.
- No ejecutes comandos destructivos que borren tablas o volúmenes sin autorización.

## 5. Reglas del panel Laravel

- Utiliza Eloquent o el constructor de consultas de Laravel.
- No construyas consultas SQL inseguras con datos del usuario.
- Utiliza FormRequest para validaciones.
- Presenta mensajes en español, tratando al usuario de usted.
- Escapa los datos del usuario al mostrarlos.
- Los registros ajenos a un supervisor deben responder 404.
- La Parte B no modifica archivos de Laravel.

## 6. Reglas de la API Express

- Utiliza Express 5 con `mysql2/promise`.
- Todas las consultas SQL deben utilizar parámetros `?`.
- No utilices ORM ni query builders.
- Están prohibidos Sequelize, Prisma, TypeORM y Knex.
- Respeta exactamente los endpoints del contrato de la API.
- No cambies métodos HTTP, rutas, parámetros, códigos ni estructuras JSON.
- Los campos adicionales del cuerpo que no estén en el contrato deben ignorarse.
- No devuelvas contraseñas, hashes ni identificadores internos prohibidos.
- El propietario de los registros se obtiene del token JWT.
- Nunca confíes en `vendedor_id` enviado por el cliente.
- Los registros ajenos o inexistentes responden 404.
- Las fechas recibidas sin zona horaria responden 422.
- Las fechas de salida utilizan ISO 8601 UTC.
- Los errores siempre se devuelven en JSON.
- Los errores generales utilizan `{ "error": "mensaje" }`.
- Los errores de validación 422 utilizan `{ "errores": { "campo": "mensaje" } }`.
- Los errores 500 no deben revelar información interna.
- En el detalle de una oportunidad, `historial[].usuario` es el nombre de quien hizo el cambio, como texto (`"Valeria López"`), nunca su id (enunciado §8 y R8).
- Un NIT compacto tiene entre 2 y 12 caracteres (enunciado R4; `clientes.nit` es VARCHAR(12)). Uno más largo responde 422 en `errores.nit`.
- Configura CORS exclusivamente mediante `process.env.CORS_ORIGIN`.
- Nunca utilices CORS abierto con `*`.

## 7. Seguridad y autenticación

- La API utiliza JWT con algoritmo HS256.
- `JWT_SECRET` se obtiene del archivo de entorno, nunca del código.
- Cada petición protegida debe validar el token.
- El middleware debe volver a consultar el usuario en la base de datos.
- Los usuarios desactivados no pueden acceder.
- Solo los vendedores pueden utilizar la API.
- Los administradores y supervisores utilizan Laravel.
- Nunca devuelvas datos de otro vendedor.
- No publiques archivos `.env`.
- No agregues secretos ni contraseñas al repositorio.
- La contraseña pública de la semilla (`Ventas2026`) solo puede aparecer en las semillas, en el README y en la colección de Postman (enunciado §11 y S2).
- Los archivos `.env.example` no contienen valores reales.
- Usa transacciones y bloqueos cuando existan operaciones concurrentes.

## 8. SPA del vendedor

- Utiliza HTML, Bootstrap 5.3 y JavaScript con módulos.
- No utilices frameworks como React, Vue o Angular.
- Emplea el patrón estado → render.
- Utiliza delegación de eventos.
- Escapa todo texto procedente de la API antes de insertarlo con `innerHTML`.
- Puede utilizarse `textContent` para mostrar texto de forma segura.
- LocalStorage guarda únicamente la información necesaria de la sesión.
- Las fechas se muestran utilizando `Intl.DateTimeFormat` y `America/Guatemala`.
- La interfaz debe manejar errores, validaciones, estados de carga y sesiones expiradas.
- La SPA nunca accede directamente a MySQL.

## 9. Regla propia del sector: control de stock

- `productos.stock` es `INT NULL`.
- `NULL` significa que no se controla inventario.
- Se aplica `CHECK (stock IS NULL OR stock >= 0)`.
- Antes de cambiar una oportunidad a `ganada` (solo permitido desde `negociacion`), debe comprobarse la disponibilidad de todos los productos con inventario controlado.
- Si todos tienen stock suficiente, la oportunidad pasa a `ganada` y se descuentan las cantidades.
- Si algún producto no tiene stock suficiente, se responde HTTP 409 y la oportunidad permanece en `negociacion`, sin cambios en el inventario ni en el historial.
- Si el cliente no desea continuar, la oportunidad se marca como `perdida` con un motivo de 1 a 255 caracteres. No existe un estado `cancelado`: las únicas etapas son las seis de R5.
- La validación y el descuento se ejecutan dentro de una misma transacción.
- Utiliza `SELECT ... FOR UPDATE`.
- Si el inventario es insuficiente, responde HTTP 409.
- Si ocurre un error, ejecuta rollback.
- Un intento fallido no descuenta inventario ni registra cambios de etapa.
- La regla propia no debe modificar el comportamiento exigido para `VerificacionSeeder`.

## 10. Desarrollo guiado por especificaciones

- Cada fase B1–B6 tendrá una especificación en `docs/specs/`.
- Las especificaciones de cada fase deben derivarse de docs/especificacion.md.
- No pueden contradecir la especificación principal.
- Cada criterio debe tener un identificador único.
- Utiliza criterios de aceptación verificables, preferiblemente en formato Dado/Cuando/Entonces.
- Cada prueba debe poder relacionarse con su criterio.
- Antes de implementar una fase, lee `CLAUDE.md`, `docs/plan.md` y su spec.
- Implementa únicamente los criterios aprobados de la fase.
- Si encuentras contradicciones, informa antes de modificar código.
- Antes de programar, presenta un plan de implementación.
- No crees archivos de documentación adicionales sin autorización.

## 11. Hooks de Claude Code

Cuando exista `.claude/settings.json`:

- Respeta los hooks configurados.
- No desactives hooks para evitar restricciones.
- Si una operación es bloqueada, explica el motivo y corrige el problema.
- No modifiques archivos `.env` mediante el agente.
- No modifiques archivos de la otra integrante.
- No instales dependencias prohibidas.
- No ejecutes operaciones destructivas sin autorización.
- Los hooks complementan las pruebas y la revisión manual.
- No afirmes que un hook funciona sin haberlo comprobado.

## 12. Subagentes

Cuando estén disponibles en `.claude/agents/`, utiliza los siguientes subagentes:

### revisor-contrato

- Verifica endpoints, métodos, rutas y respuestas.
- Compara el código contra `docs/especificacion.md`.
- Reporta incumplimientos con evidencia.
- No modifica archivos.

### revisor-seguridad

- Revisa las reglas S1–S8 del proyecto.
- Busca problemas de autenticación, autorización, SQL, CORS, XSS y concurrencia.
- Reporta hallazgos con archivo y línea.
- No modifica archivos.

### verificador-criterios

- Ejecuta las pruebas autorizadas de una spec.
- Compara resultados reales con los criterios de aceptación.
- No modifica código, migraciones ni configuraciones.
- No corrige problemas automáticamente.
- Reporta criterios cumplidos e incumplidos.

## 13. Pruebas y verificación

- Ejecuta las pruebas correspondientes al terminar cada fase.
- Utiliza `node:test` para las pruebas automatizadas de la API.
- Comprueba los endpoints con Postman.
- Verifica códigos HTTP y estructuras JSON.
- Incluye pruebas de autenticación, permisos, validaciones y concurrencia.
- No modifiques la semilla oficial para conseguir resultados favorables.
- No afirmes que una prueba pasó sin ejecutarla.
- Registra los resultados en `docs/verificacion.md`: la matriz que une cada criterio con su evidencia, las pruebas de seguridad y concurrencia y las cifras de control (enunciado P3).
- La colección de Postman se entrega en `docs/api.postman_collection.json`, con al menos una petición por endpoint, los errores principales y la prueba de la regla propia (enunciado A8).
- Las pruebas que cambien datos deben ejecutarse en una base de pruebas que pueda restablecerse.

## 14. Cifras oficiales de verificación

Con únicamente `VerificacionSeeder`, Valeria debe obtener en octubre de 2026:

- Ventas: 2.
- Total vendido: Q9,250.00.
- Pronóstico: Q2,512.88.
- Cartera: 3 de 10 clientes.

Las cifras deben coincidir entre las respuestas de la API y los reportes correspondientes del panel.

## 15. Git y control de versiones

- Utiliza ramas específicas para cada tarea.
- Realiza commits pequeños.
- Sigue Conventional Commits en español.
- No utilices `git push --force` sin autorización.
- No agregues archivos `.env` ni secretos al repositorio.
- Antes de confirmar cambios, revisa `git diff`.
- No modifiques trabajo de la otra integrante sin coordinación.

## 16. Bitácora de inteligencia artificial

- Registra errores reales del agente.
- El enunciado (P5) pide la bitácora dentro de `docs/verificacion.md`. Mientras tanto se lleva en `docs/bitacora-ia.md`; antes de la entrega debe trasladarse o enlazarse desde `docs/verificacion.md`, con al menos tres casos y su commit de corrección.
- Documenta qué propuso, por qué era incorrecto, cómo se detectó y qué corrección se realizó.
- Incluye el commit de corrección cuando exista.
- Los bloqueos de hooks pueden documentarse como evidencia si corresponden a problemas reales.
- No inventes errores ni resultados de pruebas.

## 17. Forma de trabajar

- Lee los documentos necesarios antes de iniciar cada fase.
- Presenta el plan antes de realizar cambios importantes.
- Trabaja únicamente dentro del alcance autorizado.
- No instales paquetes nuevos sin autorización.
- No elimines archivos existentes innecesariamente.
- No modifiques las reglas compartidas sin acuerdo.
- Al finalizar cada tarea, informa:
  - Archivos creados o modificados.
  - Funcionalidades implementadas.
  - Criterios de aceptación cumplidos y pendientes.
  - Pruebas ejecutadas y sus resultados.
  - Problemas encontrados y dependencias pendientes.

Si una tarea depende de la Parte A y todavía no está disponible, informa la dependencia y continúa únicamente con el trabajo independiente permitido.
