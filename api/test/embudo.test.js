// Máquina de estados del embudo (R5; B4 §3, B4-12, B4-13, B4-19, B4-C1). Funciones puras.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETAPAS, ETAPAS_ABIERTAS, PROBABILIDAD, validarTransicion, transicionesPermitidas, esEtapa, estaCerrada,
} from '../src/servicios/embudo.js';

describe('Embudo: etapas y probabilidades (R5)', () => {
  test('seis etapas con sus probabilidades enteras', () => {
    assert.deepEqual(ETAPAS, ['prospecto', 'calificado', 'propuesta', 'negociacion', 'ganada', 'perdida']);
    assert.deepEqual(PROBABILIDAD, { prospecto: 10, calificado: 25, propuesta: 50, negociacion: 75, ganada: 100, perdida: 0 });
  });

  test('esEtapa y estaCerrada', () => {
    assert.ok(esEtapa('negociacion'));
    for (const v of ['cancelado', 'Ganada', '', null, 1, undefined]) assert.equal(esEtapa(v), false, String(v));
    assert.ok(estaCerrada('ganada') && estaCerrada('perdida'));
    assert.ok(!estaCerrada('negociacion'));
  });
});

describe('Embudo: las 36 combinaciones de validarTransicion', () => {
  // Resultado esperado: 'ok', 409 o 422.
  const esperado = (a, n) => {
    if (a === 'ganada' || a === 'perdida') return 409;
    if (a === n) return 409;
    if (n === 'perdida') return 'ok';
    if (n === 'ganada') return a === 'negociacion' ? 'ok' : 422;
    return Math.abs(ETAPAS_ABIERTAS.indexOf(a) - ETAPAS_ABIERTAS.indexOf(n)) === 1 ? 'ok' : 422;
  };

  for (const actual of ETAPAS) {
    for (const nueva of ETAPAS) {
      test(`${actual} → ${nueva}`, () => {
        const r = validarTransicion(actual, nueva);
        const e = esperado(actual, nueva);
        if (e === 'ok') assert.deepEqual(r, { ok: true });
        else {
          assert.equal(r.ok, false);
          assert.equal(r.status, e);
          assert.equal(typeof r.mensaje, 'string');
        }
      });
    }
  }

  test('casos explícitos de la spec: prospecto → propuesta y → ganada son 422 (B4-13)', () => {
    assert.equal(validarTransicion('prospecto', 'propuesta').status, 422);
    assert.equal(validarTransicion('prospecto', 'ganada').status, 422);
  });

  test('transicionesPermitidas', () => {
    assert.deepEqual(transicionesPermitidas('prospecto'), ['calificado', 'perdida']);
    assert.deepEqual(transicionesPermitidas('calificado'), ['prospecto', 'propuesta', 'perdida']);
    assert.deepEqual(transicionesPermitidas('negociacion'), ['propuesta', 'ganada', 'perdida']);
    assert.deepEqual(transicionesPermitidas('ganada'), []);
    assert.deepEqual(transicionesPermitidas('perdida'), []);
  });
});
