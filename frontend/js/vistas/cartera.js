// Vista de cartera (B2-15 y B3; F2): listado, búsqueda, alta, edición, disponibles y toma.
// Todo texto que viene de la API o del usuario pasa por escaparHtml antes de insertarse (S7, B3-15).
// Los botones usan data-accion y data-id: app.js los atiende por delegación de eventos.

import { escaparHtml } from '../util/escape.js';
import { formatearCartera, MAXIMO_CARTERA } from '../util/formato.js';
import { campo } from './campo.js';

const SIN_DATO = '<span class="text-body-secondary">—</span>';
const spinner = (texto) => `
  <div class="d-flex align-items-center gap-2 text-body-secondary py-3" role="status">
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${escaparHtml(texto)}
  </div>`;

const fila = (c, bloqueado) => `
  <tr>
    <td class="fw-medium text-break">${escaparHtml(c.nombre)}</td>
    <td class="text-nowrap">${escaparHtml(c.nit)}</td>
    <td class="text-nowrap">${escaparHtml(c.telefono)}</td>
    <td class="text-break">${c.correo ? escaparHtml(c.correo) : SIN_DATO}</td>
    <td class="text-end">
      <button type="button" class="btn btn-sm btn-outline-primary" data-accion="editar-cliente" data-id="${escaparHtml(c.id)}"
              aria-label="Editar ${escaparHtml(c.nombre)}" ${bloqueado ? 'disabled' : ''}>Editar</button>
    </td>
  </tr>`;

function renderBusqueda({ busqueda, cargando }) {
  return `
    <form id="form-busqueda" class="d-flex flex-wrap gap-2 flex-grow-1" role="search" novalidate>
      <label for="busqueda-q" class="visually-hidden">Buscar por nombre o NIT</label>
      <input id="busqueda-q" name="q" type="search" class="form-control flex-grow-1 w-auto"
             placeholder="Buscar por nombre o NIT" maxlength="100" value="${escaparHtml(busqueda)}" autocomplete="off">
      <button type="submit" class="btn btn-outline-secondary" ${cargando ? 'disabled' : ''}>Buscar</button>
      ${busqueda ? `<button type="button" class="btn btn-link px-1" data-accion="limpiar-busqueda" ${cargando ? 'disabled' : ''}>Limpiar</button>` : ''}
    </form>`;
}

function renderFormulario(f) {
  if (!f) return '';
  const titulo = f.modo === 'crear' ? 'Nuevo cliente' : 'Editar cliente';
  if (f.cargando) {
    return `<section class="card shadow-sm mb-3" aria-label="${titulo}"><div class="card-body">${spinner('Cargando cliente…')}</div></section>`;
  }
  const { valores = {}, errores = {}, mensaje, enviando } = f;
  const opciones = (extra) => ({ cargando: enviando, ...extra });
  return `
    <section class="card shadow-sm mb-3" aria-labelledby="titulo-formulario-cliente">
      <div class="card-body">
        <h2 id="titulo-formulario-cliente" class="h5 mb-3">${titulo}</h2>
        ${mensaje ? `<div class="alert alert-${escaparHtml(mensaje.tipo)}" role="alert">${escaparHtml(mensaje.texto)}</div>` : ''}
        ${errores.general ? `<div class="alert alert-danger" role="alert">${escaparHtml(errores.general)}</div>` : ''}
        <form id="form-cliente" novalidate>
          <div class="row gx-3">
            <div class="col-12 col-md-6">
              ${campo(opciones({ id: 'cliente-nombre', nombre: 'nombre', etiqueta: 'Nombre', valor: valores.nombre, error: errores.nombre, autocompletar: 'organization', maxlength: 150 }))}
            </div>
            <div class="col-12 col-md-6">
              ${campo(opciones({ id: 'cliente-nit', nombre: 'nit', etiqueta: 'NIT', valor: valores.nit, error: errores.nit, ayuda: 'Escriba el NIT con su dígito verificador, o CF para consumidor final.' }))}
            </div>
            <div class="col-12 col-md-6">
              ${campo(opciones({ id: 'cliente-telefono', nombre: 'telefono', tipo: 'tel', etiqueta: 'Teléfono', valor: valores.telefono, error: errores.telefono, autocompletar: 'tel', ayuda: '8 dígitos; puede incluir +502.' }))}
            </div>
            <div class="col-12 col-md-6">
              ${campo(opciones({ id: 'cliente-correo', nombre: 'correo', tipo: 'email', etiqueta: 'Correo', valor: valores.correo, error: errores.correo, autocompletar: 'email', requerido: false, maxlength: 150 }))}
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button type="submit" class="btn btn-primary" ${enviando ? 'disabled' : ''}>
              ${enviando ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span><span role="status">Guardando…</span>' : 'Guardar'}
            </button>
            <button type="button" class="btn btn-outline-secondary" data-accion="cancelar-formulario" ${enviando ? 'disabled' : ''}>Cancelar</button>
          </div>
        </form>
      </div>
    </section>`;
}

function renderListado({ cargando, clientes, error, cargada, busqueda, formulario }) {
  if (cargando) return spinner('Cargando clientes…');
  if (error) {
    return `
      <div class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
        <span>${escaparHtml(error)}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" data-accion="reintentar-cartera">Reintentar</button>
      </div>`;
  }
  if (cargada && clientes.length === 0) {
    return busqueda
      ? `<p class="text-body-secondary">No se encontraron clientes de su cartera para «${escaparHtml(busqueda)}».</p>`
      : '<p class="text-body-secondary">Todavía no tiene clientes asignados.</p>';
  }
  const bloqueado = Boolean(formulario?.enviando);
  return `
    <div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr><th scope="col">Nombre</th><th scope="col">NIT</th><th scope="col">Teléfono</th><th scope="col">Correo</th><th scope="col"><span class="visually-hidden">Acciones</span></th></tr>
        </thead>
        <tbody>${clientes.map((c) => fila(c, bloqueado)).join('')}</tbody>
      </table>
    </div>`;
}

function renderDisponibles(d, llena) {
  if (!d?.visible) return '';
  let contenido;
  if (d.cargando) contenido = spinner('Cargando clientes disponibles…');
  else if (d.lista.length === 0) contenido = '<p class="text-body-secondary mb-0">No hay clientes disponibles en este momento.</p>';
  else {
    contenido = `
      <ul class="list-group">
        ${d.lista.map((c) => `
          <li class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span class="text-break">${escaparHtml(c.nombre)}</span>
            <button type="button" class="btn btn-sm btn-outline-success" data-accion="tomar-cliente" data-id="${escaparHtml(c.id)}"
                    aria-label="Tomar ${escaparHtml(c.nombre)}" ${llena || d.tomando !== null ? 'disabled' : ''}>
              ${String(d.tomando) === String(c.id) ? '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Tomando…' : 'Tomar'}
            </button>
          </li>`).join('')}
      </ul>`;
  }
  return `
    <section class="mt-4" aria-labelledby="titulo-disponibles">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h2 id="titulo-disponibles" class="h5 mb-0">Clientes disponibles</h2>
        <button type="button" class="btn btn-sm btn-link" data-accion="ocultar-disponibles">Ocultar</button>
      </div>
      ${llena ? `<div class="alert alert-warning py-2" role="status">Su cartera está llena (${MAXIMO_CARTERA} clientes): no puede tomar más clientes.</div>` : ''}
      ${d.error ? `<div class="alert alert-danger py-2" role="alert">${escaparHtml(d.error)}</div>` : ''}
      ${contenido}
    </section>`;
}

export function renderCartera(estado) {
  const c = estado.cartera;
  const { clientes, cargada } = c;
  const total = cargada ? (Number.isInteger(c.total) ? c.total : clientes.length) : 0;
  const llena = total >= MAXIMO_CARTERA;
  const disponibles = c.disponibles ?? { visible: false };
  const formulario = c.formulario ?? null;

  const encabezado = `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <h1 class="h4 mb-0">Mi cartera</h1>
      <span class="badge text-bg-${llena ? 'warning' : 'primary'} fs-6"
            title="Clientes asignados respecto al máximo permitido">
        ${escaparHtml(formatearCartera(total))} clientes
      </span>
    </div>`;

  const barra = `
    <div class="d-flex flex-wrap align-items-start gap-2 mb-3">
      ${renderBusqueda({ busqueda: c.busqueda ?? '', cargando: c.cargando })}
      <div class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-primary" data-accion="nuevo-cliente"
                ${llena || formulario ? 'disabled' : ''} ${llena ? 'title="Su cartera ya tiene el máximo de clientes"' : ''}>Nuevo cliente</button>
        ${disponibles.visible ? '' : '<button type="button" class="btn btn-outline-success" data-accion="ver-disponibles">Ver disponibles</button>'}
      </div>
    </div>`;

  return `${encabezado}${barra}${renderFormulario(formulario)}${renderListado({ ...c, formulario })}${renderDisponibles(disponibles, llena)}`;
}
