# Especificación del sistema — CRM Belleza
## 1. Descripción general

### 1.1 Propósito
CRM Belleza es un sistema CRM de gestión de relaciones con clientes orientado a una distribuidora de productos de maquillaje y belleza. Su objetivo es administrar clientes, controlar las oportunidades comerciales, registrar actividades de seguimiento, gestionar el catálogo y obtener reportes de ventas. El sistema permitirá controlar las responsabilidades de los vendedores, evitar asignaciones duplicadas y mantener un historial de las oportunidades comerciales.

### 1.2 Problema que resuelve
La distribuidora necesita centralizar la información comercial para evitar problemas como:
- Clientes atendidos por varios vendedores sin coordinación.
- Falta de seguimiento de oportunidades de venta.
- Ausencia de información sobre ventas mensuales.
- Dificultad para calcular pronósticos comerciales.
- Falta de control sobre la disponibilidad de productos.
- Pérdida del historial comercial al cambiar de vendedor.

### 1.3 Objetivo general
Desarrollar un CRM que permita administrar clientes, oportunidades, actividades y ventas mediante tres roles de usuario, utilizando un panel Laravel y una SPA conectada a una API REST sobre una base de datos MySQL compartida.

### 1.4 Objetivos específicos
- Implementar autenticación y autorización según el rol.
- Administrar cuentas, productos, clientes y equipos comerciales.
- Permitir a los vendedores trabajar su cartera.
- Registrar oportunidades y sus productos.
- Mantener un historial de cambios de etapa.
- Controlar las actividades de seguimiento.
- Calcular ventas y pronósticos mensuales.
- Validar y descontar existencias al confirmar una venta.
- Garantizar la seguridad y consistencia de los datos.

## 2. Arquitectura del sistema

### 2.1 Tecnologías
| Componente | Tecnología |
|---|---|
| Panel administrativo | Laravel 13 + Breeze Blade |
| Backend de la SPA | Node.js 24 + Express 5 |
| Acceso SQL desde API | mysql2/promise |
| Autenticación API | JWT con HS256 |
| Contraseñas | Hash generado en Laravel y verificado con bcryptjs |
| SPA | HTML, Bootstrap 5.3, JavaScript con módulos |
| Base de datos | MySQL 8.4 |
| Infraestructura local | Docker Desktop |
| Pruebas API | Postman |
| Control de versiones | Git y GitHub |
| Desarrollo asistido | Claude Code u otro agente de IA |

### 2.2 Arquitectura lógica
El sistema estará compuesto por tres elementos:
**Panel Laravel**
Utilizado exclusivamente por administradores y supervisores. Gestiona cuentas, catálogo, clientes, equipos y reportes.
**API REST Express**
Permite a los vendedores consultar y modificar sus datos comerciales mediante peticiones HTTP autenticadas con JWT.
**SPA del vendedor**
Interfaz de navegador que consume la API REST, sin conexión directa a la base de datos.
Laravel y Express utilizan una única base de datos MySQL.

### 2.3 Restricciones arquitectónicas
- Solo Laravel crea y modifica el esquema mediante migraciones.
- La API utiliza SQL parametrizado escrito manualmente.
- La API no utiliza ORM ni query builders.
- La SPA no utiliza frameworks de JavaScript.
- Laravel es el único componente que crea cuentas de usuario.
- Todos los componentes comparten las mismas reglas del negocio.
- Las fechas se almacenan en UTC y se muestran en hora de Guatemala cuando corresponda.

## 3. Roles y permisos

### 3.1 Administrador
Accede únicamente al panel Laravel.
Puede:
- Crear, editar y desactivar cuentas.
- Administrar productos y sus existencias.
- Consultar y administrar clientes.
- Consultar oportunidades de toda la empresa.
- Consultar reportes generales.
- Gestionar asignaciones comerciales.
No puede acceder a la API destinada a vendedores.

### 3.2 Supervisor
Accede únicamente al panel Laravel.
Puede:
- Consultar vendedores de su equipo.
- Consultar clientes de su equipo y clientes disponibles.
- Crear clientes.
- Asignar, reasignar y liberar clientes dentro de las reglas establecidas.
- Consultar oportunidades del equipo.
- Consultar reportes del equipo.
No puede administrar cuentas ni catálogo, ni consultar información privada de otros equipos.

### 3.3 Vendedor
Accede únicamente a la SPA mediante la API Express.
Puede:
- Iniciar y cerrar sesión.
- Consultar y buscar clientes de su cartera.
- Crear y editar sus clientes.
- Tomar clientes disponibles.
- Crear oportunidades para sus clientes.
- Agregar, modificar y quitar productos de oportunidades.
- Cambiar etapas comerciales.
- Registrar actividades.
- Marcar actividades como completadas.
- Consultar su resumen de ventas.
No puede administrar usuarios, modificar el catálogo, acceder al panel Laravel ni consultar información de otro vendedor.

### 3.4 Cuentas inactivas
Una cuenta inactiva no puede iniciar sesión.
Si se desactiva mientras tiene una sesión o token válido, debe perder acceso en su siguiente petición.

## 4. Modelo de datos
El esquema obligatorio será administrado únicamente por Laravel, mediante migraciones. La API nunca ejecuta `CREATE`, `ALTER`, `DROP` ni `TRUNCATE`.
Todas las fechas se almacenan en UTC. Todas las tablas tienen `created_at` y `updated_at`, salvo `historial_etapas`, que solo tiene `created_at`.

### 4.1 Tabla users
Campos originales de Laravel (la migración original no se edita):
- `id`
- `name` (la API lo expone como `nombre`)
- `email` (la API lo expone como `correo`)
- `password` (hash generado por Laravel)
- Campos de autenticación y marcas de tiempo correspondientes.

Campos adicionales, agregados con una migración propia:

| Campo | Regla |
|---|---|
| rol | administrador, supervisor o vendedor; obligatorio; por defecto vendedor |
| supervisor_id | FK a users; obligatorio para vendedores y NULL para los demás roles; debe referenciar una cuenta con rol supervisor |
| activo | Booleano, por defecto verdadero |

Cada vendedor pertenece al equipo de un supervisor. Las cuentas no se borran: se desactivan.

### 4.2 Tabla productos
| Campo | Regla |
|---|---|
| id | Clave primaria |
| nombre | VARCHAR(120), obligatorio, único |
| precio | DECIMAL(10,2), mayor que cero, en quetzales |
| activo | Booleano; solo los activos se agregan a una oportunidad |
| stock | INT NULL, columna adicional del sector |

Los productos no se borran: se desactivan.
`stock = NULL` significa que el producto no tiene control de inventario. Si stock tiene un valor numérico, debe ser mayor o igual a cero. La columna acepta vacío, por lo que no rompe el contrato del núcleo.

### 4.3 Tabla clientes
| Campo | Regla |
|---|---|
| id | Clave primaria |
| vendedor_id | FK a users, admite NULL; es el vendedor responsable |
| nombre | VARCHAR(150), obligatorio |
| nit | VARCHAR(12), admite NULL; NIT válido guardado compacto (de 2 a 12 caracteres, por ejemplo `4521817K`); NULL para consumidor final; único si no es NULL |
| telefono | CHAR(8), obligatorio, único; 8 dígitos que empiezan con 2 a 9 |
| correo | VARCHAR(150), opcional; formato de correo válido |

Un `vendedor_id` nulo significa que el cliente está disponible. Al borrar un cliente se borran sus actividades.

### 4.4 Tabla oportunidades
| Campo | Regla |
|---|---|
| id | Clave primaria |
| cliente_id | FK a clientes, obligatorio |
| vendedor_id | FK a users; el dueño de la oportunidad |
| titulo | VARCHAR(150), obligatorio |
| etapa | prospecto, calificado, propuesta, negociacion, ganada o perdida; por defecto prospecto |
| motivo_perdida | VARCHAR(255) o NULL; presente si y solo si la etapa es perdida |
| fecha_cierre | DATETIME o NULL; presente si y solo si la etapa es ganada o perdida |

La oportunidad pertenece al vendedor responsable.

### 4.5 Tabla oportunidad_productos
Cada fila es una línea de la oportunidad: un producto, su cantidad y el precio al que se cotizó.

| Campo | Regla |
|---|---|
| id | Clave primaria (es el `lineaId` del contrato) |
| oportunidad_id | FK a oportunidades; al borrar la oportunidad se borran sus líneas |
| producto_id | FK a productos |
| cantidad | SMALLINT, entre 1 y 999 |
| precio_unitario | DECIMAL(10,2), mayor que cero; el precio del catálogo al agregar el producto |

Un producto solo puede aparecer una vez dentro de una misma oportunidad (índice único).

### 4.6 Tabla historial_etapas
| Campo | Regla |
|---|---|
| id | Clave primaria |
| oportunidad_id | FK a oportunidades; al borrar la oportunidad se borra su historial |
| usuario_id | FK a users; quién hizo el cambio |
| etapa_anterior | Una etapa o NULL (NULL en el registro de creación) |
| etapa_nueva | Una etapa, obligatoria |
| created_at | Fecha del cambio en UTC (esta tabla no tiene `updated_at`) |

Cada oportunidad registra su creación y cada cambio de etapa posterior.

### 4.7 Tabla actividades
| Campo | Regla |
|---|---|
| id | Clave primaria |
| cliente_id | FK a clientes; al borrar el cliente se borran sus actividades |
| vendedor_id | FK a users; quién la registró |
| tipo | llamada, reunion o tarea; obligatorio |
| descripcion | VARCHAR(500), obligatoria |
| vence_en | DATETIME, opcional, en UTC |
| completada | Booleano, por defecto falso |

### 4.8 Integridad referencial
La base de datos debe incluir:
- Claves primarias y foráneas, con las cascadas indicadas en cada tabla.
- Índices únicos: nombre de producto, NIT (cuando no es NULL), teléfono y producto por oportunidad.
- Restricciones CHECK: precios mayores que cero, cantidades de 1 a 999, formato del teléfono, stock no negativo y la relación entre etapa, motivo de pérdida y fecha de cierre.

Dos aplicaciones escriben en estas tablas, por lo que una regla que solo vive en una de ellas no protege nada. Las validaciones que dependen de varias filas (cartera máxima, transiciones, stock suficiente) se implementan además en la lógica del servidor, dentro de transacciones.

### 4.9 Dónde se cumple cada regla
| Regla | Base de datos | Panel Laravel | API Express |
|---|---|---|---|
| Rol y supervisor de cada cuenta | FK `supervisor_id` | FormRequest (solo un supervisor activo) | No crea cuentas |
| Cuenta desactivada sin acceso | Columna `activo` | Middleware de sesión | Middleware JWT y bloqueo del vendedor al escribir |
| Producto único y precio > 0 | Índice único y CHECK | FormRequest | Solo lectura del catálogo |
| NIT válido, compacto y único | Índice único (NIT no NULL) | FormRequest con la misma normalización | `normalizarNit` y error 1062 → 409 |
| Teléfono de 8 dígitos y único | CHECK de formato e índice único | FormRequest con la misma normalización | `normalizarTelefono` y error 1062 → 409 |
| Cartera máxima de 10 clientes | — (depende de varias filas) | Transacción al asignar o reasignar | Transacción con bloqueo del vendedor (`FOR UPDATE`) antes de contar |
| Toma atómica de un cliente | — | — | Transacción con `FOR UPDATE` y `UPDATE … WHERE vendedor_id IS NULL` |
| Propiedad de los registros | FK | Políticas y consultas por equipo (404) | Filtro por el vendedor del token (404) |
| Etapa válida | CHECK o ENUM | Solo lectura | Máquina de estados |
| Motivo y fecha de cierre según etapa | CHECK | Solo lectura | Se escriben en la misma transacción que el cambio de etapa |
| Historial de etapas | FK y cascada | Solo lectura | Misma transacción que el cambio, con la oportunidad bloqueada |
| Producto una vez por oportunidad | Índice único | Solo lectura | Error 1062 → 409, sin consulta previa |
| Cantidad de 1 a 999 | CHECK | Solo lectura | Validación (422) |
| Precio copiado del catálogo | CHECK precio > 0 | Cambiar el precio no altera líneas | Se copia en el servidor; el cuerpo nunca lo trae |
| Stock suficiente y no negativo (RP) | CHECK `stock IS NULL OR stock >= 0` | Administración del stock en el catálogo | Transacción con `FOR UPDATE` de los productos y `UPDATE … stock >= ?` |
| Fechas en UTC | DATETIME en UTC | Zona UTC de Laravel | `mysql2` con `timezone: 'Z'`; entrada sin zona → 422 |

---

## 5. Reglas del núcleo

### R1. Acceso según rol
Cada usuario podrá ingresar únicamente mediante la interfaz correspondiente a su rol.
Los vendedores no pueden usar el panel Laravel. Los administradores y supervisores no pueden autenticarse como vendedores mediante la API.
Las cuentas inactivas quedan bloqueadas en ambas puertas, y lo que tenían abierto (sesión del panel o token de la API) deja de servirles en su siguiente petición.

### R2. Propiedad de los registros
Los vendedores solo pueden consultar y modificar sus clientes, sus oportunidades y las actividades de los clientes de su cartera.
Un supervisor solo ve a su equipo y a los clientes disponibles.
El dueño se determina mediante la sesión o el JWT, nunca mediante datos enviados en el cuerpo.
Un registro ajeno responde HTTP 404, no 403: la respuesta no confirma que exista.

### R3. Cartera comercial
Cada vendedor puede tener un máximo de diez clientes.
Crear, asignar o tomar un cliente cuando la cartera está llena se rechaza (HTTP 409 en la API).
Un cliente sin vendedor está disponible y cualquier vendedor con espacio en su cartera puede tomarlo.
La lista de disponibles muestra solo el `id` y el `nombre`: sin NIT, teléfono ni correo.
La toma de clientes es atómica: si varios vendedores intentan tomar el mismo cliente al mismo tiempo, exactamente uno lo consigue y los demás reciben HTTP 409.
La cartera máxima se respeta aunque lleguen varias altas o tomas simultáneas del mismo vendedor.

### R4. Identidad del cliente

**NIT**
- Se permite NIT válido de Guatemala o CF (consumidor final).
- Antes de validarlo se compacta: se eliminan espacios y guiones, se convierte a mayúsculas y se quitan los ceros a la izquierda.
- Un NIT compacto tiene entre 2 y 12 caracteres. El último carácter es el dígito verificador (0 a 9, o K).
- El verificador se calcula con módulo 11: se separa el cuerpo (todo menos el último carácter); cada dígito del cuerpo se multiplica, de derecha a izquierda, por 2, 3, 4…; se suman los productos y se calcula `(11 - (suma mod 11)) mod 11`. Si da 10, el verificador es K.
- Ejemplo: `452 1817-k` se compacta a `4521817K`. Cuerpo 4521817: 7·2 + 1·3 + 8·4 + 1·5 + 2·6 + 5·7 + 4·8 = 133; 133 mod 11 = 1; 11 − 1 = 10 → K. Válido.
- CF se almacena como NULL y la API lo devuelve como `"CF"`. Así varios clientes pueden ser consumidor final sin chocar con el índice único.

**Teléfono**
- Se eliminan espacios, guiones, puntos, paréntesis y el prefijo de Guatemala (`+502` o `502`).
- Debe quedar un teléfono de ocho dígitos que empiece con un dígito del 2 al 9.

**Sin repetidos**
- El NIT (cuando no es CF) y el teléfono no se repiten entre clientes, comparados ya normalizados: `4521817-k` y `4521817K` son el mismo NIT.
- Los duplicados devuelven HTTP 409. El árbitro final es el índice único de la base de datos; una consulta previa, sola, no basta.

### R5. Embudo de ventas
| Etapa | Probabilidad |
|---|---:|
| prospecto | 10 % |
| calificado | 25 % |
| propuesta | 50 % |
| negociacion | 75 % |
| ganada | 100 % |
| perdida | 0 % |

- Toda oportunidad nace en `prospecto`, para un cliente de la cartera de quien la crea.
- Las primeras cuatro etapas son abiertas; `ganada` y `perdida` son cerradas.
- El enunciado exige como mínimo avanzar una etapa a la vez entre las abiertas, ganar desde negociación y perder desde negociación. Las transiciones adicionales y la respuesta de la API a las no permitidas se fijan en la decisión D1.
- Para ganar se exige al menos un producto.
- Para perder se exige un motivo de 1 a 255 caracteres después de eliminar los espacios de los extremos.
- Al cerrarse, la oportunidad registra su fecha de cierre. Una oportunidad cerrada no puede modificar su título, etapa ni productos (HTTP 409).
- El historial registra la creación (con etapa anterior NULL) y cada cambio de etapa, con quién y cuándo, en la misma transacción que el cambio.
- Un intento rechazado no deja registro en el historial, y dos cambios simultáneos sobre la misma oportunidad no pueden dejar dos registros.

### R6. Montos y precios
- Los montos están expresados en quetzales con dos decimales.
- Los precios se almacenan como DECIMAL(10,2), nunca como FLOAT.
- El precio se copia del catálogo cuando se agrega una línea. Quien hace la petición nunca envía el precio.
- Los cambios posteriores del precio del catálogo no alteran líneas existentes.
- El total de una oportunidad es la suma de cantidad × precio unitario de sus líneas, y lo calcula el servidor.
- Solo pueden agregarse productos activos.
- Un producto que ya está en la oportunidad no se agrega otra vez (HTTP 409): se cambia su cantidad.
- Las cantidades son enteros entre 1 y 999.

### R7. Reportes
- Una venta corresponde a una oportunidad ganada.
- El mes de venta es el mes calendario de su fecha de cierre en hora de Guatemala (UTC−6, sin horario de verano), aunque la base guarde UTC. Por ejemplo, una venta del 1 de noviembre a las 03:30 UTC pertenece al 31 de octubre.
- El total vendido es la suma de los totales de las ventas del mes, calculados con el precio guardado en cada línea.
- El pronóstico se calcula con las oportunidades abiertas, sin filtro de mes:
`pronostico = SUM(total_oportunidad * probabilidad / 100)`, redondeado a dos decimales.
- El reporte incluye cantidad de ventas, total vendido, pronóstico, información de cartera según el rol y los desgloses exigidos en el panel.
- Los reportes se calculan en la base de datos (SQL en la API; Eloquent o el constructor de consultas en el panel) y la API los devuelve como números, no como texto.

### R8. Respuestas y fechas
- La API utiliza JSON.
- La API nunca devuelve hashes de contraseñas, llaves internas como `vendedor_id`, `user_id` o `supervisor_id`, ni datos de otro vendedor.
- Las fechas de salida se expresan en ISO 8601 UTC, por ejemplo `2026-10-05T16:00:00.000Z`.
- Una fecha de entrada sin zona horaria (`2026-12-01T10:00`) es ambigua y se rechaza con HTTP 422. Con zona (`2026-12-01T10:00:00-06:00`) se almacena en UTC.
- La SPA muestra las fechas en la zona `America/Guatemala`.
- Una actividad está vencida cuando no está completada y su vencimiento ya pasó.

## 6. Requisitos del panel Laravel

### L1. Esquema y semillas
Laravel debe generar el esquema mediante migraciones.
Se implementarán:
- `VerificacionSeeder`: datos exactos del enunciado.
- `SectorSeeder`: datos propios de la distribuidora de maquillaje.
El sistema debe permitir cargar únicamente la semilla de verificación o ambas semillas.

### L2. Cuentas y roles
El administrador gestiona las cuentas y sus roles.
No existe registro público.
El administrador no puede desactivarse ni retirarse su propio rol de administrador.
Los vendedores deben estar asociados a un supervisor válido.

### L3. Catálogo
El administrador puede crear, editar y desactivar productos.
El precio debe ser mayor que cero y tener como máximo dos decimales.
La disponibilidad de stock se administra en el catálogo.
Cambiar el precio de un producto no altera oportunidades anteriores.

### L4. Clientes y asignación
El administrador y el supervisor gestionan los clientes permitidos por sus roles.
Se requiere búsqueda, filtros, creación, edición, asignación, reasignación y liberación.
Debe respetarse el límite de diez clientes por vendedor.
El administrador solo puede eliminar un cliente si no tiene oportunidades.

### L5. Equipos y visibilidad
El supervisor solo administra su equipo.
Debe poder consultar la cartera y las ventas mensuales de cada vendedor de su equipo.
No puede acceder a registros de otros equipos.

### L6. Oportunidades y reportes
El panel muestra las oportunidades permitidas según el rol.
Las oportunidades son de solo lectura en el panel.
Los reportes incluyen ventas, totales y pronósticos por vendedor y producto, con los filtros y alcances correspondientes.

### L7. Validación del servidor
Los formularios deben validar sus datos en el servidor.
Los mensajes estarán en español y tratarán al usuario de usted.
Los formularios conservarán la información introducida cuando ocurra un error.

## 7. Requisitos de la API REST
URL base: `/api`

### A1. Inicio de sesión
La API permite iniciar sesión mediante correo y contraseña.
Solo los vendedores activos reciben un JWT.
Las credenciales incorrectas generan HTTP 401.
Los usuarios de roles no permitidos o desactivados, con contraseña correcta, reciben HTTP 403.

### A2. Middleware de autenticación
Todas las rutas, excepto el login, requieren un token Bearer válido.
El token utiliza HS256 y tiene expiración configurable.
El middleware vuelve a consultar el estado del usuario en cada petición.

### A3. Clientes y cartera
La API permite:
- Listar los clientes del vendedor.
- Buscar clientes.
- Crear clientes.
- Consultar clientes disponibles.
- Consultar detalles.
- Editar clientes propios.
- Tomar clientes disponibles.
La cartera máxima y la toma de clientes se protegen contra concurrencia.

### A4. Oportunidades y productos
La API permite:
- Consultar oportunidades.
- Crear oportunidades.
- Consultar detalles.
- Modificar títulos.
- Cambiar etapas.
- Agregar productos.
- Modificar cantidades.
- Quitar líneas de productos.
El cambio de etapa y su historial deben ser transaccionales.

### A5. Actividades
La API permite:
- Consultar actividades.
- Crear actividades para clientes propios.
- Marcar actividades como completadas.
Las fechas de vencimiento se reciben con zona horaria y se almacenan en UTC.

### A6. Resumen mensual
La API calcula y devuelve ventas, total vendido, pronóstico y cartera.
Las cifras se calculan mediante SQL y se devuelven como números.
La implementación de este endpoint corresponde a la Parte A según la distribución acordada.

### A7. Errores y respuestas
Todos los endpoints respetan los códigos y estructuras del contrato.
Los errores inesperados no exponen información interna.

### A8. Documentación
El repositorio debe incluir:
- Tabla de endpoints.
- Instrucciones para iniciar Laravel, Express, SPA y MySQL.
- Colección de Postman.
- Casos de error.
- Pruebas de la regla propia del sector.

## 8. Contrato obligatorio de la API
Base: `http://localhost:3000/api`. Todo viaja en JSON. Todas las rutas exigen `Authorization: Bearer <token>`, salvo el inicio de sesión.
Se pueden agregar endpoints, pero no cambiar estos: el catedrático los verifica con pruebas automáticas.

| Método | Ruta | Cuerpo o parámetros | Respuesta correcta | Errores |
|---|---|---|---|---|
| POST | /auth/login | `{ correo, clave }` | 200 `{ token, usuario }` | 400, 401, 403, 422 |
| GET | /productos | — | 200, productos activos | 400\*, 401 |
| GET | /clientes | `?q=` (contiene, en nombre o NIT; máximo 100 caracteres) | 200, clientes de su cartera | 400, 401 |
| POST | /clientes | `{ nombre, nit, telefono, correo }`; correo opcional | 201, el cliente, ya en su cartera | 400, 401, 409, 422 |
| GET | /clientes/disponibles | — | 200, `[{ id, nombre }]` | 400\*, 401 |
| POST | /clientes/:id/tomar | — | 200, el cliente, ya en su cartera | 401, 404, 409 |
| GET | /clientes/:id | — | 200, el cliente | 401, 404 |
| PATCH | /clientes/:id | Los campos que cambian (`nombre`, `nit`, `telefono`, `correo`) | 200, el cliente | 400, 401, 404, 409, 422 |
| POST | /clientes/:id/actividades | `{ tipo, descripcion, vence_en }`; vence_en opcional | 201, la actividad | 400, 401, 404, 422 |
| GET | /actividades | `?estado=pendiente` o `completada` | 200, actividades de los clientes de su cartera | 400, 401 |
| PATCH | /actividades/:id | `{ completada }` | 200, la actividad | 400, 401, 404, 422 |
| GET | /oportunidades | `?etapa=` | 200, resumen de sus oportunidades | 400, 401 |
| POST | /oportunidades | `{ cliente_id, titulo }` | 201, detalle, en prospecto | 400, 401, 422 |
| GET | /oportunidades/:id | — | 200, detalle | 401, 404 |
| PATCH | /oportunidades/:id | `{ titulo }` | 200, detalle | 400, 401, 404, 409, 422 |
| PATCH | /oportunidades/:id/etapa | `{ etapa, motivo_perdida }`; motivo solo al perder | 200, detalle | 400, 401, 404, 409, 422 |
| POST | /oportunidades/:id/productos | `{ producto_id, cantidad }` | 201, detalle | 400, 401, 404, 409, 422 |
| PATCH | /oportunidades/:id/productos/:lineaId | `{ cantidad }` | 200, detalle | 400, 401, 404, 409, 422 |
| DELETE | /oportunidades/:id/productos/:lineaId | — | 204, sin cuerpo | 401, 404, 409 |
| GET | /reportes/resumen | `?mes=AAAA-MM`; por omisión, el mes actual de Guatemala | 200, resumen del mes | 400, 401 |

\* 400 solo cuando se envía un parámetro de consulta que la ruta no admite (decisión D6; §8.7).

`:lineaId` es el id de la línea, el que aparece en `productos` dentro del detalle.
Los campos que el contrato no lista (por ejemplo `vendedor_id`, `etapa` al crear o `precio_unitario`) nunca se usan (decisión D5).
Un identificador de ruta que no es un entero positivo (por ejemplo `/clientes/abc`) responde 404, igual que un recurso inexistente (decisión D9).

### 8.1 Respuesta de login
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "usuario": { "id": 4, "nombre": "Valeria López", "correo": "valeria@crm.test" }
}
```

### 8.2 Respuesta de cliente
En una lista, cada elemento tiene esta misma forma. El NIT NULL se devuelve como `"CF"` y `correo` puede ser `null`.
```json
{ "id": 1, "nombre": "Comercial El Quetzal", "nit": "4521817K",
  "telefono": "55551234", "correo": "compras@elquetzal.test" }
```

`GET /clientes/disponibles` devuelve exclusivamente `[{ "id": 13, "nombre": "Hotel Los Pinos" }]`.

### 8.3 Detalle de oportunidad
```json
{
  "id": 1,
  "cliente": { "id": 1, "nombre": "Comercial El Quetzal" },
  "titulo": "Renovación de planes",
  "etapa": "ganada",
  "probabilidad": 100,
  "total": 5650,
  "fecha_cierre": "2026-10-05T16:00:00.000Z",
  "motivo_perdida": null,
  "productos": [
    { "id": 1, "producto_id": 2, "nombre": "Plan avanzado",
      "cantidad": 2, "precio_unitario": 2600, "subtotal": 5200 },
    { "id": 2, "producto_id": 3, "nombre": "Instalación",
      "cantidad": 1, "precio_unitario": 450, "subtotal": 450 }
  ],
  "historial": [
    { "etapa_anterior": null, "etapa_nueva": "prospecto",
      "usuario": "Valeria López", "fecha": "2026-09-23T16:00:00.000Z" }
  ]
}
```
- `probabilidad` es un entero porcentual (10, 25, 50, 75, 100 o 0).
- `total` y `subtotal` los calcula el servidor con el precio guardado en cada línea.
- `historial[].usuario` es el nombre de quien hizo el cambio, como texto; nunca su id (R8).

**Resumen del listado** (`GET /oportunidades`): sin productos ni historial (decisión D11).
```json
{ "id": 1, "cliente": { "id": 1, "nombre": "Comercial El Quetzal" }, "titulo": "Renovación de planes",
  "etapa": "ganada", "probabilidad": 100, "total": 5650, "fecha_cierre": "2026-10-05T16:00:00.000Z" }
```

**Catálogo** (`GET /productos`): solo productos activos, ordenados por nombre (decisión D12).
```json
{ "id": 2, "nombre": "Plan avanzado", "precio": 2750.5, "stock": null }
```

### 8.4 Respuesta de actividad
```json
{ "id": 2, "cliente": { "id": 2, "nombre": "Ferretería Xela" },
  "tipo": "tarea", "descripcion": "Enviar propuesta de capacitación",
  "vence_en": "2030-01-15T15:00:00.000Z", "completada": false, "vencida": false }
```
`vencida` se calcula al responder: es verdadera si la actividad no está completada y su vencimiento ya pasó.

### 8.5 Resumen mensual
```json
{ "mes": "2026-10", "ventas": 2, "total": 9250, "pronostico": 2512.88,
  "cartera": { "clientes": 3, "maximo": 10 } }
```
Los montos viajan como números: `9250` y `9250.00` son el mismo número en JSON, pero `"9250.00"` (texto) es incorrecto.

### 8.6 Códigos HTTP
| Código | Cuándo se usa |
|---|---|
| 200 | Lectura o modificación correcta |
| 201 | Se creó un cliente, una oportunidad, una línea o una actividad |
| 204 | Se quitó un producto de una oportunidad; no hay cuerpo |
| 400 | La petición no se puede interpretar: JSON mal formado, falta el cuerpo, o un filtro o parámetro no existe |
| 401 | Credenciales incorrectas; o falta el token, está alterado, venció o la cuenta ya no es válida |
| 403 | Credenciales correctas, pero la cuenta no puede usar la API: no es de vendedor o está desactivada |
| 404 | El recurso no existe o es de otro vendedor |
| 409 | La petición choca con el estado actual: cartera llena, cliente ya tomado, NIT o teléfono repetido, producto repetido, oportunidad cerrada, etapa repetida o stock insuficiente |
| 422 | La petición se entiende, pero los datos violan una regla |
| 500 | Error inesperado; el mensaje es genérico y el detalle queda solo en la consola del servidor |

### 8.7 Formato de errores
Error general (cualquier código):
```json
{ "error": "Su cartera ya tiene 10 clientes, el máximo permitido." }
```
Error de validación (422), un mensaje por campo:
```json
{ "errores": {
    "nit": "Escriba un NIT válido (con su dígito verificador) o CF.",
    "telefono": "Escriba un teléfono de Guatemala de 8 dígitos." } }
```
Los mensajes están en español y tratan al usuario de usted.

**Precedencia de códigos.** En las rutas sobre un recurso existente se comprueba, en este orden: identificador de ruta (404) → parámetros de consulta (400) → cuerpo interpretable (400) → propiedad (404) → estado cerrado (409) → validación de campos (422) → reglas de negocio (409 o 422). Así, una oportunidad ajena siempre responde 404 y una cerrada 409, aunque el cuerpo sea inválido (decisión D10).

## 9. Requisitos de la SPA

### F1. Sesión
La SPA tendrá una pantalla de inicio de sesión.
Si la cuenta no es de vendedor o está desactivada, la SPA muestra el mensaje del 403.
Guardará la sesión necesaria y permitirá cerrar sesión. LocalStorage solo guarda la sesión.
Si recibe HTTP 401 durante una sesión, eliminará el token y solicitará una nueva autenticación con un aviso.

### F2. Cartera
La SPA mostrará:
- Clientes del vendedor.
- Búsqueda desde el servidor.
- Número de clientes asignados respecto al límite de diez.
- Formulario de creación.
- Edición de clientes.
- Clientes disponibles.
- Acción para tomar clientes.
Los errores de validación aparecerán junto a los campos sin perder lo escrito.

### F3. Embudo de oportunidades
El vendedor podrá:
- Consultar sus oportunidades por etapa.
- Crear oportunidades.
- Abrir el detalle de una oportunidad.
- Agregar productos.
- Modificar cantidades.
- Quitar productos.
- Consultar el historial.
- Cambiar de etapa según las reglas aprobadas.
- Registrar el motivo cuando se pierda una oportunidad.
El sistema mostrará el total y los subtotales correspondientes.

### F4. Actividades
La interfaz tendrá:
- Listado de actividades pendientes.
- Listado de actividades completadas.
- Distinción visual de actividades vencidas.
- Formulario de creación.
- Acción para marcar actividades como completadas.

### F5. Resumen mensual
El vendedor podrá consultar:
- Mes seleccionado.
- Ventas.
- Total vendido.
- Pronóstico.
- Cartera.
Los montos se mostrarán en quetzales.
La implementación de esta vista corresponde a la Parte A según la distribución acordada.

### F6. Calidad de interfaz
- Diseño adaptable a dispositivos móviles.
- Sin desplazamiento horizontal a 375 píxeles.
- Indicadores de carga.
- Mensajes cuando la API no esté disponible.
- Manejo de errores de servidor.
- Escapado de texto para evitar XSS.
- Patrón estado → render y delegación de eventos.

## 10. Regla propia del sector: RP — Stock suficiente

### 10.1 Descripción
CRM Belleza incorpora una regla adicional para controlar las existencias de los productos de maquillaje.
Cuando un vendedor intente marcar una oportunidad como ganada, el sistema comprobará que exista inventario suficiente de los productos sujetos a control.
Si las existencias no alcanzan, no se confirmará la venta.

### 10.2 Reglas
La numeración válida de la regla propia es la de esta sección. En `docs/specs/B4-oportunidades.md`, «RP-3» se usa para el tratamiento de `stock = NULL`, que aquí está en la sección 10.3 y en RP-04.

**RP-1. Verificación**
Antes de confirmar una venta, se verifica el stock de todas las líneas de la oportunidad que tengan inventario controlado.

**RP-2. Descuento**
Cuando una oportunidad pasa correctamente a ganada, se descuentan las cantidades correspondientes de los productos controlados.

**RP-3. Atomicidad**
La validación del stock, el descuento, el cambio de etapa y el registro de historial deben ejecutarse en una misma transacción.

Si alguna validación falla, toda la operación se revierte.

### 10.3 Comportamiento
- `stock = NULL`: inventario no controlado.
- `stock >= cantidad`: puede confirmar la venta.
- `stock < cantidad`: HTTP 409.
- El stock nunca puede quedar negativo.
- Una venta no puede descontarse dos veces.
- Una venta rechazada no modifica el inventario ni el historial.
- Las ventas creadas mediante la semilla oficial mantienen sus resultados de verificación.

### 10.4 Criterios de aceptación
**RP-01 — Stock suficiente**
Dado un producto con stock 10 y una oportunidad que contiene 3 unidades, cuando se gana la oportunidad, entonces el stock pasa a 7 y la oportunidad queda ganada.

**RP-02 — Stock insuficiente**
Dado un producto con stock 2 y una oportunidad que contiene 5 unidades, cuando se intenta ganar, entonces responde 409 y se conserva el stock original.

**RP-03 — Transacción completa**
Dada una oportunidad con varios productos, cuando uno de ellos no tiene stock suficiente, entonces ningún producto se descuenta y la oportunidad conserva su etapa.

**RP-04 — Sin control de inventario**
Dado un producto con stock NULL, cuando una oportunidad válida se gana, entonces ese producto no bloquea la confirmación ni recibe un descuento numérico.

**RP-05 — Concurrencia**
Dadas dos oportunidades que compiten por las mismas existencias, cuando se intenta ganarlas simultáneamente, entonces no se permite vender una cantidad total superior al stock disponible.

**RP-06 — Semilla oficial**
Dada una base cargada únicamente con `VerificacionSeeder`, cuando se ejecutan las pruebas oficiales, entonces la regla de stock no altera las cifras ni impide las operaciones obligatorias del núcleo.

## 11. Seguridad

### S1. Contraseñas
Solo Laravel genera hashes de contraseñas.
La API utiliza bcryptjs para verificarlos.
No se almacenan contraseñas en texto plano.

### S2. Secretos
Los archivos `.env` no se publican: están en `.gitignore` en `laravel/` y en `api/`.
Se utilizan archivos `.env.example` sin contraseñas ni valores reales.
`JWT_SECRET` debe tener al menos 32 caracteres aleatorios.
La contraseña pública de la semilla (`Ventas2026`) solo puede aparecer en las semillas, en el README y en la colección de Postman.
Borrar un `.env` en un commit posterior no lo saca del historial de Git: si un secreto se filtró, debe cambiarse.

### S3. Consultas SQL
La API utiliza parámetros `?` en las consultas.
No concatena datos del usuario en SQL.
Laravel utiliza Eloquent o consultas parametrizadas.

### S4. Protección de datos
Las respuestas no revelan hashes, identificadores internos prohibidos ni datos de otros vendedores.

### S5. Acceso a recursos
Un recurso ajeno debe responder 404.
Las consultas y modificaciones verifican la propiedad correspondiente.

### S6. CORS
La API solo acepta el origen configurado en `CORS_ORIGIN`.
No se permite CORS abierto con `*`.

### S7. XSS

Todo texto externo se escapa antes de incorporarse mediante `innerHTML`, o se presenta con `textContent`.
Las vistas Blade deben aplicar el escape adecuado.

### S8. Concurrencia
Las operaciones críticas utilizan transacciones, bloqueos, actualizaciones condicionales e índices únicos cuando corresponda.

Se verificará la concurrencia en:

- Toma de clientes disponibles.
- Límite de diez clientes.
- Cambio de etapa.
- Registros duplicados.
- Confirmación de ventas y descuento de stock.

## 12. Criterios de aceptación del núcleo
Los siguientes criterios complementan los criterios específicos de cada requisito.

**CA-01 — Acceso permitido**
Dado un vendedor activo con credenciales correctas, cuando inicia sesión mediante la API, entonces recibe HTTP 200 con token y datos de usuario.

**CA-02 — Acceso prohibido**
Dado un administrador con credenciales correctas, cuando intenta iniciar sesión mediante la API de vendedores, entonces recibe HTTP 403 sin token.

**CA-03 — Cuenta desactivada**
Dado un vendedor que posee un JWT válido, cuando su cuenta se desactiva y realiza una nueva petición, entonces recibe HTTP 401.

**CA-04 — Propiedad**
Dado un cliente que pertenece a Diego, cuando Valeria intenta consultarlo o modificarlo mediante su token, entonces recibe HTTP 404.

**CA-05 — Cartera máxima**
Dado un vendedor con diez clientes, cuando intenta crear o tomar otro, entonces recibe HTTP 409 y su cartera permanece igual.

**CA-06 — NIT inválido**
Dado un NIT con dígito verificador incorrecto, cuando se crea un cliente, entonces recibe HTTP 422 con un error en el campo `nit`.

**CA-07 — NIT consumidor final**
Dado el valor CF, cuando se registra un cliente, entonces el NIT se almacena como NULL y se devuelve como `"CF"`.

**CA-08 — Creación de oportunidad**
Dado un cliente propio, cuando el vendedor crea una oportunidad válida, entonces se registra en prospecto y se crea su primer historial.

**CA-09 — Precios históricos**
Dada una oportunidad con un producto agregado, cuando cambia el precio del catálogo, entonces se conserva el precio previamente guardado en la línea.

**CA-10 — Oportunidad cerrada**
Dada una oportunidad ganada o perdida, cuando se intenta modificar el título, etapa o productos, entonces recibe HTTP 409 y los datos permanecen iguales.

**CA-11 — Actividad vencida**
Dada una actividad no completada cuyo vencimiento ya pasó, cuando se consulta, entonces el atributo `vencida` es verdadero.

**CA-12 — Reportes**
Dada la semilla oficial sin modificaciones, cuando se consulta el resumen de Valeria de octubre de 2026, entonces las cifras coinciden exactamente con los valores oficiales.

**CA-13 — Respuesta segura**
Dada una petición válida de un vendedor, cuando la API responde, entonces no incluye hashes ni identificadores de propiedad prohibidos.

**CA-14 — Interfaz móvil**
Dada una pantalla de 375 píxeles, cuando el vendedor utiliza la SPA, entonces puede acceder a sus funciones sin desplazamiento horizontal.

**CA-15 — Integración**
Dado un supervisor que asigna un cliente desde Laravel, cuando el vendedor consulta su cartera en la SPA, entonces aparece el cliente asignado.

**CA-16 — Venta compartida**
Dada una oportunidad marcada como ganada mediante la SPA, cuando el administrador consulta los reportes Laravel del mes correspondiente, entonces esa venta se refleja correctamente.

### 12.1 Criterios por requisito
Cada requisito de las secciones 6, 7, 9 y 11 se cumple cuando se cumplen todos sus criterios. Los criterios de la Parte B se detallan, con sus pruebas, en las specs de fase (`docs/specs/B1-base.md` a `B6`); aquí se resume el criterio verificable de cada requisito y se indica la spec que lo desarrolla.

#### Panel Laravel (Parte A)

**L1-01 — Esquema completo**
Dada una base vacía, cuando se ejecuta `php artisan migrate:fresh --seeder=VerificacionSeeder`, entonces existen las tablas de la sección 4 con sus llaves foráneas, índices únicos y restricciones CHECK, sin pasos manuales, y la migración original de `users` no fue editada.

**L1-02 — Dos semillas**
Dada una base vacía, cuando se ejecuta `php artisan migrate:fresh --seed`, entonces quedan cargadas `VerificacionSeeder` y `SectorSeeder`, sin repetir correos, NIT ni teléfonos y sin superar 10 clientes por vendedor.

**L1-03 — Restricción en la base**
Dado el esquema creado, cuando se intenta guardar directamente en MySQL un producto con precio 0, una línea con cantidad 1000 o un stock negativo, entonces la base lo rechaza por su restricción CHECK.

**L2-01 — Sin registro público**
Dado el panel en ejecución, cuando se solicita la ruta de registro de Breeze, entonces no existe (404).

**L2-02 — Gestión de cuentas**
Dado un administrador, cuando crea un vendedor sin supervisor o con un supervisor inactivo, entonces el formulario vuelve con un mensaje junto al campo y lo escrito se conserva.

**L2-03 — Autoprotección del administrador**
Dado un administrador, cuando intenta desactivarse o quitarse su propio rol, entonces la operación se rechaza con un mensaje.

**L2-04 — Vendedor en el panel**
Dado un vendedor con credenciales correctas, cuando intenta iniciar sesión en el panel, entonces ve un mensaje que lo envía a la SPA y no entra.

**L2-05 — Cuenta desactivada en el panel**
Dado un usuario con sesión abierta en el panel, cuando su cuenta se desactiva, entonces pierde el acceso en su siguiente petición.

**L3-01 — Catálogo sin borrado**
Dado un producto, cuando el administrador lo retira, entonces queda desactivado y no se borra; deja de aparecer en `GET /api/productos`.

**L3-02 — Precio válido**
Dado el formulario de producto, cuando se envía un precio 0, negativo o con tres decimales, entonces se rechaza con un mensaje junto al campo.

**L3-03 — Precio histórico**
Dada una oportunidad con un producto agregado, cuando el administrador cambia su precio en el catálogo, entonces la línea y los reportes conservan el precio guardado (CA-09).

**L4-01 — Búsqueda y filtros**
Dado un administrador o supervisor, cuando busca por nombre o NIT y filtra por vendedor o «sin asignar», entonces solo ve los clientes que le corresponden y que cumplen el filtro.

**L4-02 — Mismas reglas que la API**
Dado el formulario de cliente, cuando se escribe `4521817-k` y `+502 5555-1234`, entonces se guardan como `4521817K` y `55551234`, y un NIT o teléfono ya existente se rechaza igual que en la API.

**L4-03 — Asignación con cartera llena**
Dado un vendedor con 10 clientes, cuando se le asigna otro desde el panel, entonces se rechaza con un mensaje y su cartera sigue en 10.

**L4-04 — Eliminación de clientes**
Dado un cliente con oportunidades, cuando el administrador intenta eliminarlo, entonces se rechaza; sin oportunidades, se elimina junto con sus actividades.

**L5-01 — Visibilidad del supervisor**
Dado Sergio Ruiz, cuando escribe a mano la dirección de un cliente del equipo de Sandra Pérez, entonces recibe 404.

**L5-02 — Asignación dentro del equipo**
Dado un supervisor, cuando intenta asignar un cliente a un vendedor de otro equipo o inactivo, entonces se rechaza.

**L5-03 — Página del equipo**
Dado un supervisor, cuando abre la página de su equipo con la semilla de verificación, entonces ve la cartera (por ejemplo, Carlos Ajú 9 de 10) y las ventas del mes de cada vendedor.

**L6-01 — Oportunidades de solo lectura**
Dado un administrador o supervisor, cuando consulta las oportunidades, entonces las ve filtradas por etapa y vendedor, con el total y la fecha de cierre en hora de Guatemala, y sin acciones de modificación.

**L6-02 — Reporte del mes**
Dada la semilla de verificación, cuando el administrador selecciona octubre de 2026, entonces el reporte muestra 4 ventas, Q22,450.00 y pronóstico Q6,751.13, con los desgloses por vendedor y por producto de la sección 13.3.

**L7-01 — Validación en el servidor**
Dado cualquier formulario del panel, cuando se envían datos inválidos, entonces vuelve con un mensaje en español, tratando de usted, junto a cada campo, y con lo escrito conservado.

#### API REST (Parte B, salvo A6)

**A1-01 — Login de vendedor** (B2-01)
Dado un vendedor activo, cuando envía `POST /api/auth/login` con credenciales correctas, entonces recibe 200 con `{ token, usuario }` y un JWT HS256 con su id en `sub` y expiración configurable.

**A1-02 — Credenciales incorrectas** (B2-03)
Dado un correo inexistente o una contraseña incorrecta, cuando se inicia sesión, entonces la respuesta es 401 y exactamente la misma en ambos casos.

**A1-03 — Rol no permitido** (B2-04, CA-02)
Dado un administrador, un supervisor o una cuenta desactivada con la contraseña correcta, cuando inicia sesión en la API, entonces recibe 403 y ningún token.

**A2-01 — Token obligatorio** (B2-06, B2-07)
Dada cualquier ruta salvo el login, cuando se llama sin token o con un token alterado, vencido o firmado con otro algoritmo, entonces responde 401.

**A2-02 — Revocación** (B2-08, CA-03)
Dado un vendedor con un token válido, cuando su cuenta se desactiva o deja de ser vendedor, entonces su siguiente petición responde 401.

**A3-01 — Clientes y cartera** (B3-01 a B3-15)
Dada la semilla de verificación, cuando Valeria consulta `GET /api/clientes` y `GET /api/clientes/disponibles`, entonces recibe sus 3 clientes y los 6 disponibles de la semilla con solo `id` y `nombre`.

**A3-02 — Toma atómica** (B3-C1)
Dado un cliente disponible, cuando diez vendedores intentan tomarlo a la vez, entonces exactamente uno recibe 200 y los demás 409.

**A3-03 — Cartera con peticiones simultáneas** (B3-C2)
Dado Carlos con 9 clientes, cuando envía tres altas válidas simultáneas, entonces exactamente una responde 201, las otras dos 409, y su cartera queda en 10.

**A4-01 — Oportunidades y productos** (B4-01 a B4-21)
Dado un cliente de su cartera, cuando el vendedor crea una oportunidad y agrega productos, entonces se crea en `prospecto` con su primer historial, cada línea copia el precio del catálogo y el total lo calcula el servidor.

**A4-02 — Cambio de etapa transaccional** (B4-C1)
Dada una oportunidad abierta, cuando llegan dos cambios simultáneos de etapa, entonces solo uno se aplica y el historial tiene un único registro nuevo.

**A5-01 — Crear actividad** (B5)
Dado un cliente de su cartera, cuando el vendedor envía `POST /api/clientes/:id/actividades` con `vence_en` con zona horaria, entonces recibe 201 con la fecha en UTC y `vencida` calculada.

**A5-02 — Fecha ambigua** (B5)
Dada una actividad nueva, cuando `vence_en` llega sin zona horaria (`2026-12-01T10:00`), entonces responde 422 con `errores.vence_en`.

**A5-03 — Actividades ajenas y filtro** (B5)
Dado un vendedor, cuando consulta `GET /api/actividades?estado=pendiente` o modifica una actividad de un cliente ajeno, entonces solo ve las de su cartera y lo ajeno responde 404; un estado no admitido responde 400.

**A6-01 — Resumen del mes** (Parte A)
Dada la semilla de verificación, cuando Valeria consulta `GET /api/reportes/resumen?mes=2026-10`, entonces recibe `{ "mes": "2026-10", "ventas": 2, "total": 9250, "pronostico": 2512.88, "cartera": { "clientes": 3, "maximo": 10 } }` con números, no texto.

**A6-02 — Mes por omisión y mes inválido** (Parte A)
Dado un vendedor, cuando consulta el resumen sin `mes`, entonces recibe el mes actual de Guatemala; con `mes=2026-13`, recibe 400.

**A7-01 — Errores en JSON** (B1-04, B1-05)
Dada cualquier petición, cuando falla por JSON mal formado, ruta inexistente o error inesperado, entonces la respuesta es JSON con `{ error }` (400, 404 o 500) y el 500 no revela detalles internos.

**A7-02 — Validación por campo** (B1, B3-07)
Dada una petición con datos que violan una regla, cuando se procesa, entonces responde 422 con `{ errores: { campo: mensaje } }`.

**A8-01 — Documentación** (B6)
Dado el repositorio, cuando se revisa, entonces el README tiene la tabla de endpoints y los pasos exactos para levantar las tres piezas desde cero, y `docs/api.postman_collection.json` tiene al menos una petición por endpoint, los errores principales y la prueba de la regla propia.

#### SPA (Parte B, salvo F5)

**F1-01 — Inicio y cierre de sesión** (B2-11 a B2-13)
Dado un vendedor, cuando inicia sesión, entonces el token se guarda en LocalStorage (sin la contraseña) y se borra al cerrar sesión.

**F1-02 — Cuenta no permitida y sesión expirada** (B2-14, B2-16)
Dado un administrador, cuando intenta entrar a la SPA, entonces ve el mensaje del 403; dado un vendedor con sesión abierta, cuando una petición responde 401, entonces vuelve al inicio de sesión con un aviso.

**F2-01 — Cartera** (B3-14, B3-15)
Dado un vendedor, cuando abre su cartera, entonces ve sus clientes con búsqueda en el servidor y el indicador «X de 10»; al dar de alta un cliente con errores, los mensajes aparecen junto a cada campo y lo escrito se conserva.

**F2-02 — Tomar clientes**
Dado un cliente disponible que otro vendedor ya tomó, cuando el vendedor intenta tomarlo, entonces la SPA muestra el mensaje del 409.

**F3-01 — Tablero** (B4-22)
Dado un vendedor, cuando abre el embudo, entonces ve una columna por cada etapa abierta y la lista de oportunidades cerradas.

**F3-02 — Detalle** (B4-23)
Dada una oportunidad propia, cuando la abre, entonces ve productos con cantidad, precio guardado y subtotal, el total en quetzales y el historial con fecha y hora de Guatemala.

**F3-03 — Acciones** (B4-24, B4-25)
Dada una oportunidad abierta, cuando la consulta, entonces solo ve los botones de las transiciones permitidas; perder pide el motivo, y un 409 por stock se muestra conservando el estado previo.

**F4-01 — Actividades** (B5)
Dado un vendedor, cuando abre sus actividades, entonces ve pendientes y completadas, las vencidas se distinguen, crea una con fecha y hora local (enviada en ISO 8601 con zona) y puede marcarla como completada.

**F5-01 — Resumen del mes** (Parte A)
Dado un vendedor, cuando elige un mes, entonces ve ventas, total vendido, pronóstico y cartera, con montos en quetzales y fechas en hora de Guatemala, sin importar la zona horaria de la computadora.

**F6-01 — Calidad de la interfaz** (B2-16, B6)
Dada la SPA, cuando hay peticiones en curso, entonces se muestra un indicador de carga; si la API está apagada, se muestra un mensaje que lo explica; a 375 píxeles de ancho no hay desplazamiento horizontal.

#### Seguridad

**S1-01 — Contraseñas**
Dada la tabla `users`, cuando se revisa, entonces ninguna contraseña está en texto plano; solo Laravel genera hashes y la API solo los verifica con bcryptjs.

**S2-01 — Secretos**
Dado el historial de Git, cuando se revisa, entonces ningún archivo `.env` fue confirmado; los `.env.example` no tienen valores reales; `JWT_SECRET` tiene al menos 32 caracteres; y `Ventas2026` solo aparece en las semillas, el README y la colección de Postman.

**S3-01 — Inyección SQL** (B3-03)
Dada la búsqueda de clientes, cuando se envía `' OR 1=1 --`, entonces no se devuelven clientes ajenos ni se ejecuta SQL inyectado, porque la API usa parámetros `?` y el panel Eloquent o enlaces de parámetros.

**S4-01 — Datos expuestos** (CA-13)
Dada cualquier respuesta de la API, cuando se revisa en Postman, entonces no contiene hashes, `vendedor_id`, `user_id`, `supervisor_id` ni datos de otro vendedor.

**S5-01 — Recursos ajenos** (CA-04, L5-01)
Dada Valeria, cuando intenta leer o modificar un cliente de Diego, entonces recibe 404; dado Sergio Ruiz, cuando intenta editar un cliente del equipo de Sandra Pérez, entonces recibe 404.

**S6-01 — CORS**
Dada una página servida desde un origen distinto de `CORS_ORIGIN`, cuando llama a la API, entonces el navegador bloquea la respuesta; la configuración nunca usa `*`.

**S7-01 — XSS**
Dado un cliente llamado `<img src=x onerror=alert(1)>`, cuando aparece en la SPA o en el panel, entonces se muestra como texto y no ejecuta código.

**S8-01 — Concurrencia** (B3-C1, B3-C2, B4-C1 a B4-C3)
Dadas peticiones simultáneas contra la API, cuando compiten por tomar un cliente, por la cartera máxima, por un cambio de etapa, por un registro duplicado o por el mismo stock, entonces el resultado respeta la regla, el índice único es el árbitro final de los duplicados y el stock nunca queda negativo.

## 13. Semillas y cifras de control

### 13.1 VerificacionSeeder
La semilla debe reproducir exactamente los datos establecidos en la sección 11 del enunciado oficial.
Incluye usuarios, productos, clientes, oportunidades, historial y actividades:
- 7 cuentas: 1 administradora, 2 supervisores (Sergio Ruiz y Sandra Pérez) y 4 vendedores (Valeria y Diego en el equipo de Sergio; Carlos e Iván, desactivado, en el de Sandra). La contraseña de todas es `Ventas2026`.
- 5 productos (uno desactivado) sin control de stock, de modo que la regla propia no afecta a las cifras de control.
- 21 clientes: 3 de Valeria, 2 de Diego, 9 de Carlos, 1 de Iván y 6 disponibles.
- 11 oportunidades con sus líneas y 43 registros de historial.
- 4 actividades.

Las fechas están en UTC. No se deben modificar sus registros ni las cifras esperadas.

### 13.2 SectorSeeder
Contendrá datos propios de una distribuidora de maquillaje.
Incluye productos de belleza con precios y existencias, clientes, vendedores, oportunidades y actividades coherentes con el sector.
No debe generar conflictos con los correos, teléfonos, NIT ni límites de cartera de la semilla oficial.

### 13.3 Cifras de control
| Usuario o ámbito | Mes | Ventas | Total | Pronóstico | Cartera |
|---|---|---:|---:|---:|---|
| Valeria | Octubre 2026 | 2 | Q9,250.00 | Q2,512.88 | 3/10 |
| Valeria | Noviembre 2026 | 1 | Q3,600.00 | Q2,512.88 | 3/10 |
| Diego | Octubre 2026 | 1 | Q6,000.00 | Q112.50 | 2/10 |
| Carlos | Octubre 2026 | 1 | Q7,200.00 | Q4,125.75 | 9/10 |
| Equipo Sergio | Octubre 2026 | 3 | Q15,250.00 | Q2,625.38 | — |
| Equipo Sandra | Octubre 2026 | 1 | Q7,200.00 | Q4,125.75 | — |
| Empresa | Octubre 2026 | 4 | Q22,450.00 | Q6,751.13 | — |
Estas cifras aplican exclusivamente a la semilla oficial, sin modificaciones de prueba.

## 14. Decisiones de diseño
Esta sección responde las preguntas que el enunciado (sección 7) deja abiertas, más las decisiones de contrato que surgieron al implementar B3 y B4. Cada decisión indica la alternativa descartada y por qué.

Estados:
- **Decidida e implementada:** está en el código y probada; requiere la confirmación de ambas integrantes al aprobar esta versión de la especificación.
- **Propuesta:** todavía no está implementada; la deciden ambas integrantes antes de la fase correspondiente.

| Pregunta del enunciado | Decisión |
|---|---|
| ¿Qué transiciones del embudo permiten, además del mínimo? | D1 |
| ¿Qué pasa con las oportunidades y actividades de un cliente reasignado? | D2 |
| ¿Se puede liberar un cliente con oportunidades abiertas? | D3 |
| ¿Qué pasa con la cartera de un vendedor desactivado? | D4 |
| ¿Qué hace la API con campos que el contrato no lista? | D5 |
| ¿Cuál es su regla propia? | D7 (sección 10) |

### D1. Transiciones de oportunidades
**Decisión:** entre las etapas abiertas se avanza o se retrocede una sola etapa; se pierde desde cualquier etapa abierta; se gana únicamente desde negociación.
**Respuesta de la API a lo no permitido:**
- Un salto no permitido (por ejemplo, prospecto → propuesta o prospecto → ganada) responde 422 con `errores.etapa`.
- Una etapa que no existe responde 422 con `errores.etapa`.
- Pedir la etapa en la que ya está responde 409 (D13).
- Cualquier cambio sobre una oportunidad ganada o perdida responde 409.
- Ganar sin productos responde 422 con `errores.etapa` (D14); ganar con stock insuficiente responde 409 (RP-1).

**Alternativa descartada:** permitir saltos libres entre etapas.
**Motivo:** mantener un seguimiento comercial ordenado y auditable; retroceder una etapa permite corregir un avance prematuro sin perder el historial.
**Estado:** Decidida e implementada (B4).

### D2. Reasignación de clientes
**Decisión:**
- Al reasignar un cliente, sus oportunidades **abiertas** pasan al nuevo vendedor.
- Las oportunidades **cerradas** (ganadas o perdidas) conservan al vendedor que las cerró: son el crédito de la venta y forman parte de sus cifras.
- Las **actividades no se modifican: siguen al cliente.** La API las muestra según el dueño actual del cliente (`clientes.vendedor_id`), no según `actividades.vendedor_id`, que solo registra quién las creó. Al reasignar, el nuevo vendedor ve las actividades del cliente y el anterior deja de verlas, sin cambiar ninguna fila de `actividades`.

**Alternativa descartada:** transferir también las oportunidades cerradas (y su crédito) al nuevo vendedor, reescribir `actividades.vendedor_id` con el nuevo responsable o eliminar el historial.
**Motivo:** conservar la trazabilidad comercial y las cifras de ventas de cada vendedor; quién registró una actividad es un dato histórico que no debe cambiar.
**Estado:** Decidida e implementada en el panel (A4: `App\Services\AsignacionClientes`; criterio A4-20).

### D3. Liberación de clientes
**Decisión:** no se libera un cliente que tenga oportunidades abiertas; el panel lo rechaza con «Cierre o reasigne las oportunidades abiertas antes de liberar al cliente.». Un cliente que solo tiene oportunidades cerradas sí se libera, y esas oportunidades conservan a su vendedor (D2).
**Alternativa descartada:** liberar el cliente y dejar sus oportunidades abiertas sin responsable.
**Motivo:** evitar oportunidades comerciales sin seguimiento.
**Estado:** Decidida e implementada en el panel (A4; criterio A4-21). Las oportunidades abiertas se comprueban con el cliente bloqueado, en el orden de D17.

### D4. Desactivación de vendedores
**Decisión:**
- Al desactivar una cuenta, su acceso se bloquea de inmediato en las dos puertas: la API responde 401 a su siguiente petición y el panel cierra su sesión.
- Sus clientes y sus oportunidades abiertas se quedan con él, visibles para la administración y para su supervisor, con la marca «vendedor inactivo», hasta que el administrador o el supervisor reasigne cada cliente. Al reasignarlo se aplica D2.
- No hay reasignación ni liberación automática.

**Alternativa descartada:** eliminar o liberar automáticamente sus clientes, oportunidades o historiales, o repartirlos solos entre otros vendedores.
**Motivo:** conservar los datos comerciales y que la reasignación la decida una persona.
**Estado:** Decidida e implementada: bloqueo en la API (B2 y B3) y en el panel (A2, middleware `cuenta.vigente`); marca «vendedor inactivo» y reasignación en el panel (A4; criterio A4-22).

### D5. Campos adicionales de la API
**Decisión:** los campos del cuerpo que no aparecen en el contrato se ignoran y nunca se utilizan para modificar propiedades internas (`vendedor_id`, `precio_unitario`, `etapa` al crear, `total`…).
**Alternativa descartada:** rechazar todo campo adicional con HTTP 422.
**Motivo:** mantener compatibilidad con clientes HTTP sin permitir modificaciones no autorizadas.
**Estado:** Decidida e implementada (B2 a B4).

### D6. Filtros y parámetros desconocidos
**Decisión:** un parámetro de consulta que la ruta no admite, un parámetro repetido o un valor de filtro inexistente (por ejemplo `?etapa=cancelado`) responde 400. El mensaje es fijo y no repite lo enviado.
**Alternativa descartada:** ignorar parámetros de consulta desconocidos.
**Motivo:** evitar consultas ambiguas; coincide con el 400 del enunciado («un filtro o parámetro no existe»).
**Estado:** Decidida e implementada (B3 y B4).

### D7. Regla propia del sector
**Decisión:** control de stock suficiente para confirmar oportunidades ganadas y descuento automático dentro de una transacción (sección 10).
**Alternativa descartada:** permitir ventas sin comprobar existencias.
**Motivo:** reducir errores de inventario y evitar vender cantidades no disponibles.
**Estado:** Decidida e implementada en la API (B4). La columna `stock` y su CHECK los crea la Parte A.

### D8. Tomar un cliente que ya tiene vendedor
**Decisión:** responde 409, sea de otro vendedor o del mismo; un cliente inexistente responde 404.
**Alternativa descartada:** responder 404 cuando el cliente es de otro vendedor.
**Motivo:** el enunciado (R3) exige 409 al que pierde la carrera por un cliente; la existencia del cliente ya es visible en la lista de disponibles.
**Estado:** Decidida e implementada (B3).

### D9. Identificador de ruta inválido
**Decisión:** un identificador que no es un entero positivo (`/clientes/abc`, `/oportunidades/0`) responde 404, sin consultar la base.
**Alternativa descartada:** responder 400 por «parámetro inválido».
**Motivo:** desde fuera, un id mal escrito y uno inexistente son lo mismo, y nunca debe responder 500.
**Estado:** Decidida e implementada (B3 y B4).

### D10. Precedencia de códigos sobre registros existentes
**Decisión:** primero se comprueban la propiedad (404) y el estado cerrado (409), y después los campos del cuerpo (422) (sección 8.7).
**Alternativa descartada:** validar los campos antes de consultar el registro.
**Motivo:** el enunciado exige que lo ajeno responda 404 y que una oportunidad cerrada responda 409 a cualquier intento de modificación.
**Estado:** Decidida e implementada (B4).

### D11. Forma del listado de oportunidades
**Decisión:** `GET /oportunidades` devuelve resúmenes `{ id, cliente, titulo, etapa, probabilidad, total, fecha_cierre }`, sin productos ni historial.
**Alternativa descartada:** devolver el detalle completo de cada oportunidad.
**Motivo:** el enunciado indica que el resumen de la lista no trae productos ni historial; el tablero no los necesita.
**Estado:** Decidida e implementada (B4).

### D12. Catálogo para vendedores
**Decisión:** `GET /productos` devuelve solo productos activos con `{ id, nombre, precio, stock }`.
**Alternativa descartada:** ocultar el stock al vendedor.
**Motivo:** permite avisar en la SPA de la disponibilidad antes de intentar ganar; `stock: null` indica que no hay control de inventario.
**Estado:** Decidida e implementada (B4).

### D13. Repetir la etapa actual
**Decisión:** pedir la etapa en la que ya está la oportunidad responde 409.
**Alternativa descartada:** tratarlo como transición no permitida (422).
**Motivo:** en dos peticiones simultáneas con la misma transición, la segunda choca con el estado que dejó la primera; es un conflicto, no un dato inválido.
**Estado:** Decidida e implementada (B4).

### D14. Errores al crear oportunidades y agregar productos
**Decisión:**
- Un `cliente_id` ajeno, disponible o inexistente responde 422 con `errores.cliente_id` y el mismo mensaje en todos los casos.
- Un `producto_id` inexistente o inactivo responde 422 con `errores.producto_id`.
- Ganar sin productos responde 422 con `errores.etapa`.

**Alternativa descartada:** responder 404 para los identificadores del cuerpo.
**Motivo:** el 404 corresponde al recurso de la ruta; un valor incorrecto en el cuerpo es un error de validación, y el mismo mensaje no revela si el cliente existe.
**Estado:** Decidida e implementada (B4).

### D15. Productos desactivados después de agregarlos
**Decisión:** una línea cuyo producto se desactivó después de agregarla puede editarse y la oportunidad puede ganarse si hay stock suficiente.
**Alternativa descartada:** bloquear la edición o la venta.
**Motivo:** R6 solo prohíbe agregar productos inactivos; el precio ya quedó guardado en la línea.
**Estado:** Decidida e implementada (B4).

### D16. Edición parcial y campos de cliente
**Decisión:**
- Un `PATCH` sin ningún campo editable responde 400.
- La búsqueda `q` admite como máximo 100 caracteres; más larga, 400.
- El correo es opcional, con formato básico y un máximo de 150 caracteres; `null` o `''` lo dejan vacío.
- El nombre es obligatorio, de 1 a 150 caracteres.
- Los textos se miden en caracteres (como MySQL) y se recortan los espacios de los extremos.

**Alternativa descartada:** devolver 200 sin cambios ante un `PATCH` vacío.
**Motivo:** una petición sin nada que actualizar no se puede interpretar.
**Estado:** Decidida e implementada (B3 y B4).

### D17. Orden de bloqueos
**Decisión:** toda escritura de la API bloquea en el mismo orden: vendedor → cliente → oportunidad → líneas → productos por id ascendente. El bloqueo del vendedor vuelve a exigir que la cuenta esté activa.
**Alternativa descartada:** bloquear cada fila en el orden en que la necesita cada operación.
**Motivo:** un orden único evita interbloqueos entre operaciones simultáneas. El panel debe respetar el mismo orden al asignar clientes o modificar el stock.
**Estado:** Decidida e implementada en la API (B3 y B4). La Parte A debe adoptarlo.

## 15. Responsabilidades de implementación
### Parte A
Responsable de:
- L1–L7.
- Migraciones.
- VerificacionSeeder.
- SectorSeeder.
- Cuentas y roles.
- Panel administrativo y supervisor.
- Catálogo y gestión de stock.
- Reportes del panel.
- A6: resumen mensual de la API.
- F5: vista de resumen mensual de la SPA.

### Parte B
Responsable de:
- A1, A2, A3, A4, A5, A7 y su parte correspondiente de A8.
- F1, F2, F3, F4 y F6.
- Autenticación JWT.
- Clientes y cartera.
- Oportunidades y productos.
- Actividades.
- Validaciones y errores.
- Verificación y descuento de stock al ganar.
- Pruebas Postman.
- Pruebas de concurrencia.
- Especificaciones particulares B1–B6.

### Responsabilidades compartidas
- Aprobar la especificación.
- Mantener `CLAUDE.md`.
- Actualizar `docs/plan.md`.
- Completar `docs/verificacion.md`.
- Revisar pull requests.
- Verificar la integración.
- Registrar incidentes de IA.
- Preparar README y entrega final.
- Comprender las tres partes para la defensa oral.

## 16. Proceso de desarrollo
El proyecto seguirá cuatro etapas: especificación, planificación, implementación y verificación.

### 16.1 Especificación
Definir requisitos, reglas, criterios, contratos y decisiones.
El documento aprobado se identificará mediante la etiqueta Git `spec-v1`; el historial debe mostrar que el código de implementación llegó después de esa etiqueta.
Las correcciones posteriores aprobadas por ambas integrantes se marcan con una nueva etiqueta (por ejemplo `spec-v1.1`).
Cuando el catedrático publique un cambio de requisito, se actualiza esta especificación con la etiqueta `spec-v2`, se planifica el cambio y se implementa sin romper lo que ya funcionaba. Las migraciones existentes no se editan: el cambio llega con migraciones nuevas.

### 16.2 Planificación
Registrar en `docs/plan.md`, y actualizar antes de cada fase:
- Arquitectura.
- Estructura.
- Fases.
- Tareas.
- Responsables.
- Dependencias.
- Instrucciones al agente en cada fase.

### 16.3 Implementación
Cada integrante desarrollará su parte siguiendo las especificaciones.
Se utilizarán ramas de Git y commits descriptivos de ambas integrantes, repartidos a lo largo del proyecto.
Los cambios se revisarán antes de integrarse.

### 16.4 Verificación
Se comprobarán:
- Requisitos funcionales.
- Contrato de la API.
- Reglas de seguridad.
- Concurrencia.
- Cifras de control.
- Regla propia.
- Integración Laravel–API–SPA.

`docs/verificacion.md` contendrá:
- La matriz que une cada criterio de aceptación con su evidencia.
- El resultado de las pruebas de seguridad, incluidas las de peticiones simultáneas.
- Las cifras de control obtenidas con `VerificacionSeeder`.
- La bitácora de IA (sección 17).

### 16.5 Documentación y entrega
- El README incluye la tabla de endpoints y los pasos exactos para levantar MySQL, Laravel, la API y la SPA desde cero.
- `docs/api.postman_collection.json` incluye al menos una petición por endpoint, los casos de error principales y la prueba de la regla propia.
- La entrega es el commit de la etiqueta `entrega-final`, en un repositorio accesible para el catedrático. Lo que no está en ese commit no se considera entregado.
- En la defensa, las tres piezas corren con la base cargada solo con `VerificacionSeeder` (`php artisan migrate:fresh --seeder=VerificacionSeeder`), con Postman abierto y el repositorio en la etiqueta `entrega-final`.

## 17. Uso de inteligencia artificial
Los agentes deberán seguir las instrucciones establecidas en `CLAUDE.md`.
Las especificaciones y el plan son la fuente de verdad de las tareas.
Los agentes no deben inventar requisitos ni modificar contratos aprobados.
Los hooks y subagentes son herramientas adicionales de protección y revisión; no reemplazan las pruebas.
Todo el código entregado es responsabilidad de la pareja, lo haya escrito una persona o un agente: cada integrante debe poder explicarlo y modificarlo en la defensa.

La bitácora de IA forma parte de `docs/verificacion.md`. Documenta al menos tres casos reales en los que el agente propuso algo incorrecto, inseguro o distinto de la especificación, indicando:
- Qué propuso el agente.
- Por qué era incorrecto.
- Cómo se detectó.
- Qué corrección se realizó.
- Qué commit contiene la corrección.

Se registran errores reales del agente, no cada cambio del proyecto. No se inventan errores ni resultados. Mientras se trabaja, los casos se llevan en `docs/bitacora-ia.md` y deben trasladarse o enlazarse desde `docs/verificacion.md` antes de la entrega.
