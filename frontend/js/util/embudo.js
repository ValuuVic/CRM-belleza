// Etapas del embudo para la SPA (R5; B4 §3, B4-24).
// Solo decide qué botones de transición se MUESTRAN; la API vuelve a validar cada cambio
// (api/src/servicios/embudo.js). Si las reglas cambian, deben cambiarse en ambos lugares.

export const ETAPAS_ABIERTAS = Object.freeze(['prospecto', 'calificado', 'propuesta', 'negociacion']);
export const ETAPAS_CERRADAS = Object.freeze(['ganada', 'perdida']);

export const ETIQUETAS = Object.freeze({
  prospecto: 'Prospecto',
  calificado: 'Calificado',
  propuesta: 'Propuesta',
  negociacion: 'Negociación',
  ganada: 'Ganada',
  perdida: 'Perdida',
});

export const estaCerrada = (etapa) => ETAPAS_CERRADAS.includes(etapa);
// Object.hasOwn evita leer claves heredadas («constructor», «toString»…) si llegara una etapa extraña.
export const etiqueta = (etapa) => (Object.hasOwn(ETIQUETAS, etapa) ? ETIQUETAS[etapa] : String(etapa ?? ''));

/**
 * Transiciones que la SPA ofrece desde `actual`, en el orden en que se muestran:
 * retroceder, avanzar, ganar (solo desde negociación) y perder (desde cualquier abierta).
 * @returns {{ etapa: string, tipo: 'retroceder' | 'avanzar' | 'ganar' | 'perder' }[]}
 */
export function transicionesVisibles(actual) {
  const i = ETAPAS_ABIERTAS.indexOf(actual);
  if (i < 0) return [];
  const lista = [];
  if (i > 0) lista.push({ etapa: ETAPAS_ABIERTAS[i - 1], tipo: 'retroceder' });
  if (i < ETAPAS_ABIERTAS.length - 1) lista.push({ etapa: ETAPAS_ABIERTAS[i + 1], tipo: 'avanzar' });
  if (actual === 'negociacion') lista.push({ etapa: 'ganada', tipo: 'ganar' });
  lista.push({ etapa: 'perdida', tipo: 'perder' });
  return lista;
}
