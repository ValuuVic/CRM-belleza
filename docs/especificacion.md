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
El esquema obligatorio será administrado únicamente por Laravel.

### 4.1 Tabla users
Campos originales de Laravel:
- `id`
- `name`
- `email`
- `password`
- Campos de autenticación y marcas de tiempo correspondientes.

Campos adicionales:

| Campo | Regla |
|---|---|
| rol | administrador, supervisor o vendedor; por defecto vendedor |
| supervisor_id | FK a users, obligatorio para vendedores y NULL para otros roles |
| activo | Booleano, por defecto verdadero |

Cada vendedor pertenece a un supervisor.

### 4.2 Tabla productos
| Campo | Regla |
|---|---|
| id | Clave primaria |
| nombre | VARCHAR(120), obligatorio, único |
| precio | DECIMAL(10,2), mayor que cero |
| activo | Booleano |
| stock | INT NULL, adicional del sector |

`stock = NULL` significa que el producto no tiene control de inventario.

Si stock tiene un valor numérico, debe ser mayor o igual a cero.

### 4.3 Tabla clientes
| Campo | Regla |
|---|---|
| id | Clave primaria |
| vendedor_id | FK a users, admite NULL |
| nombre | VARCHAR(150), obligatorio |
| nit | VARCHAR(12), admite NULL, único si no es NULL |
| telefono | CHAR(8), obligatorio, único |
| correo | VARCHAR(150), opcional |

Un `vendedor_id` nulo significa que el cliente está disponible.

### 4.4 Tabla oportunidades
| Campo | Regla |
|---|---|
| id | Clave primaria |
| cliente_id | FK a clientes |
| vendedor_id | FK a users |
| titulo | VARCHAR(150), obligatorio |
| etapa | prospecto, calificado, propuesta, negociacion, ganada, perdida |
| motivo_perdida | VARCHAR(255), opcional según etapa |
| fecha_cierre | DATETIME, opcional según etapa |

La oportunidad pertenece al vendedor responsable.

### 4.5 Tabla oportunidad_productos
| Campo | Regla |
|---|---|
| id | Clave primaria |
| oportunidad_id | FK a oportunidades |
| producto_id | FK a productos |
| cantidad | SMALLINT, entre 1 y 999 |
| precio_unitario | DECIMAL(10,2), mayor que cero |

Un producto solo puede aparecer una vez dentro de una misma oportunidad.
El precio unitario se copia del catálogo al agregar el producto.

### 4.6 Tabla historial_etapas
| Campo | Regla |
|---|---|
| id | Clave primaria |
| oportunidad_id | FK a oportunidades |
| usuario_id | FK a users |
| etapa_anterior | Etapa anterior o NULL |
| etapa_nueva | Etapa nueva |
| created_at | Fecha del cambio en UTC |

Cada oportunidad registra su creación y posteriores cambios de etapa.

### 4.7 Tabla actividades
| Campo | Regla |
|---|---|
| id | Clave primaria |
| cliente_id | FK a clientes |
| vendedor_id | FK a users |
| tipo | llamada, reunion o tarea |
| descripcion | VARCHAR(500), obligatoria |
| vence_en | DATETIME, opcional |
| completada | Booleano, por defecto falso |

Las tablas conservarán las marcas de tiempo exigidas por el modelo del enunciado.

### 4.8 Integridad referencial
La base de datos debe incluir:
- Claves primarias y foráneas.
- Índices únicos para productos, NIT y teléfonos cuando correspondan.
- Índice único de producto por oportunidad.
- Restricciones CHECK para cantidades y precios.
- Restricciones relacionadas con el estado de las oportunidades.
- Restricción de stock no negativo.
- Reglas de eliminación y cascada definidas por el modelo oficial.
Las validaciones que dependan de relaciones entre varias filas también se implementarán en la lógica del servidor.

---

## 5. Reglas del núcleo

### R1. Acceso según rol
Cada usuario podrá ingresar únicamente mediante la interfaz correspondiente a su rol.
Los vendedores no pueden usar el panel Laravel. Los administradores y supervisores no pueden autenticarse como vendedores mediante la API.
Las cuentas inactivas quedan bloqueadas.

### R2. Propiedad de los registros
Los vendedores solo pueden consultar y modificar los registros de su cartera.
El dueño se determina mediante la sesión o el JWT, nunca mediante datos enviados en el cuerpo.
Un registro ajeno debe responder HTTP 404.

### R3. Cartera comercial
Cada vendedor puede tener un máximo de diez clientes.
Crear, asignar o tomar un cliente cuando la cartera está llena debe rechazarse.
Un cliente sin vendedor está disponible.
La toma de clientes debe ser atómica: si varios vendedores intentan tomar el mismo cliente, solamente uno puede conseguirlo.

### R4. Identidad del cliente

**NIT**
- Se permite NIT válido de Guatemala o CF.
- Se eliminan espacios y guiones antes de validarlo.
- Se convierte a mayúsculas y se eliminan los ceros iniciales conforme al algoritmo oficial.
- Se verifica el dígito mediante módulo 11.
- CF se almacena como NULL.
- La API presenta los valores NULL de NIT como `"CF"`.
- No se permiten NIT duplicados cuando tienen valor.

**Teléfono**
- Se eliminan separadores y el prefijo de Guatemala cuando esté presente.
- Debe quedar un teléfono de ocho dígitos.
- Debe comenzar con un dígito del 2 al 9.
- No puede repetirse.

Los duplicados devuelven HTTP 409.

### R5. Embudo de ventas
| Etapa | Probabilidad |
|---|---:|
| prospecto | 10 % |
| calificado | 25 % |
| propuesta | 50 % |
| negociacion | 75 % |
| ganada | 100 % |
| perdida | 0 % |

Toda oportunidad comienza en `prospecto`.
Las primeras cuatro etapas son abiertas. `ganada` y `perdida` son cerradas.
El sistema debe permitir, como mínimo, el avance consecutivo entre etapas abiertas, ganar desde negociación y perder desde negociación.
Para ganar se exige al menos un producto.
Para perder se exige un motivo de 1 a 255 caracteres después de eliminar espacios sobrantes.
Una oportunidad cerrada no puede modificar su título, etapa o productos.
El cambio de etapa y el registro de historial ocurren en la misma transacción.

### R6. Montos y precios
- Los montos están expresados en quetzales.
- Los precios se almacenan como DECIMAL(10,2).
- El precio se copia del catálogo cuando se agrega una línea.
- Los cambios posteriores del precio del catálogo no alteran líneas existentes.
- El total se calcula en el servidor.
- Solo pueden agregarse productos activos.
- Un producto duplicado dentro de una oportunidad se rechaza con HTTP 409.
- Las cantidades deben estar entre 1 y 999.

### R7. Reportes
Una venta corresponde a una oportunidad ganada.
El mes de venta se determina según la fecha de cierre en hora de Guatemala.
El reporte incluirá:
- Cantidad de ventas.
- Total vendido.
- Pronóstico.
- Información de cartera según el rol.
- Desgloses exigidos en el panel.
El total vendido se calcula sumando las oportunidades ganadas durante el mes.
El pronóstico se calcula con las oportunidades abiertas:
`pronostico = SUM(total_oportunidad * probabilidad / 100)`
Se redondea a dos decimales.

### R8. Respuestas y fechas
- La API utiliza JSON.
- No se devuelven hashes ni identificadores internos prohibidos.
- Las fechas de salida se expresan en ISO 8601 UTC.
- Las fechas de entrada que necesiten zona horaria deben incluirla.
- Una fecha ambigua se rechaza con HTTP 422.
- La SPA muestra fechas en la zona `America/Guatemala`.
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
Todas las rutas siguientes utilizan el prefijo `/api`.
| Método | Ruta | Éxito |
|---|---|---|
| POST | /auth/login | 200, token y usuario |
| GET | /productos | 200, catálogo activo |
| GET | /clientes?q= | 200, clientes del vendedor |
| POST | /clientes | 201, cliente |
| GET | /clientes/disponibles | 200, lista pública limitada |
| POST | /clientes/:id/tomar | 200, cliente |
| GET | /clientes/:id | 200, cliente |
| PATCH | /clientes/:id | 200, cliente |
| POST | /clientes/:id/actividades | 201, actividad |
| GET | /actividades?estado= | 200, actividades |
| PATCH | /actividades/:id | 200, actividad |
| GET | /oportunidades?etapa= | 200, oportunidades |
| POST | /oportunidades | 201, detalle |
| GET | /oportunidades/:id | 200, detalle |
| PATCH | /oportunidades/:id | 200, detalle |
| PATCH | /oportunidades/:id/etapa | 200, detalle |
| POST | /oportunidades/:id/productos | 201, detalle |
| PATCH | /oportunidades/:id/productos/:lineaId | 200, detalle |
| DELETE | /oportunidades/:id/productos/:lineaId | 204, sin cuerpo |
| GET | /reportes/resumen?mes= | 200, resumen |
Los cuerpos de entrada, parámetros, códigos de error y respuestas deben coincidir exactamente con la sección 8 del enunciado oficial.

### 8.1 Respuesta de login
```json
{
  "token": "jwt",
  "usuario": {
    "id": 4,
    "nombre": "Valeria López",
    "correo": "valeria@crm.test"
  }
}
```
### 8.2 Respuesta de cliente
```json
{
  "id": 1,
  "nombre": "Comercial El Quetzal",
  "nit": "4521817K",
  "telefono": "55551234",
  "correo": "compras@elquetzal.test"
}
```

### 8.3 Detalle de oportunidad
Debe contener:
- `id`
- `cliente` con id y nombre
- `titulo`
- `etapa`
- `probabilidad`
- `total`
- `fecha_cierre`
- `motivo_perdida`
- `productos` con id de línea, producto_id, nombre, cantidad, precio_unitario y subtotal
- `historial` con etapa_anterior, etapa_nueva, usuario y fecha

### 8.4 Respuesta de actividad
Debe contener:
- `id`
- `cliente` con id y nombre
- `tipo`
- `descripcion`
- `vence_en`
- `completada`
- `vencida`

### 8.5 Resumen mensual
```json
{
  "mes": "2026-10",
  "ventas": 2,
  "total": 9250,
  "pronostico": 2512.88,
  "cartera": {
    "clientes": 3,
    "maximo": 10
  }
}
```

### 8.6 Códigos HTTP
| Código | Significado |
|---|---|
| 200 | Consulta o modificación correcta |
| 201 | Recurso creado |
| 204 | Eliminación de línea, sin cuerpo |
| 400 | Petición no interpretable o parámetro inválido |
| 401 | Autenticación inválida |
| 403 | Rol no permitido en el login |
| 404 | Recurso inexistente o ajeno |
| 409 | Conflicto con el estado actual |
| 422 | Error de validación |
| 500 | Error inesperado |

Los errores generales tendrán formato `{ "error": "mensaje" }`.
Los errores de validación usarán `{ "errores": { "campo": "mensaje" } }`.

## 9. Requisitos de la SPA

### F1. Sesión
La SPA tendrá una pantalla de inicio de sesión.
Guardará la sesión necesaria y permitirá cerrar sesión.
Si recibe HTTP 401 durante una sesión, eliminará el token y solicitará una nueva autenticación.

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
Los archivos `.env` no se publican.
Se utilizan archivos `.env.example` sin contraseñas reales.
`JWT_SECRET` debe tener al menos 32 caracteres aleatorios.

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

## 13. Semillas y cifras de control

### 13.1 VerificacionSeeder
La semilla debe reproducir exactamente los datos establecidos en la sección 11 del enunciado oficial.
Incluye usuarios, productos, clientes, oportunidades, historial y actividades.
No se deben modificar sus registros ni las cifras esperadas.

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

## 14. Decisiones de diseño pendientes de aprobación
Esta sección recoge decisiones que el enunciado deja a la pareja.
Las propuestas siguientes no se consideran aprobadas hasta que ambas integrantes las revisen.

### D1. Transiciones de oportunidades
**Propuesta:** permitir avanzar y retroceder una etapa entre las cuatro etapas abiertas; ganar únicamente desde negociación y perder desde cualquier etapa abierta.
**Alternativa descartada propuesta:** permitir saltos libres entre etapas.
**Motivo:** mantener un seguimiento comercial ordenado y auditable.
**Estado:** Pendiente de aprobación.

### D2. Reasignación de clientes
**Propuesta:** las oportunidades cerradas conservan el vendedor que realizó la venta. Las oportunidades abiertas y sus actividades se transfieren al nuevo responsable; las actividades históricas conservan el identificador del usuario que las registró cuando corresponda.
**Alternativa descartada propuesta:** eliminar el historial o transferir el crédito de las ventas cerradas al nuevo vendedor.
**Motivo:** conservar la trazabilidad comercial.
**Estado:** Pendiente de aprobación y comprobación de compatibilidad con el modelo.

### D3. Liberación de clientes
**Propuesta:** no permitir liberar un cliente que tenga oportunidades abiertas hasta resolverlas o reasignarlas conforme al proceso aprobado.
**Alternativa descartada propuesta:** liberar clientes con oportunidades abiertas sin responsable.
**Motivo:** evitar oportunidades comerciales sin seguimiento.
**Estado:** Pendiente de aprobación.

### D4. Desactivación de vendedores
**Propuesta:** al desactivar una cuenta, bloquear su acceso inmediatamente; sus clientes pendientes de reasignación seguirán visibles para la administración y se redistribuirán según el procedimiento aprobado.
**Alternativa descartada propuesta:** eliminar automáticamente los clientes, las oportunidades o los historiales.
**Motivo:** conservar los datos comerciales.
**Estado:** Pendiente de aprobación; definir el comportamiento exacto de los registros abiertos.

### D5. Campos adicionales de la API
**Decisión propuesta:** ignorar los campos del cuerpo que no aparecen en el contrato y nunca utilizarlos para modificar propiedades internas.
**Alternativa descartada propuesta:** rechazar todo campo adicional con HTTP 422.
**Motivo:** mantener compatibilidad con clientes HTTP sin permitir modificaciones no autorizadas.
**Estado:** Pendiente de aprobación.

### D6. Filtros y parámetros desconocidos
**Propuesta:** rechazar con HTTP 400 filtros o parámetros de consulta que no estén admitidos por la ruta.
**Alternativa descartada propuesta:** ignorar parámetros de consulta desconocidos.
**Motivo:** evitar consultas ambiguas.
**Estado:** Pendiente de aprobación.

### D7. Regla propia del sector
**Decisión propuesta:** control de stock suficiente para confirmar oportunidades ganadas y descuento automático dentro de una transacción.
**Alternativa descartada propuesta:** permitir ventas sin comprobar existencias.
**Motivo:** reducir errores de inventario y evitar vender cantidades no disponibles.
**Estado:** Pendiente de aprobación formal por ambas integrantes y validación contra el núcleo obligatorio.

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
El proyecto seguirá cuatro etapas:

### 16.1 Especificación
Definir requisitos, reglas, criterios, contratos y decisiones.
El documento aprobado se identificará mediante la etiqueta Git `spec-v1`.

### 16.2 Planificación
Registrar en `docs/plan.md`:
- Arquitectura.
- Fases.
- Tareas.
- Responsables.
- Dependencias.
- Instrucciones al agente.

### 16.3 Implementación
Cada integrante desarrollará su parte siguiendo las especificaciones.
Se utilizarán ramas de Git y commits descriptivos.
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
Se registrará evidencia en `docs/verificacion.md`.

## 17. Uso de inteligencia artificial
Los agentes deberán seguir las instrucciones establecidas en `CLAUDE.md`.
Las especificaciones y el plan son la fuente de verdad de las tareas.
Los agentes no deben inventar requisitos ni modificar contratos aprobados.
Los hooks y subagentes son herramientas adicionales de protección y revisión; no reemplazan las pruebas.
La bitácora de IA documentará al menos tres casos reales de errores, propuestas inseguras o desviaciones de la especificación, indicando:
- Qué propuso el agente.
- Por qué era incorrecto.
- Cómo se detectó.
- Qué corrección se realizó.
- Qué commit contiene la corrección.
Cada que se realice un cambio debe de guardarse en la bitacora de IA.