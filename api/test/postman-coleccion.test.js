// B6-10 a B6-13 (A8): estructura de docs/api.postman_collection.json, sin red.
// Comprueba que la colección cubre cada endpoint del contrato (§8), los errores principales,
// la regla propia y que reutiliza variables sin guardar tokens ni secretos privados.
// La ejecución de las peticiones se hace en Postman (manual) contra la demo o una base de pruebas.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const texto = await readFile(new URL('../../docs/api.postman_collection.json', import.meta.url), 'utf8');
const coleccion = JSON.parse(texto);

/** Todas las peticiones con la ruta de carpetas en la que están. */
function peticiones(items, carpeta = []) {
  return items.flatMap((i) => (i.item ? peticiones(i.item, [...carpeta, i.name]) : [{ ...i, carpeta }]));
}
const todas = peticiones(coleccion.item);

/** URL de Postman → "MÉTODO /ruta/:id" (variables e ids numéricos pasan a :id; sin consulta). */
function firma(p) {
  const ruta = p.request.url.raw.replace('{{baseUrl}}', '').split('?')[0]
    .split('/').map((s) => (/^\{\{.+\}\}$/.test(s) || /^\d+$/.test(s) ? ':id' : s)).join('/');
  return `${p.request.method} ${ruta}`;
}
const firmas = new Set(todas.map(firma));
const scripts = (p, tipo) => p.event?.filter((e) => e.listen === tipo).flatMap((e) => e.script.exec).join('\n') ?? '';

// Contrato obligatorio (docs/especificacion.md §8): 19 endpoints de la Parte B + el resumen de la Parte A.
const CONTRATO = [
  'POST /auth/login', 'GET /productos', 'GET /clientes', 'POST /clientes', 'GET /clientes/disponibles',
  'POST /clientes/:id/tomar', 'GET /clientes/:id', 'PATCH /clientes/:id', 'POST /clientes/:id/actividades',
  'GET /actividades', 'PATCH /actividades/:id', 'GET /oportunidades', 'POST /oportunidades', 'GET /oportunidades/:id',
  'PATCH /oportunidades/:id', 'PATCH /oportunidades/:id/etapa', 'POST /oportunidades/:id/productos',
  'PATCH /oportunidades/:id/productos/:id', 'DELETE /oportunidades/:id/productos/:id', 'GET /reportes/resumen',
];

describe('B6-10 colección completa', () => {
  test('JSON válido con el esquema de colecciones v2.1 de Postman', () => {
    assert.equal(coleccion.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
    assert.ok(coleccion.info.name);
    assert.ok(todas.length >= CONTRATO.length);
  });

  for (const endpoint of CONTRATO) {
    test(`hay al menos una petición para ${endpoint}`, () => assert.ok(firmas.has(endpoint), [...firmas].join('\n')));
  }

  test('no hay peticiones a rutas fuera del contrato (salvo las de 404: ruta inexistente e id no numérico, D9)', () => {
    const ERRORES_404 = ['GET /ruta-que-no-existe', 'GET /clientes/abc'];
    const extra = [...firmas].filter((f) => !CONTRATO.includes(f) && !ERRORES_404.includes(f));
    assert.deepEqual(extra, []);
  });

  test('cada petición comprueba su código HTTP', () => {
    for (const p of todas) assert.match(scripts(p, 'test'), /to\.have\.status\(\d{3}\)/, p.name);
  });
});

describe('B6-11 variables de colección', () => {
  const variables = new Map(coleccion.variable.map((v) => [v.key, v.value]));

  test('todas las URL usan {{baseUrl}} y la autenticación por defecto es Bearer {{token}}', () => {
    assert.equal(variables.get('baseUrl'), 'http://localhost:3000/api');
    for (const p of todas) assert.match(p.request.url.raw, /^\{\{baseUrl\}\}\//, p.name);
    assert.deepEqual(coleccion.auth, { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] });
  });

  test('el login guarda el token en una variable; no hay tokens escritos a mano', () => {
    const login = todas.find((p) => p.name.startsWith('Login vendedora A'));
    assert.match(scripts(login, 'test'), /collectionVariables\.set\('token'/);
    assert.equal(variables.get('token'), '');
    assert.equal(variables.get('token_b'), '');
    assert.doesNotMatch(texto, /eyJ[\w-]{10,}\.[\w-]+\.[\w-]+/);
  });

  test('las credenciales salen de variables; la única clave guardada es la pública de la semilla (S2)', () => {
    assert.match(variables.get('clave'), /^Ventas\d{4}$/); // la contraseña pública de la semilla (no se repite aquí: S2-01)
    for (const p of todas) {
      const cuerpo = p.request.body?.raw ?? '';
      const clave = /"clave":\s*"([^"]*)"/.exec(cuerpo)?.[1];
      if (clave !== undefined) assert.ok(['{{clave}}', 'Clave-Incorrecta-1', ''].includes(clave), `${p.name}: ${clave}`);
    }
    assert.doesNotMatch(texto, /Clave\.Prueba|JWT_SECRET|MYSQL_|DB_PASSWORD/);
  });

  test('los correos de la semilla que no están en la especificación se dejan vacíos para no inventarlos', () => {
    assert.equal(variables.get('correo_vendedora'), 'valeria@crm.test');
    for (const k of ['correo_vendedor_b', 'correo_admin', 'correo_supervisor', 'correo_inactivo']) assert.equal(variables.get(k), '', k);
  });
});

describe('B6-12 errores principales del contrato', () => {
  const conCodigo = (c) => todas.filter((p) => scripts(p, 'test').includes(`to.have.status(${c})`));

  for (const codigo of [400, 401, 403, 404, 409, 422]) {
    test(`hay peticiones que esperan ${codigo} y comprueban el formato del error`, () => {
      const lista = conCodigo(codigo);
      assert.ok(lista.length > 0, `ninguna espera ${codigo}`);
      const formato = codigo === 422 ? /errores/ : /\['error'\]/;
      for (const p of lista) assert.match(scripts(p, 'test'), formato, p.name);
    });
  }

  test('403 para administrador, supervisor y vendedor desactivado; 401 sin token y con token alterado', () => {
    const nombres = conCodigo(403).map((p) => p.name).join(' | ');
    for (const quien of ['administrador', 'supervisor', 'desactivado']) assert.match(nombres, new RegExp(quien));
    const n401 = conCodigo(401).map((p) => p.name).join(' | ');
    assert.match(n401, /Sin token/);
    assert.match(n401, /Token alterado/);
  });

  test('404 para recursos de otro vendedor (R2, S5)', () => {
    const ajenas = conCodigo(404).filter((p) => /ajen|otro vendedor/i.test(p.name) || /ajen/.test(p.request.url.raw));
    assert.ok(ajenas.length >= 3, ajenas.map((p) => p.name).join(', '));
  });

  test('las respuestas correctas comprueban que no hay hashes ni identificadores internos (S4)', () => {
    assert.ok(todas.filter((p) => scripts(p, 'test').includes('Sin hashes ni identificadores internos')).length >= 8);
  });
});

describe('B6-13 regla propia de stock (RP-01 a RP-04)', () => {
  const rp = coleccion.item.find((c) => c.name.includes('Regla propia'));

  test('carpeta con RP-01, RP-02, RP-03 y RP-04 (numeración de §10.4)', () => {
    assert.ok(rp);
    assert.deepEqual(rp.item.map((c) => c.name.slice(0, 5)), ['RP-01', 'RP-02', 'RP-03', 'RP-04']);
  });

  test('cada caso intenta ganar y comprueba el stock o la etapa después', () => {
    for (const caso of rp.item) {
      const ps = peticiones(caso.item);
      const ganar = ps.find((p) => p.request.method === 'PATCH' && /"etapa":\s*"ganada"/.test(p.request.body?.raw ?? ''));
      assert.ok(ganar, caso.name);
      const despues = ps.slice(ps.indexOf(ganar) + 1);
      assert.ok(despues.some((p) => p.request.url.raw.endsWith('/productos')), `${caso.name}: no relee el stock`);
    }
  });

  test('stock insuficiente espera 409 y sin cambios; suficiente descuenta; NULL sigue NULL', () => {
    const scriptsDe = (prefijo) => peticiones(rp.item.find((c) => c.name.startsWith(prefijo)).item).map((p) => scripts(p, 'test')).join('\n');
    assert.match(scriptsDe('RP-02'), /to\.have\.status\(409\)[^]*negociacion[^]*to\.eql\(antes\)/);
    assert.match(scriptsDe('RP-03'), /to\.have\.status\(409\)[^]*to\.eql\(antes\)[^]*to\.eql\(antes\)/);
    assert.match(scriptsDe('RP-01'), /to\.eql\(antes - 3\)/);
    assert.match(scriptsDe('RP-04'), /stock\)\.to\.eql\(null\)/);
  });

  test('el resumen mensual (cifras de control) se ejecuta antes de cualquier carpeta que escribe', () => {
    const nombres = coleccion.item.map((c) => c.name);
    const resumen = nombres.findIndex((n) => n.includes('Resumen mensual'));
    const primeraEscritura = coleccion.item.findIndex((c) => peticiones(c.item ?? []).some((p) => p.request.method !== 'GET' && !p.request.url.raw.endsWith('/auth/login')));
    assert.ok(resumen >= 0 && resumen < primeraEscritura, nombres.join(' | '));
  });

  test('advierte que las carpetas que escriben solo se ejecutan contra la demo o una base restablecible', () => {
    assert.match(coleccion.info.description, /nunca contra la base compartida/);
    assert.match(rp.description, /restablecible/);
  });
});
