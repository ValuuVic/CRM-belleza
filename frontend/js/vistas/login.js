// Vista de inicio de sesión (B2-11). Devuelve HTML: todo texto externo pasa por escaparHtml (S7).
// La contraseña nunca se guarda en el estado ni en el navegador: solo se lee del formulario al enviarlo.

import { escaparHtml } from '../util/escape.js';

function campo({ id, nombre, tipo, etiqueta, valor = '', error, autocompletar, cargando }) {
  const invalido = error ? ' is-invalid' : '';
  return `
    <div class="mb-3">
      <label for="${id}" class="form-label">${etiqueta}</label>
      <input id="${id}" name="${nombre}" type="${tipo}" class="form-control${invalido}"
             value="${escaparHtml(valor)}" autocomplete="${autocompletar}" required
             ${error ? `aria-invalid="true" aria-describedby="${id}-error"` : ''} ${cargando ? 'disabled' : ''}>
      ${error ? `<div id="${id}-error" class="invalid-feedback">${escaparHtml(error)}</div>` : ''}
    </div>`;
}

export function renderLogin(estado) {
  const { cargando, correo, errores, mensaje } = estado.login;
  return `
    <div class="row justify-content-center">
      <div class="col-12 col-sm-10 col-md-7 col-lg-5">
        <div class="card shadow-sm mt-4">
          <div class="card-body p-4">
            <h1 class="h4 mb-1">Iniciar sesión</h1>
            <p class="text-body-secondary mb-4">Acceso para vendedores de CRM Belleza.</p>
            ${mensaje ? `<div class="alert alert-danger" role="alert">${escaparHtml(mensaje)}</div>` : ''}
            <form id="form-login" novalidate>
              ${campo({ id: 'login-correo', nombre: 'correo', tipo: 'email', etiqueta: 'Correo electrónico', valor: correo, error: errores.correo, autocompletar: 'username', cargando })}
              ${campo({ id: 'login-clave', nombre: 'clave', tipo: 'password', etiqueta: 'Contraseña', error: errores.clave, autocompletar: 'current-password', cargando })}
              <button type="submit" class="btn btn-primary w-100" ${cargando ? 'disabled' : ''}>
                ${cargando ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span><span role="status">Ingresando…</span>' : 'Ingresar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>`;
}
