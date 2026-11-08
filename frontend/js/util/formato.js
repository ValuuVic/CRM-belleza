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

// Guatemala usa UTC−6 todo el año, sin horario de verano (R7): el desplazamiento es fijo.
export const DESPLAZAMIENTO_GUATEMALA = '-06:00';
const FECHA_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Valor de un <input type="datetime-local"> ("2026-12-01T10:00") → ISO 8601 con la zona de
 * Guatemala ("2026-12-01T10:00:00-06:00") para la API (B5-17, R8). No depende de la zona del
 * navegador. Vacío → null (sin vencimiento). Un texto que no tiene ese formato se devuelve tal cual:
 * la API lo rechaza con 422 y el mensaje aparece bajo el campo.
 */
export function localGuatemalaAIso(valor) {
  const texto = String(valor ?? '').trim();
  if (texto === '') return null;
  const m = FECHA_LOCAL.exec(texto);
  if (!m) return texto;
  const [, a, mes, dia, h, min, s = '00'] = m;
  return `${a}-${mes}-${dia}T${h}:${min}:${s}${DESPLAZAMIENTO_GUATEMALA}`;
}

/** Indicador de cartera: "3 de 10". */
export function formatearCartera(cantidad, maximo = MAXIMO_CARTERA) {
  const n = Number.isInteger(cantidad) && cantidad >= 0 ? cantidad : 0;
  return `${n} de ${maximo}`;
}

const FORMATO_QUETZALES = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });

/** Importe numérico de la API → texto en quetzales ("Q450.00"). Devuelve '' si no es un número. */
export function formatearQuetzales(monto) {
  const n = typeof monto === 'number' ? monto : Number.NaN;
  return Number.isFinite(n) ? FORMATO_QUETZALES.format(n) : '';
}
