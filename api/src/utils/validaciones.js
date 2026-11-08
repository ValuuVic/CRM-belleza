// Validaciones compartidas de B1 (B1-06, B1-07, B1-08).
// Reglas: docs/especificacion.md §5 R4 (NIT y teléfono) y R8 (fechas).
// Estas funciones no lanzan excepciones: devuelven { valido, … } y la capa que
// las use decide el mensaje de error 422 por campo.

/**
 * Normaliza y valida un NIT guatemalteco (R4).
 * - Elimina espacios y guiones, convierte a mayúsculas y quita los ceros iniciales.
 * - "CF" (consumidor final) es válido y se representa como null.
 * - El último carácter es el dígito verificador (0-9 o K), calculado con módulo 11:
 *   los dígitos del cuerpo se multiplican por pesos n+1 … 2 (de izquierda a derecha),
 *   verificador = (11 - (suma % 11)) % 11, y 10 se representa como "K".
 *
 * @param {unknown} valor
 * @returns {{ valido: boolean, nit: string | null }}
 */
export function normalizarNit(valor) {
  if (typeof valor !== 'string') return { valido: false, nit: null };

  const limpio = valor.replace(/[\s-]/g, '').toUpperCase();
  if (limpio === 'CF') return { valido: true, nit: null };

  const sinCeros = limpio.replace(/^0+/, '');
  if (!/^\d+[\dK]$/.test(sinCeros)) return { valido: false, nit: null };

  const cuerpo = sinCeros.slice(0, -1);
  const verificador = sinCeros.slice(-1);

  let suma = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    suma += Number(cuerpo[i]) * (cuerpo.length + 1 - i);
  }
  const resultado = (11 - (suma % 11)) % 11;
  const esperado = resultado === 10 ? 'K' : String(resultado);

  return esperado === verificador ? { valido: true, nit: sinCeros } : { valido: false, nit: null };
}

/**
 * Normaliza y valida un teléfono guatemalteco (R4).
 * - Elimina separadores: espacios, guiones, puntos y paréntesis.
 * - Elimina el prefijo de Guatemala: "+502", o "502" cuando quedan 11 dígitos.
 * - Debe quedar un número de 8 dígitos que empiece por 2-9.
 *
 * @param {unknown} valor
 * @returns {{ valido: boolean, telefono: string | null }}
 */
export function normalizarTelefono(valor) {
  if (typeof valor !== 'string') return { valido: false, telefono: null };

  let limpio = valor.replace(/[\s\-.()]/g, '');
  if (limpio.startsWith('+502')) limpio = limpio.slice(4);
  else if (/^502\d{8}$/.test(limpio)) limpio = limpio.slice(3);

  return /^[2-9]\d{7}$/.test(limpio)
    ? { valido: true, telefono: limpio }
    : { valido: false, telefono: null };
}

// AAAA-MM-DDTHH:MM[:SS[.mmm]] seguido obligatoriamente de Z o ±HH:MM.
const FECHA_CON_ZONA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):(\d{2}))$/;

const esBisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasDelMes = (a, m) => [31, esBisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/**
 * Valida una fecha ISO 8601 con zona horaria explícita y la normaliza a UTC (R8).
 * Se rechazan las fechas sin zona ("2026-10-15T10:00"), solo fecha ("2026-10-15"),
 * fechas imposibles ("2026-02-31T…") y cualquier otro formato ambiguo.
 *
 * @param {unknown} valor
 * @returns {{ valido: boolean, fecha: Date | null }}
 */
export function fechaUtc(valor) {
  if (typeof valor !== 'string') return { valido: false, fecha: null };

  const m = FECHA_CON_ZONA.exec(valor);
  if (!m) return { valido: false, fecha: null };

  const [, a, mes, dia, hora, min, seg = '00', , zona, zh, zm] = m;
  const anio = Number(a);
  const nMes = Number(mes);
  const fueraDeRango =
    nMes < 1 || nMes > 12 ||
    Number(dia) < 1 || Number(dia) > diasDelMes(anio, nMes) ||
    Number(hora) > 23 || Number(min) > 59 || Number(seg) > 59 ||
    (zona !== 'Z' && (Number(zh) > 14 || Number(zm) > 59));
  if (fueraDeRango) return { valido: false, fecha: null };

  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? { valido: false, fecha: null } : { valido: true, fecha };
}
