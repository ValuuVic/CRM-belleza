// Embudo de ventas (R5; B4 §3). Funciones puras: no consultan la base de datos.
// Transiciones (B4 §3; decisión D1 de especificacion.md §14, «Decidida e implementada»):
// - Entre etapas abiertas solo se avanza o retrocede una etapa.
// - A `perdida` desde cualquier etapa abierta; a `ganada` solo desde `negociacion`.
// - Una oportunidad cerrada no cambia de etapa (409) y no se puede repetir la etapa actual (409).
// - Cualquier otro salto es una transición no permitida (422 errores.etapa).

export const ETAPAS_ABIERTAS = Object.freeze(['prospecto', 'calificado', 'propuesta', 'negociacion']);
export const ETAPAS_CERRADAS = Object.freeze(['ganada', 'perdida']);
export const ETAPAS = Object.freeze([...ETAPAS_ABIERTAS, ...ETAPAS_CERRADAS]);

/** Probabilidad en porcentaje entero (R5). */
export const PROBABILIDAD = Object.freeze({
  prospecto: 10, calificado: 25, propuesta: 50, negociacion: 75, ganada: 100, perdida: 0,
});

export const ETAPA_INICIAL = 'prospecto';

export const esEtapa = (etapa) => typeof etapa === 'string' && ETAPAS.includes(etapa);
export const estaCerrada = (etapa) => ETAPAS_CERRADAS.includes(etapa);

export const MENSAJE_CERRADA = 'La oportunidad está cerrada y no se puede modificar';
export const MENSAJE_MISMA_ETAPA = 'La oportunidad ya se encuentra en esa etapa';

/**
 * Valida una transición de etapa.
 * @param {string} actual etapa actual (válida)
 * @param {string} nueva etapa solicitada (válida)
 * @returns {{ ok: true } | { ok: false, status: 409 | 422, mensaje: string }}
 */
export function validarTransicion(actual, nueva) {
  if (estaCerrada(actual)) return { ok: false, status: 409, mensaje: MENSAJE_CERRADA };
  if (actual === nueva) return { ok: false, status: 409, mensaje: MENSAJE_MISMA_ETAPA };
  if (nueva === 'perdida') return { ok: true };
  if (nueva === 'ganada') {
    return actual === 'negociacion'
      ? { ok: true }
      : { ok: false, status: 422, mensaje: 'Solo se puede ganar una oportunidad desde negociación' };
  }
  const distancia = Math.abs(ETAPAS_ABIERTAS.indexOf(nueva) - ETAPAS_ABIERTAS.indexOf(actual));
  return distancia === 1
    ? { ok: true }
    : { ok: false, status: 422, mensaje: 'Solo se puede avanzar o retroceder una etapa a la vez' };
}

/** Etapas a las que se puede pasar desde `actual` (para la SPA y las pruebas). */
export const transicionesPermitidas = (actual) => ETAPAS.filter((e) => validarTransicion(actual, e).ok);
