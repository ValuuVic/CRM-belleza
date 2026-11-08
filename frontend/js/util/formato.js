// Formatos de presentación de la SPA (CLAUDE.md §8: fechas con Intl y America/Guatemala).

export const MAXIMO_CARTERA = 10; // R3: máximo de diez clientes por vendedor

const FORMATO_FECHA = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Fecha ISO 8601 UTC de la API → texto en hora de Guatemala. Devuelve '' si no es válida. */
export function formatearFecha(iso) {
  if (typeof iso !== 'string' || !iso) return '';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '' : FORMATO_FECHA.format(fecha);
}

/** Indicador de cartera: "3 de 10". */
export function formatearCartera(cantidad, maximo = MAXIMO_CARTERA) {
  const n = Number.isInteger(cantidad) && cantidad >= 0 ? cantidad : 0;
  return `${n} de ${maximo}`;
}
