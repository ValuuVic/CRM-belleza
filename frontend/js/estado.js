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
  cartera: { cargando: false, clientes: [], error: null, cargada: false },
});

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
  actualizar({ sesion: null, cartera: estadoInicial().cartera, login: estadoInicial().login });
}

/** Solo para las pruebas: vuelve al estado inicial leyendo de nuevo el almacenamiento. */
export function _reiniciarParaPruebas() {
  estado = estadoInicial();
  oyentes.clear();
}
