// Campo de formulario Bootstrap compartido por las vistas (login de B2 y cliente de B3).
// El valor y el mensaje de error pueden venir del usuario o de la API: siempre se escapan (S7).
// El error se muestra debajo del campo (B3-14) y se enlaza con aria-describedby.

import { escaparHtml } from '../util/escape.js';

/**
 * @param {{ id: string, nombre: string, tipo?: string, etiqueta: string, valor?: string, error?: string,
 *   autocompletar?: string, cargando?: boolean, requerido?: boolean, ayuda?: string, maxlength?: number }} opciones
 */
export function campo({
  id, nombre, tipo = 'text', etiqueta, valor = '', error, autocompletar = 'off', cargando = false,
  requerido = true, ayuda, maxlength,
}) {
  const invalido = error ? ' is-invalid' : '';
  const describe = [ayuda ? `${id}-ayuda` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return `
    <div class="mb-3">
      <label for="${id}" class="form-label">${escaparHtml(etiqueta)}${requerido ? '' : ' <span class="text-body-secondary small">(opcional)</span>'}</label>
      <input id="${id}" name="${nombre}" type="${tipo}" class="form-control${invalido}"
             value="${escaparHtml(valor)}" autocomplete="${autocompletar}"${requerido ? ' required' : ''}${maxlength ? ` maxlength="${maxlength}"` : ''}
             ${error ? 'aria-invalid="true" ' : ''}${describe ? `aria-describedby="${describe}"` : ''} ${cargando ? 'disabled' : ''}>
      ${ayuda ? `<div id="${id}-ayuda" class="form-text">${escaparHtml(ayuda)}</div>` : ''}
      ${error ? `<div id="${id}-error" class="invalid-feedback">${escaparHtml(error)}</div>` : ''}
    </div>`;
}
