// Tablero de oportunidades (B4-22; F3): cuatro columnas abiertas, sección de cerradas y alta.
// Todo texto de la API o del usuario pasa por escaparHtml antes de insertarse (S7).
// Los importes vienen calculados por el servidor; aquí solo se formatean en quetzales.

import { escaparHtml } from '../util/escape.js';
import { formatearFecha, formatearQuetzales } from '../util/formato.js';
import { ETAPAS_ABIERTAS, etiqueta } from '../util/embudo.js';
import { campo, spinner, actualizando } from './campo.js';

const enlace = (o) => `#/oportunidades/${encodeURIComponent(String(o.id))}`;

const tarjeta = (o) => `
  <a class="card card-body p-2 text-decoration-none text-body shadow-sm" href="${escaparHtml(enlace(o))}">
    <span class="fw-medium text-break">${escaparHtml(o.titulo)}</span>
    <span class="small text-body-secondary text-break">${escaparHtml(o.cliente?.nombre)}</span>
    <span class="small fw-semibold">${escaparHtml(formatearQuetzales(o.total))}</span>
  </a>`;

function renderFormulario(f, clientes) {
  if (!f) return '';
  const { valores, errores = {}, mensaje, enviando, cargandoClientes } = f;
  return `
    <section class="card shadow-sm mb-3" aria-labelledby="titulo-nueva-oportunidad">
      <div class="card-body">
        <h2 id="titulo-nueva-oportunidad" class="h5 mb-3">Nueva oportunidad</h2>
        ${mensaje ? `<div class="alert alert-${escaparHtml(mensaje.tipo)}" role="alert">${escaparHtml(mensaje.texto)}</div>` : ''}
        ${cargandoClientes ? spinner('Cargando sus clientes…') : `
        <form id="form-oportunidad" novalidate>
          <div class="row gx-3">
            <div class="col-12 col-md-5">
              ${campo({ id: 'oportunidad-cliente', nombre: 'cliente_id', etiqueta: 'Cliente', valor: valores.cliente_id, error: errores.cliente_id, cargando: enviando, vacia: clientes.length ? 'Seleccione un cliente de su cartera' : 'No tiene clientes en su cartera', opciones: clientes.map((c) => ({ valor: c.id, texto: c.nombre })) })}
            </div>
            <div class="col-12 col-md-7">
              ${campo({ id: 'oportunidad-titulo', nombre: 'titulo', etiqueta: 'Título', valor: valores.titulo, error: errores.titulo, cargando: enviando, maxlength: 150 })}
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button type="submit" class="btn btn-primary" ${enviando ? 'disabled' : ''}>
              ${enviando ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span><span role="status">Creando…</span>' : 'Crear en prospecto'}
            </button>
            <button type="button" class="btn btn-outline-secondary" data-accion="cancelar-oportunidad" ${enviando ? 'disabled' : ''}>Cancelar</button>
          </div>
        </form>`}
      </div>
    </section>`;
}

function renderColumnas(lista) {
  return `
    <div class="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-3 mb-4">
      ${ETAPAS_ABIERTAS.map((etapa) => {
        const items = lista.filter((o) => o.etapa === etapa);
        return `
          <section class="col" aria-labelledby="col-${etapa}">
            <div class="card h-100 bg-body-tertiary border-0">
              <div class="card-body p-2">
                <h2 id="col-${etapa}" class="h6 d-flex justify-content-between align-items-center mb-2">
                  <span>${escaparHtml(etiqueta(etapa))}</span>
                  <span class="badge text-bg-secondary">${items.length}</span>
                </h2>
                <div class="d-grid gap-2">
                  ${items.length ? items.map(tarjeta).join('') : '<p class="small text-body-secondary mb-0">Sin oportunidades.</p>'}
                </div>
              </div>
            </div>
          </section>`;
      }).join('')}
    </div>`;
}

function renderCerradas(lista) {
  const cerradas = lista.filter((o) => o.etapa === 'ganada' || o.etapa === 'perdida');
  return `
    <section aria-labelledby="titulo-cerradas">
      <h2 id="titulo-cerradas" class="h5">Cerradas</h2>
      ${cerradas.length === 0 ? '<p class="text-body-secondary">Todavía no hay oportunidades ganadas ni perdidas.</p>' : `
      <ul class="list-group">
        ${cerradas.map((o) => `
          <li class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2">
            <a class="text-break" href="${escaparHtml(enlace(o))}">${escaparHtml(o.titulo)}</a>
            <span class="d-flex flex-wrap align-items-center gap-2 small">
              <span class="text-body-secondary text-break">${escaparHtml(o.cliente?.nombre)}</span>
              <span class="badge text-bg-${o.etapa === 'ganada' ? 'success' : 'secondary'}">${escaparHtml(etiqueta(o.etapa))}</span>
              <span class="fw-semibold">${escaparHtml(formatearQuetzales(o.total))}</span>
              ${o.fecha_cierre ? `<span class="text-body-secondary">${escaparHtml(formatearFecha(o.fecha_cierre))}</span>` : ''}
            </span>
          </li>`).join('')}
      </ul>`}
    </section>`;
}

export function renderOportunidades(estado) {
  const t = estado.oportunidades;
  const encabezado = `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <h1 class="h4 mb-0">Oportunidades</h1>
      <button type="button" class="btn btn-primary" data-accion="nueva-oportunidad" ${t.formulario ? 'disabled' : ''}>Nueva oportunidad</button>
    </div>`;
  let cuerpo;
  if (t.cargando && !t.cargada) cuerpo = spinner('Cargando oportunidades…');
  else if (t.error) {
    cuerpo = `
      <div class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
        <span>${escaparHtml(t.error)}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" data-accion="reintentar-oportunidades">Reintentar</button>
      </div>`;
  } else cuerpo = `${t.cargando ? actualizando : ''}${renderColumnas(t.lista)}${renderCerradas(t.lista)}`;
  return `${encabezado}${renderFormulario(t.formulario, t.clientes)}${cuerpo}`;
}
