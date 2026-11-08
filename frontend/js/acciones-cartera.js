// Acciones de la cartera (B3; F2): búsqueda, alta, edición, disponibles y toma de clientes.
// Solo cambian el estado (patrón estado → render); app.js las conecta con los eventos del DOM.
// Están separadas de app.js para poder probarlas sin navegador.
// - Un 401 lo gestiona api.js (cierra la sesión y vuelve al login): aquí solo se deja de actuar.
// - Un 422 conserva lo escrito y muestra los errores por campo (B3-14).
// - Un 409 se muestra como mensaje del formulario o de la lista de disponibles.
// - Una respuesta de otra sesión (S4) o de una consulta ya superada se descarta (B6-01, B6-08).

import { obtenerEstado, actualizar, tokenActual, sigueLaSesion } from './estado.js';
import {
  obtenerClientes, obtenerCliente, obtenerDisponibles, crearCliente, actualizarCliente, tomarCliente,
} from './api.js';

export const CAMPOS_FORMULARIO = ['nombre', 'nit', 'telefono', 'correo'];
const VACIO = Object.freeze({ nombre: '', nit: '', telefono: '', correo: '' });

const cartera = () => obtenerEstado().cartera;
const cambiarCartera = (cambios) => actualizar((e) => ({ cartera: { ...e.cartera, ...cambios } }));
const cambiarFormulario = (cambios) => actualizar((e) => ({
  cartera: { ...e.cartera, formulario: e.cartera.formulario ? { ...e.cartera.formulario, ...cambios } : null },
}));
const cambiarDisponibles = (cambios) => actualizar((e) => ({
  cartera: { ...e.cartera, disponibles: { ...e.cartera.disponibles, ...cambios } },
}));
const mensajeDe = (r, porDefecto) => (typeof r.datos?.error === 'string' && r.datos.error) || porDefecto;

/** Cliente de la API → valores de texto del formulario. */
const aValores = (c) => ({ nombre: c.nombre ?? '', nit: c.nit ?? 'CF', telefono: c.telefono ?? '', correo: c.correo ?? '' });

/** Lee del formulario solo los campos conocidos, como texto. */
export function leerValores(datos) {
  const valores = {};
  for (const c of CAMPOS_FORMULARIO) valores[c] = String(datos?.[c] ?? '');
  return valores;
}

/**
 * Cuerpo de la petición: en el alta, todos los campos (correo solo si tiene texto); en la edición,
 * solo los campos que cambiaron respecto al cliente cargado (PATCH parcial, B3-13).
 * Un correo vaciado en la edición se envía como null para borrarlo.
 */
export function cuerpoFormulario(modo, valores, original = VACIO) {
  if (modo === 'crear') {
    const cuerpo = { nombre: valores.nombre, nit: valores.nit, telefono: valores.telefono };
    if (valores.correo.trim()) cuerpo.correo = valores.correo;
    return cuerpo;
  }
  const cambios = {};
  for (const c of CAMPOS_FORMULARIO) {
    if (valores[c].trim() !== String(original[c] ?? '').trim()) cambios[c] = c === 'correo' && !valores[c].trim() ? null : valores[c];
  }
  return cambios;
}

// ---------- Cartera y búsqueda ----------

/**
 * Carga la cartera. Si hay búsqueda, pide también el listado completo para el indicador «X de 10».
 * @param {{ busqueda?: string }} [opciones] busqueda: nuevo texto de búsqueda (por defecto, el vigente).
 */
let consultaVigente = 0; // dos búsquedas seguidas: solo cuenta la respuesta de la última

export async function cargarCartera({ busqueda = cartera().busqueda } = {}) {
  const q = String(busqueda ?? '').trim();
  const consulta = ++consultaVigente;
  const token = tokenActual();
  cambiarCartera({ cargando: true, error: null, busqueda: q, borradorBusqueda: null });
  const [filtrada, completa] = await Promise.all([obtenerClientes(q), q ? obtenerClientes() : null]);
  if (!sigueLaSesion(token, filtrada) || (completa && !sigueLaSesion(token, completa))) return;
  if (consulta !== consultaVigente) return;

  if (filtrada.ok && Array.isArray(filtrada.datos) && (!completa || (completa.ok && Array.isArray(completa.datos)))) {
    cambiarCartera({
      cargando: false, cargada: true, error: null,
      clientes: filtrada.datos,
      total: (completa ?? filtrada).datos.length,
    });
  } else {
    const fallo = filtrada.ok ? completa : filtrada;
    cambiarCartera({ cargando: false, error: mensajeDe(fallo, 'No se pudo cargar la cartera.') });
  }
}

export const buscar = (texto) => cargarCartera({ busqueda: texto });
export const limpiarBusqueda = () => cargarCartera({ busqueda: '' });

// ---------- Formulario de alta y edición ----------

export function abrirNuevo() {
  cambiarCartera({ formulario: { modo: 'crear', id: null, valores: { ...VACIO }, original: null, errores: {}, mensaje: null, enviando: false, cargando: false } });
}

export async function abrirEdicion(id) {
  const token = tokenActual();
  cambiarCartera({ formulario: { modo: 'editar', id, valores: { ...VACIO }, original: null, errores: {}, mensaje: null, enviando: false, cargando: true } });
  const r = await obtenerCliente(id);
  if (!sigueLaSesion(token, r)) return;
  if (cartera().formulario?.modo !== 'editar' || String(cartera().formulario.id) !== String(id)) return; // se canceló o se abrió otro
  if (r.ok && r.datos && typeof r.datos === 'object') {
    const valores = aValores(r.datos);
    cambiarFormulario({ cargando: false, valores, original: { ...valores } });
    return;
  }
  cambiarCartera({ formulario: null });
  actualizar({ aviso: { tipo: 'warning', texto: mensajeDe(r, 'No se pudo cargar el cliente.') } });
  if (r.status === 404) cargarCartera();
}

export const cancelarFormulario = () => cambiarCartera({ formulario: null });

/** Envía el formulario con los valores escritos (se conservan ante cualquier error). */
export async function enviarFormulario(datos) {
  const f = cartera().formulario;
  if (!f || f.enviando || f.cargando) return;
  const valores = leerValores(datos);
  const cuerpo = cuerpoFormulario(f.modo, valores, f.original ?? VACIO);

  if (f.modo === 'editar' && Object.keys(cuerpo).length === 0) {
    cambiarFormulario({ valores, errores: {}, mensaje: { tipo: 'info', texto: 'No hay cambios para guardar.' } });
    return;
  }

  const token = tokenActual();
  cambiarFormulario({ valores, errores: {}, mensaje: null, enviando: true });
  const r = f.modo === 'crear' ? await crearCliente(cuerpo) : await actualizarCliente(f.id, cuerpo);
  if (!sigueLaSesion(token, r)) return;

  if (r.ok) {
    cambiarCartera({ formulario: null });
    actualizar({ aviso: { tipo: 'success', texto: f.modo === 'crear' ? 'Cliente registrado en su cartera.' : 'Cliente actualizado.' } });
    await recargarTodo();
    return;
  }
  if (r.status === 422 && r.datos?.errores && typeof r.datos.errores === 'object') {
    cambiarFormulario({ enviando: false, errores: r.datos.errores });
    return;
  }
  cambiarFormulario({ enviando: false, mensaje: { tipo: 'danger', texto: mensajeDe(r, 'No se pudo guardar el cliente.') } });
  if (r.status === 404) cargarCartera();
}

// ---------- Clientes disponibles ----------

export async function verDisponibles() {
  const token = tokenActual();
  cambiarDisponibles({ visible: true, cargando: true, error: null });
  const r = await obtenerDisponibles();
  if (!sigueLaSesion(token, r)) return;
  if (r.ok && Array.isArray(r.datos)) cambiarDisponibles({ cargando: false, lista: r.datos });
  else cambiarDisponibles({ cargando: false, error: mensajeDe(r, 'No se pudieron cargar los clientes disponibles.') });
}

export const ocultarDisponibles = () => cambiarDisponibles({ visible: false, error: null });

export async function tomar(id) {
  if (cartera().disponibles.tomando !== null) return;
  const nombre = cartera().disponibles.lista.find((c) => String(c.id) === String(id))?.nombre;
  const token = tokenActual();
  cambiarDisponibles({ tomando: id, error: null });
  const r = await tomarCliente(id);
  if (!sigueLaSesion(token, r)) return;
  cambiarDisponibles({ tomando: null });
  if (r.ok) {
    actualizar({ aviso: { tipo: 'success', texto: nombre ? `Se agregó «${nombre}» a su cartera.` : 'Cliente agregado a su cartera.' } });
    await recargarTodo();
    return;
  }
  // 409 (ya tomado o cartera llena), 404 u otro error: se informa y se actualizan las listas.
  const error = mensajeDe(r, 'No se pudo tomar el cliente.');
  await recargarTodo();
  cambiarDisponibles({ error });
}

async function recargarTodo() {
  await Promise.all([cargarCartera(), cartera().disponibles.visible ? verDisponibles() : null]);
}
