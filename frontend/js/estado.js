// Estado único de la SPA (patrón estado → render, CLAUDE.md §8).
// La sesión guarda SOLO el token y los datos públicos del usuario: nunca la contraseña (B2-16).
// localStorage puede no estar disponible (modo privado, bloqueos): todos los accesos van en try/catch.

const CLAVE_SESION = 'crm.sesion';

function almacen() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function leerSesion() {
  try {
    const crudo = almacen()?.getItem(CLAVE_SESION);
    if (!crudo) return null;
    const s = JSON.parse(crudo);
    if (typeof s?.token !== 'string' || !s.token || typeof s?.usuario !== 'object' || s.usuario === null) return null;
    return { token: s.token, usuario: { id: s.usuario.id, nombre: s.usuario.nombre, correo: s.usuario.correo } };
  } catch {
    return null;
  }
}

const estadoInicial = () => ({
  sesion: leerSesion(),
  ruta: '#/login',
  aviso: null, // { tipo: 'warning' | 'danger' | 'info', texto }
  login: { cargando: false, correo: '', errores: {}, mensaje: null },
  cartera: carteraInicial(),
  oportunidades: tableroInicial(),
  detalle: detalleInicial(),
});

/**
 * Tablero de oportunidades (B4-22).
 * - lista: resúmenes de GET /api/oportunidades.
 * - formulario: null o { valores: { cliente_id, titulo }, errores, mensaje, enviando, cargandoClientes }.
 * - clientes: cartera propia para elegir el cliente de la nueva oportunidad.
 */
export function tableroInicial() {
  return { cargando: false, lista: [], error: null, cargada: false, formulario: null, clientes: [] };
}

/**
 * Detalle de una oportunidad (B4-23 a B4-25).
 * - datos: último detalle confirmado por la API; un error (p. ej. 409 de stock) no lo cambia.
 * - catalogo: productos activos para agregar líneas.
 * - enviando: acción en curso o null; mensaje: { tipo, texto } de la última acción.
 * - errores: 422 por formulario: { titulo, linea: { producto_id, cantidad }, lineas: { [id]: cantidad }, perdida }.
 * - valores: lo escrito en los formularios, para conservarlo ante un error.
 * - perdida: true mientras se muestra el formulario del motivo de pérdida.
 */
export function detalleInicial() {
  return {
    id: null, cargando: false, datos: null, error: null, catalogo: [],
    enviando: null, mensaje: null, perdida: false,
    errores: { titulo: null, linea: {}, lineas: {}, perdida: null },
    valores: { titulo: null, linea: { producto_id: '', cantidad: '1' }, lineas: {}, perdida: '' },
  };
}

/**
 * Estado de la cartera (B2-15, B3).
 * - clientes: resultado de la última consulta (con o sin búsqueda).
 * - total: tamaño de la cartera completa, para el indicador «X de 10» aunque haya búsqueda.
 * - busqueda: texto aplicado en el servidor (solo cambia al enviar el formulario).
 * - formulario: null o { modo: 'crear' | 'editar', id, valores, original, errores, mensaje, enviando }.
 * - disponibles: clientes sin vendedor ({ id, nombre }) y el estado de la acción «tomar».
 */
export function carteraInicial() {
  return {
    cargando: false, clientes: [], total: 0, busqueda: '', error: null, cargada: false,
    formulario: null,
    disponibles: { visible: false, cargando: false, lista: [], error: null, tomando: null },
  };
}

let estado = estadoInicial();
const oyentes = new Set();

export const obtenerEstado = () => estado;

/** Combina `cambios` (objeto o función del estado actual) y avisa a los oyentes. */
export function actualizar(cambios) {
  const parcial = typeof cambios === 'function' ? cambios(estado) : cambios;
  estado = { ...estado, ...parcial };
  for (const oyente of oyentes) oyente(estado);
}

export function suscribir(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** Guarda la sesión recibida del login (solo token y usuario { id, nombre, correo }). */
export function guardarSesion({ token, usuario }) {
  const sesion = { token, usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } };
  try {
    almacen()?.setItem(CLAVE_SESION, JSON.stringify(sesion));
  } catch {
    // sin almacenamiento: la sesión dura hasta recargar la página
  }
  actualizar({ sesion });
}

/** Elimina la sesión local y los datos de la cartera. */
export function cerrarSesion() {
  try {
    almacen()?.removeItem(CLAVE_SESION);
  } catch {
    // sin almacenamiento
  }
  actualizar({
    sesion: null, cartera: carteraInicial(), oportunidades: tableroInicial(), detalle: detalleInicial(), login: estadoInicial().login,
  });
}

/** Solo para las pruebas: vuelve al estado inicial leyendo de nuevo el almacenamiento. */
export function _reiniciarParaPruebas() {
  estado = estadoInicial();
  oyentes.clear();
}
