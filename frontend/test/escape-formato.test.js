// B2-16 (escapado) y formatos de la SPA.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escaparHtml } from '../js/util/escape.js';
import { formatearFecha, formatearCartera, MAXIMO_CARTERA } from '../js/util/formato.js';

describe('escaparHtml (S7)', () => {
  test('neutraliza etiquetas, atributos y entidades', () => {
    assert.equal(escaparHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;&#x2F;script&gt;');
    assert.equal(escaparHtml(`" onmouseover='robar()'`), '&quot; onmouseover&#x3D;&#39;robar()&#39;');
    assert.equal(escaparHtml('<img src=x onerror=alert(1)>'), '&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;');
    assert.equal(escaparHtml('Tom & Jerry `x`'), 'Tom &amp; Jerry &#x60;x&#x60;');
  });

  test('no escapa dos veces de forma incorrecta y conserva el texto normal', () => {
    assert.equal(escaparHtml('Comercial El Quetzal'), 'Comercial El Quetzal');
    assert.equal(escaparHtml('Almacén Ñandú'), 'Almacén Ñandú');
    assert.equal(escaparHtml('&amp;'), '&amp;amp;');
  });

  test('null y undefined son cadena vacía; números y booleanos se convierten a texto', () => {
    assert.equal(escaparHtml(null), '');
    assert.equal(escaparHtml(undefined), '');
    assert.equal(escaparHtml(42), '42');
    assert.equal(escaparHtml(false), 'false');
  });
});

describe('formato', () => {
  test('formatearCartera muestra "n de 10"', () => {
    assert.equal(MAXIMO_CARTERA, 10);
    assert.equal(formatearCartera(3), '3 de 10');
    assert.equal(formatearCartera(0), '0 de 10');
    assert.equal(formatearCartera(10), '10 de 10');
    assert.equal(formatearCartera(-1), '0 de 10');
    assert.equal(formatearCartera(undefined), '0 de 10');
  });

  test('formatearFecha usa la hora de Guatemala (UTC-6)', () => {
    const texto = formatearFecha('2026-10-15T16:00:00.000Z');
    assert.match(texto, /10:00/);
    assert.match(texto, /15/);
    // Cruce de medianoche: 05:00 UTC del 1 de noviembre son las 23:00 del 31 de octubre en Guatemala.
    assert.match(formatearFecha('2026-11-01T05:00:00Z'), /31/);
  });

  test('formatearFecha devuelve cadena vacía si la fecha no es válida', () => {
    for (const v of ['', 'no-fecha', null, undefined, 123]) assert.equal(formatearFecha(v), '');
  });
});
