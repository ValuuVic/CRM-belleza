// Acciones de actividades comerciales (B5-16 a B5-20; F4): pestañas, alta y «Completar».
// Mismo patrón que acciones-cartera.js y acciones-oportunidades.js: solo cambian el estado y
// app.js las conecta con el DOM.
// - Un 401 lo gestiona api.js (cierra la sesión y vuelve al login): aquí solo se deja de actuar.
// - Un 422 conserva lo escrito y muestra los errores bajo los campos.
// - La lista solo cambia con lo que confirma la API: «Completar» quita la actividad de Pendientes
//   después del 200, nunca antes.
// - La fecha del datetime-local se envía con la zona de Guatemala (localGuatemalaAIso).

import { obtenerEstado, actualizar } from './estado.js';
import { obtenerActividades, crearActividad, marcarActividad, obtenerClientes } from './api.js';
import { localGuatemalaAIso } from './util/formato.js';

export const PESTANAS = Object.freeze(['pendiente', 'completada']);
const MENSAJE_CLIENTE = 'Seleccione un cliente de su cartera';

const actividades = () => obtenerEstado().actividades;
const cambiar = (cambios) => actualizar((e) => ({ actividades: { ...e.actividades, ...cambios } }));
const cambiarFormulario = (cambios) => actualizar((e) => ({
  actividades: { ...e.actividades, formulario: e.actividades.formulario ? { ...e.actividades.formulario, ...cambios } : null },
}));
const mensajeDe = (r, porDefecto) => (typeof r.datos?.error === 'string' && r.datos.error) || porDefecto;

// Una respuesta que llega después de cerrar sesión (o de que entre otra persona) se descarta:
// los datos de una sesión nunca se escriben en el estado de otra (S4).
const tokenActual = () => obtenerEstado().sesion?.token ?? null;
const sigueLaSesion = (token, r) => r.status !== 401 && token !== null && tokenActual() === token;

// ---------- Listado ----------

let consultaVigente = 0; // descarta respuestas de una pestaña que ya no está activa

/** Carga la pestaña activa con GET /api/actividades?estado=<pestaña> (B5-16). */
export async function cargarActividades() {
  const pestana = actividades().pestana;
  const consulta = ++consultaVigente;
  const token = tokenActual();
  cambiar({ cargando: true, error: null });
  const r = await obtenerActividades(pestana);
  if (!sigueLaSesion(token, r) || consulta !== consultaVigente) return;
  if (r.ok && Array.isArray(r.datos)) cambiar({ cargando: false, cargada: true, lista: r.datos });
  else cambiar({ cargando: false, error: mensajeDe(r, 'No se pudieron cargar las actividades.') });
}

/** Cambia de pestaña (Pendientes / Completadas) y consulta el servidor. */
export function cambiarPestana(pestana) {
  if (!PESTANAS.includes(pestana) || pestana === actividades().pestana) return;
  cambiar({ pestana, lista: [], cargada: false, mensaje: null });
  return cargarActividades();
}

/** «Completar» (B5-19): PATCH { completada: true }; la actividad sale de Pendientes tras el 200. */
export async function completar(id) {
  const a = actividades();
  if (a.completando !== null) return;
  const actividadId = Number(id);
  const token = tokenActual();
  cambiar({ completando: actividadId, mensaje: null });
  const r = await marcarActividad(actividadId, true);
  if (!sigueLaSesion(token, r)) return;
  if (r.ok && r.datos?.id === actividadId) {
    actualizar((e) => ({
      actividades: {
        ...e.actividades,
        completando: null,
        lista: e.actividades.pestana === 'pendiente'
          ? e.actividades.lista.filter((x) => x.id !== actividadId)
          : e.actividades.lista.map((x) => (x.id === actividadId ? r.datos : x)),
        mensaje: { tipo: 'success', texto: 'Actividad marcada como completada.' },
      },
    }));
    return;
  }
  const texto = r.status === 404
    ? 'La actividad ya no pertenece a un cliente de su cartera.'
    : mensajeDe(r, 'No se pudo completar la actividad.');
  cambiar({ completando: null, mensaje: { tipo: 'danger', texto } });
}

// ---------- Alta ----------

const valoresVacios = () => ({ cliente_id: '', tipo: '', descripcion: '', vence_en: '' });

/** Abre el formulario y carga la cartera para elegir el cliente (B5-17). */
export async function abrirNueva() {
  const token = tokenActual();
  cambiar({ mensaje: null, formulario: { valores: valoresVacios(), errores: {}, mensaje: null, enviando: false, cargandoClientes: true } });
  const r = await obtenerClientes();
  if (!sigueLaSesion(token, r)) return;
  if (r.ok && Array.isArray(r.datos)) {
    cambiar({ clientes: r.datos.map((c) => ({ id: c.id, nombre: c.nombre })) });
    cambiarFormulario({ cargandoClientes: false });
  } else {
    cambiarFormulario({ cargandoClientes: false, mensaje: { tipo: 'danger', texto: mensajeDe(r, 'No se pudieron cargar sus clientes.') } });
  }
}

export const cancelarNueva = () => cambiar({ formulario: null });

/** Envía la nueva actividad: POST /api/clientes/:id/actividades (B5-17, B5-20). */
export async function enviarNueva(datos) {
  const f = actividades().formulario;
  if (!f || f.enviando) return;
  const valores = {
    cliente_id: String(datos?.cliente_id ?? ''),
    tipo: String(datos?.tipo ?? ''),
    descripcion: String(datos?.descripcion ?? ''),
    vence_en: String(datos?.vence_en ?? ''),
  };
  // El cliente va en la ruta: sin él no hay a dónde enviar la petición.
  if (!/^[1-9]\d*$/.test(valores.cliente_id)) {
    cambiarFormulario({ valores, errores: { cliente_id: MENSAJE_CLIENTE }, mensaje: null });
    return;
  }
  const cuerpo = { tipo: valores.tipo, descripcion: valores.descripcion };
  const vence = localGuatemalaAIso(valores.vence_en);
  if (vence !== null) cuerpo.vence_en = vence; // vacío → sin vencimiento

  const token = tokenActual();
  cambiarFormulario({ valores, errores: {}, mensaje: null, enviando: true });
  const r = await crearActividad(valores.cliente_id, cuerpo);
  if (!sigueLaSesion(token, r)) return;
  if (r.ok && r.datos?.id) {
    cambiar({ formulario: null, mensaje: { tipo: 'success', texto: 'Actividad registrada.' } });
    if (actividades().pestana === 'pendiente') await cargarActividades();
    return;
  }
  if (r.status === 422 && r.datos?.errores) cambiarFormulario({ enviando: false, errores: r.datos.errores });
  else if (r.status === 404) cambiarFormulario({ enviando: false, errores: { cliente_id: 'El cliente ya no está en su cartera. Seleccione otro.' } });
  else cambiarFormulario({ enviando: false, mensaje: { tipo: 'danger', texto: mensajeDe(r, 'No se pudo registrar la actividad.') } });
}
