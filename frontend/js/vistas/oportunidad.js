// Detalle de una oportunidad (B4-23 a B4-25; F3): productos, importes, título, etapas e historial.
// - Importes en quetzales y fechas en hora de Guatemala; los calcula y guarda el servidor.
// - Solo se muestran los botones de las transiciones permitidas (B4-24); la API vuelve a validarlas.
// - «Marcar como perdida» abre un formulario para el motivo (B4-25).
// - Todo texto de la API o del usuario pasa por escaparHtml antes de insertarse (S7).

import { escaparHtml } from '../util/escape.js';
import { formatearFecha, formatearQuetzales } from '../util/formato.js';
import { estaCerrada, etiqueta, transicionesVisibles } from '../util/embudo.js';
import { campo, spinner } from './campo.js';

const volver = '<a class="d-inline-block mb-2" href="#/oportunidades">← Volver a oportunidades</a>';

const COLOR_ETAPA = { ganada: 'success', perdida: 'secondary', negociacion: 'warning' };

const TEXTO_BOTON = {
  retroceder: (e) => `Retroceder a ${etiqueta(e)}`,
  avanzar: (e) => `Avanzar a ${etiqueta(e)}`,
  ganar: () => 'Marcar como ganada',
  perder: () => 'Marcar como perdida',
};
const CLASE_BOTON = { retroceder: 'btn-outline-secondary', avanzar: 'btn-primary', ganar: 'btn-success', perder: 'btn-outline-danger' };

function renderCabecera(o) {
  return `
    <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
      <div class="flex-grow-1">
        <h1 class="h4 mb-1 text-break">${escaparHtml(o.titulo)}</h1>
        <div class="text-body-secondary text-break">Cliente: ${escaparHtml(o.cliente?.nombre)}</div>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <span class="badge text-bg-${Object.hasOwn(COLOR_ETAPA, o.etapa) ? COLOR_ETAPA[o.etapa] : 'primary'} fs-6">${escaparHtml(etiqueta(o.etapa))}</span>
        <span class="badge text-bg-light border fs-6" title="Probabilidad de cierre">${escaparHtml(o.probabilidad)} %</span>
      </div>
    </div>
    <dl class="row small mb-3">
      <dt class="col-5 col-sm-3">Total</dt><dd class="col-7 col-sm-9 fw-semibold">${escaparHtml(formatearQuetzales(o.total))}</dd>
      ${o.fecha_cierre ? `<dt class="col-5 col-sm-3">Fecha de cierre</dt><dd class="col-7 col-sm-9">${escaparHtml(formatearFecha(o.fecha_cierre))}</dd>` : ''}
      ${o.motivo_perdida ? `<dt class="col-5 col-sm-3">Motivo de pérdida</dt><dd class="col-7 col-sm-9 text-break">${escaparHtml(o.motivo_perdida)}</dd>` : ''}
    </dl>`;
}

function renderTitulo(d) {
  const valor = d.valores.titulo ?? d.datos.titulo;
  const ocupado = Boolean(d.enviando);
  return `
    <form id="form-titulo" class="d-flex flex-wrap align-items-start gap-2 mb-3" novalidate>
      <div class="flex-grow-1">
        ${campo({ id: 'detalle-titulo', nombre: 'titulo', etiqueta: 'Título', valor, error: d.errores.titulo, cargando: ocupado, maxlength: 150 })}
      </div>
      <button type="submit" class="btn btn-outline-primary mt-md-4" ${ocupado ? 'disabled' : ''}>Guardar título</button>
    </form>`;
}

function renderLineas(d, abierta) {
  const { productos } = d.datos;
  const ocupado = Boolean(d.enviando);
  if (productos.length === 0) return '<p class="text-body-secondary">Esta oportunidad todavía no tiene productos.</p>';
  const filas = productos.map((l) => {
    const error = d.errores.lineas[l.id];
    const valor = d.valores.lineas[l.id] ?? l.cantidad;
    const cantidad = abierta
      ? `<form class="d-flex gap-1 align-items-start" data-formulario="linea" data-id="${escaparHtml(l.id)}" novalidate>
           <div>
             <label class="visually-hidden" for="linea-cantidad-${escaparHtml(l.id)}">Cantidad de ${escaparHtml(l.nombre)}</label>
             <input id="linea-cantidad-${escaparHtml(l.id)}" name="cantidad" type="number" min="1" max="999" step="1"
                    class="form-control form-control-sm cantidad-linea${error ? ' is-invalid' : ''}" value="${escaparHtml(valor)}"
                    ${error ? `aria-invalid="true" aria-describedby="linea-cantidad-${escaparHtml(l.id)}-error"` : ''} ${ocupado ? 'disabled' : ''}>
             ${error ? `<div id="linea-cantidad-${escaparHtml(l.id)}-error" class="invalid-feedback">${escaparHtml(error)}</div>` : ''}
           </div>
           <button type="submit" class="btn btn-sm btn-outline-primary" ${ocupado ? 'disabled' : ''}>Guardar</button>
         </form>`
      : escaparHtml(l.cantidad);
    return `
      <tr>
        <td class="text-break">${escaparHtml(l.nombre)}</td>
        <td>${cantidad}</td>
        <td class="text-nowrap text-end">${escaparHtml(formatearQuetzales(l.precio_unitario))}</td>
        <td class="text-nowrap text-end">${escaparHtml(formatearQuetzales(l.subtotal))}</td>
        ${abierta ? `<td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger" data-accion="quitar-linea" data-id="${escaparHtml(l.id)}" aria-label="Quitar ${escaparHtml(l.nombre)}" ${ocupado ? 'disabled' : ''}>Quitar</button></td>` : ''}
      </tr>`;
  }).join('');
  return `
    <div class="table-responsive">
      <table class="table align-middle">
        <thead>
          <tr><th scope="col">Producto</th><th scope="col">Cantidad</th><th scope="col" class="text-end">Precio</th><th scope="col" class="text-end">Subtotal</th>${abierta ? '<th scope="col"><span class="visually-hidden">Acciones</span></th>' : ''}</tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr><th scope="row" colspan="3" class="text-end">Total</th><td class="text-nowrap text-end fw-semibold">${escaparHtml(formatearQuetzales(d.datos.total))}</td>${abierta ? '<td></td>' : ''}</tr>
        </tfoot>
      </table>
    </div>`;
}

function renderAgregar(d) {
  const enOportunidad = new Set(d.datos.productos.map((l) => String(l.producto_id)));
  const opciones = d.catalogo
    .filter((p) => !enOportunidad.has(String(p.id)))
    .map((p) => ({ valor: p.id, texto: `${p.nombre} — ${formatearQuetzales(p.precio)} · ${p.stock === null ? 'sin control de inventario' : `stock ${p.stock}`}` }));
  const ocupado = Boolean(d.enviando);
  const e = d.errores.linea ?? {};
  return `
    <form id="form-agregar-linea" class="row gx-2 align-items-start" novalidate>
      <div class="col-12 col-md-7">
        ${campo({ id: 'linea-producto', nombre: 'producto_id', etiqueta: 'Producto', valor: d.valores.linea.producto_id, error: e.producto_id, cargando: ocupado, opciones, vacia: opciones.length ? 'Seleccione un producto del catálogo' : 'No hay más productos activos' })}
      </div>
      <div class="col-6 col-md-2">
        ${campo({ id: 'linea-cantidad', nombre: 'cantidad', tipo: 'number', etiqueta: 'Cantidad', valor: d.valores.linea.cantidad, error: e.cantidad, cargando: ocupado, min: 1, max: 999 })}
      </div>
      <div class="col-6 col-md-3 d-flex align-items-end mb-3 mt-md-4">
        <button type="submit" class="btn btn-outline-success w-100" ${ocupado ? 'disabled' : ''}>Agregar</button>
      </div>
      <p class="form-text mt-0">El precio se toma del catálogo al agregar el producto.</p>
    </form>`;
}

function renderTransiciones(d) {
  const ocupado = Boolean(d.enviando);
  const botones = transicionesVisibles(d.datos.etapa).map((t) => `
    <button type="button" class="btn ${CLASE_BOTON[t.tipo]}" data-accion="cambiar-etapa" data-etapa="${escaparHtml(t.etapa)}" ${ocupado || (t.tipo === 'perder' && d.perdida) ? 'disabled' : ''}>
      ${d.enviando === `etapa-${t.etapa}` ? '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>' : ''}${escaparHtml(TEXTO_BOTON[t.tipo](t.etapa))}
    </button>`).join('');
  const perdida = d.perdida ? `
    <form id="form-perdida" class="card card-body mt-3 border-danger-subtle" novalidate aria-labelledby="titulo-perdida">
      <h3 id="titulo-perdida" class="h6">Motivo de la pérdida</h3>
      ${campo({ id: 'perdida-motivo', nombre: 'motivo_perdida', etiqueta: 'Motivo', valor: d.valores.perdida, error: d.errores.perdida, cargando: ocupado, maxlength: 255, ayuda: 'De 1 a 255 caracteres.' })}
      <div class="d-flex flex-wrap gap-2">
        <button type="submit" class="btn btn-danger" ${ocupado ? 'disabled' : ''}>Confirmar pérdida</button>
        <button type="button" class="btn btn-outline-secondary" data-accion="cancelar-perdida" ${ocupado ? 'disabled' : ''}>Cancelar</button>
      </div>
    </form>` : '';
  return `
    <section class="mb-4" aria-labelledby="titulo-etapa">
      <h2 id="titulo-etapa" class="h5">Cambiar de etapa</h2>
      <div class="d-flex flex-wrap gap-2">${botones}</div>
      ${perdida}
    </section>`;
}

function renderHistorial(historial) {
  if (!historial.length) return '<p class="text-body-secondary">Sin cambios registrados.</p>';
  return `
    <ol class="list-group list-group-numbered">
      ${historial.map((h) => `
        <li class="list-group-item d-flex flex-wrap justify-content-between gap-2">
          <span>${h.etapa_anterior ? `${escaparHtml(etiqueta(h.etapa_anterior))} → ` : 'Creada en '}<strong>${escaparHtml(etiqueta(h.etapa_nueva))}</strong></span>
          <span class="small text-body-secondary">${escaparHtml(h.usuario)} · ${escaparHtml(formatearFecha(h.fecha))}</span>
        </li>`).join('')}
    </ol>`;
}

export function renderOportunidad(estado) {
  const d = estado.detalle;
  if (d.cargando && !d.datos) return `${volver}${spinner('Cargando oportunidad…')}`;
  if (d.error) {
    return `${volver}
      <div class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
        <span>${escaparHtml(d.error)}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" data-accion="reintentar-detalle">Reintentar</button>
      </div>`;
  }
  if (!d.datos) return `${volver}${spinner('Cargando oportunidad…')}`;

  const o = d.datos;
  const abierta = !estaCerrada(o.etapa);
  return `
    ${volver}
    ${renderCabecera(o)}
    ${d.mensaje ? `<div id="mensaje-detalle" class="alert alert-${escaparHtml(d.mensaje.tipo)}" role="alert" tabindex="-1">${escaparHtml(d.mensaje.texto)}</div>` : ''}
    ${abierta ? renderTitulo(d) : '<div class="alert alert-light border small" role="status">La oportunidad está cerrada: no se pueden modificar su título, productos ni etapa.</div>'}
    <section class="mb-4" aria-labelledby="titulo-productos">
      <h2 id="titulo-productos" class="h5">Productos</h2>
      ${renderLineas(d, abierta)}
      ${abierta ? renderAgregar(d) : ''}
    </section>
    ${abierta ? renderTransiciones(d) : ''}
    <section aria-labelledby="titulo-historial">
      <h2 id="titulo-historial" class="h5">Historial de etapas</h2>
      ${renderHistorial(o.historial)}
    </section>`;
}
