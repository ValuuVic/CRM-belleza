# B6 — Calidad, Postman, concurrencia y verificación final

**Proyecto:** CRM Belleza  
**Responsable:** Parte B  
**Rama:** `b/calidad`  
**Contrato general:** `docs/especificacion.md` (`spec-v1`)  
**Requisitos principales:** F6, A8, S7, S8, P3 y P5.  
**Requisitos complementarios:** A7, R1, R2, R3, R5, R8, S1–S6 y pruebas pendientes de B2–B5.

## 1. Objetivo

Verificar la calidad, seguridad, compatibilidad y documentación de la API Express y la SPA del CRM Belleza.

La fase debe consolidar las pruebas automatizadas, preparar una colección de Postman, ejecutar pruebas de concurrencia y comprobar que la interfaz cumpla los requisitos de calidad del enunciado oficial.

También debe preparar las evidencias correspondientes a la Parte B para la documentación final del proyecto.

No se considerarán aprobadas las pruebas reales de integración que dependan de las migraciones, semillas y funcionalidades de Laravel mientras estas no estén disponibles.

## 2. Fuera de alcance

- Crear nuevas funcionalidades comerciales.
- Rehacer B1, B2, B3, B4 o B5.
- Implementar el panel Laravel.
- Crear o modificar migraciones.
- Crear VerificacionSeeder o SectorSeeder.
- Implementar las funciones de administrador y supervisor.
- Cambiar unilateralmente `docs/especificacion.md`.
- Modificar credenciales, secretos o archivos `.env`.
- Ejecutar operaciones destructivas sobre una base de datos compartida.

Se permiten correcciones de errores reales detectados durante la verificación dentro del código de la Parte B.

## 3. Calidad de la SPA — F6

### B6-01 — Patrón estado y renderización

**Dadas** las vistas del vendedor, **cuando** cambia el estado de la aplicación, **entonces** la interfaz se actualiza utilizando el patrón estado → render establecido en el proyecto.

Se debe conservar la delegación de eventos y evitar introducir manejadores duplicados.

### B6-02 — Indicadores de carga

**Dada** una petición HTTP en curso, **cuando** el vendedor espera la respuesta, **entonces** la SPA muestra un indicador de carga visible y lo retira al finalizar.

Debe comprobarse en cartera, oportunidades, actividades y demás vistas que realicen peticiones.

### B6-03 — API no disponible

**Dado** que la API Express no está disponible, **cuando** el usuario intenta consultar información, **entonces** la SPA muestra un mensaje que explique el error de conexión y no una pantalla vacía.

### B6-04 — Diseño responsive

**Dadas** las vistas de login, cartera, oportunidades, detalle de oportunidad y actividades, **cuando** se visualizan en un dispositivo de 375 píxeles de ancho, **entonces** no presentan desplazamiento horizontal ni controles importantes cortados.

### B6-05 — Recuperación ante errores

**Dada** una operación que falla, **cuando** la API devuelve un error controlado, **entonces** la SPA informa al usuario y conserva los datos del formulario cuando corresponde.

No debe mostrar información sensible ni errores internos del servidor.

## 4. Seguridad visual — S7

### B6-06 — Escapado de contenido externo

**Dado** un cliente cuyo nombre contiene:

```text
<img src=x onerror=alert(1)>
```

**Cuando** el nombre aparece en cualquier vista de la SPA, **entonces** se presenta como texto y no se ejecuta código JavaScript.

El mismo principio aplica a nombres de productos, descripciones, títulos, mensajes y cualquier texto procedente de la API.

### B6-07 — Revisión de renderizado HTML

**Dado** el código de `frontend/`, **cuando** se revisan las operaciones que insertan contenido mediante `innerHTML`, **entonces** todo texto externo debe pasar por una función de escapado segura o insertarse utilizando `textContent`.

La revisión debe identificar archivos y líneas de cualquier incumplimiento.

### B6-08 — Seguridad de sesión

**Dada** una sesión de vendedor, **cuando** se inspecciona el almacenamiento del navegador, **entonces** solo se conserva la información necesaria de la sesión, nunca la contraseña.

Ante HTTP 401 en una petición protegida, la sesión local debe eliminarse y el vendedor debe regresar al login.

### B6-09 — Error 403 en el login

**Dadas** credenciales correctas de administrador o supervisor, **cuando** intentan iniciar sesión mediante la SPA de vendedores y la API responde HTTP 403, **entonces** la interfaz presenta el mensaje correspondiente y no almacena un token.

## 5. Colección Postman — A8

### B6-10 — Colección completa

**Dado** el contrato oficial de la API, **cuando** se abre `docs/api.postman_collection.json` en Postman, **entonces** la colección contiene al menos una petición por cada endpoint obligatorio.

Debe incluir los endpoints de:

- Autenticación.
- Productos.
- Clientes y clientes disponibles.
- Oportunidades y líneas de productos.
- Actividades.
- Resumen mensual, cuya implementación corresponde a la Parte A.

Las peticiones del resumen mensual se deben incluir en la colección, pero no se debe implementar el endpoint de la Parte A desde B6.

### B6-11 — Variables de colección

**Dada** la colección de Postman, **cuando** se configura el entorno local, **entonces** las peticiones pueden reutilizar la URL base y el token de autenticación sin modificar manualmente cada solicitud.

No almacenar secretos reales ni contraseñas privadas dentro del repositorio.

### B6-12 — Casos de errores

**Dada** la colección, **cuando** se revisan sus ejemplos, **entonces** contiene pruebas de los errores principales del contrato:

- 400: solicitud mal formada.
- 401: autenticación inválida.
- 403: rol no autorizado en login.
- 404: recurso inexistente o ajeno.
- 409: conflicto de negocio.
- 422: error de validación.

Las respuestas esperadas deben coincidir con los códigos establecidos en el enunciado.

### B6-13 — Regla propia de stock

**Dada** una oportunidad en negociación, **cuando** se ejecutan los casos RP-1, RP-2 y RP-3 mediante Postman, **entonces** se comprueba:

- Stock insuficiente: HTTP 409 y ninguna modificación.
- Stock suficiente: la oportunidad se gana y el inventario se descuenta.
- Stock `NULL`: la venta puede completarse y ese valor permanece `NULL`.

Las operaciones que alteran datos deben ejecutarse únicamente sobre una base de pruebas autorizada y restablecible.

## 6. Pruebas de concurrencia — S8

### B6-14 — Toma simultánea de clientes

**Dado** un cliente disponible, **cuando** se ejecutan diez peticiones simultáneas para tomarlo, **entonces** exactamente una consigue HTTP 200 y las otras nueve reciben HTTP 409.

El cliente debe quedar asignado a un solo vendedor.

### B6-15 — Límite de cartera

**Dado** un vendedor con nueve clientes, **cuando** realiza tres operaciones simultáneas de creación válidas, **entonces** exactamente una recibe HTTP 201 y dos reciben HTTP 409.

La cartera termina con diez clientes.

### B6-16 — NIT duplicado

**Dadas** dos creaciones simultáneas con el mismo NIT válido y datos restantes distintos, **cuando** se ejecutan, **entonces** una creación recibe HTTP 201 y la otra HTTP 409.

No deben quedar dos registros con el mismo NIT normalizado.

### B6-17 — Cambio simultáneo de etapa

**Dada** una oportunidad abierta, **cuando** dos peticiones intentan realizar el mismo cambio de etapa simultáneamente, **entonces** solo una modificación resulta exitosa y se registra un único evento nuevo en el historial.

El código del rechazo debe respetar la decisión de transición establecida en B4.

### B6-18 — Competencia por inventario

**Dadas** dos oportunidades que necesitan la última unidad de un mismo producto, **cuando** ambas intentan ganarse simultáneamente, **entonces** exactamente una se completa.

La otra recibe HTTP 409 por stock insuficiente. El inventario nunca debe ser negativo.

### B6-19 — Script reproducible

**Dado** el archivo `api/scripts/prueba-concurrencia.js`, **cuando** se ejecuta contra un entorno de pruebas preparado, **entonces** envía peticiones HTTP reales mediante `fetch` y `Promise.all`, registra los códigos obtenidos y comprueba los resultados esperados.

El script no debe conectarse directamente a MySQL ni ejecutar migraciones o comandos destructivos.

Debe permitir configurar la URL de la API y utilizar credenciales de pruebas autorizadas.

No debe realizar automáticamente operaciones de escritura sobre la base compartida o de producción.

## 7. Pruebas de integración pendientes

### B6-20 — Revocación real del JWT

**Dado** un vendedor autenticado, **cuando** su cuenta se desactiva en MySQL, **entonces** su siguiente petición protegida responde HTTP 401.

La prueba real debe ejecutarse cuando existan las migraciones y `VerificacionSeeder`, en un entorno donde el estado de la cuenta pueda restaurarse.

### B6-21 — Integración entre Laravel y Express

**Dado** un cliente asignado desde el panel Laravel, **cuando** el vendedor consulta su cartera en la SPA, **entonces** visualiza ese cliente.

**Dada** una oportunidad ganada desde la SPA, **cuando** se consulta el reporte mensual en Laravel, **entonces** la venta aparece con el importe correcto.

Estos escenarios requieren la Parte A terminada.

### B6-22 — Semilla oficial y cifras de control

**Dado** `VerificacionSeeder` recién cargado, **cuando** se ejecutan las consultas y reportes de verificación, **entonces** sus resultados coinciden con las cifras de control del enunciado.

Para Valeria López en octubre de 2026 se esperan:

- 2 ventas ganadas.
- Q9,250.00 de total vendido.
- Q2,512.88 de pronóstico.
- 3 de 10 clientes en cartera.

La comprobación del resumen mensual depende del endpoint y los reportes correspondientes a la Parte A.

## 8. Documentación — A8, P3 y P5

### B6-23 — README

**Dado** el repositorio del proyecto, **cuando** se consulta `README.md`, **entonces** contiene:

- Descripción del CRM Belleza.
- Tecnologías utilizadas.
- Estructura general del proyecto.
- Tabla de endpoints.
- Variables de entorno necesarias, sin secretos.
- Pasos exactos para instalar y ejecutar MySQL, Laravel, Express y la SPA.
- Instrucciones para preparar las semillas oficiales.
- Pasos para ejecutar pruebas de API, SPA y concurrencia.
- Forma de importar la colección de Postman.

Las instrucciones de Laravel deben coordinarse y verificarse con la Parte A. No se deben inventar comandos que no hayan sido comprobados.

### B6-24 — Matriz de verificación

**Dada** la documentación de los criterios de aceptación, **cuando** se complete `docs/verificacion.md`, **entonces** cada criterio debe relacionarse con:

- Requisito al que pertenece.
- Prueba ejecutada.
- Resultado real.
- Evidencia disponible.
- Estado: aprobado, fallido o pendiente.

Las pruebas omitidas por falta de I1 deben aparecer como pendientes, nunca como aprobadas.

La edición final de este archivo se realizará cuando ambas integrantes acuerden consolidar la verificación.

### B6-25 — Bitácora de errores de IA

**Dado** el historial del desarrollo asistido por IA, **cuando** se complete la bitácora exigida por P5 en `docs/verificacion.md`, **entonces** se documentan al menos tres errores reales del agente.

Cada caso debe incluir:

- Qué propuso incorrectamente la IA.
- Cómo se detectó el problema.
- Qué se corrigió.
- El commit que contiene la corrección.

La información se obtendrá de los errores ya registrados durante B1–B5, sin inventar casos.

## 9. Revisión final de seguridad

### B6-26 — Autorización por rol

**Dadas** las credenciales de los tres roles oficiales, **cuando** se intenta iniciar sesión en la API Express, **entonces** únicamente los vendedores activos reciben un token.

Administrador y supervisor deben recibir HTTP 403 con credenciales correctas.

La entrada al panel Laravel se verificará por separado con la Parte A.

### B6-27 — Protección de información

**Dado** un vendedor autenticado, **cuando** intenta consultar o modificar información de otro vendedor, **entonces** las operaciones protegidas responden conforme a R2 y S5, sin exponer información privada.

### B6-28 — Seguridad de la configuración

**Dado** el repositorio, **cuando** se inspecciona su configuración, **entonces** no contiene archivos `.env` con secretos reales, claves JWT reales ni credenciales privadas publicadas.

Se debe revisar el hallazgo previo de `MYSQL_ROOT_PASSWORD` y `MYSQL_PASSWORD` en `.env.example`, coordinando cualquier corrección con la Parte A.

## 10. Metodología de verificación

La implementación de B6 deberá utilizar:

- `node:test` para las pruebas automatizadas.
- Postman para verificar el contrato HTTP.
- Pruebas de interfaz en el navegador.
- Pruebas de concurrencia mediante peticiones HTTP.
- `revisor-contrato`.
- `revisor-seguridad`.
- `verificador-criterios`, cuando sea viable ejecutarlo contra el entorno correspondiente.

Los resultados deben distinguir claramente las pruebas simuladas de las verificaciones reales contra MySQL.

## 11. Archivos previstos

### Nuevos

- `docs/api.postman_collection.json`.
- `api/scripts/prueba-concurrencia.js`.
- Pruebas de regresión e integración que resulten necesarias.

### Modificados cuando corresponda

- `README.md`.
- Archivos de `frontend/` que presenten defectos reales de calidad o seguridad.
- Pruebas de API y SPA incompletas.
- Documentación de evidencias.

No modificar archivos compartidos de la Parte A sin autorización.

## 12. Dependencias y riesgos

### Dependencias pendientes

- Migraciones MySQL de la Parte A.
- `VerificacionSeeder` y `SectorSeeder`.
- Control de roles en Laravel.
- Panel de administrador y supervisor.
- Reportes mensuales.
- Base de pruebas restablecible para las operaciones de escritura.

### Riesgos

- Las pruebas con datos simulados pueden ocultar problemas de SQL o concurrencia real.
- Las pruebas de Postman pueden modificar la semilla si se ejecutan sin un entorno controlado.
- Las diferencias de zona horaria pueden alterar las cifras mensuales.
- Los cambios de seguridad en archivos compartidos requieren coordinación.
- No debe declararse completo el sistema mientras Laravel siga sin implementar.

## 13. Condiciones de finalización

B6 podrá considerarse implementada cuando:

- Se cubran B6-01 a B6-28.
- La SPA supere las pruebas de calidad disponibles.
- Exista una colección Postman conforme al contrato.
- El script de concurrencia esté preparado.
- El README documente correctamente la ejecución.
- Pasen las pruebas automatizadas correspondientes.
- Los subagentes revisen los cambios.
- Se registren los resultados y pendientes con evidencia verificable.

La integración real y la aprobación definitiva del proyecto requieren las migraciones, semillas, panel y reportes de la Parte A.

Las pruebas no ejecutadas deben permanecer expresamente pendientes.