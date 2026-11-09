// Resumen mensual del vendedor (A6; docs/specs/A6-resumen.md). Parte A.
// Implementa en la API la definición única de cifras de docs/specs/A5-equipos-reportes.md §5, la misma
// que App\Services\ReporteVentas en el panel:
// - Mes de Guatemala (UTC−6, sin horario de verano) como rango UTC [AAAA-MM-01 06:00, mes siguiente 06:00),
//   calculado aquí y pasado como parámetro (§5.1).
// - C1 ventas, C2 total y C3 pronóstico en MySQL con DECIMAL, redondeados a 2 decimales una sola vez,
//   después de sumar (§5.3); C4 cartera.
// - Una sola sentencia con subconsultas: las cuatro cifras salen de la misma instantánea.
// - SQL fijo y literal con `?` (S3). El CASE de probabilidad y la lista de etapas abiertas se escriben
//   aquí tal cual; api/test/reportes-a6.test.js exige que coincidan con PROBABILIDAD y ETAPAS_ABIERTAS de
//   embudo.js, de modo que un cambio en el embudo sin cambiar este SQL hace fallar la prueba.
//   El vendedor llega del token (req.vendedor.id), nunca de la consulta.

import { MAXIMO_CARTERA } from '../rutas/clientes.js';

/** AAAA-MM con mes 01-12 y año 1000-9999 (DA6-1). */
export const MES_VALIDO = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
export const MENSAJE_MES_INVALIDO = 'El mes debe tener el formato AAAA-MM';

/** CASE de probabilidad de A5 §5.2 (= PROBABILIDAD de embudo.js para las etapas abiertas). */
export const SQL_PROBABILIDAD = "CASE o.etapa WHEN 'prospecto' THEN 10 WHEN 'calificado' THEN 25 WHEN 'propuesta' THEN 50 WHEN 'negociacion' THEN 75 END";

/** Etapas abiertas en SQL (= ETAPAS_ABIERTAS de embudo.js). */
export const SQL_ETAPAS_ABIERTAS = "'prospecto', 'calificado', 'propuesta', 'negociacion'";

// C1 a C4 de A5 §5.3 con {alcance} = o.vendedor_id = ?.
// Parámetros: [inicio, fin, vendedor, inicio, fin, vendedor, vendedor, vendedor].
export const SQL_RESUMEN = `SELECT
  (SELECT COUNT(*) FROM oportunidades o
     WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND o.vendedor_id = ?) AS ventas,
  (SELECT ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario), 0), 2)
     FROM oportunidades o JOIN oportunidad_productos l ON l.oportunidad_id = o.id
     WHERE o.etapa = 'ganada' AND o.fecha_cierre >= ? AND o.fecha_cierre < ? AND o.vendedor_id = ?) AS total,
  (SELECT ROUND(COALESCE(SUM(l.cantidad * l.precio_unitario * CASE o.etapa WHEN 'prospecto' THEN 10 WHEN 'calificado' THEN 25 WHEN 'propuesta' THEN 50 WHEN 'negociacion' THEN 75 END / 100), 0), 2)
     FROM oportunidades o JOIN oportunidad_productos l ON l.oportunidad_id = o.id
     WHERE o.etapa IN ('prospecto', 'calificado', 'propuesta', 'negociacion') AND o.vendedor_id = ?) AS pronostico,
  (SELECT COUNT(*) FROM clientes WHERE vendedor_id = ?) AS clientes`;

const FORMATO_GUATEMALA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit' });

/** Mes actual en hora de Guatemala, «AAAA-MM» (DA6-2). `ahora` se puede fijar en las pruebas. */
export function mesActualGuatemala(ahora = new Date()) {
  const partes = Object.fromEntries(FORMATO_GUATEMALA.formatToParts(ahora).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}`;
}

export const mesValido = (valor) => typeof valor === 'string' && MES_VALIDO.test(valor);

/**
 * Rango UTC del mes de Guatemala (A5 §5.1), como texto DATETIME para MySQL.
 * @param {string} mes AAAA-MM válido
 * @returns {[string, string]} [inicio, fin)
 */
export function rangoMes(mes) {
  const [anio, numero] = mes.split('-').map(Number);
  const siguiente = numero === 12 ? `${anio + 1}-01` : `${anio}-${String(numero + 1).padStart(2, '0')}`;
  return [`${mes}-01 06:00:00`, `${siguiente}-01 06:00:00`];
}

/**
 * Resumen del mes de un vendedor (contrato §8.5): números, nunca texto.
 * @param {{ execute: Function }} conexion pool o conexión de mysql2
 * @param {number} vendedorId id del vendedor del token
 * @param {string} mes AAAA-MM válido
 */
export async function calcularResumen(conexion, vendedorId, mes) {
  const [inicio, fin] = rangoMes(mes);
  const [[fila]] = await conexion.execute(SQL_RESUMEN, [inicio, fin, vendedorId, inicio, fin, vendedorId, vendedorId, vendedorId]);
  return {
    mes,
    ventas: Number(fila.ventas),
    total: Number(fila.total),
    pronostico: Number(fila.pronostico),
    cartera: { clientes: Number(fila.clientes), maximo: MAXIMO_CARTERA },
  };
}
