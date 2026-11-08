# B2 — Login JWT, middleware y SPA inicial

**Proyecto:** CRM Belleza  
**Responsable:** Parte B  
**Rama:** `b/login-jwt`  
**Estado:** Pendiente de implementación  
**Documentos base:** `CLAUDE.md`, `docs/especificacion.md`, `docs/plan.md`  
**Dependencia:** I1 — Migraciones y VerificacionSeeder de la Parte A

## 1. Objetivo

Implementar la autenticación de vendedores mediante JWT y construir la SPA mínima que permita iniciar sesión, consultar una cartera en modo lectura y cerrar sesión.
La fase debe cumplir A1, A2, F1, la base de F2 y los requisitos de seguridad S1, S4 y S6 aplicables.

## 2. Alcance

### API Express

- Implementar `POST /api/auth/login`.
- Validar correo y contraseña.
- Consultar usuarios mediante SQL parametrizado.
- Verificar hashes de Laravel utilizando `bcryptjs`.
- Generar tokens JWT mediante HS256.
- Implementar middleware de autenticación.
- Verificar nuevamente el estado y rol del usuario en cada petición protegida.
- Preparar `GET /api/clientes` únicamente para listar clientes de la cartera del vendedor.

### SPA

- Crear pantalla de inicio de sesión.
- Implementar comunicación HTTP mediante Fetch API.
- Almacenar y recuperar la sesión.
- Crear navegación mediante rutas hash.
- Mostrar una vista inicial de cartera de solo lectura.
- Implementar cierre de sesión.
- Manejar sesiones expiradas y errores de conexión.
- Preparar el diseño adaptable mediante Bootstrap 5.3.

### Fuera del alcance

- Crear o administrar cuentas.
- Implementar registro público.
- Crear, editar o tomar clientes.
- Crear oportunidades.
- Gestionar productos o stock.
- Registrar actividades.
- Implementar reportes.
- Modificar Laravel, migraciones o seeders.

## 3. Contrato de autenticación

### B2-01 — Inicio de sesión correcto

**Dado** un vendedor activo con credenciales válidas, **cuando** envía `POST /api/auth/login` con correo y clave, **entonces** recibe HTTP 200:

```json
{
  "token": "JWT_VALIDO",
  "usuario": {
    "id": 4,
    "nombre": "Valeria López",
    "correo": "valeria@crm.test"
  }
}
```

El token debe estar firmado mediante HS256.

### B2-02 — Datos inválidos

**Dada** una petición de inicio de sesión sin correo o clave, **cuando** se valida el cuerpo, **entonces** recibe HTTP 422 con el objeto `errores`.

Un cuerpo ausente o que no sea un objeto JSON válido debe generar el error correspondiente del contrato.

### B2-03 — Credenciales incorrectas

**Dado** un correo inexistente o una contraseña incorrecta, **cuando** se intenta iniciar sesión, **entonces** recibe HTTP 401 sin revelar cuál de los datos fue incorrecto.

Debe utilizarse una comparación con hash falso cuando el usuario no exista, para reducir diferencias observables entre ambos casos.

### B2-04 — Rol no permitido

**Dado** un administrador o supervisor con credenciales correctas, **cuando** intenta iniciar sesión en la API de vendedores, **entonces** recibe HTTP 403 sin token.

### B2-05 — Cuenta inactiva

**Dado** un vendedor inactivo con contraseña correcta, **cuando** intenta iniciar sesión, **entonces** recibe HTTP 403 sin token.

## 4. Middleware JWT

### B2-06 — Token obligatorio

**Dada** una ruta protegida, **cuando** se solicita sin encabezado `Authorization: Bearer`, **entonces** responde HTTP 401.

### B2-07 — Verificación de firma y expiración

**Dado** un token inválido, manipulado, expirado o firmado mediante un algoritmo distinto de HS256, **cuando** se utiliza, **entonces** responde HTTP 401.

La API debe verificar expresamente `algorithms: ['HS256']`.

### B2-08 — Revocación por estado del usuario

**Dado** un vendedor que inició sesión correctamente, **cuando** su cuenta se desactiva o deja de tener el rol vendedor, **entonces** la siguiente petición protegida responde HTTP 401, aunque el JWT no haya expirado.

### B2-09 — Identidad del vendedor

**Dado** un JWT válido, **cuando** el middleware autentica una petición, **entonces** obtiene el identificador desde el token verificado y la base de datos.

Los identificadores de propiedad nunca deben confiarse al cuerpo enviado por el navegador.

## 5. Consulta inicial de cartera

### B2-10 — Clientes propios

**Dado** un vendedor autenticado, **cuando** consulta `GET /api/clientes`, **entonces** recibe HTTP 200 con únicamente los clientes asignados a su cuenta.

No debe exponer clientes pertenecientes a otros vendedores.

La implementación completa de filtros, creación, edición y toma de clientes corresponde a B3.

## 6. SPA inicial

### B2-11 — Formulario de login

**Dado** un vendedor sin sesión, **cuando** abre la SPA, **entonces** visualiza el formulario de inicio de sesión.

El formulario debe permitir introducir correo y contraseña, enviar la petición y mostrar los errores correspondientes.

### B2-12 — Sesión y navegación

**Dado** un inicio de sesión correcto, **cuando** la SPA recibe el token y los datos del usuario, **entonces** guarda la sesión necesaria y navega hacia la cartera.

La navegación debe funcionar mediante rutas hash, sin frameworks.

### B2-13 — Cierre de sesión

**Dado** un vendedor autenticado, **cuando** selecciona «Cerrar sesión», **entonces** se elimina la sesión local y se muestra nuevamente la pantalla de login.

### B2-14 — Sesión expirada

**Dada** una sesión almacenada, **cuando** una petición protegida recibe HTTP 401, **entonces** la SPA elimina el token, redirige al login y muestra un aviso.

### B2-15 — Cartera de solo lectura

**Dado** un vendedor autenticado, **cuando** accede a la vista de cartera, **entonces** visualiza sus clientes y el indicador de cantidad de clientes asignados respecto al máximo de diez.

Todavía no debe permitir crear, editar o tomar clientes.

### B2-16 — Seguridad visual y errores

La SPA debe:

- Escapar los textos externos antes de insertarlos en HTML.
- Utilizar Bootstrap 5.3.
- Incluir la etiqueta viewport.
- Mostrar mensajes cuando no pueda conectarse a la API.
- Mostrar indicadores de carga.
- Evitar guardar contraseñas en el navegador.
- Utilizar JavaScript con módulos, sin React, Vue u otros frameworks.

## 7. Archivos previstos

### API

- `api/src/rutas/auth.js`
- `api/src/middleware/auth.js`
- Ruta de lectura inicial de clientes.
- Ajustes mínimos necesarios en `api/src/app.js`.
- Pruebas automatizadas de autenticación y autorización.

### SPA

- `frontend/index.html`
- `frontend/js/estado.js`
- `frontend/js/api.js`
- `frontend/js/app.js`
- `frontend/js/util/escape.js`
- `frontend/js/util/formato.js`
- `frontend/js/vistas/login.js`
- `frontend/js/vistas/cartera.js`

Se debe revisar la estructura existente antes de crear o modificar archivos.

El punto de integración `#/resumen` corresponde a la Parte A y debe quedar reservado, sin implementar su contenido.

## 8. Seguridad

- No utilizar el paquete `bcrypt`; utilizar `bcryptjs`.
- No crear usuarios desde Express.
- No exponer hashes.
- No almacenar contraseñas en LocalStorage.
- Utilizar `JWT_SECRET` únicamente desde la configuración del entorno.
- Utilizar HS256 para firmar y verificar tokens.
- Utilizar consultas SQL parametrizadas.
- Validar que el usuario continúe activo en cada petición.
- Respetar `CORS_ORIGIN`.
- No revelar información sensible mediante los errores.
- No modificar archivos `.env`.

## 9. Pruebas

Verificar como mínimo:

- Inicio de sesión correcto.
- Correo inexistente.
- Contraseña incorrecta.
- Campos vacíos.
- Cuerpo inválido.
- Administrador intentando ingresar.
- Supervisor intentando ingresar.
- Vendedor inactivo.
- Token ausente.
- Token manipulado.
- Token expirado.
- Token con algoritmo no permitido.
- Cuenta desactivada después de iniciar sesión.
- Consulta de clientes propios.
- Protección de datos de otros vendedores.
- Inicio y cierre de sesión en la SPA.
- Redirección al recibir HTTP 401.
- Manejo de errores de conexión.
- Escapado de contenido externo.

Las pruebas de integración deben utilizar una base de pruebas con el esquema y los datos oficiales disponibles.

No se ejecutarán migraciones ni operaciones destructivas desde la Parte B.

## 10. Condiciones de finalización

B2 estará terminada cuando:

- Se cumplan los criterios B2-01 a B2-16.
- Las pruebas automatizadas correspondientes pasen.
- Se haya probado el login con vendedores reales de VerificacionSeeder.
- La SPA permita iniciar y cerrar sesión.
- El vendedor pueda consultar su cartera.
- Los subagentes revisen el código.
- Los hooks no detecten incumplimientos pendientes.
- No se hayan modificado archivos reservados para la Parte A.
- Los cambios estén revisados antes de integrarlos a main.