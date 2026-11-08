// Acciones del embudo de oportunidades (B4; F3): tablero, alta, detalle, líneas, título y etapas.
// Mismo patrón que acciones-cartera.js: solo cambian el estado; app.js las conecta con el DOM.
// - Un 401 lo gestiona api.js (cierra la sesión y vuelve al login): aquí solo se deja de actuar.
// - Un 422 conserva lo escrito y muestra los errores bajo los campos.
// - Un 409 (cerrada, duplicado o stock insuficiente) se muestra como mensaje y el detalle se queda
//   como estaba: solo se reemplaza con lo que confirme la API (B4-25).
// - El total, los subtotales y el precio los calcula el servidor; la SPA nunca los envía (B4-07, B4-20).

import { obtenerEstado, actualizar, detalleInicial } from './estado.js';
import {
  obtenerClientes, obtenerProductos, obtenerOportunidades, obtenerOportunidad, crearOportunidad,
  actualizarTitulo, cambiarEtapa as pedirCambioEtapa, agregarLinea as pedirAgregarLinea,
  actualizarLinea, eliminarLinea,
} from './api.js';
import { etiqueta } from './util/embudo.js';

const tablero = () => obtenerEstado().oportunidades;
const detalle = () => obtenerEstado().detalle;
const cambiarTablero = (cambios) => actualizar((e) => ({ oportunidades: { ...e.oportunidades, ...cambios } }));
const cambiarFormulario = (cambios) => actualizar((e) => ({
  oportunidades: { ...e.oportunidades, formulario: e.oportunidades.formulario ? { ...e.oportunidades.formulario, ...cambios } : null },
}));
const cambiarDetalle = (cambios) => actualizar((e) => ({ detalle: { ...e.detalle, ...cambios } }));
const mensajeDe = (r, porDefecto) => (typeof r.datos?.error === 'string' && r.datos.error) || porDefecto;

/**
 * Texto de un formulario → número para la API. Un texto vacío se envía como null y uno no numérico
 * tal cual: la API lo rechaza con 422 y el mensaje aparece bajo el campo.
 */
export function aNumero(texto) {
  const s = String(texto ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

// ---------- Tablero ----------

export async function cargarTablero() {
  cambiarTablero({ cargando: true, error: null });
  const r = await obtenerOportunidades();
  if (r.status === 401) return;
  if (r.ok && Array.isArray(r.datos)) cambiarTablero({ cargando: false, cargada: true, lista: r.datos });
  else cambiarTablero({ cargando: false, error: mensajeDe(r, 'No se pudieron cargar las oportunidades.') });
}

export async function abrirNueva() {
  cambiarTablero({ formulario: { valores: { cliente_id: '', titulo: '' }, errores: {}, mensaje: null, enviando: false, cargandoClientes: true } });
  const r = await obtenerClientes();
  if (r.status === 401) return;
  if (r.ok && Array.isArray(r.datos)) {
    cambiarTablero({ clientes: r.datos.map((c) => ({ id: c.id, nombre: c.nombre })) });
    cambiarFormulario({ cargandoClientes: false });
  } else {
    cambiarFormulario({ cargandoClientes: false, mensaje: { tipo: 'danger', texto: mensajeDe(r, 'No se pudieron cargar sus clientes.') } });
  }
}

export const cancelarNueva = () => cambiarTablero({ formulario: null });

/** Crea la oportunidad y abre su detalle (B4-04). */
export async function enviarNueva(datos) {
  const f = tablero().formulario;
  if (!f || f.enviando) return;
  const valores = { cliente_id: String(datos?.cliente_id ?? ''), titulo: String(datos?.titulo ?? '') };
  cambiarFormulario({ valores, errores: {}, mensaje: null, enviando: true });
  const r = await crearOportunidad({ cliente_id: aNumero(valores.cliente_id), titulo: valores.titulo });
  if (r.status === 401) return;
  if (r.ok && r.datos?.id) {
    cambiarTablero({ formulario: null });
    actualizar({ aviso: { tipo: 'success', texto: 'Oportunidad creada en prospecto.' } });
    if (globalThis.location) globalThis.location.hash = `#/oportunidades/${r.datos.id}`;
    return;
  }
  if (r.status === 422 && r.datos?.errores) cambiarFormulario({ enviando: false, errores: r.datos.errores });
  else cambiarFormulario({ enviando: false, mensaje: { tipo: 'danger', texto: mensajeDe(r, 'No se pudo crear la oportunidad.') } });
}

// ---------- Detalle ----------

export async function cargarDetalle(id) {
  const base = obtenerEstado().detalle;
  const mismo = String(base.id) === String(id);
  actualizar({ detalle: { ...(mismo ? base : detalleInicial()), id: String(id), cargando: true, error: null } });
  const [r, catalogo] = await Promise.all([obtenerOportunidad(id), obtenerProductos()]);
  if (r.status === 401 || catalogo.status === 401) return;
  if (String(detalle().id) !== String(id)) return; // el usuario ya abrió otra oportunidad
  if (r.ok && r.datos && typeof r.datos === 'object') {
    cambiarDetalle({
      cargando: false,
      datos: r.datos,
      catalogo: catalogo.ok && Array.isArray(catalogo.datos) ? catalogo.datos : [],
      mensaje: catalogo.ok ? detalle().mensaje : { tipo: 'warning', texto: 'No se pudo cargar el catálogo de productos.' },
    });
  } else {
    cambiarDetalle({ cargando: false, datos: null, error: mensajeDe(r, 'No se pudo cargar la oportunidad.') });
  }
}

/**
 * Ejecuta una modificación del detalle. Si la API la confirma, el detalle se reemplaza por su
 * respuesta; si no, se conserva el detalle anterior y se muestra el mensaje o los errores 422.
 * @returns {Promise<boolean>} true si la API confirmó el cambio
 */
async function modificar(accion, peticion, { exito, al422 }) {
  const d = detalle();
  if (!d.datos || d.enviando) return false;
  const id = d.id;
  cambiarDetalle({ enviando: accion, mensaje: null });
  const r = await peticion(id);
  if (r.status === 401) return false;
  if (String(detalle().id) !== String(id)) return false;

  if (r.ok) {
    let datos = r.datos;
    if (r.status === 204) { // DELETE de una línea: se vuelve a pedir el detalle confirmado
      const d2 = await obtenerOportunidad(id);
      if (d2.status === 401) return false;
      datos = d2.ok ? d2.datos : detalle().datos;
    }
    cambiarDetalle({ enviando: null, datos, mensaje: { tipo: 'success', texto: exito } });
    return true;
  }
  if (r.status === 422 && r.datos?.errores && al422) {
    al422(r.datos.errores);
    cambiarDetalle({ enviando: null });
    return false;
  }
  cambiarDetalle({ enviando: null, mensaje: { tipo: 'danger', texto: mensajeDe(r, 'No se pudo completar la operación.') } });
  return false;
}

const conErrores = (cambios) => actualizar((e) => ({ detalle: { ...e.detalle, errores: { ...e.detalle.errores, ...cambios } } }));
const conValores = (cambios) => actualizar((e) => ({ detalle: { ...e.detalle, valores: { ...e.detalle.valores, ...cambios } } }));

export async function guardarTitulo(texto) {
  const titulo = String(texto ?? '');
  conValores({ titulo });
  conErrores({ titulo: null });
  const ok = await modificar('titulo', (id) => actualizarTitulo(id, titulo), {
    exito: 'Título actualizado.',
    al422: (e) => conErrores({ titulo: e.titulo ?? Object.values(e)[0] }),
  });
  if (ok) conValores({ titulo: null });
}

export async function agregarProducto(datos) {
  const linea = { producto_id: String(datos?.producto_id ?? ''), cantidad: String(datos?.cantidad ?? '') };
  conValores({ linea });
  conErrores({ linea: {} });
  const ok = await modificar('agregar', (id) => pedirAgregarLinea(id, { producto_id: aNumero(linea.producto_id), cantidad: aNumero(linea.cantidad) }), {
    exito: 'Producto agregado.',
    al422: (e) => conErrores({ linea: e }),
  });
  if (ok) conValores({ linea: { producto_id: '', cantidad: '1' } });
}

export async function cambiarCantidad(lineaId, texto) {
  const cantidad = String(texto ?? '');
  conValores({ lineas: { ...detalle().valores.lineas, [lineaId]: cantidad } });
  conErrores({ lineas: { ...detalle().errores.lineas, [lineaId]: null } });
  const ok = await modificar(`linea-${lineaId}`, (id) => actualizarLinea(id, lineaId, aNumero(cantidad)), {
    exito: 'Cantidad actualizada.',
    al422: (e) => conErrores({ lineas: { ...detalle().errores.lineas, [lineaId]: e.cantidad ?? Object.values(e)[0] } }),
  });
  if (ok) {
    const { [lineaId]: _v, ...valores } = detalle().valores.lineas;
    conValores({ lineas: valores });
  }
}

export const quitarProducto = (lineaId) => modificar(`quitar-${lineaId}`, (id) => eliminarLinea(id, lineaId), { exito: 'Producto quitado.' });

/** Cambio de etapa (B4-12 a B4-18). La API valida la transición y el stock. */
export async function cambiarEtapa(etapa) {
  if (etapa === 'perdida') { abrirPerdida(); return; }
  await modificar(`etapa-${etapa}`, (id) => pedirCambioEtapa(id, { etapa }), {
    exito: `La oportunidad pasó a ${etiqueta(etapa).toLowerCase()}.`,
    al422: (e) => cambiarDetalle({ mensaje: { tipo: 'danger', texto: e.etapa ?? Object.values(e)[0] } }),
  });
}

export function abrirPerdida() {
  cambiarDetalle({ perdida: true, mensaje: null });
  conErrores({ perdida: null });
}

export const cancelarPerdida = () => cambiarDetalle({ perdida: false });

/** Marca la oportunidad como perdida con su motivo (B4-14, B4-25). */
export async function confirmarPerdida(texto) {
  const motivo = String(texto ?? '');
  conValores({ perdida: motivo });
  conErrores({ perdida: null });
  const ok = await modificar('etapa-perdida', (id) => pedirCambioEtapa(id, { etapa: 'perdida', motivo_perdida: motivo }), {
    exito: 'La oportunidad se marcó como perdida.',
    al422: (e) => conErrores({ perdida: e.motivo_perdida ?? e.etapa ?? Object.values(e)[0] }),
  });
  if (ok) { cambiarDetalle({ perdida: false }); conValores({ perdida: '' }); }
}
