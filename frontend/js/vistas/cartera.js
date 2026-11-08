// Vista de cartera de solo lectura (B2-15). B3 añadirá búsqueda, creación, edición y toma de clientes.
// Todo texto que viene de la API pasa por escaparHtml antes de insertarse (S7).

import { escaparHtml } from '../util/escape.js';
import { formatearCartera, MAXIMO_CARTERA } from '../util/formato.js';

const fila = (c) => `
  <tr>
    <td class="fw-medium text-break">${escaparHtml(c.nombre)}</td>
    <td class="text-nowrap">${escaparHtml(c.nit)}</td>
    <td class="text-nowrap">${escaparHtml(c.telefono)}</td>
    <td class="text-break">${c.correo ? escaparHtml(c.correo) : '<span class="text-body-secondary">—</span>'}</td>
  </tr>`;

export function renderCartera(estado) {
  const { cargando, clientes, error, cargada } = estado.cartera;

  const encabezado = `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <h1 class="h4 mb-0">Mi cartera</h1>
      <span class="badge text-bg-${clientes.length >= MAXIMO_CARTERA ? 'warning' : 'primary'} fs-6"
            title="Clientes asignados respecto al máximo permitido">
        ${escaparHtml(formatearCartera(cargada ? clientes.length : 0))} clientes
      </span>
    </div>`;

  if (cargando) {
    return `${encabezado}
      <div class="d-flex align-items-center gap-2 text-body-secondary py-4" role="status">
        <span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Cargando clientes…
      </div>`;
  }

  if (error) {
    return `${encabezado}
      <div class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
        <span>${escaparHtml(error)}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" data-accion="reintentar-cartera">Reintentar</button>
      </div>`;
  }

  if (cargada && clientes.length === 0) {
    return `${encabezado}<p class="text-body-secondary">Todavía no tiene clientes asignados.</p>`;
  }

  return `${encabezado}
    <div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr><th scope="col">Nombre</th><th scope="col">NIT</th><th scope="col">Teléfono</th><th scope="col">Correo</th></tr>
        </thead>
        <tbody>${clientes.map(fila).join('')}</tbody>
      </table>
    </div>`;
}
