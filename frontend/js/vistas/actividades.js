// Vista de actividades comerciales (B5-16 a B5-20; F4): pestañas Pendientes / Completadas,
// formulario de alta, indicador de vencidas y botón «Completar».
// - `vencida` la calcula la API (§8.4); la vista solo la muestra.
// - Fechas en hora de Guatemala con formatearFecha (Intl, America/Guatemala).
// - Todo texto de la API o del usuario pasa por escaparHtml antes de insertarse (S7).

import { escaparHtml } from '../util/escape.js';
import { formatearFecha } from '../util/formato.js';
import { campo, spinner } from './campo.js';

export const ETIQUETA_TIPO = Object.freeze({ llamada: 'Llamada', reunion: 'Reunión', tarea: 'Tarea' });
const PESTANAS = [['pendiente', 'Pendientes'], ['completada', 'Completadas']];

function renderPestanas(activa, deshabilitadas) {
  return `
    <ul class="nav nav-tabs mb-3" role="tablist">
      ${PESTANAS.map(([valor, texto]) => `
        <li class="nav-item" role="presentation">
          <button type="button" class="nav-link${valor === activa ? ' active' : ''}" role="tab"
                  aria-selected="${valor === activa}" data-accion="pestana-actividades" data-estado="${valor}"
                  ${deshabilitadas ? 'disabled' : ''}>${texto}</button>
        </li>`).join('')}
    </ul>`;
}

function renderActividad(a, completando) {
  const enviando = completando === a.id;
  const vence = a.vence_en
    ? `<span class="${a.vencida ? 'text-danger fw-semibold' : 'text-body-secondary'}">Vence: ${escaparHtml(formatearFecha(a.vence_en))}</span>`
    : '<span class="text-body-secondary">Sin fecha de vencimiento</span>';
  return `
    <li class="list-group-item${a.vencida ? ' list-group-item-danger' : ''}" data-id="${escaparHtml(a.id)}">
      <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div class="flex-grow-1 min-w-0">
          <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
            <span class="badge text-bg-secondary">${escaparHtml(ETIQUETA_TIPO[a.tipo] ?? a.tipo)}</span>
            ${a.vencida ? '<span class="badge text-bg-danger">Vencida</span>' : ''}
            ${a.completada ? '<span class="badge text-bg-success">Completada</span>' : ''}
            <span class="fw-medium text-break">${escaparHtml(a.cliente?.nombre)}</span>
          </div>
          <p class="mb-1 text-break">${escaparHtml(a.descripcion)}</p>
          <small>${vence}</small>
        </div>
        ${a.completada ? '' : `
        <button type="button" class="btn btn-sm btn-outline-success" data-accion="completar-actividad"
                data-id="${escaparHtml(a.id)}" ${completando !== null ? 'disabled' : ''}>
          ${enviando ? '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span><span role="status">Completando…</span>' : 'Completar'}
        </button>`}
      </div>
    </li>`;
}

function renderLista(a) {
  if (a.cargando && !a.cargada) return spinner('Cargando actividades…');
  if (a.error) {
    return `
      <div class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
        <span>${escaparHtml(a.error)}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" data-accion="reintentar-actividades">Reintentar</button>
      </div>`;
  }
  if (a.lista.length === 0) {
    return `<p class="text-body-secondary">${a.pestana === 'pendiente' ? 'No tiene actividades pendientes.' : 'Todavía no hay actividades completadas.'}</p>`;
  }
  const vencidas = a.lista.filter((x) => x.vencida).length;
  return `
    ${vencidas ? `<p class="small text-danger mb-2">${vencidas === 1 ? '1 actividad vencida' : `${vencidas} actividades vencidas`}</p>` : ''}
    <ul class="list-group" aria-label="Actividades">${a.lista.map((x) => renderActividad(x, a.completando)).join('')}</ul>`;
}

function renderFormulario(f, clientes) {
  if (!f) return '';
  const { valores, errores = {}, mensaje, enviando, cargandoClientes } = f;
  return `
    <section class="card shadow-sm mb-3" aria-labelledby="titulo-nueva-actividad">
      <div class="card-body">
        <h2 id="titulo-nueva-actividad" class="h5 mb-3">Nueva actividad</h2>
        ${mensaje ? `<div class="alert alert-${escaparHtml(mensaje.tipo)}" role="alert">${escaparHtml(mensaje.texto)}</div>` : ''}
        ${cargandoClientes ? spinner('Cargando sus clientes…') : `
        <form id="form-actividad" novalidate>
          <div class="row gx-3">
            <div class="col-12 col-md-6">
              ${campo({ id: 'actividad-cliente', nombre: 'cliente_id', etiqueta: 'Cliente', valor: valores.cliente_id, error: errores.cliente_id, cargando: enviando, vacia: clientes.length ? 'Seleccione un cliente de su cartera' : 'No tiene clientes en su cartera', opciones: clientes.map((c) => ({ valor: c.id, texto: c.nombre })) })}
            </div>
            <div class="col-12 col-md-6">
              ${campo({ id: 'actividad-tipo', nombre: 'tipo', etiqueta: 'Tipo', valor: valores.tipo, error: errores.tipo, cargando: enviando, vacia: 'Seleccione el tipo', opciones: Object.entries(ETIQUETA_TIPO).map(([valor, texto]) => ({ valor, texto })) })}
            </div>
          </div>
          ${campo({ id: 'actividad-descripcion', nombre: 'descripcion', etiqueta: 'Descripción', valor: valores.descripcion, error: errores.descripcion, cargando: enviando, filas: 3, ayuda: 'Máximo 500 caracteres.' })}
          ${campo({ id: 'actividad-vence', nombre: 'vence_en', tipo: 'datetime-local', etiqueta: 'Vence', valor: valores.vence_en, error: errores.vence_en, cargando: enviando, requerido: false, ayuda: 'Fecha y hora de Guatemala.' })}
          <div class="d-flex flex-wrap gap-2">
            <button type="submit" class="btn btn-primary" ${enviando ? 'disabled' : ''}>
              ${enviando ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span><span role="status">Guardando…</span>' : 'Registrar actividad'}
            </button>
            <button type="button" class="btn btn-outline-secondary" data-accion="cancelar-actividad" ${enviando ? 'disabled' : ''}>Cancelar</button>
          </div>
        </form>`}
      </div>
    </section>`;
}

export function renderActividades(estado) {
  const a = estado.actividades;
  const encabezado = `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <h1 class="h4 mb-0">Actividades</h1>
      <button type="button" class="btn btn-primary" data-accion="nueva-actividad" ${a.formulario ? 'disabled' : ''}>Nueva actividad</button>
    </div>`;
  const mensaje = a.mensaje
    ? `<div class="alert alert-${escaparHtml(a.mensaje.tipo)}" role="${a.mensaje.tipo === 'danger' ? 'alert' : 'status'}">${escaparHtml(a.mensaje.texto)}</div>`
    : '';
  return `${encabezado}${renderFormulario(a.formulario, a.clientes)}${mensaje}${renderPestanas(a.pestana, a.cargando)}${renderLista(a)}`;
}
