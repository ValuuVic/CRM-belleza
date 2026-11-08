// Errores HTTP controlados (B1-04).
// Formatos del contrato (docs/especificacion.md §8.6):
//   - Errores generales:     { "error": "mensaje" }
//   - Errores de validación: 422 { "errores": { "campo": "mensaje" } }

// Códigos de error general del contrato (§8.6) con formato { "error" }.
// El 422 se crea solo con ErrorValidacion (formato { "errores" }) y el 500 solo
// lo genera el manejador global, con un mensaje fijo.
export const CODIGOS_ERROR_GENERAL = Object.freeze([400, 401, 403, 404, 409]);

export class ErrorHttp extends Error {
  /**
   * @param {400 | 401 | 403 | 404 | 409} status Código HTTP de error general.
   * @param {string} mensaje Mensaje para el cliente; no debe contener datos internos.
   */
  constructor(status, mensaje) {
    if (new.target === ErrorHttp && !CODIGOS_ERROR_GENERAL.includes(status)) {
      throw new TypeError(`ErrorHttp no admite el código ${status}; use ErrorValidacion para 422.`);
    }
    super(mensaje);
    this.name = 'ErrorHttp';
    this.status = status;
  }

  get cuerpo() {
    return { error: this.message };
  }
}

export class ErrorValidacion extends ErrorHttp {
  /** @param {Record<string, string>} errores Mensajes por campo. */
  constructor(errores) {
    super(422, 'Error de validación');
    this.name = 'ErrorValidacion';
    this.errores = { ...errores };
  }

  get cuerpo() {
    return { errores: this.errores };
  }
}

export const peticionInvalida = (mensaje = 'Petición inválida') => new ErrorHttp(400, mensaje);
export const noEncontrado = (mensaje = 'Recurso no encontrado') => new ErrorHttp(404, mensaje);
export const conflicto = (mensaje = 'Conflicto con el estado actual') => new ErrorHttp(409, mensaje);
