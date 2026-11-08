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

## 6. Fases de la Parte A — Laravel
### A1 — Migraciones y semillas
**Rama sugerida:** `a/migraciones`
**Objetivo:** Crear el esquema de la base de datos y los datos oficiales de verificación.
**Requisitos:** L1, R1–R8 y restricciones de integridad aplicables.

**Tareas:**

- [ ] Crear migraciones para las tablas obligatorias.
- [ ] Agregar columnas de roles en users.
- [ ] Crear llaves foráneas.
- [ ] Crear índices únicos.
- [ ] Crear restricciones CHECK.
- [ ] Agregar stock al catálogo.
- [ ] Crear VerificacionSeeder.
- [ ] Crear SectorSeeder.
- [ ] Validar las relaciones.
- [ ] Comprobar las cifras oficiales.

**Pruebas:**

En una base local de pruebas, recién preparada y cuya información pueda eliminarse:

`php artisan migrate:fresh --seeder=VerificacionSeeder`

Verificar estructura, registros y cifras de control.

**Entrega:** Esquema y semilla listos para integración I1.

### A2 — Usuarios, autenticación y roles
**Rama:** `a/cuentas`
**Requisitos:** L2, R1, S1, S2, S4.
**Tareas:**

- [ ] Configurar Breeze Blade.
- [ ] Deshabilitar el registro público.
- [ ] Crear administración de cuentas.
- [ ] Implementar roles.
- [ ] Asociar vendedores a supervisores.
- [ ] Permitir activar y desactivar usuarios.
- [ ] Impedir la autodesactivación del administrador.
- [ ] Impedir que vendedores accedan al panel.
- [ ] Revocar acceso de cuentas inactivas.

**Pruebas:** Acceso por rol, credenciales incorrectas y cuentas desactivadas.

### A3 — Catálogo de productos
**Rama:** `a/catalogo`
**Requisitos:** L3, R6 y regla propia.
**Tareas:**

- [ ] Listar productos.
- [ ] Crear productos.
- [ ] Editar productos.
- [ ] Desactivar productos.
- [ ] Validar precios.
- [ ] Gestionar stock.
- [ ] Evitar stock negativo.
- [ ] Conservar precios históricos de oportunidades.

**Pruebas:** Validaciones, productos inactivos y conservación de precios.

### A4 — Clientes y asignaciones
**Rama:** `a/clientes`
**Requisitos:** L4, R2, R3, R4.
**Tareas:**

- [ ] Listar clientes.
- [ ] Buscar por nombre y NIT.
- [ ] Crear y editar clientes.
- [ ] Normalizar NIT.
- [ ] Normalizar teléfonos.
- [ ] Asignar clientes.
- [ ] Reasignar clientes.
- [ ] Liberar clientes.
- [ ] Respetar la cartera máxima.
- [ ] Aplicar las decisiones aprobadas sobre oportunidades y actividades.

**Pruebas:** Permisos, duplicados, asignaciones y límite de cartera.

### A5 — Equipos, oportunidades y reportes
**Ramas:** `a/equipos`, `a/reportes`
**Requisitos:** L5, L6 y R7.
**Tareas:**

- [ ] Crear vista de equipo del supervisor.
- [ ] Mostrar cartera por vendedor.
- [ ] Mostrar oportunidades según permisos.
- [ ] Implementar filtros por vendedor y etapa.
- [ ] Mostrar oportunidades en modo solo lectura.
- [ ] Calcular ventas mensuales.
- [ ] Calcular pronóstico.
- [ ] Crear reportes por vendedor y producto.
- [ ] Aplicar zona horaria de Guatemala.
- [ ] Verificar cifras oficiales.

**Pruebas:** Acceso por equipo y cálculos contra VerificacionSeeder.

### A6 — Resumen mensual para API y SPA
**Rama:** `a/resumen`
**Requisitos:** A6 y F5.
**Tareas:**

- [ ] Implementar `GET /api/reportes/resumen`.
- [ ] Utilizar SQL parametrizado.
- [ ] Reutilizar las reglas de cálculo del panel.
- [ ] Devolver montos como números.
- [ ] Crear `frontend/js/vistas/resumen.js`.
- [ ] Integrar la vista con el router de la SPA.
- [ ] Mostrar selector de mes.
- [ ] Verificar cifras de control.

**Dependencia:** La Parte B debe tener preparada la infraestructura de la API y la SPA.
**Pruebas:** Comparación de resultados del panel, API y SPA.

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

## 7. Fases de la Parte B — Express y SPA

Las fases B1–B6 pueden desarrollarse progresivamente.

Cada fase tendrá una spec propia en `docs/specs/`.

### B1 — Base de API y validaciones

**Rama:** `b/base-api`  
**Spec:** `docs/specs/B1-base.md`
**Requisitos:** A7, S2, S3, S6 y validaciones compartidas.
**Dependencia:** Especificación aprobada. No requiere que las migraciones estén terminadas.

**Tareas:**

- [ ] Configurar Express 5.
- [ ] Preparar `api/src/server.js`.
- [ ] Preparar `api/src/app.js`.
- [ ] Configurar CORS.
- [ ] Configurar pool mysql2/promise.
- [ ] Crear función para transacciones.
- [ ] Crear errores HTTP.
- [ ] Crear manejador global de errores.
- [ ] Preparar validaciones de NIT.
- [ ] Preparar validaciones de teléfono.
- [ ] Preparar validaciones de fechas.
- [ ] Preparar validaciones comunes.
- [ ] Crear pruebas con node:test.
- [ ] Reservar el router de reportes para la Parte A.

**Pruebas:**
- Validación de datos.
- Manejo de JSON incorrecto.
- Respuestas 400 y 404.
- Errores generales.
- Configuración CORS.
- Pruebas automatizadas.

**Entrega:** Infraestructura básica de API lista.

### B2 — JWT, middleware y SPA inicial

**Ramas:** `b/login-jwt`, `b/spa-base`  
**Spec:** `docs/specs/B2-login.md`
**Requisitos:** A1, A2, F1, S1, S4, S6.
**Dependencia:** Integración I1, con users y VerificacionSeeder disponibles.

**Tareas:**

- [ ] Implementar POST /auth/login.
- [ ] Verificar contraseñas con bcryptjs.
- [ ] Generar JWT HS256.
- [ ] Configurar expiración.
- [ ] Implementar middleware de autenticación.
- [ ] Volver a consultar el estado del usuario.
- [ ] Rechazar cuentas desactivadas.
- [ ] Rechazar roles no autorizados.
- [ ] Preparar la primera lectura de cartera.
- [ ] Crear SPA inicial.
- [ ] Implementar inicio de sesión.
- [ ] Guardar y eliminar la sesión.
- [ ] Crear comunicación mediante fetch.
- [ ] Implementar cierre de sesión.
- [ ] Preparar navegación.
- [ ] Preparar estados y manejo de errores.

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

**Ramas:** `b/clientes`, `b/spa-cartera`  
**Spec:** `docs/specs/B3-clientes.md`
**Requisitos:** A3, F2, R2, R3, R4, S3, S5, S8.
**Dependencia:** B2 y esquema de clientes disponible.

**Tareas:**

- [ ] Implementar GET /clientes.
- [ ] Implementar POST /clientes.
- [ ] Implementar GET /clientes/disponibles.
- [ ] Implementar GET /clientes/:id.
- [ ] Implementar PATCH /clientes/:id.
- [ ] Implementar POST /clientes/:id/tomar.
- [ ] Validar NIT y teléfono.
- [ ] Evitar clientes duplicados.
- [ ] Aplicar máximo de diez clientes.
- [ ] Proteger registros ajenos.
- [ ] Implementar operaciones atómicas.
- [ ] Crear vista de cartera.
- [ ] Crear búsqueda.
- [ ] Crear formularios de alta y edición.
- [ ] Mostrar clientes disponibles.
- [ ] Implementar acción tomar.
- [ ] Mostrar errores junto a los campos.

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

**Ramas:** `b/oportunidades`, `b/spa-embudo`  
**Spec:** `docs/specs/B4-oportunidades.md`
**Requisitos:** A4, F3, R5, R6, S8 y regla propia del sector.
**Dependencia:** B3 y tablas de oportunidades, productos e historial disponibles.

**Tareas:**

- [ ] Implementar GET /productos.
- [ ] Implementar GET /oportunidades con filtro por etapa.
- [ ] Implementar POST /oportunidades.
- [ ] Implementar GET /oportunidades/:id.
- [ ] Implementar PATCH /oportunidades/:id.
- [ ] Implementar PATCH /oportunidades/:id/etapa.
- [ ] Implementar POST /oportunidades/:id/productos.
- [ ] Implementar PATCH de cantidad por línea.
- [ ] Implementar DELETE de línea con respuesta 204.
- [ ] Copiar precios históricos desde el catálogo.
- [ ] Calcular subtotales y totales.
- [ ] Validar transiciones aprobadas.
- [ ] Registrar historial.
- [ ] Registrar fecha de cierre.
- [ ] Validar stock antes de ganar.
- [ ] Descontar existencias.
- [ ] Implementar rollback ante fallos.
- [ ] Proteger cambios simultáneos.
- [ ] Crear tablero de oportunidades.
- [ ] Crear detalle de oportunidad.
- [ ] Crear formularios y acciones para productos.
- [ ] Mostrar historial.
- [ ] Mostrar errores de inventario.

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

**Ramas:** `b/actividades`, `b/spa-actividades`  
**Spec:** `docs/specs/B5-actividades.md`
**Requisitos:** A5, F4, R2 y R8.
**Dependencia:** B3.

**Tareas:**
- [ ] Implementar GET /actividades.
- [ ] Implementar POST /clientes/:id/actividades.
- [ ] Implementar PATCH /actividades/:id.
- [ ] Filtrar pendientes y completadas.
- [ ] Calcular actividades vencidas.
- [ ] Validar fechas con zona horaria.
- [ ] Devolver fechas ISO UTC.
- [ ] Proteger actividades de otros vendedores.
- [ ] Crear vista de actividades.
- [ ] Crear formulario de actividad.
- [ ] Mostrar fechas en hora de Guatemala.
- [ ] Permitir completar actividades.

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
- [ ] Revisar todos los endpoints.
- [ ] Ejecutar pruebas node:test.
- [ ] Preparar colección Postman.
- [ ] Agregar casos de error.
- [ ] Implementar script de concurrencia.
- [ ] Comprobar protección de datos.
- [ ] Comprobar SQL parametrizado.
- [ ] Comprobar CORS.
- [ ] Comprobar JWT.
- [ ] Comprobar XSS.
- [ ] Revisar interfaz de 375 píxeles.
- [ ] Mostrar indicadores de carga.
- [ ] Manejar desconexión de API.
- [ ] Verificar los códigos HTTP exactos.
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

### I2 — Primera petición real desde la SPA

**Dependencias:** Parte B termina B2; Parte A tiene disponible la asignación de clientes de A4.
**Pruebas:**
- El vendedor inicia sesión en la SPA.
- Consulta su cartera.
- El supervisor asigna un cliente desde Laravel.
- La SPA vuelve a consultar los datos.
- El nuevo cliente aparece.

**Resultado esperado:** La información se comparte correctamente entre ambos componentes.

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

### I4 — Resumen mensual de la SPA

**Dependencias:** Parte A termina A6 y Parte B tiene preparado el router y la SPA.
**Pruebas:**
- Consultar GET /api/reportes/resumen.
- Comparar cifras con el panel.
- Mostrar el resumen en la SPA.
- Verificar los meses y la zona horaria.

**Resultado esperado:** Panel, API y SPA muestran cifras consistentes.

## 9. Organización de las specs
Cada fase de la Parte B tendrá una especificación independiente.

| Fase | Archivo |
|---|---|
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
- `a/reportes`
- `b/base-api`
- `b/login-jwt`
- `b/spa-base`
- `b/clientes`
- `b/spa-cartera`
- `b/oportunidades`
- `b/spa-embudo`
- `b/actividades`
- `b/calidad`

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
Los incidentes se documentarán en `docs/verificacion.md`.
No se inventarán resultados ni incidentes.
