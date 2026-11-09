// Acciones del resumen mensual del vendedor (A6, F5; docs/specs/A6-resumen.md). Parte A.
// Mismo patrón que las acciones de la Parte B: solo cambian el estado y app.js las conecta con el DOM.
// - Usa pedir() de api.js y actualizar() de estado.js sin modificarlos: el estado vive en la clave
//   `resumen`, que crea este módulo.
// - cerrarSesion() no limpia esa clave, así que se guarda el token con los datos y la vista solo dibuja
//   los de la sesión actual (S4). Una respuesta de otra sesión, de otro mes o de una consulta ya superada
//   se descarta (DA6-5, B6-01).
// - Un 401 lo gestiona api.js (cierra la sesión y vuelve al login): aquí solo se deja de actuar.
// - El mes inicial es el mes actual de Guatemala, sin depender de la zona de la computadora (DA6-2).

import { obtenerEstado, actualizar, tokenActual, sigueLaSesion } from './estado.js';
import { pedir } from './api.js';

/** AAAA-MM con mes 01-12 y año 1000-9999 (DA6-1). */
export const MES_VALIDO = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
export const MENSAJE_ERROR = 'No se pudo cargar el resumen. Inténtelo de nuevo.';
export const MENSAJE_MES = 'Elija un mes válido.';

const FORMATO_GUATEMALA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit' });

/** Mes actual en hora de Guatemala, «AAAA-MM». `ahora` se puede fijar en las pruebas. */
export function mesActualGuatemala(ahora = new Date()) {
  const partes = Object.fromEntries(FORMATO_GUATEMALA.formatToParts(ahora).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}`;
}

/**
 * Estado del resumen:
 * - mes: mes elegido (AAAA-MM) o null antes de entrar a la vista.
 * - datos: respuesta de GET /api/reportes/resumen para ese mes, o null.
 * - token: sesión a la que pertenecen mes y datos (S4).
 */
export function resumenInicial() {
  return { mes: null, cargando: false, datos: null, error: null, token: null };
}

const resumen = () => obtenerEstado().resumen ?? resumenInicial();
const cambiar = (cambios) => actualizar((e) => ({ resumen: { ...(e.resumen ?? resumenInicial()), ...cambios } }));
const mensajeDe = (r) => (typeof r.datos?.error === 'string' && r.datos.error) || MENSAJE_ERROR;

let consultaVigente = 0;

/** Pide el resumen de `mes` (AAAA-MM válido) para la sesión actual. */
export async function cargarResumen(mes) {
  const token = tokenActual();
  if (!token) return;
  const consulta = ++consultaVigente;
  cambiar({ mes, cargando: true, error: null, datos: null, token });

  const r = await pedir(`/reportes/resumen?${new URLSearchParams({ mes })}`);
  if (!sigueLaSesion(token, r) || consulta !== consultaVigente || resumen().mes !== mes) return;

  if (r.ok && r.datos && typeof r.datos === 'object' && r.datos.mes === mes) cambiar({ cargando: false, datos: r.datos });
  else cambiar({ cargando: false, error: mensajeDe(r) });
}

/** Al entrar a #/resumen: el mes ya elegido en esta sesión o, si no hay, el mes actual de Guatemala. */
export function entrarResumen(ahora = new Date()) {
  const r = resumen();
  const mes = r.token !== null && r.token === tokenActual() && r.mes ? r.mes : mesActualGuatemala(ahora);
  return cargarResumen(mes);
}

/** Cambio del selector de mes (DA6-5). Un valor vacío o mal formado no consulta la API. */
export function cambiarMes(valor) {
  const mes = String(valor ?? '').trim();
  if (!MES_VALIDO.test(mes)) {
    cambiar({ error: MENSAJE_MES, datos: null, cargando: false });
    return undefined;
  }
  return cargarResumen(mes);
}

/** Botón «Reintentar»: vuelve a pedir el mes elegido. */
export function reintentar() {
  const r = resumen();
  return cargarResumen(r.mes && MES_VALIDO.test(r.mes) ? r.mes : mesActualGuatemala());
}
