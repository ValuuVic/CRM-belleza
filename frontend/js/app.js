// Punto de entrada de la SPA del vendedor (B2-11 a B2-16, B3 cartera, B4 oportunidades).
// - Enrutador con rutas hash, sin frameworks.
// - Patrón estado → render: cada cambio de estado vuelve a dibujar la vista activa.
// - Delegación de eventos en `document` (formularios y botones con data-accion).

import { obtenerEstado, actualizar, suscribir, guardarSesion, cerrarSesion } from './estado.js';
import { iniciarSesion } from './api.js';
import * as cartera from './acciones-cartera.js';
import * as oportunidades from './acciones-oportunidades.js';
import { escaparHtml } from './util/escape.js';
import { renderLogin } from './vistas/login.js';
import { renderCartera } from './vistas/cartera.js';
import { renderOportunidades } from './vistas/oportunidades.js';
import { renderOportunidad } from './vistas/oportunidad.js';

const RUTAS_PROTEGIDAS = new Set(['#/cartera', '#/oportunidades', '#/resumen']);
const RUTAS = new Set(['#/login', ...RUTAS_PROTEGIDAS]);
const RUTA_DETALLE = /^#\/oportunidades\/([1-9]\d{0,15})$/; // detalle de una oportunidad (B4)
const esProtegida = (ruta) => RUTAS_PROTEGIDAS.has(ruta) || RUTA_DETALLE.test(ruta);

const $app = document.getElementById('app');
const $avisos = document.getElementById('avisos');
const $navUsuario = document.getElementById('nav-usuario');
const $navEnlaces = document.getElementById('nav-enlaces');

// ---------- Render ----------

// #/resumen está reservado para la Parte A (F5): aquí solo se muestra el punto de integración.
const renderResumenReservado = () => `
  <h1 class="h4">Resumen mensual</h1>
  <p class="text-body-secondary">Disponible próximamente.</p>`;

function renderVista(estado) {
  if (RUTA_DETALLE.test(estado.ruta)) return renderOportunidad(estado);
  switch (estado.ruta) {
    case '#/cartera': return renderCartera(estado);
    case '#/oportunidades': return renderOportunidades(estado);
    case '#/resumen': return renderResumenReservado();
    default: return renderLogin(estado);
  }
}

function renderAvisos({ aviso }) {
  $avisos.innerHTML = aviso
    ? `<div class="alert alert-${escaparHtml(aviso.tipo)} alert-dismissible mb-0" role="alert">
         ${escaparHtml(aviso.texto)}
         <button type="button" class="btn-close" data-accion="cerrar-aviso" aria-label="Cerrar aviso"></button>
       </div>`
    : '';
}

function renderNavegacion({ sesion, ruta }) {
  const conSesion = Boolean(sesion);
  $navUsuario.textContent = conSesion ? sesion.usuario.nombre : '';
  $navEnlaces.classList.toggle('d-none', !conSesion);
  for (const enlace of $navEnlaces.querySelectorAll('a[href^="#/"]')) {
    const href = enlace.getAttribute('href');
    const activo = href === ruta || ruta.startsWith(`${href}/`); // el detalle marca «Oportunidades»
    enlace.classList.toggle('active', activo);
    if (activo) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  }
}

let ultimoMensajeDetalle = null;

function render(estado) {
  renderNavegacion(estado);
  renderAvisos(estado);
  $app.innerHTML = renderVista(estado);
  // B4-25: el resultado de una acción del detalle (p. ej. 409 por stock) se muestra arriba;
  // al aparecer un mensaje nuevo se lleva el foco a él para que se vea y se lea en voz alta.
  const mensaje = estado.detalle?.mensaje ?? null;
  if (mensaje && mensaje !== ultimoMensajeDetalle) {
    const $mensaje = document.getElementById('mensaje-detalle');
    $mensaje?.focus({ preventScroll: true });
    $mensaje?.scrollIntoView({ block: 'center' });
  }
  ultimoMensajeDetalle = mensaje;
}

// ---------- Acciones ----------

// Las acciones de la cartera (B3) están en acciones-cartera.js; un 401 lo gestiona api.js (B2-14).

async function enviarLogin(formulario) {
  const datos = new FormData(formulario);
  const correo = String(datos.get('correo') ?? '').trim();
  const clave = String(datos.get('clave') ?? '');
  formulario.reset(); // la contraseña no permanece en el formulario ni en el estado

  actualizar({ aviso: null, login: { cargando: true, correo, errores: {}, mensaje: null } });
  const r = await iniciarSesion(correo, clave);

  if (r.ok && r.datos?.token && r.datos?.usuario) {
    guardarSesion(r.datos);
    actualizar({ login: { cargando: false, correo: '', errores: {}, mensaje: null } });
    navegar('#/cartera');
    return;
  }
  const errores = r.status === 422 && r.datos?.errores ? r.datos.errores : {};
  const mensaje = r.status === 422 ? null : r.datos?.error ?? 'No se pudo iniciar sesión.';
  actualizar({ login: { cargando: false, correo, errores, mensaje } });
}

function salir() {
  cerrarSesion();
  actualizar({ aviso: { tipo: 'info', texto: 'Ha cerrado sesión.' } });
  navegar('#/login');
}

// ---------- Enrutador ----------

function navegar(ruta) {
  if (location.hash !== ruta) location.hash = ruta; // dispara hashchange → alCambiarRuta
  else alCambiarRuta();
}

function alCambiarRuta() {
  const { sesion } = obtenerEstado();
  const conocida = RUTAS.has(location.hash) || RUTA_DETALLE.test(location.hash);
  let ruta = conocida ? location.hash : sesion ? '#/cartera' : '#/login';

  if (esProtegida(ruta) && !sesion) ruta = '#/login';
  if (ruta === '#/login' && sesion) ruta = '#/cartera';
  if (location.hash !== ruta) {
    history.replaceState(null, '', ruta);
  }

  actualizar({ ruta });
  if (ruta === '#/cartera') cartera.cargarCartera();
  if (ruta === '#/oportunidades') oportunidades.cargarTablero();
  const detalle = RUTA_DETALLE.exec(ruta);
  if (detalle) oportunidades.cargarDetalle(detalle[1]);
}

// ---------- Eventos (delegación) ----------

document.addEventListener('submit', (evento) => {
  const formulario = evento.target;
  switch (formulario.id) {
    case 'form-login':
      evento.preventDefault();
      enviarLogin(formulario);
      break;
    case 'form-busqueda': // la búsqueda se ejecuta al enviar, no en cada tecla (B3 §8)
      evento.preventDefault();
      cartera.buscar(String(new FormData(formulario).get('q') ?? ''));
      break;
    case 'form-cliente':
      evento.preventDefault();
      cartera.enviarFormulario(Object.fromEntries(new FormData(formulario)));
      break;
    // B4: oportunidades
    case 'form-oportunidad':
      evento.preventDefault();
      oportunidades.enviarNueva(Object.fromEntries(new FormData(formulario)));
      break;
    case 'form-titulo':
      evento.preventDefault();
      oportunidades.guardarTitulo(new FormData(formulario).get('titulo'));
      break;
    case 'form-agregar-linea':
      evento.preventDefault();
      oportunidades.agregarProducto(Object.fromEntries(new FormData(formulario)));
      break;
    case 'form-perdida':
      evento.preventDefault();
      oportunidades.confirmarPerdida(new FormData(formulario).get('motivo_perdida'));
      break;
    default:
      if (formulario.dataset?.formulario === 'linea') { // cantidad de una línea (una por fila)
        evento.preventDefault();
        oportunidades.cambiarCantidad(formulario.dataset.id, new FormData(formulario).get('cantidad'));
      }
      break;
  }
});

document.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-accion]');
  if (!boton || boton.disabled) return;
  const { id } = boton.dataset;
  switch (boton.dataset.accion) {
    case 'cerrar-sesion': salir(); break;
    case 'cerrar-aviso': actualizar({ aviso: null }); break;
    case 'reintentar-cartera': cartera.cargarCartera(); break;
    case 'limpiar-busqueda': cartera.limpiarBusqueda(); break;
    case 'nuevo-cliente': actualizar({ aviso: null }); cartera.abrirNuevo(); break;
    case 'editar-cliente': actualizar({ aviso: null }); cartera.abrirEdicion(id); break;
    case 'cancelar-formulario': cartera.cancelarFormulario(); break;
    case 'ver-disponibles': cartera.verDisponibles(); break;
    case 'ocultar-disponibles': cartera.ocultarDisponibles(); break;
    case 'tomar-cliente': actualizar({ aviso: null }); cartera.tomar(id); break;
    // B4: oportunidades
    case 'nueva-oportunidad': actualizar({ aviso: null }); oportunidades.abrirNueva(); break;
    case 'cancelar-oportunidad': oportunidades.cancelarNueva(); break;
    case 'reintentar-oportunidades': oportunidades.cargarTablero(); break;
    case 'reintentar-detalle': { const m = RUTA_DETALLE.exec(location.hash); if (m) oportunidades.cargarDetalle(m[1]); break; }
    case 'cambiar-etapa': actualizar({ aviso: null }); oportunidades.cambiarEtapa(boton.dataset.etapa); break;
    case 'cancelar-perdida': oportunidades.cancelarPerdida(); break;
    case 'quitar-linea': actualizar({ aviso: null }); oportunidades.quitarProducto(id); break;
    default: break;
  }
});

window.addEventListener('hashchange', alCambiarRuta);

suscribir(render);
alCambiarRuta();
