// Escapado de texto externo antes de insertarlo con innerHTML (S7, B2-16, CLAUDE.md §8).

const ENTIDADES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Convierte cualquier valor en texto seguro para HTML (contenido y atributos entre comillas).
 * null y undefined se convierten en cadena vacía.
 */
export function escaparHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/[&<>"'/`=]/g, (c) => ENTIDADES[c]);
}
