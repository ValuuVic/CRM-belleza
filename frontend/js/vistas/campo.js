// Campo de formulario Bootstrap compartido por las vistas (login de B2, cliente de B3, oportunidades de B4).
// Todos los valores que se insertan en el HTML pasan por escaparHtml (S7): el valor, las opciones y
// los errores pueden venir del usuario o de la API, y los atributos se escapan por si algún día dejan
// de ser constantes de las vistas.
// El error se muestra debajo del campo (B3-14) y se enlaza con aria-describedby.
// Con `opciones` se dibuja una lista desplegable (<select>) con el mismo tratamiento de errores.

import { escaparHtml as e } from '../util/escape.js';

/** Indicador de carga compartido por las vistas (B3, B4, B5). */
export const spinner = (texto) => `
  <div class="d-flex align-items-center gap-2 text-body-secondary py-3" role="status">
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${e(texto)}
  </div>`;

/** Indicador discreto de recarga cuando la vista ya tiene datos que mostrar (B6-02). */
export const actualizando = `
  <div class="small text-body-secondary d-flex align-items-center gap-2 mb-2" role="status">
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Actualizando…
  </div>`;

/**
 * @param {{ id: string, nombre: string, tipo?: string, etiqueta: string, valor?: string | number, error?: string,
 *   autocompletar?: string, cargando?: boolean, requerido?: boolean, ayuda?: string, maxlength?: number,
 *   min?: number, max?: number, opciones?: { valor: string | number, texto: string }[], vacia?: string,
 *   filas?: number }} opciones  Con `filas` se dibuja un <textarea>.
 */
export function campo({
  id, nombre, tipo = 'text', etiqueta, valor = '', error, autocompletar = 'off', cargando = false,
  requerido = true, ayuda, maxlength, min, max, opciones, vacia = 'Seleccione…', filas,
}) {
  const invalido = error ? ' is-invalid' : '';
  const describe = [ayuda ? `${id}-ayuda` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  const accesibilidad = `${error ? 'aria-invalid="true" ' : ''}${describe ? `aria-describedby="${e(describe)}"` : ''} ${cargando ? 'disabled' : ''}`;
  const control = opciones
    ? `<select id="${e(id)}" name="${e(nombre)}" class="form-select${invalido}"${requerido ? ' required' : ''}
             ${accesibilidad}>
        <option value="">${e(vacia)}</option>
        ${opciones.map((o) => `<option value="${e(o.valor)}"${String(o.valor) === String(valor) ? ' selected' : ''}>${e(o.texto)}</option>`).join('')}
      </select>`
    : filas // texto de varias líneas (B5: descripción de una actividad)
    ? `<textarea id="${e(id)}" name="${e(nombre)}" class="form-control${invalido}" rows="${e(filas)}"${requerido ? ' required' : ''}${maxlength ? ` maxlength="${e(maxlength)}"` : ''}
             ${accesibilidad}>${e(valor)}</textarea>`
    : `<input id="${e(id)}" name="${e(nombre)}" type="${e(tipo)}" class="form-control${invalido}"
             value="${e(valor)}" autocomplete="${e(autocompletar)}"${requerido ? ' required' : ''}${maxlength ? ` maxlength="${e(maxlength)}"` : ''}${min !== undefined ? ` min="${e(min)}"` : ''}${max !== undefined ? ` max="${e(max)}"` : ''}
             ${accesibilidad}>`;
  return `
    <div class="mb-3">
      <label for="${e(id)}" class="form-label">${e(etiqueta)}${requerido ? '' : ' <span class="text-body-secondary small">(opcional)</span>'}</label>
      ${control}
      ${ayuda ? `<div id="${e(id)}-ayuda" class="form-text">${e(ayuda)}</div>` : ''}
      ${error ? `<div id="${e(id)}-error" class="invalid-feedback">${e(error)}</div>` : ''}
    </div>`;
}
