# A5 — Equipos, oportunidades y reportes del panel

**Proyecto:** CRM Belleza  
**Responsable:** Parte A  
**Ramas:** `a/equipos`, `a/reportes`  
**Estado:** Propuesta (decisiones DA5-1 a DA5-7; preguntas abiertas P1 a P4)  
**Referencia:** `docs/especificacion.md` (`spec-v1.1`) §3.1, §3.2, R2, R5, R6, R7, L5, L6, L7, §13.3, CA-12, CA-16; `docs/plan.md` A5  
**Dependencias:** A1 (esquema y semillas), A2 (middlewares `cuenta.vigente` y `rol`), A4 (scope `Cliente::visiblePara`, alcance de equipo de DA4-1).  
**La usa:** A6 (`docs/specs/A6-resumen.md`) reutiliza la definición de cifras de la §5.

## 1. Objetivo

Dar al administrador y al supervisor, en solo lectura y dentro de su alcance:
- la página del equipo, con la cartera y las ventas del mes de cada vendedor;
- las oportunidades, con filtros por etapa y vendedor;
- el reporte del mes, con las ventas, el total y el pronóstico, desglosados por vendedor y por producto.

Todo se calcula con **una única definición** de las cifras (§5), que la API reutiliza en A6.

## 2. Alcance

### Funcionalidades incluidas

- Definición única de ventas, total vendido, pronóstico y cartera (§5), con el mes de Guatemala por rango UTC y el redondeo después de sumar.
- Página «Equipo»: cada vendedor con su estado, su cartera «n de 10» y sus ventas, total y pronóstico del mes elegido.
- Oportunidades de solo lectura: lista con filtros por etapa y vendedor; total y fecha de cierre en hora de Guatemala; detalle con líneas e historial (P4).
- Reporte del mes: totales del alcance, desglose por vendedor y desglose por producto, con filtro de mes y de vendedor.
- Pruebas de cada criterio contra las cifras de control de §13.3.

### Fuera del alcance

- Modificar oportunidades desde el panel: L6 las hace de solo lectura.
- `GET /api/reportes/resumen` y la vista de la SPA (A6).
- Cambios de esquema (ver P1), `api/` y `frontend/`.
- Exportar a PDF o Excel.

## 3. Restricciones técnicas

- Eloquent o constructor de consultas (R7: «Eloquent o el constructor de consultas en el panel»). Los cálculos se hacen en MySQL, nunca sumando en PHP. Solo se pasan como datos el rango, los ids y las etapas; nunca texto del usuario dentro del SQL.
- Montos DECIMAL de punta a punta: en PHP se muestran como texto con dos decimales. No se usa `float` para sumar.
- Fechas de salida en hora de Guatemala con `Carbon::setTimezone('America/Guatemala')`; en la base siguen en UTC.
- Rutas con `auth`, `cuenta.vigente` y `rol:administrador,supervisor`. Un registro fuera del alcance responde 404 (R2, S5).
- Blade con `{{ }}` (S7). Mensajes en español, tratando de usted.
- Pruebas contra `crm_belleza_test` con `VerificacionSeeder`; las de equipos del sector cargan además `SectorSeeder`.

## 4. Decisiones de esta fase (propuestas)

| Id | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| DA5-1 | Una venta se atribuye a `oportunidades.vendedor_id`, el vendedor que la cerró. El equipo es el `supervisor_id` actual de ese vendedor | Atribuirla al dueño actual del cliente | D2: las cerradas conservan el crédito de quien vendió |
| DA5-2 | Alcances: **vendedor** = `o.vendedor_id = ?`; **equipo** = `o.vendedor_id IN (SELECT id FROM users WHERE supervisor_id = ?)`; **empresa** = sin filtro. El supervisor solo puede pedir su equipo o uno de sus vendedores; el administrador, cualquiera | — | R2, L5 |
| DA5-3 | El mes llega como `AAAA-MM` (mes 01-12, año 1000-9999); por omisión, el mes actual de Guatemala. Un mes inválido vuelve al reporte del mes actual con «Elija un mes válido.» | Error 500 o mes vacío | L7; mismo formato que A6 |
| DA5-4 | Los vendedores desactivados aparecen en el equipo y en el reporte, marcados como «inactivo», con sus ventas pasadas | Ocultarlos | D4: sus datos se conservan |
| DA5-5 | Desglose por producto del mes: unidades y total vendido de las líneas de las ventas del mes, y pronóstico del producto con las líneas de las oportunidades abiertas. Incluye los productos inactivos que tengan cifras | Solo los productos activos | Un producto desactivado puede haberse vendido en el mes (R6) |
| DA5-6 | Las listas de oportunidades se paginan de 25 en 25, con los filtros conservados (como DA4-8). Un filtro de etapa inexistente vuelve con «Elija una etapa válida.» | Paginar del lado del cliente | Consistente con A4 |
| DA5-7 | El supervisor que pide `/oportunidades/{id}` de otro equipo o un vendedor de otro equipo en un filtro recibe 404 (o una lista vacía en el filtro) | 403 | R2 y DA4-1 |

## 5. Definición única de las cifras

Esta sección es la única fuente de las cifras. El panel (A5) la implementa con el constructor de consultas y la API (A6) con SQL parametrizado (`?`). Los dos deben dar los mismos números, y la prueba de paridad A5-16 lo comprueba.

### 5.1 Mes de Guatemala como rango UTC (R7)

Guatemala es UTC−6 todo el año. Para `mes = AAAA-MM`:

    inicio = AAAA-MM-01 06:00:00 (UTC)
    fin    = primer día del mes siguiente, 06:00:00 (UTC)
    fecha_cierre >= inicio AND fecha_cierre < fin

El rango se calcula en el código de la aplicación (PHP o JS), nunca con `CONVERT_TZ`, y se pasa como parámetro.

Ejemplos:
- 2026-10 → `[2026-10-01 06:00:00, 2026-11-01 06:00:00)`.
- La op. 2, cerrada el 2026-11-01 a las 03:30 UTC, pertenece a **octubre**.
- La op. 3, cerrada el 2026-11-01 a las 06:30 UTC, pertenece a **noviembre**.
- Una venta cerrada exactamente a las 06:00:00 UTC del día 1 pertenece al mes que empieza.

### 5.2 Probabilidad por etapa (R5)

    CASE o.etapa WHEN 'prospecto' THEN 10 WHEN 'calificado' THEN 25
                 WHEN 'propuesta' THEN 50 WHEN 'negociacion' THEN 75 END

Solo se usa con las etapas abiertas. Debe coincidir con `PROBABILIDAD` de `api/src/servicios/embudo.js`.

### 5.3 Las cuatro cifras

`{alcance}` es uno de los de DA5-2.

**C1 · Ventas del mes:** oportunidades ganadas cuyo cierre cae en el rango. Una venta sin líneas cuenta igual.

    SELECT COUNT(*) FROM oportunidades o
    WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND {alcance}

**C2 · Total vendido del mes:** suma de `cantidad × precio_unitario` de las líneas de esas ventas, con el precio guardado (R6). Se redondea a 2 decimales después de sumar.

    SELECT ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario), 0), 2)
    FROM oportunidades o JOIN oportunidad_productos l ON l.oportunidad_id = o.id
    WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND {alcance}

**C3 · Pronóstico:** oportunidades abiertas, sin filtro de mes. Es la suma de `total × probabilidad / 100`, calculada línea a línea en DECIMAL y redondeada a 2 decimales **una sola vez, después de sumar todo el alcance**. No se suman pronósticos ya redondeados.

    SELECT ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario * {probabilidad} / 100), 0), 2)
    FROM oportunidades o JOIN oportunidad_productos l ON l.oportunidad_id = o.id
    WHERE o.etapa IN ('prospecto', 'calificado', 'propuesta', 'negociacion') AND {alcance}

**C4 · Cartera:** clientes actuales del vendedor (no depende del mes); el máximo es 10 (R3).

    SELECT COUNT(*) FROM clientes WHERE vendedor_id = ?

**Desgloses.**
- *Por vendedor:* C1, C2 y C3 agrupados por `o.vendedor_id`, más C4. Cada fila se redondea por separado.
- *Por producto (DA5-5):* `SUM(l.cantidad)` y C2 agrupados por `l.producto_id` para las ventas del mes, y C3 agrupado por `l.producto_id`.

### 5.4 Cifras de control (§13.3, solo `VerificacionSeeder`)

| Alcance | Mes | Ventas | Total | Pronóstico | Cartera |
|---|---|---:|---:|---:|---|
| Valeria | 2026-10 | 2 | 9250.00 | 2512.88 | 3 de 10 |
| Valeria | 2026-11 | 1 | 3600.00 | 2512.88 | 3 de 10 |
| Diego | 2026-10 | 1 | 6000.00 | 112.50 | 2 de 10 |
| Carlos | 2026-10 | 1 | 7200.00 | 4125.75 | 9 de 10 |
| Iván (inactivo) | 2026-10 | 0 | 0.00 | 0.00 | 1 de 10 |
| Equipo de Sergio | 2026-10 | 3 | 15250.00 | 2625.38 | — |
| Equipo de Sandra | 2026-10 | 1 | 7200.00 | 4125.75 | — |
| Empresa | 2026-10 | 4 | 22450.00 | 6751.13 | — |

| Producto (2026-10) | Unidades | Total vendido | Pronóstico |
|---|---:|---:|---:|
| Plan básico | 5 | 6000.00 | 0.00 |
| Plan avanzado | 2 | 5200.00 | 6188.63 |
| Instalación | 1 | 450.00 | 562.50 |
| Soporte anual | 3 | 10800.00 | 0.00 |

El pronóstico de Valeria vale 2062.875 + 450 + 0 = 2512.875 y se redondea a 2512.88. El de la empresa, 6751.125, se redondea a 6751.13.

## 6. Rutas

| Método | Ruta | Nombre | Acceso | Acción |
|---|---|---|---|---|
| GET | `/equipo` | `equipo.index` | administrador, supervisor | Vendedores del alcance con cartera y cifras del mes (`?mes=`) |
| GET | `/oportunidades` | `oportunidades.index` | ídem | Lista de solo lectura (`?etapa=`, `?vendedor=`) |
| GET | `/oportunidades/{oportunidad}` | `oportunidades.show` | ídem | Detalle de solo lectura (P4); fuera del alcance, 404 |
| GET | `/reportes` | `reportes.index` | ídem | Reporte del mes (`?mes=`, `?vendedor=`) |

No hay rutas POST, PUT, PATCH ni DELETE de oportunidades en el panel. Todas llevan `auth`, `cuenta.vigente` y `rol:administrador,supervisor`.

## 7. Criterios de aceptación

**Semilla `VerificacionSeeder`.**
- Cuentas: Alicia (administradora); Sergio, con Valeria y Diego; Sandra, con Carlos e Iván (desactivado).
- Oportunidades:
  - Ganadas: 1, 2 y 3 de Valeria; 8 de Diego; 10 de Carlos.
  - Abiertas: 4 (negociación), 5 (propuesta) y 7 (prospecto) de Valeria; 9 (calificado) de Diego; 11 (negociación) de Carlos.
  - Perdida: 6 de Valeria.

**Semilla `SectorSeeder`** (cuando se indica): Lucía, con Andrea y Kevin.

### Definición de las cifras

#### A5-01 — Cifras de control por vendedor (CA-12, §13.3)

**Dada** la semilla oficial, **cuando** se calculan C1 a C4 con alcance de vendedor, **entonces** coinciden con la tabla de §5.4: Valeria en octubre de 2026, 2 ventas, 9250.00, 2512.88 y 3 de 10; en noviembre, 1 venta, 3600.00 y 2512.88. También coinciden Diego, Carlos e Iván.

#### A5-02 — Equipos y empresa (§13.3)

**Dada** la semilla oficial, **cuando** se calculan con alcance de equipo y de empresa para octubre de 2026, **entonces** el equipo de Sergio da 3 / 15250.00 / 2625.38, el de Sandra 1 / 7200.00 / 4125.75 y la empresa 4 / 22450.00 / 6751.13.

#### A5-03 — Mes de Guatemala en el límite (R7)

**Dadas** la op. 2 (cierre 2026-11-01 03:30 UTC) y la op. 3 (cierre 2026-11-01 06:30 UTC), **cuando** se calcula el mes, **entonces** la op. 2 cuenta en octubre y la op. 3 en noviembre. **Dada** una venta creada en la prueba con cierre exactamente a las 2026-11-01 06:00:00 UTC, **entonces** cuenta en noviembre y no en octubre.

#### A5-04 — Redondeo después de sumar

**Dadas** dos oportunidades abiertas creadas en la prueba cuyas contribuciones son 0.125 cada una (por ejemplo, una línea de 1.25 en prospecto), **cuando** se calcula el pronóstico de su vendedor, **entonces** da 0.25 (0.125 + 0.125, redondeado al final) y no 0.26 (0.13 + 0.13).

#### A5-05 — Precio guardado (R6, CA-09)

**Dado** que «Plan avanzado» sube a Q3,000.00 en el catálogo, **cuando** se calculan las cifras de octubre, **entonces** Valeria sigue en 9250.00 y 2512.88, y la empresa en 22450.00 y 6751.13.

### Equipo

#### A5-06 — Página del equipo (L5-03)

**Dada** Sandra, **cuando** abre `/equipo?mes=2026-10`, **entonces**:
- ve a Carlos Ajú con «9 de 10», 1 venta, Q7,200.00 y pronóstico Q4,125.75;
- ve a Iván Toj marcado «inactivo», con «1 de 10», 0 ventas y Q0.00;
- no ve a Valeria, a Diego ni a ningún vendedor de otro equipo.

**Dado** Sergio, **cuando** abre la misma página, **entonces** ve a Valeria (3 de 10, 2, Q9,250.00, Q2,512.88) y a Diego (2 de 10, 1, Q6,000.00, Q112.50).

#### A5-07 — El administrador ve todos los equipos (P3)

**Dada** Alicia, **cuando** abre `/equipo?mes=2026-10`, **entonces** ve los equipos de Sergio y Sandra (y el de Lucía con `SectorSeeder`), cada uno con sus vendedores, su subtotal de equipo (§5.4) y el total de la empresa.

#### A5-08 — Mes por omisión e inválido (DA5-3)

**Dado** `/equipo` o `/reportes` sin `mes`, **cuando** se abre, **entonces** muestra el mes actual de Guatemala. **Cuando** se pide `?mes=2026-13`, `?mes=26-10` o `?mes=octubre`, **entonces** vuelve al mes actual con «Elija un mes válido.», sin 500.

### Oportunidades de solo lectura

#### A5-09 — Lista con filtros (L6-01)

**Dada** Alicia, **cuando** abre `/oportunidades`, **entonces** ve las 11 oportunidades con cliente, vendedor, etapa, total y fecha de cierre en hora de Guatemala. La op. 2 muestra «31/10/2026 21:30». **Cuando** filtra por etapa «negociación», ve las ops. 4 y 11; **cuando** filtra por Valeria, ve las ops. 1 a 7; los dos filtros se combinan.

#### A5-10 — Alcance del supervisor (R2, L5-01)

**Dado** Sergio, **cuando** abre `/oportunidades`, **entonces** ve solo las de Valeria y Diego (1 a 9).
- **Cuando** pide `/oportunidades/10` (de Carlos) o filtra `?vendedor=6`, **entonces** recibe 404 o una lista vacía, respectivamente.
- **Con `SectorSeeder`**, Lucía no ve ninguna oportunidad de la semilla oficial.

#### A5-11 — Detalle de solo lectura (L6, P4)

**Dada** Alicia, **cuando** abre `/oportunidades/1`, **entonces** ve las líneas de «Renovación de planes»: Plan avanzado × 2 a Q2,600.00 e Instalación × 1 a Q450.00, con un total de Q5,650.00. También ve el historial de 5 cambios de etapa con el nombre de quien los hizo («Valeria López») y la fecha en hora de Guatemala. La página no tiene formularios ni botones de cambio, y `PUT`, `PATCH` o `DELETE /oportunidades/1` responden 405.

#### A5-12 — Etapa inválida (DA5-6)

**Cuando** se pide `/oportunidades?etapa=cancelado`, **entonces** la lista vuelve sin filtro con «Elija una etapa válida.», sin 500.

### Reporte del mes

#### A5-13 — Reporte de la empresa (L6-02)

**Dada** Alicia, **cuando** abre `/reportes?mes=2026-10`, **entonces** ve:
- el total del alcance: 4 ventas, Q22,450.00 y pronóstico Q6,751.13;
- el desglose por vendedor de §5.4, incluido Iván con «inactivo»;
- el desglose por producto de §5.4: Plan básico 5 / Q6,000.00 / Q0.00; Plan avanzado 2 / Q5,200.00 / Q6,188.63; Instalación 1 / Q450.00 / Q562.50; Soporte anual 3 / Q10,800.00 / Q0.00.

#### A5-14 — Reporte del supervisor

**Dado** Sergio, **cuando** abre `/reportes?mes=2026-10`, **entonces** ve 3 ventas, Q15,250.00 y Q2,625.38, con el desglose de Valeria y Diego, y por producto solo las líneas de su equipo. **Cuando** filtra por Valeria, ve 2, Q9,250.00 y Q2,512.88. **Cuando** escribe a mano `?vendedor=6`, recibe un reporte vacío (0, Q0.00, Q0.00), sin datos de Carlos.

#### A5-15 — Venta compartida (CA-16)

**Dada** la op. 4 de Valeria en negociación, **cuando** Valeria la gana desde la API (`PATCH /api/oportunidades/4/etapa`) y Alicia abre el reporte del mes de esa fecha de cierre, **entonces** la venta aparece en las ventas, en el total del mes y en el desglose de Valeria, y deja de contar en el pronóstico.

#### A5-16 — Paridad con la definición (§5)

**Dadas** las consultas del panel hechas con el constructor de consultas, **cuando** se ejecutan para los alcances y meses de §5.4 y para 2026-11, **entonces** dan exactamente los mismos números que el SQL de referencia de §5.3 ejecutado con `DB::select` en la prueba.

#### A5-17 — Texto escapado y suite (S7)

**Dado** un cliente o un producto con nombre `<b>x</b>`, **cuando** aparece en una lista, el detalle o el reporte, **entonces** se muestra como texto literal. **Dado** `php artisan test`, **entonces** la suite completa (A1 a A5) pasa contra `crm_belleza_test`.

## 8. Preguntas abiertas

| Id | Pregunta | Recomendación | Criterio |
|---|---|---|---|
| P1 | ¿Cómo se garantiza la «definición única» entre PHP (panel) y Node (API)? (a) Texto canónico en §5, implementado en cada lado, con pruebas de paridad; (b) una vista SQL (`CREATE VIEW` con el total y el ponderado de cada oportunidad) en una migración nueva, leída por los dos | (a): no cambia el esquema ni toca A1. Las pruebas A5-16 y A6-07 comparan los dos lados con la misma referencia | A5-16 |
| P2 | ¿El desglose por producto incluye el pronóstico por producto? (L6 dice «pronósticos por vendedor y producto») | Sí, con C3 agrupado por producto (§5.4) | A5-13 |
| P3 | ¿El administrador también tiene la página «Equipo», con todos los equipos? | Sí: cada equipo agrupado por supervisor, con su subtotal | A5-07 |
| P4 | ¿Hay un detalle de oportunidad de solo lectura (líneas e historial) o solo la lista? | Sí, detalle: es donde se comprueba el precio guardado y el historial | A5-11 |

## 9. Archivos previstos

- Crear:
  - `app/Support/Cifras.php`: rango del mes (§5.1) y consultas C1 a C4 y desgloses (§5.3) con el constructor de consultas.
  - `app/Http/Controllers/EquipoController.php`, `OportunidadController.php` y `ReporteController.php`.
  - `app/Http/Requests/ReporteRequest.php` (mes y vendedor) y `OportunidadIndexRequest.php` (etapa y vendedor).
  - Vistas en `resources/views/equipo/`, `oportunidades/` y `reportes/`.
  - `tests/Feature/A5EquiposReportesTest.php`.
- Editar:
  - `routes/web.php` y `layouts/navigation.blade.php`.
  - `app/Models/Oportunidad.php`: scope `visiblePara`, como en A4, si hace falta.

## 10. Estrategia de pruebas

- **Cifras:** A5-01 a A5-05 contra §5.4. A5-03 y A5-04 crean sus propias oportunidades en la prueba.
- **Paridad (A5-16):** el SQL de referencia de §5.3 frente a `Cifras` para cada alcance.
- **Pantallas:** con `assertSeeInOrder` sobre los montos formateados.
- **Acceso:** 404 y listas vacías fuera del alcance; 405 en los métodos de escritura.
- **CA-16 de punta a punta:** la API y el panel sobre `crm_belleza_test`, como en A3 y A4.
- **Resultados reales** en `docs/verificacion.md`.

## 11. Condiciones de finalización

A5 se considerará terminada cuando:

- El panel cumpla A5-01 a A5-17, con P1 a P4 decididas.
- Las cifras de §5.4 coincidan en el panel; en A6, también en la API y en la SPA.
- La suite de Laravel pase completa y los resultados queden registrados.
- No se hayan modificado archivos de la Parte B.
