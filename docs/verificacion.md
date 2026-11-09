# Verificación — CRM Belleza

Evidencias y resultados reales de las pruebas (docs/especificacion.md §16.4). Solo se registra lo que se ejecutó; lo pendiente se marca como tal.

La bitácora de IA está en `docs/bitacora-ia.md` y se enlaza desde la sección final.

---

## A1 — Migraciones y semilla de verificación (Parte A)

**Spec:** `docs/specs/A1-migraciones.md`  
**Rama:** `a/migraciones`  
**Fecha:** 2026-11-08  
**Commits:** `0ea3592` (migraciones), `7904708` (modelos), `894f1cd` (semillas), `8e0cb10` (prueba)  
**Entorno:** MySQL 8.4 en Docker (`crm-mysql`), PHP 8.4.0, Laravel 13, Node.js 24.

### Cómo se ejecutó

```
cd laravel
php artisan migrate:fresh --seeder=VerificacionSeeder
PRUEBAS_MYSQL=1 DB_CONNECTION=mysql DB_DATABASE=crm_belleza php artisan test --filter=A1EsquemaSemillaTest
cd ../api
npm run test:bd
```

`A1EsquemaSemillaTest` ejecuta `migrate:fresh` sobre la base indicada y la deja cargada solo con `VerificacionSeeder`. Por eso se omite salvo `PRUEBAS_MYSQL=1`.

### Matriz de criterios

| Criterio | Evidencia | Resultado |
|---|---|---|
| A1-01 — `users` con migración nueva | `git diff spec-v1 -- laravel/database/migrations/0001_01_01_000000_create_users_table.php` sin cambios; `information_schema.COLUMNS` muestra `rol` VARCHAR(20) por defecto `vendedor`, `supervisor_id` BIGINT UNSIGNED NULL y `activo` TINYINT(1) por defecto 1 | Cumple |
| A1-02 — Esquema desde cero | `migrate:fresh --seeder=VerificacionSeeder` y `migrate:fresh --seed` sin errores; las columnas y tipos de las 6 tablas coinciden con la spec §5; el rollback de las 8 migraciones y su nueva ejecución funcionan | Cumple |
| A1-03 — FKs y cascadas | `test_a1_03_llaves_foraneas_y_cascadas`: CASCADE en `oportunidad_productos.oportunidad_id`, `historial_etapas.oportunidad_id` y `actividades.cliente_id`; las otras 7 son RESTRICT | Cumple |
| A1-04 — Borrado en cascada | `test_a1_04_borrado_en_cascada`: se borran líneas, historial y actividades; un cliente con oportunidades da errno 1451 | Cumple |
| A1-05 — Índices únicos | `test_a1_05_indices_unicos`: producto, NIT, teléfono y línea repetidos dan errno 1062; dos NIT NULL se aceptan | Cumple |
| A1-06 — CHECK | `test_a1_06_y_a1_07_restricciones_check`: 14 inserciones inválidas dan errno 3819 (precio, cantidad 0 y 1000, precio de línea, 2 teléfonos, etapa, rol, tipo, etapa del historial y 4 combinaciones de etapa, motivo y cierre) | Cumple |
| A1-07 — Stock | Misma prueba: `stock = -1` da 3819; `0` y `NULL` se aceptan; `stock` llega en `2026_11_08_000008_add_stock_to_productos_table.php` | Cumple |
| A1-08 — Cuentas | `test_a1_08_cuentas`: 7 cuentas con id, rol, supervisor y estado esperados (Iván inactivo); hashes `$2y$` válidos para `Ventas2026`. Además, el login con `bcryptjs` pasa en las pruebas de integración de la API | Cumple |
| A1-09 — Productos | `test_a1_09_productos`: 5 productos con sus precios, «Licencia anterior» inactivo y `stock` NULL | Cumple |
| A1-10 — Clientes | `test_a1_10_clientes`: 21 clientes (Valeria 3, Diego 2, Carlos 9, Iván 1, disponibles 6) y 11 CF con `nit` NULL. Los 10 NIT pasan `normalizarNit` de la API | Cumple |
| A1-11 — Oportunidades y líneas | `test_a1_11_oportunidades_y_lineas`: 11 oportunidades y 13 líneas; Plan avanzado a 2600.00 en «Renovación de planes»; motivo «Eligió a la competencia» | Cumple |
| A1-12 — Historial | `test_a1_12_historial`: 43 registros; cada oportunidad nace con `NULL → prospecto`, termina en su etapa actual, el usuario es su vendedor y el último registro de las cerradas coincide con `fecha_cierre` | Cumple |
| A1-13 — Actividades | `test_a1_13_actividades`: 4 actividades, solo la 1 completada | Cumple |
| A1-14 — Cifras de control | `test_a1_14_cifras_de_control` (tabla siguiente) | Cumple |
| A1-15 — Repetible | `test_a1_15_semilla_repetible`: un segundo `migrate:fresh` da los mismos id y cifras | Cumple |
| Modelos | `test_modelos_relaciones_y_casts`: relaciones de equipo, cartera, líneas e historial; casts `decimal:2`, `boolean` y `datetime` en UTC | Cumple |

**Resultado de `A1EsquemaSemillaTest` sobre MySQL:** 13 pruebas, 13 superadas, 126 aserciones.

### Cifras de control obtenidas

SQL sobre la base cargada solo con `VerificacionSeeder`, con el mes en hora de Guatemala por rango UTC `[AAAA-MM-01 06:00, mes siguiente-01 06:00)`.

| Ámbito | Mes | Ventas | Total | Pronóstico | Cartera | ¿Coincide con §13.3? |
|---|---|---:|---:|---:|---|---|
| Valeria López | octubre 2026 | 2 | 9250.00 | 2512.88 | 3 de 10 | Sí |
| Valeria López | noviembre 2026 | 1 | 3600.00 | 2512.88 | 3 de 10 | Sí |
| Diego Castillo | octubre 2026 | 1 | 6000.00 | 112.50 | 2 de 10 | Sí |
| Carlos Ajú | octubre 2026 | 1 | 7200.00 | 4125.75 | 9 de 10 | Sí |
| Equipo de Sergio Ruiz | octubre 2026 | 3 | 15250.00 | 2625.38 | — | Sí |
| Equipo de Sandra Pérez | octubre 2026 | 1 | 7200.00 | 4125.75 | — | Sí |
| Toda la empresa | octubre 2026 | 4 | 22450.00 | 6751.13 | — | Sí |

| Producto · octubre 2026 | Unidades | Total | ¿Coincide? |
|---|---:|---:|---|
| Plan básico | 5 | 6000.00 | Sí |
| Plan avanzado | 2 | 5200.00 | Sí |
| Instalación | 1 | 450.00 | Sí |
| Soporte anual | 3 | 10800.00 | Sí |

Estas cifras se calcularon con SQL de prueba. El endpoint `GET /api/reportes/resumen` (A6) y los reportes del panel (A5) todavía no existen y se verificarán en su fase.

### Integración con la API

`npm run test:bd` en `api/` con la semilla cargada: 421 pruebas, 397 superadas, 0 fallidas, 0 omitidas y 24 `todo`. Antes de A1 se omitían 23 pruebas de integración porque faltaba `VerificacionSeeder`; ahora se ejecutan y pasan. Como esas pruebas escriben en la base, al terminar se volvió a ejecutar `migrate:fresh --seeder=VerificacionSeeder`.

### Pendiente

- **La suite de Laravel falla sobre SQLite.** `php artisan test` da 38 pruebas: 2 superadas, 23 con error y 13 omitidas. `laravel/phpunit.xml` usa SQLite en memoria, y SQLite no admite los `ALTER TABLE … ADD CONSTRAINT … CHECK` de las migraciones. Las 23 con error son las pruebas de Breeze que migran la base; las 13 omitidas son las de A1 sin MySQL. Falta decidir la base de pruebas (recomendado: una base MySQL `crm_belleza_test`). Ver IA-14.

---

## Bitácora de IA

Los casos están en `docs/bitacora-ia.md` (IA-01 a IA-14). Se trasladan o enlazan aquí antes de la entrega.
