# A6 — Resumen mensual para la API y la SPA

**Proyecto:** CRM Belleza  
**Responsable:** Parte A  
**Rama:** `a/resumen`  
**Estado:** Propuesta (decisiones DA6-1 a DA6-6; preguntas abiertas P1 y P2)  
**Referencia:** `docs/especificacion.md` (`spec-v1.1`) A6, F5, §8.5, §8.6, §8.7, R7, R8, D6, CA-12, criterios del núcleo A6-01, A6-02 y F5-01; `docs/plan.md` A6  
**Dependencias:**
- **Cifras:** se reutiliza **sin cambios** la definición de cifras de `docs/specs/A5-equipos-reportes.md` §5: el rango del mes (§5.1), la probabilidad (§5.2), C1 a C4 (§5.3) y las cifras de control (§5.4).
- **Infraestructura de la Parte B:** `crearAutenticacion`, `exigirConsulta`, el manejador de errores, `api.js`, `estado.js` y el enrutador de `frontend/js/app.js`.

## 1. Objetivo

Implementar `GET /api/reportes/resumen` según el contrato §8.5 y la vista `#/resumen` de la SPA (F5), con las mismas cifras que el panel.

## 2. Alcance

### Funcionalidades incluidas

- `api/src/rutas/reportes.js`: `crearRutasReportes({ pool })` con `GET /resumen`. Calcula C1 a C4 de A5 §5.3 con el alcance de vendedor, el del token, en **una sola sentencia SQL** parametrizada.
- Montaje en `api/src/app.js`: `app.use('/api/reportes', crearRutasReportes({ pool }))`, en el lugar reservado (P2).
- `frontend/js/vistas/resumen.js` (`renderResumen`) y `frontend/js/acciones-resumen.js` (`cargarResumen`, `cambiarMes`), con selector de mes, estados de carga, error y reintento, y montos en quetzales.
- Pruebas `node:test`: `api/test/reportes.test.js` y `frontend/test/resumen.test.js`.

### Fuera del alcance

- Resúmenes de equipo o de empresa en la API: la API es solo para vendedores (R1).
- Cambios en otras rutas de la API o en otras vistas de la SPA.

## 3. Restricciones técnicas

- `mysql2/promise` con parámetros `?`; sin ORM ni query builders (CLAUDE.md §6).
- Una sola sentencia con subconsultas, para que las cuatro cifras salgan de la misma instantánea. No necesita transacción porque es de solo lectura.
- El vendedor sale del token (`req.vendedor.id`), nunca de la consulta ni del cuerpo.
- La respuesta tiene exactamente los campos de §8.5. `total` y `pronostico` son números (`decimalNumbers: true` y `Number()`); nunca texto. No incluye `vendedor_id` ni otros ids internos (R8).
- Los errores siguen §8.7: `{ "error": "…" }` en 400 y 401, y los 500 no revelan detalles.
- SPA: patrón estado → render, delegación de eventos, `escaparHtml` y `formatearQuetzales`. El mes por omisión y la etiqueta del mes se calculan con `Intl.DateTimeFormat` y `America/Guatemala`, sin depender de la zona de la computadora.

## 4. Decisiones de esta fase (propuestas)

| Id | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| DA6-1 | `mes` es opcional. Si se envía, debe cumplir `^\d{4}-(0[1-9]\|1[0-2])$` con un año de 1000 a 9999; si no, 400 con `{ "error": "El mes debe tener el formato AAAA-MM" }` | 422 | Contrato §7 (tabla) y A6-02 del núcleo: `mes=2026-13` → 400 |
| DA6-2 | Sin `mes`, se usa el mes actual de Guatemala, calculado con `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' })` sobre `new Date()`. La respuesta trae el `mes` usado | Mes UTC del servidor | A6-02: «mes actual de Guatemala» |
| DA6-3 | Cualquier otro parámetro, o `mes` repetido, da 400 con `exigirConsulta(req, ['mes'])` | Ignorarlo | D6 |
| DA6-4 | El rango del mes y la probabilidad se calculan con las mismas reglas de A5 §5.1 y §5.2; la probabilidad se toma de `PROBABILIDAD` (`embudo.js`) | Una tabla propia | Una sola definición |
| DA6-5 | La vista usa `<input type="month">`, con el mes actual de Guatemala como valor inicial. Al cambiarlo, se pide de nuevo el resumen y se descarta una respuesta que llegue para un mes que ya no está elegido | Botones «anterior» y «siguiente» | F5: «mes seleccionado» |
| DA6-6 | La vista muestra «octubre de 2026» (etiqueta con `Intl`, mes largo), las ventas, el total y el pronóstico con `formatearQuetzales` («Q9,250.00» y «Q2,512.88») y la cartera con `formatearCartera` («3 de 10») | — | F5-01 |

## 5. Contrato del endpoint

`GET /api/reportes/resumen?mes=AAAA-MM`, con `Authorization: Bearer <jwt de vendedor>`.

| Caso | Código | Cuerpo |
|---|---|---|
| Correcto | 200 | `{ "mes": "2026-10", "ventas": 2, "total": 9250, "pronostico": 2512.88, "cartera": { "clientes": 3, "maximo": 10 } }` |
| `mes` inválido, parámetro desconocido o repetido | 400 | `{ "error": "…" }` |
| Sin token, token inválido o cuenta desactivada | 401 | `{ "error": "…" }` (middleware de la Parte B) |

SQL, con las consultas C1 a C4 de A5 §5.3 en una sola sentencia y alcance de vendedor `o.vendedor_id = ?`:

    SELECT
      (C1 con {alcance} = o.vendedor_id = ?) AS ventas,
      (C2 …)                                 AS total,
      (C3 …)                                 AS pronostico,
      (C4)                                   AS clientes

Parámetros: `[inicio, fin, id, inicio, fin, id, id, id]`.

## 6. Criterios de aceptación

Los criterios A6-01 y A6-02 son los del núcleo, con el mismo número.

#### A6-01 — Resumen del mes (núcleo A6-01, CA-12)

**Dada** la semilla de verificación, **cuando** Valeria consulta `GET /api/reportes/resumen?mes=2026-10`, **entonces** recibe 200 con exactamente `{ "mes": "2026-10", "ventas": 2, "total": 9250, "pronostico": 2512.88, "cartera": { "clientes": 3, "maximo": 10 } }`, y `typeof total` y `typeof pronostico` son `number`.

#### A6-02 — Mes por omisión y mes inválido (núcleo A6-02)

**Dado** un vendedor, **cuando** consulta sin `mes`, **entonces** recibe el mes actual de Guatemala; la prueba fija el reloj en 2026-11-01 03:30 UTC y espera `"mes": "2026-10"`. **Cuando** consulta con `mes=2026-13`, `mes=2026-1`, `mes=26-10` o `mes=` (vacío), **entonces** recibe 400 con `{ "error": … }`.

#### A6-03 — Otros meses y vendedores (§13.3)

**Dada** la semilla:
- **cuando** Valeria pide `mes=2026-11`, **entonces** recibe 1 venta, 3600 y 2512.88, con cartera 3;
- **cuando** Diego pide `2026-10`, **entonces** recibe 1, 6000, 112.5 y 2;
- **cuando** Carlos pide `2026-10`, **entonces** recibe 1, 7200, 4125.75 y 9;
- **cuando** Valeria pide `2026-09`, **entonces** recibe 0, 0 y 2512.88: el pronóstico no depende del mes.

#### A6-04 — Solo los datos del vendedor del token (R2, R8)

**Dada** Valeria, **cuando** envía `?vendedor_id=6` o `?mes=2026-10&mes=2026-11`, **entonces** recibe 400 (D6). La respuesta normal no contiene `vendedor_id`, `id` ni datos de otro vendedor.

#### A6-05 — Autenticación (CA-03)

**Sin** token o con un token inválido, **cuando** se pide el resumen, **entonces** responde 401. **Dada** Valeria desactivada en el panel, **cuando** usa su token anterior, **entonces** responde 401.

#### A6-06 — Una venta nueva se refleja (CA-16)

**Dada** la op. 4 de Valeria en negociación, **cuando** la gana con `PATCH /api/oportunidades/4/etapa` y pide el resumen del mes de su `fecha_cierre` en Guatemala, **entonces** las ventas suben en 1 y el total en 2750.5, y el pronóstico baja en 2062.88 (de 2512.88 a 450). El reporte del panel (A5-15) muestra las mismas cifras.

#### A6-07 — Paridad con el panel (A5 §5)

**Dados** los alcances de vendedor de A5 §5.4, **cuando** se comparan las respuestas de la API con las cifras del panel para 2026-10 y 2026-11, **entonces** son iguales. La prueba de integración de la API usa la tabla de §5.4 como referencia común.

#### A6-08 — Errores sin detalles internos

**Dado** un fallo de la base de datos durante el resumen (simulado en la prueba), **cuando** responde, **entonces** es 500 con el mensaje genérico de la Parte B, sin SQL, sin pila de llamadas y sin datos de conexión.

### SPA (F5)

#### A6-09 — Vista del resumen (núcleo F5-01)

**Dada** Valeria con sesión en la SPA, **cuando** abre `#/resumen` y elige octubre de 2026, **entonces** ve «octubre de 2026», 2 ventas, «Q9,250.00», «Q2,512.88» y «3 de 10». La prueba corre con la variable `TZ` del proceso en `Asia/Tokyo` y en `America/New_York`, y obtiene lo mismo.

#### A6-10 — Mes inicial de Guatemala

**Dada** la hora 2026-11-01 03:30 UTC (31 de octubre a las 21:30 en Guatemala), **cuando** se abre `#/resumen`, **entonces** el selector muestra 2026-10 y se pide `?mes=2026-10`.

#### A6-11 — Carga, error y reintento (F6)

**Mientras** llega la respuesta, la vista muestra «Cargando…» y deshabilita el selector. Con un error de red o un 500, muestra el mensaje y un botón «Reintentar». Con un 401, `api.js` cierra la sesión y vuelve al login. Una respuesta de un mes que ya no está elegido se descarta (DA6-5).

#### A6-12 — Texto escapado y navegación

**Dada** cualquier respuesta, **cuando** se dibuja la vista, **entonces** el texto pasa por `escaparHtml`. El enlace «Resumen» de la navegación marca la ruta activa, y la vista se ve sin desplazamiento horizontal a 375 px (CA-14).

## 7. Preguntas abiertas

| Id | Pregunta | Recomendación | Criterio |
|---|---|---|---|
| P1 | La paridad entre panel y API: ¿basta con que las dos pruebas usen la misma tabla de referencia (A5 §5.4), o se agrega una prueba de punta a punta que compare la API con el panel en vivo? | Las dos cosas: las pruebas automáticas con la tabla, más una comprobación de punta a punta registrada en `docs/verificacion.md` | A6-07 |
| P2 | Hay archivos de la Parte B que deben cambiar para integrar A6: una línea en `api/src/app.js` (montar `/api/reportes`) y, en la SPA, `frontend/js/app.js` (render y carga de `#/resumen`, eventos del selector), `estado.js` (`resumenInicial()`) y `api.js` (`obtenerResumen(mes)`). ¿Los cambia la Parte A con autorización de la Parte B, o los hace la Parte B? | La Parte A los cambia, con la autorización explícita de la Parte B y en commits separados que tocan solo esas líneas | A6-09 a A6-12 |

## 8. Archivos previstos

- Crear (reservados a la Parte A):
  - `api/src/rutas/reportes.js`;
  - `frontend/js/vistas/resumen.js`;
  - `frontend/js/acciones-resumen.js`;
  - `api/test/reportes.test.js`;
  - `frontend/test/resumen.test.js`.
- Editar, según P2: `api/src/app.js` (una línea), `frontend/js/app.js`, `frontend/js/estado.js` y `frontend/js/api.js`.

## 9. Estrategia de pruebas

- **API (`node:test`):**
  - Pruebas unitarias del mes (DA6-1, DA6-2) con el reloj fijado.
  - Pruebas de integración contra `crm_belleza_test` con `npm run test:bd`, para A6-01 a A6-07.
  - A6-08 con el `pool` inyectado que falla, como en las pruebas de la Parte B.
- **SPA (`node:test`):** render y acciones con `TZ` distinta (A6-09, A6-10) y respuestas simuladas para carga, error, 401 y respuesta vieja (A6-11).
- **De punta a punta:** el panel, la API y la SPA sobre `crm_belleza_test`; ganar la op. 4 y comparar el panel (A5-15) con la API (A6-06). Las cifras se registran en `docs/verificacion.md`.

## 10. Condiciones de finalización

A6 se considerará terminada cuando:

- Se cumplan A6-01 a A6-12, con P1 y P2 decididas y la autorización de la Parte B para los archivos compartidos.
- Las cifras de A5 §5.4 coincidan en el panel, la API y la SPA.
- `npm test` y `npm run test:bd` de `api/`, y `node --test frontend/test/*.test.js`, pasen sin fallos, con los resultados registrados.
