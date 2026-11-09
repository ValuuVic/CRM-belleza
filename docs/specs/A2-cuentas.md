# A2 — Cuentas, autenticación y roles del panel

**Proyecto:** CRM Belleza  
**Responsable:** Parte A  
**Rama:** `a/cuentas`  
**Estado:** Aprobada (decisiones DA2-1 a DA2-5 y P1 a P8)  
**Referencia:** `docs/especificacion.md` (`spec-v1`) §3, §3.4, R1, L2, S1, S2, S4; `docs/plan.md` A2  
**Dependencias:** A1 (columnas `rol`, `supervisor_id`, `activo` y `VerificacionSeeder`).

## 1. Objetivo

Dejar el panel Laravel accesible solo para administradores y supervisores activos, sin registro público ni
borrado de cuentas, y dar al administrador la gestión de cuentas (crear, editar, activar y desactivar) con
las reglas de rol y supervisor de la sección 4.1.

## 2. Alcance

### Funcionalidades incluidas

- Eliminar el registro público de Breeze (ruta, controlador, vista, enlaces y su prueba).
- Quitar «Eliminar cuenta» del perfil (ruta, método del controlador, vista y su prueba).
- Quitar la recuperación de contraseña por correo de Breeze (P3).
- Perfil propio: solo nombre y contraseña; el correo lo cambia el administrador (P4).
- Login del panel con mensajes distintos para vendedor y cuenta desactivada.
- Middleware `cuenta.vigente`: en cada petición autenticada cierra la sesión si la cuenta se desactivó o dejó de ser administrador o supervisor.
- Middleware `rol`: el panel admite administrador y supervisor; la gestión de cuentas, solo administrador.
- Gestión de cuentas sin borrado, con FormRequest y mensajes en español tratando de usted.
- Base MySQL de pruebas `crm_belleza_test` y `phpunit.xml` apuntando a ella (P8), como primera tarea de la fase.
- Pruebas de cada criterio.

### Fuera del alcance

- Vista de equipo del supervisor y cartera de sus vendedores (A5).
- Catálogo, clientes y reportes (A3 a A5).
- Qué pasa con las oportunidades abiertas de un vendedor desactivado (P6: se decide en A4 con D2–D4).
- Cambios en `api/` o `frontend/` (la API ya bloquea por su cuenta a los que no son vendedores activos).
- Cambios de esquema: A2 usa las columnas de A1 sin migraciones nuevas.

## 3. Restricciones técnicas

- Breeze Blade existente; Eloquent o constructor de consultas, nunca `DB::raw` con datos del usuario.
- Contraseñas con el cast `hashed` del modelo o `Hash::make` (bcrypt, `$2y$`); nunca en texto plano ni en registros.
- Validación en FormRequest con `messages()` y `attributes()` en español, tratando de usted; al fallar se vuelve al formulario con `old()`, sin la contraseña.
- Blade con `{{ }}`; nunca `{!! !!}` con datos del usuario.
- Solo `validated()` llega al modelo: `rol`, `supervisor_id` y `activo` no se aceptan fuera del formulario de cuentas del administrador.
- `Ventas2026` no aparece en pruebas ni vistas (S2); las pruebas crean sus propias contraseñas.
- Las reglas que dependen de otras filas (P1, P2, P5) se comprueban dentro de una transacción, con `lockForUpdate` sobre las cuentas implicadas, para que dos cambios simultáneos no las burlen.
- Las pruebas corren contra `crm_belleza_test` (MySQL 8.4), nunca contra `crm_belleza` ni SQLite (P8).

## 4. Decisiones de esta fase (propuestas)

| Id | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| DA2-1 | El login comprueba primero la contraseña; solo con la contraseña correcta se distingue vendedor o desactivada | Avisar del rol o del estado antes de verificar la contraseña | Con clave incorrecta no se revela si la cuenta existe ni su rol (igual que A1-02/A1-03 de la API) |
| DA2-2 | Con contraseña correcta pero cuenta no permitida no se crea sesión: se cierra (`Auth::logout`), se invalida la sesión y se regenera el token | Dejar la sesión y bloquear después | L2-04: «no entra» |
| DA2-3 | `supervisor_id` se guarda como NULL cuando el rol no es vendedor, aunque el formulario lo envíe | Rechazar con error | §4.1: NULL para los demás roles; evita datos incoherentes |
| DA2-4 | Al editar, la contraseña vacía conserva la actual | Exigirla siempre | Editar el rol o el estado no obliga a cambiar la clave |
| DA2-5 | Un supervisor que entra a la gestión de cuentas recibe 403 | 404 | La ruta existe y es del panel; el 404 de CLAUDE.md es para registros ajenos (L5-01). Aprobada (P7) |

## 5. Rutas

| Método | Ruta | Nombre | Middleware | Acción |
|---|---|---|---|---|
| GET | `/register` | — | — | No existe: 404 |
| POST | `/register` | — | — | No existe: 404 o 405 |
| DELETE | `/profile` | — | — | No existe: 405 |
| GET/POST | `/forgot-password` | — | — | No existe: 404 (P3) |
| GET | `/reset-password/{token}` | — | — | No existe: 404 (P3) |
| POST | `/reset-password` | — | — | No existe: 404 (P3) |
| GET | `/dashboard` | `dashboard` | `auth`, `cuenta.vigente`, `rol:administrador,supervisor` | Inicio del panel |
| GET/PATCH | `/profile` | `profile.edit` / `profile.update` | `auth`, `cuenta.vigente`, `rol:administrador,supervisor` | Perfil sin borrado |
| GET | `/cuentas` | `cuentas.index` | `auth`, `cuenta.vigente`, `rol:administrador` | Lista |
| GET | `/cuentas/crear` | `cuentas.create` | ídem | Formulario |
| POST | `/cuentas` | `cuentas.store` | ídem | Crear |
| GET | `/cuentas/{user}/editar` | `cuentas.edit` | ídem | Formulario |
| PUT | `/cuentas/{user}` | `cuentas.update` | ídem | Guardar (incluye `activo`) |
| DELETE | `/cuentas/{user}` | — | — | No existe: 405 |

## 6. Reglas del formulario de cuentas

| Campo | Al crear | Al editar | Mensaje de error (ejemplo) |
|---|---|---|---|
| name | Obligatorio, texto, máx. 255 | Igual | «Escriba el nombre de la cuenta.» |
| email | Obligatorio, formato de correo, máx. 255, único en `users` (sin distinguir mayúsculas) | Único ignorando la propia cuenta; solo lo cambia el administrador (P4) | «Ya existe una cuenta con ese correo.» |
| password | Obligatoria, confirmada, `Password::defaults()` (mín. 8) | Opcional; vacía conserva la actual (DA2-4) | «La contraseña debe tener al menos 8 caracteres.» |
| rol | Obligatorio: administrador, supervisor o vendedor | Igual; no se puede cambiar el propio rol de administrador; un supervisor con vendedores o un vendedor con clientes no cambian de rol (P2) | «Usted no puede quitarse su propio rol de administrador.» / «Reasigne primero a los vendedores de este supervisor.» / «Reasigne o libere primero los clientes de este vendedor.» |
| supervisor_id | Obligatorio si rol = vendedor; debe ser una cuenta con rol supervisor y activa; se ignora en otros roles (DA2-3) | Igual | «Elija un supervisor activo para el vendedor.» |
| activo | Booleano; por omisión, activo | No se puede desactivar la propia cuenta; un supervisor con vendedores activos no se desactiva (P1); siempre queda al menos un administrador activo (P5) | «Usted no puede desactivar su propia cuenta.» / «Reasigne primero a los vendedores activos de este supervisor.» / «Debe quedar al menos un administrador activo.» |

## 7. Criterios de aceptación

Cuentas de `VerificacionSeeder`: Alicia Morales (1, administradora), Sergio Ruiz (2) y Sandra Pérez (3, supervisores), Valeria López (4, vendedora), Iván Toj (7, vendedor desactivado). En las pruebas, las contraseñas se fijan en la propia prueba.

### Registro público y borrado

#### A2-01 — Sin registro público (L2-01)

**Dado** el panel, **cuando** se pide `GET /register` o se envía `POST /register`, **entonces** responde 404 (o 405 en el POST) y no se crea ninguna cuenta; `Route::has('register')` es falso, no existen `RegisteredUserController` ni `auth/register.blade.php`, y ni la portada ni el login muestran enlaces de registro.

#### A2-25 — Sin recuperación de contraseña por correo (P3)

**Dado** el panel, **cuando** se pide `/forgot-password` o `/reset-password/{token}`, **entonces** responde 404; el login no muestra «¿Olvidó su contraseña?» y no existen `PasswordResetLinkController`, `NewPasswordController` ni sus vistas. Una contraseña olvidada la cambia el administrador desde «Cuentas».

#### A2-02 — Perfil sin «Eliminar cuenta»

**Dada** Alicia con sesión abierta, **cuando** abre `/profile`, **entonces** ve sus datos y el cambio de contraseña, pero no el formulario de borrado; **cuando** envía `DELETE /profile`, **entonces** responde 405 y su cuenta sigue existiendo.

### Inicio de sesión

#### A2-03 — Administrador y supervisor entran

**Dada** Alicia o Sergio con la contraseña correcta, **cuando** inician sesión en `/login`, **entonces** entran al panel (`/dashboard`).

#### A2-04 — Vendedor enviado a la SPA (L2-04)

**Dada** Valeria con la contraseña correcta, **cuando** inicia sesión en el panel, **entonces** vuelve a `/login` con el mensaje «Su cuenta es de vendedor. Ingrese desde la aplicación de ventas.», no queda autenticada y la sesión se regenera (DA2-2).

#### A2-05 — Cuenta desactivada

**Dado** Iván con la contraseña correcta (o un supervisor desactivado), **cuando** inicia sesión en el panel, **entonces** vuelve a `/login` con el mensaje «Su cuenta está desactivada. Comuníquese con el administrador.» y no queda autenticado.

#### A2-06 — Credenciales incorrectas

**Dado** un correo inexistente, o Alicia, Valeria o Iván con una contraseña incorrecta, **cuando** inician sesión, **entonces** ven el mismo mensaje genérico, «Las credenciales no coinciden con nuestros registros.», sin revelar si la cuenta existe, su rol o su estado (DA2-1); se mantiene el límite de 5 intentos de Breeze.

#### A2-07 — Lo escrito se conserva

**Dado** un inicio de sesión rechazado (A2-04 a A2-06), **cuando** vuelve el formulario, **entonces** conserva el correo y no la contraseña.

### Sesión vigente

#### A2-08 — Desactivación con sesión abierta (L2-05, §3.4)

**Dado** Sergio con sesión abierta, **cuando** el administrador lo desactiva y Sergio hace su siguiente petición, **entonces** la sesión se cierra e invalida y se le envía a `/login` con el mensaje de cuenta desactivada.

#### A2-09 — Cambio de rol con sesión abierta

**Dado** Sergio con sesión abierta, **cuando** su rol cambia a vendedor y hace su siguiente petición, **entonces** la sesión se cierra y ve el mensaje de A2-04.

#### A2-10 — Lectura en cada petición

**Dado** el middleware `cuenta.vigente`, **cuando** procesa una petición autenticada, **entonces** usa el estado actual de la cuenta en la base (no el guardado en la sesión).

### Rol

#### A2-11 — Solo administrador y supervisor en el panel

**Dado** cualquier ruta del panel salvo el login y el cierre de sesión, **cuando** la pide alguien sin sesión, **entonces** se le envía a `/login`; las cuentas de vendedor nunca llegan a tener sesión (A2-04, A2-09).

#### A2-12 — Gestión de cuentas solo para el administrador

**Dado** Sergio con sesión abierta, **cuando** pide cualquier ruta `/cuentas…` (o la escribe a mano), **entonces** recibe 403 (DA2-5) y no ve el menú «Cuentas»; Alicia sí lo ve y entra.

### Gestión de cuentas

#### A2-13 — Lista

**Dada** Alicia, **cuando** abre `/cuentas`, **entonces** ve las 7 cuentas con nombre, correo, rol, supervisor y estado, sin hashes ni contraseñas.

#### A2-14 — Crear un vendedor

**Dada** Alicia, **cuando** crea un vendedor con nombre, correo nuevo, contraseña confirmada y Sergio como supervisor, **entonces** se guarda activo, con `supervisor_id = 2` y la contraseña como hash `$2y$` que verifica con `Hash::check` y con `bcryptjs` desde la API.

#### A2-15 — Crear un supervisor o administrador

**Dada** Alicia, **cuando** crea una cuenta de rol supervisor o administrador (aunque el formulario envíe un supervisor), **entonces** se guarda con `supervisor_id` NULL (DA2-3).

#### A2-16 — Vendedor sin supervisor válido (L2-02)

**Dada** Alicia, **cuando** crea o edita un vendedor sin supervisor, con un supervisor desactivado, con una cuenta que no es supervisor (por ejemplo, Valeria) o con un id inexistente, **entonces** el formulario vuelve con el mensaje junto al campo `supervisor_id` y conserva lo escrito.

#### A2-17 — Correo repetido

**Dada** Alicia, **cuando** crea una cuenta con `valeria@crm.test` (o `VALERIA@crm.test`), o edita otra cuenta con ese correo, **entonces** el formulario vuelve con «Ya existe una cuenta con ese correo.» y no se crea ni cambia nada; editar a Valeria conservando su propio correo sí se acepta.

#### A2-18 — Validación general (L7)

**Dado** el formulario de cuentas, **cuando** se envía sin nombre, con correo inválido, con contraseña corta o sin confirmar, o con un rol inexistente, **entonces** vuelve con un mensaje en español, tratando de usted, junto a cada campo, y con lo escrito conservado salvo la contraseña.

#### A2-19 — Editar sin cambiar la contraseña

**Dada** Alicia editando a Diego, **cuando** cambia el nombre y deja la contraseña vacía, **entonces** se guarda el nombre y el hash no cambia (DA2-4).

#### A2-20 — Desactivar y reactivar

**Dada** Alicia, **cuando** desactiva a Valeria, **entonces** `activo` queda falso, la cuenta sigue existiendo y su siguiente petición a la API responde 401 (CA-03); **cuando** la reactiva, **entonces** puede volver a iniciar sesión en la SPA. Sus clientes no cambian (D4).

#### A2-21 — Autoprotección del administrador (L2-03)

**Dada** Alicia editando su propia cuenta, **cuando** intenta desactivarse o cambiar su rol, **entonces** se rechaza con el mensaje correspondiente, y su rol y estado no cambian.

#### A2-22 — Sin borrado

**Dada** cualquier cuenta, **cuando** se envía `DELETE /cuentas/{id}`, **entonces** responde 405 y la cuenta sigue existiendo.

#### A2-23 — Campos protegidos del perfil (P4)

**Dada** Sergio o Alicia editando su perfil (`PATCH /profile`), **cuando** el cuerpo incluye `email`, `rol`, `activo` o `supervisor_id`, **entonces** esos campos se ignoran y solo cambia el nombre; el formulario de perfil muestra el correo sin permitir editarlo.

#### A2-24 — Cuenta inexistente

**Dada** Alicia, **cuando** pide `/cuentas/999/editar`, **entonces** recibe 404.

#### A2-26 — Supervisor con vendedores activos (P1)

**Dada** Alicia, **cuando** intenta desactivar a Sergio (con Valeria y Diego activos), **entonces** se rechaza con «Reasigne primero a los vendedores activos de este supervisor.» y Sergio sigue activo; **dado** un supervisor cuyos vendedores están todos desactivados, **cuando** se desactiva, **entonces** se acepta.

#### A2-27 — Cambio de rol con dependientes (P2)

**Dada** Alicia, **cuando** intenta cambiar el rol de Sandra (con Carlos e Iván en su equipo) o el de Valeria (con 3 clientes), **entonces** se rechaza con el mensaje correspondiente y el rol no cambia; **dado** un vendedor sin clientes, **cuando** pasa a supervisor, **entonces** se acepta y su `supervisor_id` queda NULL.

#### A2-28 — Al menos un administrador activo (P5)

**Dadas** Alicia y una segunda administradora creada en la prueba, **cuando** cada una intenta a la vez desactivar o quitar el rol a la otra, **entonces** como mucho una de las operaciones se aplica y siempre queda al menos un administrador activo; con un solo administrador activo, ningún cambio lo deja en 0.

#### A2-29 — Base de pruebas (P8)

**Dado** `laravel/phpunit.xml`, **cuando** se ejecuta `php artisan test`, **entonces** las pruebas usan la base MySQL `crm_belleza_test`, la suite completa termina sin errores y `crm_belleza` no cambia.

## 8. Decisiones sobre las preguntas abiertas

Aprobadas por la Parte A el 2026-11-08, junto con DA2-5.

| Id | Pregunta | Decisión | Criterio |
|---|---|---|---|
| P1 | ¿Se puede desactivar un supervisor que tiene vendedores activos? | No: se rechaza hasta reasignar a sus vendedores activos (§4.1: cada vendedor tiene un supervisor activo) | A2-26 |
| P2 | ¿Se puede cambiar el rol de un supervisor con vendedores, o el de un vendedor con clientes? | No: se rechaza mientras tenga vendedores (supervisor) o clientes (vendedor) | A2-27 |
| P3 | ¿Se mantiene la recuperación de contraseña de Breeze? | No: se quita; el administrador asigna una contraseña nueva desde «Cuentas» | A2-25 |
| P4 | ¿Puede un usuario cambiar su propio correo desde el perfil? | No: solo el nombre y la contraseña; el correo lo cambia el administrador | A2-23 |
| P5 | ¿Debe existir siempre al menos un administrador activo? | Sí: se rechaza el cambio que deje 0 administradores activos | A2-21, A2-28 |
| P6 | ¿Qué pasa con las oportunidades abiertas de un vendedor desactivado? | Fuera de A2; se decide en A4 con D2–D4 | — |
| P7 | ¿El supervisor recibe 403 o 404 en la gestión de cuentas? | 403 (DA2-5) | A2-12 |
| P8 | ¿Contra qué base corren las pruebas de A2? | Base MySQL `crm_belleza_test` en el contenedor y `phpunit.xml` apuntando a ella, antes de implementar el resto de A2 | A2-29 |

## 9. Archivos previstos

- Borrar: `app/Http/Controllers/Auth/RegisteredUserController.php`, `app/Http/Controllers/Auth/PasswordResetLinkController.php`, `app/Http/Controllers/Auth/NewPasswordController.php`, `resources/views/auth/register.blade.php`, `resources/views/auth/forgot-password.blade.php`, `resources/views/auth/reset-password.blade.php`, `resources/views/profile/partials/delete-user-form.blade.php`, `tests/Feature/Auth/RegistrationTest.php`, `tests/Feature/Auth/PasswordResetTest.php`.
- Editar: `routes/auth.php`, `routes/web.php`, `bootstrap/app.php` (alias de middleware), `app/Http/Controllers/ProfileController.php`, `app/Http/Requests/Auth/LoginRequest.php`, `app/Http/Requests/ProfileUpdateRequest.php`, `resources/views/auth/login.blade.php`, `resources/views/welcome.blade.php`, `resources/views/profile/edit.blade.php`, `resources/views/profile/partials/update-profile-information-form.blade.php`, `resources/views/layouts/navigation.blade.php`, `tests/Feature/ProfileTest.php`, `phpunit.xml` (P8).
- Crear: `app/Http/Middleware/CuentaVigente.php`, `app/Http/Middleware/Rol.php`, `app/Http/Controllers/CuentaController.php`, `app/Http/Requests/CuentaStoreRequest.php`, `app/Http/Requests/CuentaUpdateRequest.php`, `resources/views/cuentas/{index,create,edit,_form}.blade.php`, `tests/Feature/A2CuentasTest.php`.

No crear archivos adicionales que no sean necesarios.

## 10. Estrategia de pruebas

- Primero, crear `crm_belleza_test` y apuntar `phpunit.xml` a ella (A2-29); la suite de Breeze debe volver a pasar antes de seguir.
- Pruebas de Laravel (Feature) por criterio, con `VerificacionSeeder` cargado en la base de pruebas.
- Login con vendedor, desactivado y credenciales malas (A2-03 a A2-07).
- Sesión abierta y cambio de estado o rol en la base entre dos peticiones (A2-08 a A2-10).
- Rutas prohibidas por rol y rutas que no existen (A2-01, A2-02, A2-11, A2-12, A2-22, A2-24).
- Formularios con errores y datos conservados (A2-16 a A2-18, A2-21).
- Reglas sobre otras filas y peticiones simultáneas (A2-26 a A2-28).
- Integración: desactivar a Valeria en el panel y comprobar el 401 de la API (A2-20).
- Resultados reales en `docs/verificacion.md`.

## 11. Condiciones de finalización

A2 se considerará terminada cuando:

- El panel cumpla los criterios A2-01 a A2-29.
- La suite de Laravel se ejecute completa, sin errores, y sus resultados queden registrados.
- No se hayan modificado archivos de la Parte B (`api/`, `frontend/`).
- Cada tarea tenga su commit, con Conventional Commits en español.
