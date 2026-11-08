// B1-06, B1-07, B1-08 y B1-10: validaciones de NIT, teléfono y fechas.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNit, normalizarTelefono, fechaUtc, validarCliente, idValido } from '../src/utils/validaciones.js';
import { ErrorValidacion } from '../src/utils/errores.js';

describe('B1-06 normalizarNit', () => {
  test('acepta el NIT del contrato (esp. §8.2) con verificador K', () => {
    assert.deepEqual(normalizarNit('4521817K'), { valido: true, nit: '4521817K' });
  });

  test('enunciado R4: el NIT compacto tiene entre 2 y 12 caracteres', () => {
    // 12345678901 + verificador 6 = 12 caracteres, válido; 123456789012 + 0 = 13 caracteres, rechazado
    // aunque su dígito verificador sea correcto (no cabría en clientes.nit VARCHAR(12)).
    assert.deepEqual(normalizarNit('123456789016'), { valido: true, nit: '123456789016' });
    assert.deepEqual(normalizarNit('1234567890120'), { valido: false, nit: null });
    assert.deepEqual(normalizarNit('00-1234567890-16'), { valido: true, nit: '123456789016' }, 'los ceros iniciales no cuentan');
    assert.deepEqual(normalizarNit('1'), { valido: false, nit: null }, 'un solo carácter no tiene cuerpo');
  });

  test('acepta un NIT con verificador numérico', () => {
    // 1234567: 1·8+2·7+3·6+4·5+5·4+6·3+7·2 = 112; 112 % 11 = 2; 11-2 = 9
    assert.deepEqual(normalizarNit('12345679'), { valido: true, nit: '12345679' });
  });

  test('acepta un NIT cuyo verificador calculado es 0', () => {
    // Cuerpo 45: 4·3 + 5·2 = 22; 22 % 11 = 0; (11 - 0) % 11 = 0 → verificador "0"
    assert.deepEqual(normalizarNit('450'), { valido: true, nit: '450' });
  });

  test('elimina espacios y guiones y pasa a mayúsculas', () => {
    assert.deepEqual(normalizarNit(' 4521817-k '), { valido: true, nit: '4521817K' });
    assert.deepEqual(normalizarNit('452 181 7-K'), { valido: true, nit: '4521817K' });
  });

  test('elimina los ceros iniciales', () => {
    assert.deepEqual(normalizarNit('004521817K'), { valido: true, nit: '4521817K' });
  });

  test('CF se representa como null', () => {
    assert.deepEqual(normalizarNit('CF'), { valido: true, nit: null });
    assert.deepEqual(normalizarNit(' cf '), { valido: true, nit: null });
    assert.deepEqual(normalizarNit('C-F'), { valido: true, nit: null });
  });

  test('rechaza un dígito verificador incorrecto', () => {
    assert.deepEqual(normalizarNit('45218170'), { valido: false, nit: null });
    assert.deepEqual(normalizarNit('12345678'), { valido: false, nit: null });
  });

  test('rechaza formatos inválidos', () => {
    for (const v of ['', '   ', 'K', '0', '000', '45K1817', 'K4521817', '4521.817K', 'ABC', '4521817KK']) {
      assert.equal(normalizarNit(v).valido, false, `debería rechazar ${JSON.stringify(v)}`);
    }
  });

  test('rechaza valores que no son texto', () => {
    for (const v of [undefined, null, 4521817, {}, []]) {
      assert.deepEqual(normalizarNit(v), { valido: false, nit: null });
    }
  });
});

describe('B1-07 normalizarTelefono', () => {
  test('acepta 8 dígitos que empiezan por 2-9', () => {
    assert.deepEqual(normalizarTelefono('55551234'), { valido: true, telefono: '55551234' });
    assert.deepEqual(normalizarTelefono('22334455'), { valido: true, telefono: '22334455' });
    assert.deepEqual(normalizarTelefono('99887766'), { valido: true, telefono: '99887766' });
  });

  test('elimina separadores', () => {
    for (const v of ['5555-1234', '5555 1234', '5555.1234', '(5555) 1234', ' 5555 - 1234 ']) {
      assert.deepEqual(normalizarTelefono(v), { valido: true, telefono: '55551234' }, v);
    }
  });

  test('elimina el prefijo de Guatemala', () => {
    for (const v of ['+502 5555 1234', '+50255551234', '502-5555-1234', '50255551234', '(+502) 5555-1234']) {
      assert.deepEqual(normalizarTelefono(v), { valido: true, telefono: '55551234' }, v);
    }
  });

  test('no recorta un número local de 8 dígitos que empieza por 502', () => {
    assert.deepEqual(normalizarTelefono('50212345'), { valido: true, telefono: '50212345' });
  });

  test('rechaza teléfonos inválidos', () => {
    for (const v of ['5555123', '555512345', '05551234', '15551234', '5555ABCD', '', '+1 5555 1234', '+502 1555 1234', '+5025555123']) {
      assert.equal(normalizarTelefono(v).valido, false, `debería rechazar ${JSON.stringify(v)}`);
    }
  });

  test('rechaza valores que no son texto', () => {
    for (const v of [undefined, null, 55551234, {}]) {
      assert.deepEqual(normalizarTelefono(v), { valido: false, telefono: null });
    }
  });
});

describe('B1-08 fechaUtc', () => {
  test('acepta fechas en UTC (Z) y las conserva', () => {
    const r = fechaUtc('2026-10-15T16:00:00Z');
    assert.equal(r.valido, true);
    assert.equal(r.fecha.toISOString(), '2026-10-15T16:00:00.000Z');
  });

  test('normaliza a UTC una fecha con desplazamiento de Guatemala (-06:00)', () => {
    const r = fechaUtc('2026-10-15T10:00:00-06:00');
    assert.equal(r.valido, true);
    assert.equal(r.fecha.toISOString(), '2026-10-15T16:00:00.000Z');
  });

  test('acepta minutos sin segundos, milisegundos y desplazamientos positivos', () => {
    assert.equal(fechaUtc('2026-10-15T10:00-06:00').fecha.toISOString(), '2026-10-15T16:00:00.000Z');
    assert.equal(fechaUtc('2026-10-15T10:00:00.250Z').fecha.toISOString(), '2026-10-15T10:00:00.250Z');
    assert.equal(fechaUtc('2026-10-16T01:30:00+05:30').fecha.toISOString(), '2026-10-15T20:00:00.000Z');
  });

  test('cruza correctamente el cambio de día y acepta el 29 de febrero en año bisiesto', () => {
    assert.equal(fechaUtc('2026-10-31T23:00:00-06:00').fecha.toISOString(), '2026-11-01T05:00:00.000Z');
    assert.equal(fechaUtc('2028-02-29T12:00:00Z').valido, true);
  });

  test('rechaza fechas sin zona horaria o ambiguas', () => {
    for (const v of [
      '2026-10-15T10:00:00',   // sin zona
      '2026-10-15T10:00',      // sin zona
      '2026-10-15',            // solo fecha
      '2026-10-15 10:00:00Z',  // separador no ISO
      '15/10/2026 10:00',      // formato local
      'mañana',
      '2026-10-15T10:00:00-0600', // desplazamiento sin dos puntos
      '2026-10-15T10:00:00GMT',
      '',
    ]) {
      assert.deepEqual(fechaUtc(v), { valido: false, fecha: null }, `debería rechazar ${JSON.stringify(v)}`);
    }
  });

  test('rechaza fechas imposibles', () => {
    for (const v of [
      '2026-02-31T10:00:00Z', '2026-02-29T10:00:00Z', '2026-13-01T10:00:00Z', '2026-00-10T10:00:00Z',
      '2026-10-32T10:00:00Z', '2026-10-15T24:00:00Z', '2026-10-15T10:60:00Z', '2026-10-15T10:00:60Z',
      '2026-10-15T10:00:00+15:00', '2026-10-15T10:00:00-06:75',
    ]) {
      assert.equal(fechaUtc(v).valido, false, `debería rechazar ${v}`);
    }
  });

  test('rechaza valores que no son texto', () => {
    for (const v of [undefined, null, 1760544000000, new Date()]) {
      assert.deepEqual(fechaUtc(v), { valido: false, fecha: null });
    }
  });
});

describe('B3 validarCliente', () => {
  const errores = (fn) => { try { fn(); } catch (e) { return e; } return null; };

  test('alta válida: normaliza NIT, teléfono, nombre y correo; ignora campos ajenos (B3-09, B3-10)', () => {
    assert.deepEqual(
      validarCliente({ nombre: ' Bella ', nit: 'cf', telefono: '+502 5555 1234', correo: ' a@b.test ', vendedor_id: 99, id: 1 }),
      { nombre: 'Bella', nit: null, telefono: '55551234', correo: 'a@b.test' },
    );
    assert.equal(validarCliente({ nombre: 'X', nit: '4521817-k', telefono: '22334455' }).correo, null);
  });

  test('alta con datos inválidos → ErrorValidacion con un mensaje por campo (B3-07)', () => {
    const e = errores(() => validarCliente({ nit: '4521817-1', telefono: '1234', correo: 'x' }));
    assert.ok(e instanceof ErrorValidacion);
    assert.equal(e.status, 422);
    assert.deepEqual(Object.keys(e.errores).sort(), ['correo', 'nit', 'nombre', 'telefono']);
  });

  test('edición parcial: solo valida y devuelve los campos presentes (B3-13)', () => {
    assert.deepEqual(validarCliente({ telefono: '2468-1357' }, { parcial: true }), { telefono: '24681357' });
    assert.deepEqual(validarCliente({ correo: null }, { parcial: true }), { correo: null });
    assert.deepEqual(validarCliente({ correo: '' }, { parcial: true }), { correo: null });
  });

  test('edición sin campos editables → 400 (no 422)', () => {
    for (const cuerpo of [{}, { vendedor_id: 5 }, { otro: 'x' }]) {
      const e = errores(() => validarCliente(cuerpo, { parcial: true }));
      assert.equal(e.status, 400, JSON.stringify(cuerpo));
    }
  });
});

describe('B3-06 idValido', () => {
  test('acepta enteros positivos seguros', () => {
    assert.equal(idValido('1'), 1);
    assert.equal(idValido('9007199254740991'), 9007199254740991);
  });

  test('rechaza textos, cero, negativos, decimales, ceros iniciales, exponentes y desbordes', () => {
    for (const v of ['abc', '0', '-1', '1.5', '010', '1e3', ' 1', '9007199254740993', '99999999999999999', '', undefined, 5]) {
      assert.equal(idValido(v), null, String(v));
    }
  });
});
