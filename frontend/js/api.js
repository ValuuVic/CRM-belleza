// Comunicación con la API REST mediante Fetch (B2-12, B2-14, B2-16). La SPA nunca accede a MySQL.

import { obtenerEstado, actualizar, cerrarSesion } from './estado.js';

export const URL_API = 'http://127.0.0.1:3000/api';

export const MENSAJE_SIN_CONEXION = 'No se pudo conectar con el servidor. Compruebe su conexión e inténtelo de nuevo.';
export const MENSAJE_SESION_EXPIRADA = 'Su sesión ha expirado. Inicie sesión nuevamente.';
export const MENSAJE_TIEMPO_AGOTADO = 'El servidor tardó demasiado en responder. Inténtelo de nuevo en unos momentos.';
// En una escritura cancelada por tiempo, el servidor pudo haberla completado: reintentar a ciegas podría
// duplicar una oportunidad o una actividad, así que se pide revisar antes (S8).
export const MENSAJE_TIEMPO_AGOTADO_ESCRITURA = 'No se recibió respuesta del servidor y la operación pudo haberse completado. Actualice la vista y compruébelo antes de volver a intentarlo.';

// Tiempo máximo de una petición (B6-02, B6-03): si la API no responde, la petición se cancela y el
// indicador de carga se retira con un mensaje, en lugar de quedarse girando indefinidamente.
const TIEMPO_LIMITE_MS = 15000;
let tiempoLimiteMs = TIEMPO_LIMITE_MS;

/** Solo para las pruebas: cambia el tiempo límite (sin argumento, vuelve al valor normal). */
export function _fijarTiempoLimiteParaPruebas(ms = TIEMPO_LIMITE_MS) {
  tiempoLimiteMs = ms;
}

/** Sesión expirada o revocada (B2-14): borra el token, avisa y vuelve al login. */
function manejarSesionExpirada() {
  cerrarSesion();
  actualizar({ aviso: { tipo: 'warning', texto: MENSAJE_SESION_EXPIRADA } });
  if (globalThis.location) globalThis.location.hash = '#/login';
}

/**
 * Hace una petición a la API.
 * @returns {Promise<{ ok: boolean, status: number, datos: any, errorRed?: boolean }>}
 *   `status` es 0 cuando no se pudo conectar o la API no respondió a tiempo (`tiempoAgotado`).
 */
export async function pedir(ruta, { metodo = 'GET', cuerpo, protegida = true } = {}) {
  const cabeceras = { Accept: 'application/json' };
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  const token = obtenerEstado().sesion?.token;
  if (protegida && token) cabeceras.Authorization = `Bearer ${token}`;

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempoLimiteMs);
  let respuesta;
  let datos = null;
  try {
    try {
      respuesta = await globalThis.fetch(`${URL_API}${ruta}`, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal: control.signal,
      });
    } catch {
      const mensaje = metodo === 'GET' ? MENSAJE_TIEMPO_AGOTADO : MENSAJE_TIEMPO_AGOTADO_ESCRITURA;
      return control.signal.aborted
        ? { ok: false, status: 0, datos: { error: mensaje }, errorRed: true, tiempoAgotado: true }
        : { ok: false, status: 0, datos: { error: MENSAJE_SIN_CONEXION }, errorRed: true };
    }

    try {
      const texto = await respuesta.text();
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      datos = null;
    }
  } finally {
    clearTimeout(temporizador);
  }

  // Solo un 401 de la sesión vigente la cierra: el de una petición enviada con el token de una sesión
  // anterior (respuesta tardía) no debe cerrar la sesión de quien entró después (S4, B6-08).
  if (respuesta.status === 401 && protegida && token === obtenerEstado().sesion?.token) manejarSesionExpirada();
  return { ok: respuesta.ok, status: respuesta.status, datos };
}

/** POST /api/auth/login con { correo, clave }. No es una ruta protegida: un 401 es "credenciales incorrectas". */
export const iniciarSesion = (correo, clave) => pedir('/auth/login', { metodo: 'POST', cuerpo: { correo, clave }, protegida: false });

/** GET /api/clientes?q=: array plano con la cartera del vendedor, filtrada en el servidor (B3-03). */
export function obtenerClientes(q = '') {
  const texto = String(q ?? '').trim();
  return pedir(texto ? `/clientes?${new URLSearchParams({ q: texto })}` : '/clientes');
}

const rutaCliente = (id) => `/clientes/${encodeURIComponent(String(id))}`;

/** GET /api/clientes/:id: detalle de un cliente propio. */
export const obtenerCliente = (id) => pedir(rutaCliente(id));

/** GET /api/clientes/disponibles: [{ id, nombre }]. */
export const obtenerDisponibles = () => pedir('/clientes/disponibles');

/** POST /api/clientes con { nombre, nit, telefono, correo? }. */
export const crearCliente = (datos) => pedir('/clientes', { metodo: 'POST', cuerpo: datos });

/** PATCH /api/clientes/:id con los campos modificados. */
export const actualizarCliente = (id, cambios) => pedir(rutaCliente(id), { metodo: 'PATCH', cuerpo: cambios });

/** POST /api/clientes/:id/tomar (sin cuerpo). */
export const tomarCliente = (id) => pedir(`${rutaCliente(id)}/tomar`, { metodo: 'POST' });

// ---------- B4: productos y oportunidades ----------

/** GET /api/productos: catálogo activo [{ id, nombre, precio, stock }]. */
export const obtenerProductos = () => pedir('/productos');

const rutaOportunidad = (id) => `/oportunidades/${encodeURIComponent(String(id))}`;
const rutaLinea = (id, lineaId) => `${rutaOportunidad(id)}/productos/${encodeURIComponent(String(lineaId))}`;

/** GET /api/oportunidades: resúmenes de las oportunidades propias. */
export const obtenerOportunidades = () => pedir('/oportunidades');

/** GET /api/oportunidades/:id: detalle (§8.3). */
export const obtenerOportunidad = (id) => pedir(rutaOportunidad(id));

/** POST /api/oportunidades con { cliente_id, titulo }. */
export const crearOportunidad = (datos) => pedir('/oportunidades', { metodo: 'POST', cuerpo: datos });

/** PATCH /api/oportunidades/:id con { titulo }. */
export const actualizarTitulo = (id, titulo) => pedir(rutaOportunidad(id), { metodo: 'PATCH', cuerpo: { titulo } });

/** PATCH /api/oportunidades/:id/etapa con { etapa, motivo_perdida? }. */
export const cambiarEtapa = (id, cuerpo) => pedir(`${rutaOportunidad(id)}/etapa`, { metodo: 'PATCH', cuerpo });

/** POST /api/oportunidades/:id/productos con { producto_id, cantidad } (el precio lo pone el servidor). */
export const agregarLinea = (id, datos) => pedir(`${rutaOportunidad(id)}/productos`, { metodo: 'POST', cuerpo: datos });

/** PATCH /api/oportunidades/:id/productos/:lineaId con { cantidad }. */
export const actualizarLinea = (id, lineaId, cantidad) => pedir(rutaLinea(id, lineaId), { metodo: 'PATCH', cuerpo: { cantidad } });

/** DELETE /api/oportunidades/:id/productos/:lineaId → 204 sin cuerpo. */
export const eliminarLinea = (id, lineaId) => pedir(rutaLinea(id, lineaId), { metodo: 'DELETE' });

// ---------- B5: actividades ----------

/** GET /api/actividades?estado=pendiente|completada (sin estado: todas). */
export const obtenerActividades = (estado) => pedir(estado ? `/actividades?${new URLSearchParams({ estado })}` : '/actividades');

/** POST /api/clientes/:id/actividades con { tipo, descripcion, vence_en? } (vence_en ISO con zona). */
export const crearActividad = (clienteId, datos) => pedir(`${rutaCliente(clienteId)}/actividades`, { metodo: 'POST', cuerpo: datos });

/** PATCH /api/actividades/:id con { completada } (booleano JSON). */
export const marcarActividad = (id, completada = true) => pedir(`/actividades/${encodeURIComponent(String(id))}`, { metodo: 'PATCH', cuerpo: { completada } });
