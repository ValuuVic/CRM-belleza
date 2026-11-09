// Vista del resumen mensual del vendedor (A6, F5; docs/specs/A6-resumen.md). Parte A.
// - Selector de mes (<input type="month" id="resumen-mes">); app.js conecta su evento `change` con
//   acciones-resumen.cambiarMes y el botón «Reintentar» (data-accion="reintentar-resumen").
// - Montos en quetzales con formatearQuetzales y cartera «n de 10» con formatearCartera (util/formato.js).
// - La etiqueta del mes («octubre de 2026») se arma con Intl y America/Guatemala, sin depender de la zona
//   de la computadora.
// - Solo se dibujan datos de la sesión actual (S4) y todo texto pasa por escaparHtml (S7).

import { escaparHtml } from '../util/escape.js';
import { formatearQuetzales, formatearCartera } from '../util/formato.js';
import { spinner } from './campo.js';
import { MES_VALIDO } from '../acciones-resumen.js';

const FORMATO_MES = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'America/Guatemala' });

/** «2026-10» → «octubre de 2026». Mediodía del día 15 en UTC: cae en el mismo mes en Guatemala. */
export function nombreMes(mes) {
  if (typeof mes !== 'string' || !MES_VALIDO.test(mes)) return '';
  const [anio, numero] = mes.split('-').map(Number);
  return FORMATO_MES.format(new Date(Date.UTC(anio, numero - 1, 15, 18)));
}

const tarjeta = (titulo, valor) => `
  <div class="col-12 col-sm-6 col-lg-3">
    <div class="card h-100">
      <div class="card-body">
        <h2 class="h6 text-body-secondary mb-1">${escaparHtml(titulo)}</h2>
        <p class="fs-4 fw-semibold mb-0 text-break">${escaparHtml(valor)}</p>
      </div>
    </div>
  </div>`;

function renderCuerpo(r) {
  if (r.cargando) return spinner('Cargando…');
  if (r.error) {
    return `
      <div class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
        <span>${escaparHtml(r.error)}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" data-accion="reintentar-resumen">Reintentar</button>
      </div>`;
  }
  if (!r.datos) return '';
  const d = r.datos;
  return `
    <h2 class="h5 mb-3">${escaparHtml(nombreMes(d.mes))}</h2>
    <div class="row g-3">
      ${tarjeta('Ventas', String(d.ventas))}
      ${tarjeta('Total vendido', formatearQuetzales(d.total))}
      ${tarjeta('Pronóstico', formatearQuetzales(d.pronostico))}
      ${tarjeta('Cartera', formatearCartera(d.cartera?.clientes, d.cartera?.maximo))}
    </div>
    <p class="small text-body-secondary mt-3 mb-0">
      El pronóstico suma sus oportunidades abiertas ponderadas por su probabilidad; no depende del mes.
    </p>`;
}

export function renderResumen(estado) {
  const r = estado.resumen;
  // Solo los datos de la sesión actual (S4): tras cerrar sesión, la clave `resumen` puede quedar con
  // los de otra persona.
  const propio = r && r.token !== null && r.token === (estado.sesion?.token ?? null);
  const vista = propio ? r : { mes: null, cargando: false, datos: null, error: null };
  return `
    <h1 class="h4">Resumen mensual</h1>
    <div class="mb-3" style="max-width: 16rem">
      <label class="form-label" for="resumen-mes">Mes</label>
      <input type="month" class="form-control" id="resumen-mes" name="mes"
             value="${escaparHtml(vista.mes ?? '')}" ${vista.cargando ? 'disabled' : ''}>
    </div>
    ${renderCuerpo(vista)}`;
}
