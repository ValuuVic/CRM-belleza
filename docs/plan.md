# Plan de desarrollo — CRM Belleza

## 1. Objetivo del plan
Organizar el desarrollo de CRM Belleza mediante fases, responsabilidades, dependencias, pruebas y criterios de finalización.
El sistema estará compuesto por un panel Laravel, una API REST Express y una SPA para vendedores, conectados a una misma base de datos MySQL.
El desarrollo se realizará entre dos integrantes, trabajando en paralelo y realizando integraciones periódicas.

### 1.1 Principios de trabajo
- La especificación aprobada determina qué debe hacer el sistema.
- Este plan determina cómo se construirá.
- Las funcionalidades se implementarán por fases.
- Cada fase tendrá tareas y criterios verificables.
- Las modificaciones deben respetar `CLAUDE.md`.
- No se implementarán requisitos ajenos a la especificación aprobada.
- Todo cambio será revisado antes de integrarse a la rama principal.
- Las pruebas y sus resultados se documentarán.

### 1.0 Estado del plan
**Última actualización:** 2026-11-09.
- Las casillas `[x]` son tareas terminadas con evidencia: pruebas que pasan y, para la Parte A, su registro en `docs/verificacion.md`.
- Los cambios respecto del plan original están en la sección 14.
- **Hecho:** Parte A, A1 a A6. Parte B, B1 a B5 y casi toda B6.
- **Pendiente:** A7, la evidencia de la Parte B en `docs/verificacion.md` y las pruebas de integración en el navegador (sección 8).

### 1.2 Documentos utilizados
| Documento | Propósito |
|---|---|
| CLAUDE.md | Reglas permanentes para los agentes |
| docs/especificacion.md | Requisitos y contrato del sistema |
| docs/plan.md | Fases y tareas |
| docs/verificacion.md | Evidencias y resultados |
| docs/specs/ | Criterios específicos por fase |
| README.md | Instalación, uso y documentación técnica |

## 2. Arquitectura

### 2.1 Componentes
**Panel Laravel**
- Laravel 13.
- Breeze Blade.
- Eloquent.
- Autenticación de administrador y supervisor.
- Migraciones y seeders.
- Administración de cuentas, catálogo y clientes.
- Gestión de equipos.
- Reportes.

**API Express**
- Node.js 24.
- Express 5.
- mysql2/promise.
- jsonwebtoken.
- bcryptjs.
- cors.
- Consultas SQL parametrizadas.
- JWT para vendedores.

**SPA del vendedor**
- HTML.
- Bootstrap 5.3.
- JavaScript con módulos.
- Fetch API.
- LocalStorage únicamente para la sesión.
- Arquitectura estado → render.

**Base de datos**
- MySQL 8.4.
- Docker Compose.
- Una base compartida.
- Migraciones administradas exclusivamente por Laravel.
- Fechas almacenadas en UTC.

### 2.2 Flujo de comunicación
Panel Laravel → MySQL
SPA → API Express → MySQL
Laravel y Express trabajan sobre el mismo esquema y deben respetar las mismas reglas del negocio.

### 2.3 Restricciones
- Express no modifica la estructura de la base de datos.
- Laravel es el único componente que crea cuentas.
- La API no utiliza ORM.
- La SPA no utiliza frameworks.
- Las reglas de seguridad S1–S8 son obligatorias.
- Los contratos HTTP no pueden modificarse.
- El sistema debe reproducir las cifras de la semilla oficial.

## 3. Organización del equipo
### 3.1 Parte A — Laravel y base de datos
Responsable de:
- Migraciones y restricciones.
- VerificacionSeeder.
- SectorSeeder.
- Cuentas, roles y permisos.
- Catálogo y gestión de stock.
- Clientes y asignaciones.
- Equipos y supervisores.
- Reportes del panel.
- Endpoint A6: resumen mensual.
- Vista F5: resumen mensual de la SPA.
- Pruebas del panel.
Carpeta principal: `laravel/`.

### 3.2 Parte B — API Express y SPA
Responsable de:
- Base de Express.
- Conexión MySQL.
- Autenticación JWT.
- Middleware de autorización.
- Clientes y cartera.
- Oportunidades y productos.
- Actividades.
- Control y descuento de stock al ganar.
- Manejo de errores.
- SPA del vendedor.
- Pruebas Postman.
- Pruebas automatizadas y concurrencia.
- Verificación de seguridad de API y SPA.
Carpetas principales: `api/` y `frontend/`.

### 3.3 Responsabilidades compartidas
- Revisar la especificación.
- Aprobar cambios de contrato.
- Mantener CLAUDE.md.
- Revisar pull requests.
- Coordinar archivos compartidos.
- Completar documentación.
- Integrar las tres piezas.
- Mantener la bitácora de IA.
- Preparar la defensa.

### 3.4 Archivos compartidos
Los cambios en estos archivos deben coordinarse:
- `CLAUDE.md`
- `docs/especificacion.md`
- `docs/plan.md`
- `docs/verificacion.md`
- `README.md`
- `.claude/settings.json`
- `api/src/app.js`
Los archivos `api/src/rutas/reportes.js` y `frontend/js/vistas/resumen.js` se reservan para la implementación correspondiente de la Parte A.
La Parte B prepara los puntos de integración, sin implementar el resumen asignado a la Parte A.

## 4. Fase 0 — Preparación del entorno

### Objetivo
Preparar las herramientas necesarias para ejecutar el proyecto localmente.

### Tareas
- Verificar Git.
- Verificar PHP 8.4.
- Verificar Composer 2.
- Verificar Node.js 24.
- Verificar npm.
- Verificar Docker Desktop.
- Configurar MySQL 8.4 en Docker.
- Instalar dependencias de Laravel.
- Instalar dependencias de Express.
- Configurar archivos `.env` locales.
- Confirmar que ambas conexiones utilizan `crm_belleza`.
- Comprobar que los secretos no se suben a GitHub.

### Verificación
Docker debe ejecutar MySQL correctamente.
Laravel y Express deben poder conectarse con sus configuraciones locales cuando estén preparados.

### Condición de finalización
Ambas integrantes tienen un entorno local funcional y pueden ejecutar las herramientas necesarias.

**Estado:** cumplida. MySQL 8.4 corre en Docker (`crm-mysql`), y Laravel y Express se conectan a `crm_belleza` con su `.env` local, que no se versiona.

## 5. Fase 1 — Especificación y organización
**Responsables:** Ambas integrantes.

### Objetivo
Establecer las reglas y los contratos antes de comenzar la implementación.

### Tareas
- Completar `docs/especificacion.md`.
- Aprobar las decisiones del negocio.
- Verificar el modelo de datos.
- Verificar los requisitos L1–L7, A1–A8 y F1–F6.
- Verificar las reglas R1–R8.
- Verificar seguridad S1–S8.
- Aprobar la regla propia de stock.
- Completar `CLAUDE.md`.
- Revisar este plan.
- Registrar la etiqueta `spec-v1`.

### Dependencias
La especificación debe estar aprobada antes de implementar código funcional.

### Condición de finalización
Existe una especificación aprobada y versionada en Git.

**Estado:** cumplida. La especificación se aprobó con la etiqueta `spec-v1` (`4c6aa29`). Las correcciones posteriores aprobadas están en `spec-v1.1` y `spec-v1.2` (sección 14).

## 6. Fases de la Parte A — Laravel
### A1 — Migraciones y semillas
**Rama sugerida:** `a/migraciones`
**Objetivo:** Crear el esquema de la base de datos y los datos oficiales de verificación.
**Requisitos:** L1, R1–R8 y restricciones de integridad aplicables.

**Tareas:**

- [x] Crear migraciones para las tablas obligatorias.
- [x] Agregar columnas de roles en users.
- [x] Crear llaves foráneas.
- [x] Crear índices únicos.
- [x] Crear restricciones CHECK.
- [x] Agregar stock al catálogo.
- [x] Crear VerificacionSeeder.
- [x] Crear SectorSeeder.
- [x] Validar las relaciones.
- [x] Comprobar las cifras oficiales.

**Pruebas:**

En una base local de pruebas, recién preparada y cuya información pueda eliminarse:

`php artisan migrate:fresh --seeder=VerificacionSeeder`

Verificar estructura, registros y cifras de control.

**Entrega:** Esquema y semilla listos para integración I1.
**Estado:** terminada. Spec `docs/specs/A1-migraciones.md`; evidencia en `docs/verificacion.md` (A1).

### A2 — Usuarios, autenticación y roles
**Rama:** `a/cuentas`
**Requisitos:** L2, R1, S1, S2, S4.
**Tareas:**

- [x] Configurar Breeze Blade.
- [x] Deshabilitar el registro público.
- [x] Crear administración de cuentas.
- [x] Implementar roles.
- [x] Asociar vendedores a supervisores.
- [x] Permitir activar y desactivar usuarios.
- [x] Impedir la autodesactivación del administrador.
- [x] Impedir que vendedores accedan al panel.
- [x] Revocar acceso de cuentas inactivas.

**Pruebas:** Acceso por rol, credenciales incorrectas y cuentas desactivadas.
**Estado:** terminada. Spec `docs/specs/A2-cuentas.md`; evidencia en `docs/verificacion.md` (A2). Se agregó la base de pruebas `crm_belleza_test` (sección 14).

### A3 — Catálogo de productos
**Rama:** `a/catalogo`
**Requisitos:** L3, R6 y regla propia.
**Tareas:**

- [x] Listar productos.
- [x] Crear productos.
- [x] Editar productos.
- [x] Desactivar productos.
- [x] Validar precios.
- [x] Gestionar stock.
- [x] Evitar stock negativo.
- [x] Conservar precios históricos de oportunidades.

**Pruebas:** Validaciones, productos inactivos y conservación de precios.
**Estado:** terminada. Spec `docs/specs/A3-catalogo.md`; evidencia en `docs/verificacion.md` (A3).

### A4 — Clientes y asignaciones
**Rama:** `a/clientes`
**Requisitos:** L4, R2, R3, R4.
**Tareas:**

- [x] Listar clientes.
- [x] Buscar por nombre y NIT.
- [x] Crear y editar clientes.
- [x] Normalizar NIT.
- [x] Normalizar teléfonos.
- [x] Asignar clientes.
- [x] Reasignar clientes.
- [x] Liberar clientes.
- [x] Respetar la cartera máxima.
- [x] Aplicar las decisiones aprobadas sobre oportunidades y actividades.

**Pruebas:** Permisos, duplicados, asignaciones y límite de cartera.
**Estado:** terminada. Spec `docs/specs/A4-clientes.md`; evidencia en `docs/verificacion.md` (A4). Aplica D2, D3 y D4, decididas en `spec-v1.2`.

### A5 — Equipos, oportunidades y reportes
**Rama:** `a/reportes` (antes `a/equipos` y `a/reportes`; se juntaron en una, ver sección 14)
**Requisitos:** L5, L6 y R7.
**Tareas:**

- [x] Crear vista de equipo del supervisor.
- [x] Mostrar cartera por vendedor.
- [x] Mostrar oportunidades según permisos.
- [x] Implementar filtros por vendedor y etapa.
- [x] Mostrar oportunidades en modo solo lectura.
- [x] Calcular ventas mensuales.
- [x] Calcular pronóstico.
- [x] Crear reportes por vendedor y producto.
- [x] Aplicar zona horaria de Guatemala.
- [x] Verificar cifras oficiales.

**Pruebas:** Acceso por equipo y cálculos contra VerificacionSeeder.
**Estado:** terminada. Spec `docs/specs/A5-equipos-reportes.md`; evidencia en `docs/verificacion.md` (A5).

### A6 — Resumen mensual para API y SPA
**Rama:** `a/resumen`
**Requisitos:** A6 y F5.
**Tareas:**

- [x] Implementar `GET /api/reportes/resumen`.
- [x] Utilizar SQL parametrizado.
- [x] Reutilizar las reglas de cálculo del panel.
- [x] Devolver montos como números.
- [x] Crear `frontend/js/vistas/resumen.js`.
- [x] Integrar la vista con el router de la SPA.
- [x] Mostrar selector de mes.
- [x] Verificar cifras de control.

**Dependencia:** La Parte B debe tener preparada la infraestructura de la API y la SPA.
**Pruebas:** Comparación de resultados del panel, API y SPA.
**Estado:** terminada. Spec `docs/specs/A6-resumen.md`; evidencia en `docs/verificacion.md` (A6). La conexión de la vista en `frontend/js/app.js` se hizo en `dfaed7b`, con autorización de la Parte B. Falta comprobar el resumen en el navegador (I4).

### A7 — Validación y pruebas del panel
**Rama:** `a/validacion`
**Requisitos:** L7 y seguridad aplicable.

**Tareas:**
- [ ] Revisar formularios.
- [ ] Verificar FormRequest.
- [ ] Mostrar mensajes en español.
- [ ] Conservar datos escritos ante errores.
- [ ] Verificar permisos de administrador y supervisor.
- [ ] Revisar la seguridad de consultas y vistas.
- [ ] Ejecutar pruebas finales de Laravel.
- [ ] Registrar evidencias.

**Entrega:** Panel funcional y verificado.
**Estado:** pendiente. Varias tareas ya están cubiertas por los criterios de cada fase: FormRequest en todos los formularios, mensajes en español con lo escrito conservado (A2-18, A3-13, A4-15) y permisos por rol (A2-12, A3-24, A4-03, A5-10). Falta la revisión final de A7, con la suite completa y su registro.

## 7. Fases de la Parte B — Express y SPA

Las fases B1–B6 pueden desarrollarse progresivamente.

Cada fase tendrá una spec propia en `docs/specs/`.

**Cómo se marcaron las casillas de B1 a B6.** Las marcó la Parte A el 2026-11-09, a partir de tres evidencias:
- el código de cada fase, integrado en `main` con sus pull requests (#1 a #7 y #9);
- `npm test` en `api/`: 489 pruebas, 0 fallidas;
- `node --test frontend/test/*.test.js`: 150 de 150.

La Parte B debe confirmarlas y registrar su evidencia en `docs/verificacion.md`, donde todavía no hay secciones de B1 a B6. Quedan sin marcar «Documentar resultados» y «Preparar integración final» de B6.

### B1 — Base de API y validaciones

**Rama:** `b/base-api`  
**Spec:** `docs/specs/B1-base.md`
**Requisitos:** A7, S2, S3, S6 y validaciones compartidas.
**Dependencia:** Especificación aprobada. No requiere que las migraciones estén terminadas.

**Tareas:**

- [x] Configurar Express 5.
- [x] Preparar `api/src/server.js`.
- [x] Preparar `api/src/app.js`.
- [x] Configurar CORS.
- [x] Configurar pool mysql2/promise.
- [x] Crear función para transacciones.
- [x] Crear errores HTTP.
- [x] Crear manejador global de errores.
- [x] Preparar validaciones de NIT.
- [x] Preparar validaciones de teléfono.
- [x] Preparar validaciones de fechas.
- [x] Preparar validaciones comunes.
- [x] Crear pruebas con node:test.
- [x] Reservar el router de reportes para la Parte A.

**Pruebas:**
- Validación de datos.
- Manejo de JSON incorrecto.
- Respuestas 400 y 404.
- Errores generales.
- Configuración CORS.
- Pruebas automatizadas.

**Entrega:** Infraestructura básica de API lista.

### B2 — JWT, middleware y SPA inicial

**Rama:** `b/login-jwt` (la SPA se hizo en la misma rama; ver sección 14)  
**Spec:** `docs/specs/B2-login.md`
**Requisitos:** A1, A2, F1, S1, S4, S6.
**Dependencia:** Integración I1, con users y VerificacionSeeder disponibles.

**Tareas:**

- [x] Implementar POST /auth/login.
- [x] Verificar contraseñas con bcryptjs.
- [x] Generar JWT HS256.
- [x] Configurar expiración.
- [x] Implementar middleware de autenticación.
- [x] Volver a consultar el estado del usuario.
- [x] Rechazar cuentas desactivadas.
- [x] Rechazar roles no autorizados.
- [x] Preparar la primera lectura de cartera.
- [x] Crear SPA inicial.
- [x] Implementar inicio de sesión.
- [x] Guardar y eliminar la sesión.
- [x] Crear comunicación mediante fetch.
- [x] Implementar cierre de sesión.
- [x] Preparar navegación.
- [x] Preparar estados y manejo de errores.

**Pruebas:**
- Login correcto.
- Contraseña incorrecta.
- Usuario inexistente.
- Cuenta inactiva.
- Rol no permitido.
- Token inválido.
- Token expirado.
- Acceso sin token.
- Sesión cerrada.
- CORS desde origen no permitido.

**Entrega:** Login de vendedor funcional mediante la SPA.

### B3 — Clientes y cartera

**Rama:** `b/clientes` (la SPA se hizo en la misma rama)  
**Spec:** `docs/specs/B3-clientes.md`
**Requisitos:** A3, F2, R2, R3, R4, S3, S5, S8.
**Dependencia:** B2 y esquema de clientes disponible.

**Tareas:**

- [x] Implementar GET /clientes.
- [x] Implementar POST /clientes.
- [x] Implementar GET /clientes/disponibles.
- [x] Implementar GET /clientes/:id.
- [x] Implementar PATCH /clientes/:id.
- [x] Implementar POST /clientes/:id/tomar.
- [x] Validar NIT y teléfono.
- [x] Evitar clientes duplicados.
- [x] Aplicar máximo de diez clientes.
- [x] Proteger registros ajenos.
- [x] Implementar operaciones atómicas.
- [x] Crear vista de cartera.
- [x] Crear búsqueda.
- [x] Crear formularios de alta y edición.
- [x] Mostrar clientes disponibles.
- [x] Implementar acción tomar.
- [x] Mostrar errores junto a los campos.

**Pruebas:**

- Clientes del vendedor correcto.
- Clientes ajenos responden 404.
- NIT y teléfonos incorrectos.
- Duplicados.
- Cartera llena.
- Toma simultánea de clientes.
- Campos prohibidos ignorados.
- Conservación de datos en formularios.

**Entrega:** Cartera funcional en API y SPA.

### B4 — Oportunidades, productos y stock

**Rama:** `b/oportunidades` (la SPA se hizo en la misma rama)  
**Spec:** `docs/specs/B4-oportunidades.md`
**Requisitos:** A4, F3, R5, R6, S8 y regla propia del sector.
**Dependencia:** B3 y tablas de oportunidades, productos e historial disponibles.

**Tareas:**

- [x] Implementar GET /productos.
- [x] Implementar GET /oportunidades con filtro por etapa.
- [x] Implementar POST /oportunidades.
- [x] Implementar GET /oportunidades/:id.
- [x] Implementar PATCH /oportunidades/:id.
- [x] Implementar PATCH /oportunidades/:id/etapa.
- [x] Implementar POST /oportunidades/:id/productos.
- [x] Implementar PATCH de cantidad por línea.
- [x] Implementar DELETE de línea con respuesta 204.
- [x] Copiar precios históricos desde el catálogo.
- [x] Calcular subtotales y totales.
- [x] Validar transiciones aprobadas.
- [x] Registrar historial.
- [x] Registrar fecha de cierre.
- [x] Validar stock antes de ganar.
- [x] Descontar existencias.
- [x] Implementar rollback ante fallos.
- [x] Proteger cambios simultáneos.
- [x] Crear tablero de oportunidades.
- [x] Crear detalle de oportunidad.
- [x] Crear formularios y acciones para productos.
- [x] Mostrar historial.
- [x] Mostrar errores de inventario.

**Pruebas:**
- Oportunidad creada en prospecto.
- Transiciones válidas e inválidas.
- Oportunidades cerradas inmutables.
- Precio histórico conservado.
- Productos inactivos rechazados.
- Productos repetidos rechazados.
- Stock suficiente.
- Stock insuficiente.
- Descuento único.
- Rollback completo.
- Cambios simultáneos de etapa.

**Entrega:** Embudo y regla de stock funcionando.

### B5 — Actividades y seguimiento

**Rama:** `b/actividades` (la SPA se hizo en la misma rama)  
**Spec:** `docs/specs/B5-actividades.md`
**Requisitos:** A5, F4, R2 y R8.
**Dependencia:** B3.

**Tareas:**
- [x] Implementar GET /actividades.
- [x] Implementar POST /clientes/:id/actividades.
- [x] Implementar PATCH /actividades/:id.
- [x] Filtrar pendientes y completadas.
- [x] Calcular actividades vencidas.
- [x] Validar fechas con zona horaria.
- [x] Devolver fechas ISO UTC.
- [x] Proteger actividades de otros vendedores.
- [x] Crear vista de actividades.
- [x] Crear formulario de actividad.
- [x] Mostrar fechas en hora de Guatemala.
- [x] Permitir completar actividades.

**Pruebas:**
- Crear actividad válida.
- Fecha sin zona horaria.
- Actividad ajena.
- Actividad vencida.
- Actividad completada.
- Filtros válidos e inválidos.

**Entrega:** Seguimiento comercial funcionando.

### B6 — Calidad, pruebas y documentación

**Rama:** `b/calidad`  
**Spec:** `docs/specs/B6-calidad.md`
**Requisitos:** A7, A8, F6 y S1–S8 aplicables.
**Dependencia:** B1–B5 implementadas.

**Tareas:**
- [x] Revisar todos los endpoints.
- [x] Ejecutar pruebas node:test.
- [x] Preparar colección Postman.
- [x] Agregar casos de error.
- [x] Implementar script de concurrencia.
- [x] Comprobar protección de datos.
- [x] Comprobar SQL parametrizado.
- [x] Comprobar CORS.
- [x] Comprobar JWT.
- [x] Comprobar XSS.
- [x] Revisar interfaz de 375 píxeles.
- [x] Mostrar indicadores de carga.
- [x] Manejar desconexión de API.
- [x] Verificar los códigos HTTP exactos.
- [ ] Documentar resultados.
- [ ] Preparar integración final.

**Entrega:** API y SPA verificadas y documentadas.

## 8. Puntos de integración

### I1 — Esquema entregado

**Dependencia:** Parte A termina A1.
**Objetivo:** Confirmar que la API puede utilizar las tablas y usuarios reales.
**Pruebas:**
- Ejecutar migraciones y VerificacionSeeder en una base de pruebas.
- Confirmar las tablas.
- Confirmar los nombres reales de índices y restricciones.
- Consultar usuarios desde Express.
- Probar el inicio de sesión del vendedor cuando B2 esté implementada.

**Resultado esperado:** Laravel y Express usan el mismo esquema.
**Estado:** cumplida. Con A1, `npm run test:bd` ejecutó contra MySQL las pruebas de integración que antes se omitían (`docs/verificacion.md`, A1).

### I2 — Primera petición real desde la SPA

**Dependencias:** Parte B termina B2; Parte A tiene disponible la asignación de clientes de A4.
**Pruebas:**
- El vendedor inicia sesión en la SPA.
- Consulta su cartera.
- El supervisor asigna un cliente desde Laravel.
- La SPA vuelve a consultar los datos.
- El nuevo cliente aparece.

**Resultado esperado:** La información se comparte correctamente entre ambos componentes.
**Estado:** cumplida a nivel de API; falta la prueba en la SPA. El panel asignó y reasignó clientes, y `GET /api/clientes`, `GET /api/actividades` y `GET /api/oportunidades` lo reflejaron (`docs/verificacion.md`, A4, nota 1). Falta repetirlo viendo la cartera en la SPA del navegador.

### I3 — Primera venta integrada

**Dependencias:** B4 y reportes de A5 disponibles.
**Pruebas:**
- Crear una oportunidad.
- Agregar productos.
- Avanzar por las etapas permitidas.
- Confirmar la venta.
- Verificar descuento de stock.
- Consultar el reporte Laravel.
- Confirmar que la venta se contabilizó.

**Resultado esperado:** La venta creada mediante la SPA aparece correctamente en el panel.
**Estado:** parcial.
- **Probado con la API:** la op. 4 se ganó con `PATCH /api/oportunidades/4/etapa` y apareció en el reporte del panel (A5-15; `docs/verificacion.md`, A5, nota 1). También se probó el descuento de stock en A3-22.
- **Falta:** hacer el recorrido completo desde la SPA (crear, agregar productos, avanzar y ganar) con un producto con stock controlado.

### I4 — Resumen mensual de la SPA

**Dependencias:** Parte A termina A6 y Parte B tiene preparado el router y la SPA.
**Pruebas:**
- Consultar GET /api/reportes/resumen.
- Comparar cifras con el panel.
- Mostrar el resumen en la SPA.
- Verificar los meses y la zona horaria.

**Resultado esperado:** Panel, API y SPA muestran cifras consistentes.
**Estado:** cumplida entre el panel y la API; falta la SPA en el navegador.
- **Panel y API:** coinciden en vivo en los cinco casos comparados (`docs/verificacion.md`, A6, nota 1).
- **SPA:** la vista está probada con `node:test` (también con otras zonas horarias) y conectada en `app.js` desde `dfaed7b`. Falta comprobarla en el navegador.

## 9. Organización de las specs
Cada fase de ambas partes tiene una especificación independiente (cambio de plan: al principio solo las tenía la Parte B; ver sección 14).

| Fase | Archivo |
|---|---|
| A1 | docs/specs/A1-migraciones.md |
| A2 | docs/specs/A2-cuentas.md |
| A3 | docs/specs/A3-catalogo.md |
| A4 | docs/specs/A4-clientes.md |
| A5 | docs/specs/A5-equipos-reportes.md |
| A6 | docs/specs/A6-resumen.md |
| B1 | docs/specs/B1-base.md |
| B2 | docs/specs/B2-login.md |
| B3 | docs/specs/B3-clientes.md |
| B4 | docs/specs/B4-oportunidades.md |
| B5 | docs/specs/B5-actividades.md |
| B6 | docs/specs/B6-calidad.md |

Las specs deberán derivarse de la especificación aprobada.

Cada una incluirá:
- Objetivo de la fase.
- Requisitos correspondientes.
- Funcionalidades incluidas.
- Funcionalidades fuera del alcance.
- Contrato aplicable.
- Datos utilizados.
- Criterios de aceptación.
- Casos de error.
- Pruebas.
- Dependencias.

Los criterios deben identificarse mediante IDs y utilizar Dado/Cuando/Entonces cuando corresponda.

No se modificará el contrato principal desde una spec particular.

---

## 10. Procedimiento de trabajo con Claude Code
Para cada fase:

1. Leer `CLAUDE.md`.
2. Leer `docs/especificacion.md`.
3. Leer `docs/plan.md`.
4. Leer la spec de la fase.
5. Comprobar la rama actual.
6. Solicitar un plan de implementación.
7. Revisar el plan.
8. Autorizar la implementación.
9. Revisar los cambios realizados.
10. Ejecutar pruebas.
11. Ejecutar revisiones con subagentes, cuando estén disponibles.
12. Corregir incumplimientos.
13. Registrar evidencia.
14. Crear el commit correspondiente.
15. Abrir el pull request para revisión.

### 10.1 Hooks
Cuando se configuren los hooks en `.claude/`, deberán:

- Proteger archivos sensibles.
- Respetar la división entre partes.
- Impedir operaciones no autorizadas.
- Verificar sintaxis y pruebas cuando corresponda.
- Reportar bloqueos.

No se confiará únicamente en los hooks para demostrar seguridad.

### 10.2 Subagentes
**revisor-contrato:** verifica endpoints, parámetros y respuestas.
**revisor-seguridad:** revisa seguridad S1–S8.
**verificador-criterios:** compara las pruebas ejecutadas con los criterios de aceptación.
Los revisores no modifican archivos. El verificador no corrige código.

## 11. Estrategia de Git

### 11.1 Ramas

`main` será la rama estable.
Se utilizarán ramas independientes por tarea:

- `a/migraciones`
- `a/cuentas`
- `a/catalogo`
- `a/clientes`
- `a/reportes` (toda A5)
- `a/resumen` (A6)
- `a/readme` y `a/spec-v1.2` (documentación compartida)
- `b/base-api`
- `b/login-jwt`
- `b/clientes`
- `b/oportunidades`
- `b/actividades`
- `b/calidad`
- `b/restricciones-check`

Las ramas `b/spa-*` y `a/equipos` del plan original no se usaron (sección 14).

### 11.2 Commits

Se utilizarán Conventional Commits en español.
Ejemplos:

- `docs(spec): definir criterios de clientes`
- `feat(api): implementar inicio de sesion`
- `feat(spa): crear vista de cartera`
- `fix(api): corregir validacion de stock`
- `test(api): agregar pruebas de concurrencia`

### 11.3 Integración
- No modificar directamente el trabajo de la otra integrante sin acuerdo.
- Revisar cada pull request.
- Comprobar pruebas antes de integrar.
- Mantener la rama principal funcional.
- Registrar contribuciones de ambas integrantes.
- No subir archivos de secretos.

## 12. Estrategia de pruebas

### 12.1 Pruebas funcionales
Comprobar los requisitos L1–L7, A1–A8 y F1–F6.

### 12.2 Pruebas de seguridad
Comprobar S1–S8.
Se incluyen permisos, autenticación, SQL parametrizado, CORS, XSS y protección de datos.

### 12.3 Pruebas de concurrencia
Verificar:
- Toma simultánea de clientes.
- Límite de cartera.
- Cambios simultáneos de etapa.
- Registros duplicados.
- Confirmaciones simultáneas que compiten por stock.

### 12.4 Pruebas de integración
Comprobar el funcionamiento compartido de Laravel, API y SPA.

### 12.5 Pruebas con semillas
Utilizar únicamente VerificacionSeeder para comprobar las cifras oficiales.
El entorno de pruebas debe poder restablecerse.
No ejecutar reinicios destructivos sobre bases que contengan datos que deban conservarse.

### 12.6 Evidencias
Registrar resultados reales en `docs/verificacion.md`.
Cada evidencia deberá indicar:
- Requisito o criterio.
- Prueba ejecutada.
- Resultado esperado.
- Resultado obtenido.
- Estado.
- Evidencia o referencia correspondiente.

## 13. Bitácora de inteligencia artificial
Durante el desarrollo se documentarán al menos tres casos reales en los que el agente haya producido una solución incorrecta, insegura o distinta de la especificación.
Cada caso incluirá:
- Descripción.
- Propuesta del agente.
- Problema detectado.
- Método de detección.
- Corrección.
- Commit correspondiente.
Los incidentes se documentarán en `docs/verificacion.md`. Mientras se trabaja, se llevan en `docs/bitacora-ia.md` (IA-01 a IA-16); antes de la entrega deben trasladarse a `docs/verificacion.md` o enlazarse desde allí.
No se inventarán resultados ni incidentes.

## 14. Cambios al plan

Diferencias entre el plan original y cómo se hizo el trabajo, en orden cronológico.

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-11-08 | Cada fase de la Parte B hizo su API y su SPA en una sola rama (`b/login-jwt`, `b/clientes`, `b/oportunidades`, `b/actividades`), sin las ramas `b/spa-*` | La vista y su endpoint se prueban juntos |
| 2026-11-08 | La Parte A también escribe una spec por fase (A1 a A6, en `docs/specs/`), con criterios Dado/Cuando/Entonces y decisiones propias (DA*, P*) | Mismo procedimiento que la Parte B (sección 10) y criterios verificables |
| 2026-11-08 | Se agregó la base MySQL `crm_belleza_test` para las pruebas de Laravel (`phpunit.xml`), y se dejó de usar SQLite (decisión P8 de A2) | Los CHECK de las migraciones no funcionan en SQLite y las pruebas no deben tocar `crm_belleza` (IA-15) |
| 2026-11-08 | Rama `b/restricciones-check` (`9e37ed2`, PR #9), fuera del plan: ajuste en `api/src/middleware/errores.js` y sus pruebas | Ajustar a las restricciones CHECK reales de las migraciones de la Parte A la traducción del error 3819 de MySQL a 422 por campo |
| 2026-11-09 | `spec-v1.1` (`5afb464`): primera línea de D2, D3 y D4 con lo decidido para A4, incluido el mensaje de D3 | A4 necesitaba esas decisiones |
| 2026-11-09 | `spec-v1.2` (`5783303`): redacción final de D2, D3 y D4 como decididas, con las actividades que siguen al cliente en D2 | `spec-v1.1` había dejado las tres en «Propuesta» |
| 2026-11-09 | A5 se hizo en una sola rama, `a/reportes`, en lugar de `a/equipos` y `a/reportes` | Las tres pantallas (equipo, oportunidades y reportes) usan el mismo servicio de cifras (`App\Services\ReporteVentas`) |
| 2026-11-09 | A5 incluye el detalle de oportunidad en solo lectura y el pronóstico por producto (P2 y P4 de A5) | L6 pide pronósticos por producto, y el detalle es donde se ve el precio guardado |
| 2026-11-09 | A6 agregó a la Parte A `api/src/servicios/reportes.js`, `frontend/js/acciones-resumen.js` y sus pruebas, autorizados por la Parte B en los hooks (`4862d6a`) | Separar el cálculo de la ruta y el estado de la vista, sin modificar `estado.js` ni `api.js` |
| 2026-11-09 | La Parte A montó `/api/reportes` en `api/src/app.js` (`603fa20`), y la vista del resumen se conectó en `frontend/js/app.js` con autorización de la Parte B (`dfaed7b`) | P2 de A6 |
