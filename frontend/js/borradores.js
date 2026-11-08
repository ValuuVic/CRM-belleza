// Borradores de los formularios (B6-05, T1.7). Cada render reescribe la vista entera
// (estado → render), así que lo que el usuario escribe y todavía no envió se perdería al cerrar un
// aviso, al llegar una recarga o al pulsar otra acción. app.js llama a guardarBorrador en cada
// evento `input`/`change` (delegación) y el texto se copia al estado SIN redibujar: el siguiente
// render lo vuelve a mostrar.
// - Solo se guardan los campos conocidos de cada formulario y solo como texto.
// - La contraseña del login NUNCA se guarda (B2-16): del login solo se conserva el correo.
// - Mientras un formulario se está enviando no se toca: sus valores son los enviados.

import { modificarSinRender } from './estado.js';

const CAMPOS = Object.freeze({
  'form-cliente': ['nombre', 'nit', 'telefono', 'correo'],
  'form-oportunidad': ['cliente_id', 'titulo'],
  'form-actividad': ['cliente_id', 'tipo', 'descripcion', 'vence_en'],
  'form-agregar-linea': ['producto_id', 'cantidad'],
});

/** Copia en `seccion.formulario.valores[nombre]` si el formulario está abierto y no se está enviando. */
const enFormulario = (seccion, nombre, valor) => modificarSinRender((e) => {
  const f = e[seccion]?.formulario;
  if (!f || f.enviando || f.cargando || !f.valores) return {};
  return { [seccion]: { ...e[seccion], formulario: { ...f, valores: { ...f.valores, [nombre]: valor } } } };
});

/** Copia en `detalle.valores` (formularios del detalle de una oportunidad). */
const enDetalle = (cambio) => modificarSinRender((e) => {
  if (!e.detalle?.datos || e.detalle.enviando) return {};
  return { detalle: { ...e.detalle, valores: { ...e.detalle.valores, ...cambio(e.detalle.valores) } } };
});

/**
 * @param {{ formulario: string, dataset?: { formulario?: string, id?: string }, nombre: string, valor: unknown }} campo
 *   formulario: id del <form>; dataset: data-* del <form>; nombre: atributo name del control.
 * @returns {boolean} true si el campo es de un formulario conocido y se guardó.
 */
export function guardarBorrador({ formulario, dataset = {}, nombre, valor }) {
  const texto = String(valor ?? '');
  switch (formulario) {
    case 'form-login':
      if (nombre !== 'correo') return false; // la clave jamás se copia al estado
      modificarSinRender((e) => ({ login: { ...e.login, correo: texto } }));
      return true;
    case 'form-busqueda':
      if (nombre !== 'q') return false;
      modificarSinRender((e) => ({ cartera: { ...e.cartera, borradorBusqueda: texto } }));
      return true;
    case 'form-cliente':
      if (!CAMPOS[formulario].includes(nombre)) return false;
      enFormulario('cartera', nombre, texto);
      return true;
    case 'form-oportunidad':
      if (!CAMPOS[formulario].includes(nombre)) return false;
      enFormulario('oportunidades', nombre, texto);
      return true;
    case 'form-actividad':
      if (!CAMPOS[formulario].includes(nombre)) return false;
      enFormulario('actividades', nombre, texto);
      return true;
    case 'form-titulo':
      if (nombre !== 'titulo') return false;
      enDetalle(() => ({ titulo: texto }));
      return true;
    case 'form-agregar-linea':
      if (!CAMPOS[formulario].includes(nombre)) return false;
      enDetalle((v) => ({ linea: { ...v.linea, [nombre]: texto } }));
      return true;
    case 'form-perdida':
      if (nombre !== 'motivo_perdida') return false;
      enDetalle(() => ({ perdida: texto }));
      return true;
    default:
      if (dataset.formulario === 'linea' && nombre === 'cantidad' && dataset.id) {
        enDetalle((v) => ({ lineas: { ...v.lineas, [dataset.id]: texto } }));
        return true;
      }
      return false;
  }
}
