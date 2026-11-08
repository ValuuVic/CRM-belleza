# B1 — Base de la API Express

**Proyecto:** CRM Belleza  
**Responsable:** Parte B  
**Rama:** `b/base-api`  
**Estado:** Pendiente de implementación  
**Referencia:** `docs/especificacion.md` y `docs/plan.md`

## 1. Objetivo

Preparar la infraestructura de la API REST utilizando Node.js 24, Express 5 y MySQL 8.4.

Esta fase incluye la configuración del servidor, conexión a la base de datos, CORS, manejo de errores, validaciones compartidas y pruebas automatizadas.

No incluye la implementación del login, clientes, oportunidades, actividades ni reportes.

## 2. Alcance

### Funcionalidades incluidas

- Crear y configurar el servidor Express 5.
- Configurar el pool de conexiones con mysql2/promise.
- Preparar una función reutilizable para transacciones.
- Configurar CORS mediante `CORS_ORIGIN`.
- Implementar errores HTTP reutilizables.
- Implementar el manejo global de errores.
- Normalizar y validar NIT guatemaltecos.
- Normalizar y validar teléfonos.
- Validar fechas con zona horaria.
- Preparar pruebas automatizadas con `node:test`.

### Fuera del alcance

- Autenticación JWT.
- Endpoints de clientes.
- Endpoints de oportunidades.
- Endpoints de actividades.
- Reportes mensuales.
- Modificaciones de Laravel.
- Migraciones y seeders.
- Modificaciones del esquema MySQL.

## 3. Restricciones técnicas

- Utilizar Express 5.
- Utilizar mysql2/promise para MySQL.
- Escribir SQL parametrizado con `?`.
- No utilizar ORM ni query builders.
- No crear ni modificar tablas desde Express.
- No incorporar secretos al código fuente.
- No modificar archivos `.env` mediante el agente.
- No implementar funcionalidades de fases posteriores.
- Respetar los requisitos de seguridad aplicables.

## 4. Criterios de aceptación

### B1-01 — Servidor Express

**Dado** un entorno Node.js correctamente configurado, **cuando** se inicia el servidor, **entonces** Express escucha en el puerto configurado sin errores.

### B1-02 — Conexión MySQL

**Dadas** credenciales válidas de MySQL, **cuando** se solicita una conexión desde el pool, **entonces** se establece correctamente.

Si MySQL no está disponible, el sistema debe gestionar el error sin exponer credenciales.

### B1-03 — CORS

**Dado** un origen configurado mediante `CORS_ORIGIN`, **cuando** una petición proviene de ese origen, **entonces** se aplica la configuración CORS correspondiente.

No debe utilizarse un origen abierto `*`.

### B1-04 — Errores HTTP

**Dada** una petición inválida, **cuando** ocurre un error controlado, **entonces** la API responde con el código HTTP correspondiente y el formato JSON definido en el contrato.

### B1-05 — Errores inesperados

**Dado** un error interno, **cuando** se ejecuta el manejador global, **entonces** devuelve HTTP 500 sin revelar información sensible.

### B1-06 — Validación de NIT

**Dado** un NIT guatemalteco, **cuando** se procesa, **entonces** se normaliza y valida su dígito verificador.

El valor `CF` debe representarse internamente como NULL.

Un NIT inválido debe rechazarse.

### B1-07 — Validación de teléfono

**Dado** un teléfono guatemalteco, **cuando** se procesa, **entonces** se eliminan separadores y el prefijo permitido, dejando ocho dígitos válidos.

Los teléfonos inválidos deben rechazarse.

### B1-08 — Validación de fechas

**Dada** una fecha con zona horaria explícita, **cuando** se procesa, **entonces** puede normalizarse a UTC.

Una fecha ambigua o sin la zona requerida debe rechazarse.

### B1-09 — Transacciones

**Dada** una operación que utiliza una conexión transaccional, **cuando** todas las operaciones terminan correctamente, **entonces** se confirma la transacción.

Si ocurre un error, debe revertirse y liberar la conexión.

### B1-10 — Pruebas automatizadas

**Dadas** las funciones implementadas, **cuando** se ejecuta `node --test`, **entonces** las pruebas verifican los casos válidos e inválidos correspondientes.

## 5. Archivos previstos

Los nombres concretos deberán ajustarse a la estructura existente en `api/`, evitando duplicaciones.

Archivos esperados:

- `api/src/server.js`
- `api/src/app.js`
- `api/src/config/db.js`
- Utilidades compartidas de errores, validación y transacciones.
- Archivos de pruebas correspondientes.

No crear archivos adicionales que no sean necesarios.

## 6. Estrategia de pruebas

Se comprobará:

- Sintaxis de los archivos JavaScript.
- Inicio del servidor.
- Configuración de CORS.
- Errores HTTP y JSON.
- Casos válidos e inválidos de NIT.
- Casos válidos e inválidos de teléfono.
- Fechas con y sin zona horaria.
- Confirmación y reversión de transacciones mediante pruebas adecuadas.

Las pruebas que requieran MySQL se ejecutarán cuando el servicio esté disponible.

## 7. Condiciones de finalización

B1 se considerará terminada cuando:

- El código cumpla los criterios B1-01 a B1-10.
- Las pruebas correspondientes se ejecuten satisfactoriamente.
- Los hooks no reporten bloqueos pendientes.
- Los subagentes revisen los requisitos aplicables.
- No se hayan modificado archivos de la Parte A.
- Se hayan registrado los resultados reales de las verificaciones.

La implementación debe conservar el contrato de la especificación principal.