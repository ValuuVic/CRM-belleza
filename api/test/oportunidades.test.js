// B4-01 a B4-21: productos, oportunidades, líneas, etapas y stock con la base simulada (sin MySQL).
// Datos ficticios (test/ayuda/consultas-oportunidades.js):
//   vendedora 4: oportunidad 100 en negociacion (línea 500: producto 1 × 3, stock 10) y 102 ganada.
//   vendedor 5:  oportunidad 101 en prospecto (privada).
//   productos: 1 stock 10 · 2 Labial 33.33 stock 2 · 3 stock NULL · 4 inactivo.
// Las pruebas reales con MySQL y VerificacionSeeder están en integracion-b4.test.js (I1).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'secreto_de_prueba_b4_oportunidades_no_usar_40c';

const { crearApp } = await import('../src/app.js');
const { firmarToken } = await import('../src/config/jwt.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, levantar, pedir } = await import('./ayuda/bd-simulada.js');

after(() => poolReal.end()); // el pool real se crea al importar; se cierra sin haber conectado

async function entorno(preparar = () => {}) {
  const bd = crearBdSimulada();
  preparar(bd);
  const api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: bd.pool }));
  const llamar = (vendedor, metodo, ruta, { cuerpo, crudo, token = true } = {}) => {
    const headers = token ? { Authorization: `Bearer ${firmarToken(vendedor)}` } : {};
    let body;
    if (crudo !== undefined) { body = crudo; headers['Content-Type'] = 'application/json'; }
    else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); headers['Content-Type'] = 'application/json'; }
    return pedir(`${api.url}/api${ruta}`, { method: metodo, headers, body });
  };
  return { bd, llamar, cerrar: () => api.servidor.close() };
}

const copia = (bd) => JSON.parse(JSON.stringify({ o: bd.oportunidades, l: bd.oportunidad_productos, h: bd.historial_etapas, p: bd.productos }));
const historialDe = (bd, id) => bd.historial_etapas.filter((h) => h.oportunidad_id === id);
const opp = (bd, id) => bd.oportunidades.find((o) => o.id === id);
const prod = (bd, id) => bd.productos.find((p) => p.id === id);
const CLAVES_DETALLE = ['id', 'cliente', 'titulo', 'etapa', 'probabilidad', 'total', 'fecha_cierre', 'motivo_perdida', 'productos', 'historial'];
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Crea una oportunidad en negociacion para la vendedora 4 con las líneas indicadas. */
function enNegociacion(bd, id, lineas, cliente = 10) {
  bd.oportunidades.push({ id, cliente_id: cliente, vendedor_id: 4, titulo: `Prueba ${id}`, etapa: 'negociacion', motivo_perdida: null, fecha_cierre: null });
  lineas.forEach(([producto_id, cantidad], i) => {
    bd.oportunidad_productos.push({ id: id * 10 + i, oportunidad_id: id, producto_id, cantidad, precio_unitario: prod(bd, producto_id).precio });
  });
}

describe('B4-01 catálogo de productos', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('200 solo con productos activos, { id, nombre, precio, stock }, ordenados por nombre', async () => {
    const r = await e.llamar(4, 'GET', '/productos');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, [
      { id: 1, nombre: 'Base líquida HD', precio: 150, stock: 10 },
      { id: 2, nombre: 'Labial mate', precio: 33.33, stock: 2 },
      { id: 3, nombre: 'Paleta de sombras', precio: 250, stock: null },
    ]);
    assert.doesNotMatch(r.texto, /descontinuado|activo/);
  });

  test('sin token → 401; con parámetros → 400; la API no ofrece modificar el catálogo', async () => {
    assert.equal((await e.llamar(4, 'GET', '/productos', { token: false })).status, 401);
    assert.equal((await e.llamar(4, 'GET', '/productos?activo=0')).status, 400);
    for (const metodo of ['POST', 'PATCH', 'DELETE']) {
      assert.equal((await e.llamar(4, metodo, '/productos', { cuerpo: { nombre: 'x', precio: 1 } })).status, 404, metodo);
    }
    assert.equal(e.bd.productos.length, 4);
  });
});

describe('B4-02 oportunidades propias', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('listado con solo las del token, en formato resumen', async () => {
    const r = await e.llamar(4, 'GET', '/oportunidades');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.map((o) => o.id), [100, 102]);
    assert.deepEqual(r.json[0], {
      id: 100, cliente: { id: 10, nombre: 'Tienda Beta' }, titulo: 'Pedido de temporada Tienda Beta',
      etapa: 'negociacion', probabilidad: 75, total: 450, fecha_cierre: null,
    });
    assert.deepEqual(r.json[1].fecha_cierre, '2026-10-15T16:00:00.000Z');
    assert.doesNotMatch(r.texto, /privada|vendedor_id|productos|historial/);
    assert.deepEqual((await e.llamar(5, 'GET', '/oportunidades')).json.map((o) => o.id), [101]);
  });

  test('?etapa= filtra; etapa desconocida, repetida o parámetro ajeno → 400', async () => {
    assert.deepEqual((await e.llamar(4, 'GET', '/oportunidades?etapa=ganada')).json.map((o) => o.id), [102]);
    assert.deepEqual((await e.llamar(4, 'GET', '/oportunidades?etapa=prospecto')).json, []);
    for (const q of ['?etapa=cancelado', '?etapa=ganada&etapa=perdida', '?vendedor_id=5', '?etapa=']) {
      const r = await e.llamar(4, 'GET', `/oportunidades${q}`);
      assert.equal(r.status, 400, q);
      assert.deepEqual(Object.keys(r.json), ['error']);
    }
  });

  test('todas las rutas exigen token → 401', async () => {
    for (const [m, ruta] of [['GET', '/oportunidades'], ['GET', '/oportunidades/100'], ['POST', '/oportunidades'], ['PATCH', '/oportunidades/100'],
      ['PATCH', '/oportunidades/100/etapa'], ['POST', '/oportunidades/100/productos'], ['PATCH', '/oportunidades/100/productos/500'], ['DELETE', '/oportunidades/100/productos/500']]) {
      assert.equal((await e.llamar(4, m, ruta, { token: false, cuerpo: m === 'GET' || m === 'DELETE' ? undefined : {} })).status, 401, `${m} ${ruta}`);
    }
  });
});

describe('B4-03 oportunidades ajenas', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('detalle de la oportunidad de otro vendedor → 404 idéntico al de una inexistente', async () => {
    const ajena = await e.llamar(4, 'GET', '/oportunidades/101');
    const inexistente = await e.llamar(4, 'GET', '/oportunidades/999');
    assert.equal(ajena.status, 404);
    assert.deepEqual(ajena.json, inexistente.json);
    assert.doesNotMatch(ajena.texto, /privada|Otro Vendedor/);
  });

  test('identificadores no numéricos → 404 sin consultar oportunidades', async () => {
    e.bd.llamadas.length = 0;
    for (const id of ['abc', '0', '-1', '1.5', '010']) assert.equal((await e.llamar(4, 'GET', `/oportunidades/${id}`)).status, 404, id);
    assert.ok(!e.bd.llamadas.some((l) => /oportunidades/.test(l.sql)));
  });

  test('ninguna modificación sobre una oportunidad ajena: todas → 404 sin cambios', async () => {
    const antes = copia(e.bd);
    const intentos = [
      ['PATCH', '/oportunidades/101', { titulo: 'Robada' }],
      ['PATCH', '/oportunidades/101/etapa', { etapa: 'calificado' }],
      ['POST', '/oportunidades/101/productos', { producto_id: 2, cantidad: 1 }],
      ['PATCH', '/oportunidades/101/productos/502', { cantidad: 2 }],
      ['DELETE', '/oportunidades/101/productos/502'],
    ];
    for (const [m, ruta, cuerpo] of intentos) assert.equal((await e.llamar(4, m, ruta, { cuerpo })).status, 404, `${m} ${ruta}`);
    assert.deepEqual(copia(e.bd), antes);
  });

  test('el detalle propio sigue el formato §8.3', async () => {
    const r = await e.llamar(4, 'GET', '/oportunidades/100');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json), CLAVES_DETALLE);
    assert.doesNotMatch(r.texto, /vendedor_id/);
  });
});

describe('B4-04 y B4-05 crear oportunidad', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('201 en prospecto, probabilidad 10, sin productos y con su primer historial', async () => {
    const r = await e.llamar(4, 'POST', '/oportunidades', { cuerpo: { cliente_id: 11, titulo: '  Nueva línea de labiales  ', vendedor_id: 5, etapa: 'ganada' } });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.json), CLAVES_DETALLE);
    assert.equal(r.json.etapa, 'prospecto');
    assert.equal(r.json.probabilidad, 10);
    assert.equal(r.json.titulo, 'Nueva línea de labiales');
    assert.deepEqual(r.json.cliente, { id: 11, nombre: 'Almacén Alfa' });
    assert.equal(r.json.total, 0);
    assert.deepEqual(r.json.productos, []);
    assert.equal(r.json.historial.length, 1);
    assert.equal(r.json.historial[0].etapa_anterior, null);
    assert.equal(r.json.historial[0].etapa_nueva, 'prospecto');
    assert.equal(r.json.historial[0].usuario, 'Vendedora Uno', 'nombre como texto, sin id (enunciado §8, R8)');
    assert.match(r.json.historial[0].fecha, ISO_UTC);
    assert.equal(opp(e.bd, r.json.id).vendedor_id, 4, 'el dueño sale del token, no del cuerpo');
  });

  test('oportunidad e historial se crean en la misma transacción: si falla el historial, no queda nada', async () => {
    const antes = copia(e.bd);
    e.bd.fallos.patron = /^INSERT INTO historial_etapas/;
    const r = await e.llamar(4, 'POST', '/oportunidades', { cuerpo: { cliente_id: 10, titulo: 'Atómica' } });
    e.bd.fallos.patron = null;
    assert.equal(r.status, 500);
    assert.deepEqual(r.json, { error: 'Error interno del servidor' });
    assert.deepEqual(copia(e.bd), antes);
    assert.equal(e.bd.estadisticas.abiertas, 0);
  });

  test('B4-05: cliente ajeno, disponible o inexistente → 422 errores.cliente_id idéntico', async () => {
    const antes = copia(e.bd);
    const respuestas = [];
    for (const cliente_id of [12, 13, 999]) {
      const r = await e.llamar(4, 'POST', '/oportunidades', { cuerpo: { cliente_id, titulo: 'X' } });
      assert.equal(r.status, 422, String(cliente_id));
      assert.deepEqual(Object.keys(r.json.errores), ['cliente_id']);
      respuestas.push(r.texto);
    }
    assert.equal(new Set(respuestas).size, 1, 'no revela si el cliente existe');
    assert.doesNotMatch(respuestas[0], /Otro Vendedor|Disponible/);
    assert.deepEqual(copia(e.bd), antes);
  });

  test('validaciones del alta: título y cliente_id → 422; cuerpo no JSON → 400', async () => {
    const r = await e.llamar(4, 'POST', '/oportunidades', { cuerpo: { cliente_id: '10', titulo: '' } });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.errores).sort(), ['cliente_id', 'titulo']);
    const largo = await e.llamar(4, 'POST', '/oportunidades', { cuerpo: { cliente_id: 10, titulo: 'x'.repeat(151) } });
    assert.deepEqual(Object.keys(largo.json.errores), ['titulo']);
    for (const crudo of ['[]', '{"a":', '"x"']) assert.equal((await e.llamar(4, 'POST', '/oportunidades', { crudo })).status, 400, crudo);
  });
});

describe('B4-06 a B4-09 líneas de productos', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('B4-06/07: 201 y el precio se copia del catálogo aunque el cuerpo envíe otro', async () => {
    const r = await e.llamar(4, 'POST', '/oportunidades/100/productos', { cuerpo: { producto_id: 2, cantidad: 3, precio_unitario: 0.01, subtotal: 0.03, total: 1 } });
    assert.equal(r.status, 201);
    const linea = r.json.productos.find((l) => l.producto_id === 2);
    assert.deepEqual(Object.keys(linea), ['id', 'producto_id', 'nombre', 'cantidad', 'precio_unitario', 'subtotal']);
    assert.equal(linea.precio_unitario, 33.33);
    assert.equal(linea.subtotal, 99.99);
    assert.equal(r.json.total, 549.99);
    const insercion = e.bd.llamadas.find((l) => /^INSERT INTO oportunidad_productos/.test(l.sql));
    assert.deepEqual(insercion.params, [100, 2, 3, 33.33]);
  });

  test('CA-09: cambiar el precio del catálogo no altera la línea ya guardada', async () => {
    prod(e.bd, 2).precio = 99;
    const r = await e.llamar(4, 'GET', '/oportunidades/100');
    assert.equal(r.json.productos.find((l) => l.producto_id === 2).precio_unitario, 33.33);
    prod(e.bd, 2).precio = 33.33;
  });

  test('B4-08: el mismo producto otra vez → 409 por el índice único, sin consulta previa', async () => {
    e.bd.llamadas.length = 0;
    const antes = copia(e.bd);
    const r = await e.llamar(4, 'POST', '/oportunidades/100/productos', { cuerpo: { producto_id: 1, cantidad: 1 } });
    assert.equal(r.status, 409);
    assert.ok(!e.bd.llamadas.some((l) => /FROM oportunidad_productos WHERE oportunidad_id = \? AND producto_id/.test(l.sql)));
    assert.deepEqual(copia(e.bd), antes);
  });

  test('B4-08: producto inactivo o inexistente → 422 errores.producto_id', async () => {
    for (const producto_id of [4, 999, '1', 0]) {
      const r = await e.llamar(4, 'POST', '/oportunidades/100/productos', { cuerpo: { producto_id, cantidad: 1 } });
      assert.equal(r.status, 422, String(producto_id));
      assert.deepEqual(Object.keys(r.json.errores), ['producto_id']);
    }
  });

  test('B4-09: cantidades fuera de 1–999 o no enteras → 422 al agregar y al editar; 1 y 999 válidas', async () => {
    for (const cantidad of [0, 1000, 1.5, '3', null, -1, undefined]) {
      const alta = await e.llamar(4, 'POST', '/oportunidades/100/productos', { cuerpo: { producto_id: 3, cantidad } });
      assert.equal(alta.status, 422, `alta ${cantidad}`);
      assert.deepEqual(Object.keys(alta.json.errores), ['cantidad']);
      if (cantidad !== undefined) {
        const edicion = await e.llamar(4, 'PATCH', '/oportunidades/100/productos/500', { cuerpo: { cantidad } });
        assert.equal(edicion.status, 422, `edición ${cantidad}`);
      }
    }
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/100/productos/500', { cuerpo: { cantidad: 999 } })).status, 200);
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/100/productos/500', { cuerpo: { cantidad: 1 } })).status, 200);
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/100/productos/500', { cuerpo: {} })).status, 400);
  });
});

describe('B4-10 y B4-20 editar y quitar líneas; total calculado', () => {
  let e;
  before(async () => { e = await entorno((bd) => enNegociacion(bd, 200, [[1, 2], [2, 3]])); });
  after(() => e.cerrar());

  test('el total y los subtotales se calculan con los precios almacenados', async () => {
    const r = await e.llamar(4, 'GET', '/oportunidades/200');
    assert.deepEqual(r.json.productos.map((l) => [l.producto_id, l.cantidad, l.precio_unitario, l.subtotal]), [[1, 2, 150, 300], [2, 3, 33.33, 99.99]]);
    assert.equal(r.json.total, 399.99);
  });

  test('PATCH de cantidad → 200 con detalle y total actualizados', async () => {
    const r = await e.llamar(4, 'PATCH', '/oportunidades/200/productos/2000', { cuerpo: { cantidad: 5, precio_unitario: 1 } });
    assert.equal(r.status, 200);
    const linea = r.json.productos.find((l) => l.id === 2000);
    assert.deepEqual([linea.cantidad, linea.precio_unitario, linea.subtotal], [5, 150, 750]);
    assert.equal(r.json.total, 849.99);
  });

  test('DELETE → 204 sin cuerpo y el total baja', async () => {
    const r = await e.llamar(4, 'DELETE', '/oportunidades/200/productos/2001');
    assert.equal(r.status, 204);
    assert.equal(r.texto, '');
    const d = await e.llamar(4, 'GET', '/oportunidades/200');
    assert.deepEqual(d.json.productos.map((l) => l.id), [2000]);
    assert.equal(d.json.total, 750);
  });

  test('una línea de otra oportunidad o inexistente → 404 sin cambios', async () => {
    const antes = copia(e.bd);
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/200/productos/500', { cuerpo: { cantidad: 2 } })).status, 404);
    assert.equal((await e.llamar(4, 'DELETE', '/oportunidades/200/productos/500')).status, 404);
    assert.equal((await e.llamar(4, 'DELETE', '/oportunidades/200/productos/9999')).status, 404);
    assert.equal((await e.llamar(4, 'DELETE', '/oportunidades/200/productos/abc')).status, 404);
    assert.deepEqual(copia(e.bd), antes);
  });
});

describe('B4-11 título', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('abierta → 200 con el título recortado; sin titulo → 400; vacío o largo → 422', async () => {
    const r = await e.llamar(4, 'PATCH', '/oportunidades/100', { cuerpo: { titulo: '  Pedido ampliado ', etapa: 'ganada' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.titulo, 'Pedido ampliado');
    assert.equal(r.json.etapa, 'negociacion', 'el PATCH de título no cambia la etapa');
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/100', { cuerpo: { otro: 1 } })).status, 400);
    for (const titulo of ['', '   ', 'x'.repeat(151), 5]) {
      const v = await e.llamar(4, 'PATCH', '/oportunidades/100', { cuerpo: { titulo } });
      assert.equal(v.status, 422, JSON.stringify(titulo));
      assert.deepEqual(Object.keys(v.json.errores), ['titulo']);
    }
  });
});

describe('B4-12 y B4-13 transiciones', () => {
  let e;
  before(async () => {
    e = await entorno((bd) => bd.oportunidades.push({ id: 300, cliente_id: 10, vendedor_id: 4, titulo: 'Embudo', etapa: 'prospecto', motivo_perdida: null, fecha_cierre: null }));
  });
  after(() => e.cerrar());

  test('B4-13: prospecto → propuesta y → ganada → 422 errores.etapa sin cambios', async () => {
    const antes = copia(e.bd);
    for (const etapa of ['propuesta', 'ganada', 'negociacion']) {
      const r = await e.llamar(4, 'PATCH', '/oportunidades/300/etapa', { cuerpo: { etapa } });
      assert.equal(r.status, 422, etapa);
      assert.deepEqual(Object.keys(r.json.errores), ['etapa']);
    }
    assert.deepEqual(copia(e.bd), antes);
  });

  test('etapa desconocida o ausente → 422; misma etapa → 409', async () => {
    for (const cuerpo of [{ etapa: 'cancelado' }, { etapa: 'GANADA' }, {}, { etapa: null }]) {
      const r = await e.llamar(4, 'PATCH', '/oportunidades/300/etapa', { cuerpo });
      assert.equal(r.status, 422, JSON.stringify(cuerpo));
      assert.deepEqual(Object.keys(r.json.errores), ['etapa']);
    }
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/300/etapa', { cuerpo: { etapa: 'prospecto' } })).status, 409);
    assert.equal(historialDe(e.bd, 300).length, 0);
  });

  test('B4-12: avanzar y retroceder una etapa → 200 y un evento de historial por cambio', async () => {
    const pasos = ['calificado', 'propuesta', 'calificado', 'propuesta', 'negociacion'];
    for (const [i, etapa] of pasos.entries()) {
      const r = await e.llamar(4, 'PATCH', '/oportunidades/300/etapa', { cuerpo: { etapa, motivo_perdida: 'ignorado' } });
      assert.equal(r.status, 200, etapa);
      assert.equal(r.json.etapa, etapa);
      assert.equal(r.json.motivo_perdida, null);
      assert.equal(r.json.fecha_cierre, null);
      assert.equal(historialDe(e.bd, 300).length, i + 1);
    }
    const anteriores = historialDe(e.bd, 300).map((h) => `${h.etapa_anterior}→${h.etapa_nueva}`);
    assert.deepEqual(anteriores, ['prospecto→calificado', 'calificado→propuesta', 'propuesta→calificado', 'calificado→propuesta', 'propuesta→negociacion']);
    assert.equal(opp(e.bd, 300).etapa, 'negociacion');
  });
});

describe('B4-14 cerrar como perdida', () => {
  let e;
  before(async () => {
    e = await entorno((bd) => bd.oportunidades.push({ id: 310, cliente_id: 10, vendedor_id: 4, titulo: 'Se pierde', etapa: 'calificado', motivo_perdida: null, fecha_cierre: null }));
  });
  after(() => e.cerrar());

  test('sin motivo, vacío, solo espacios, no texto o > 255 → 422 errores.motivo_perdida sin cambios', async () => {
    const antes = copia(e.bd);
    for (const motivo_perdida of [undefined, '', '   ', 7, 'x'.repeat(256)]) {
      const r = await e.llamar(4, 'PATCH', '/oportunidades/310/etapa', { cuerpo: { etapa: 'perdida', motivo_perdida } });
      assert.equal(r.status, 422, JSON.stringify(motivo_perdida));
      assert.deepEqual(Object.keys(r.json.errores), ['motivo_perdida']);
    }
    assert.deepEqual(copia(e.bd), antes);
  });

  test('motivo válido → 200, cerrada con fecha de cierre, motivo recortado e historial', async () => {
    const r = await e.llamar(4, 'PATCH', '/oportunidades/310/etapa', { cuerpo: { etapa: 'perdida', motivo_perdida: '  El cliente eligió otro proveedor  ' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.etapa, 'perdida');
    assert.equal(r.json.probabilidad, 0);
    assert.equal(r.json.motivo_perdida, 'El cliente eligió otro proveedor');
    assert.match(r.json.fecha_cierre, ISO_UTC);
    assert.deepEqual(r.json.historial.at(-1).etapa_anterior, 'calificado');
    assert.deepEqual(r.json.historial.at(-1).etapa_nueva, 'perdida');
  });

  test('255 caracteres exactos se aceptan, contados como caracteres (un emoji cuenta uno)', async () => {
    e.bd.oportunidades.push({ id: 311, cliente_id: 10, vendedor_id: 4, titulo: 'Límite', etapa: 'prospecto', motivo_perdida: null, fecha_cierre: null });
    const r = await e.llamar(4, 'PATCH', '/oportunidades/311/etapa', { cuerpo: { etapa: 'perdida', motivo_perdida: '💄'.repeat(255) } });
    assert.equal(r.status, 200);
  });
});

describe('B4-15 a B4-18 ganar y regla de stock', () => {
  let e;
  before(async () => {
    e = await entorno((bd) => {
      bd.productos.push({ id: 10, nombre: 'Polvo compacto', precio: 90, activo: 1, stock: 5 });
      bd.productos.push({ id: 11, nombre: 'Delineador', precio: 45.5, activo: 1, stock: 2 });
      bd.productos.push({ id: 12, nombre: 'Brocha sin control', precio: 60, activo: 1, stock: null });
      bd.productos.push({ id: 13, nombre: 'Sérum', precio: 120, activo: 1, stock: 4 });
      enNegociacion(bd, 400, []); // sin productos
      enNegociacion(bd, 401, [[11, 3]]); // stock 2, pide 3
      enNegociacion(bd, 402, [[10, 3]]); // stock 5, pide 3
      enNegociacion(bd, 403, [[12, 7]]); // stock NULL
      enNegociacion(bd, 404, [[12, 2], [13, 4]]); // NULL + controlado justo
    });
  });
  after(() => e.cerrar());

  test('B4-15: ganar sin productos → 422 errores.etapa sin cambios', async () => {
    const antes = copia(e.bd);
    const r = await e.llamar(4, 'PATCH', '/oportunidades/400/etapa', { cuerpo: { etapa: 'ganada' } });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.errores), ['etapa']);
    assert.deepEqual(copia(e.bd), antes);
  });

  test('B4-16 (RP-1): stock 2 y cantidad 3 → 409; sigue en negociación, stock 2, historial igual', async () => {
    const antes = copia(e.bd);
    const r = await e.llamar(4, 'PATCH', '/oportunidades/401/etapa', { cuerpo: { etapa: 'ganada' } });
    assert.equal(r.status, 409);
    assert.deepEqual(Object.keys(r.json), ['error']);
    assert.match(r.json.error, /Stock insuficiente.*Delineador/);
    assert.equal(opp(e.bd, 401).etapa, 'negociacion');
    assert.equal(prod(e.bd, 11).stock, 2);
    assert.deepEqual(copia(e.bd), antes);
  });

  test('B4-17 (RP-2): stock 5 y cantidad 3 → 200; stock 2 y exactamente un evento nuevo', async () => {
    const eventos = historialDe(e.bd, 402).length;
    const r = await e.llamar(4, 'PATCH', '/oportunidades/402/etapa', { cuerpo: { etapa: 'ganada', motivo_perdida: 'ignorado' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.etapa, 'ganada');
    assert.equal(r.json.probabilidad, 100);
    assert.equal(r.json.motivo_perdida, null);
    assert.match(r.json.fecha_cierre, ISO_UTC);
    assert.equal(prod(e.bd, 10).stock, 2);
    assert.equal(historialDe(e.bd, 402).length, eventos + 1);
    assert.equal(r.json.historial.at(-1).etapa_nueva, 'ganada');
  });

  test('B4-18 (RP-3): producto con stock NULL → 200 y sigue NULL', async () => {
    const r = await e.llamar(4, 'PATCH', '/oportunidades/403/etapa', { cuerpo: { etapa: 'ganada' } });
    assert.equal(r.status, 200);
    assert.equal(prod(e.bd, 12).stock, null);
    assert.ok(!e.bd.llamadas.some((l) => /^UPDATE productos/.test(l.sql) && l.params[1] === 12), 'no intenta descontar un producto sin control');
  });

  test('RP-3 mixto: NULL + controlado con stock justo → solo descuenta el controlado (queda en 0)', async () => {
    const r = await e.llamar(4, 'PATCH', '/oportunidades/404/etapa', { cuerpo: { etapa: 'ganada' } });
    assert.equal(r.status, 200);
    assert.equal(prod(e.bd, 12).stock, null);
    assert.equal(prod(e.bd, 13).stock, 0);
  });

  test('orden de bloqueos: vendedor → oportunidad → líneas → productos en orden ascendente', async () => {
    e.bd.productos.push({ id: 14, nombre: 'Primer', precio: 70, activo: 1, stock: 9 });
    enNegociacion(e.bd, 405, [[14, 1], [10, 1], [12, 1]]);
    e.bd.llamadas.length = 0;
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/405/etapa', { cuerpo: { etapa: 'ganada' } })).status, 200);
    const tx = e.bd.llamadas.filter((l) => l.transaccion);
    assert.match(tx[0].sql, /^SELECT id FROM users WHERE id = \? AND rol = 'vendedor' AND activo = 1 FOR UPDATE$/);
    assert.match(tx[1].sql, /FROM oportunidades WHERE id = \? AND vendedor_id = \? FOR UPDATE$/);
    assert.match(tx[2].sql, /FROM oportunidad_productos WHERE oportunidad_id = \? ORDER BY producto_id FOR UPDATE$/);
    const bloqueados = tx.filter((l) => /FROM productos WHERE id = \? FOR UPDATE$/.test(l.sql)).map((l) => l.params[0]);
    assert.deepEqual(bloqueados, [10, 12, 14]);
    const iUltimoBloqueo = tx.findLastIndex((l) => /FROM productos WHERE id = \? FOR UPDATE$/.test(l.sql));
    const iPrimerDescuento = tx.findIndex((l) => /^UPDATE productos/.test(l.sql));
    assert.ok(iUltimoBloqueo < iPrimerDescuento, 'verifica todo el stock antes de descontar');
  });
});

describe('B4-19 oportunidades cerradas', () => {
  let e;
  before(async () => {
    e = await entorno((bd) => {
      bd.oportunidades.push({ id: 410, cliente_id: 10, vendedor_id: 4, titulo: 'Perdida', etapa: 'perdida', motivo_perdida: 'Precio', fecha_cierre: new Date('2026-10-20T12:00:00Z') });
      bd.oportunidad_productos.push({ id: 4100, oportunidad_id: 410, producto_id: 1, cantidad: 1, precio_unitario: 150 });
    });
  });
  after(() => e.cerrar());

  test('ganada o perdida: título, etapa y líneas → 409 sin cambios', async () => {
    const antes = copia(e.bd);
    for (const [id, linea] of [[102, 501], [410, 4100]]) {
      const intentos = [
        ['PATCH', `/oportunidades/${id}`, { titulo: 'Cambio' }],
        ['PATCH', `/oportunidades/${id}/etapa`, { etapa: 'negociacion' }],
        ['PATCH', `/oportunidades/${id}/etapa`, { etapa: 'ganada' }],
        ['PATCH', `/oportunidades/${id}/etapa`, { etapa: 'perdida', motivo_perdida: 'otra vez' }],
        ['POST', `/oportunidades/${id}/productos`, { producto_id: 2, cantidad: 1 }],
        ['PATCH', `/oportunidades/${id}/productos/${linea}`, { cantidad: 2 }],
        ['DELETE', `/oportunidades/${id}/productos/${linea}`],
      ];
      for (const [m, ruta, cuerpo] of intentos) {
        const r = await e.llamar(4, m, ruta, { cuerpo });
        assert.equal(r.status, 409, `${m} ${ruta} ${JSON.stringify(cuerpo)}`);
        assert.deepEqual(Object.keys(r.json), ['error']);
      }
    }
    assert.deepEqual(copia(e.bd), antes);
  });

  test('cerrada con un cuerpo no válido → 409 (no 422): el estado cerrado se comprueba antes que los campos (CA-10)', async () => {
    const antes = copia(e.bd);
    const intentos = [
      ['PATCH', '/oportunidades/102', { titulo: '' }],
      ['PATCH', '/oportunidades/102/etapa', { etapa: 'perdida' }],
      ['PATCH', '/oportunidades/102/etapa', { etapa: 'cancelado' }],
      ['POST', '/oportunidades/102/productos', { producto_id: 2, cantidad: 0 }],
      ['PATCH', '/oportunidades/102/productos/501', { cantidad: 1000 }],
    ];
    for (const [m, ruta, cuerpo] of intentos) assert.equal((await e.llamar(4, m, ruta, { cuerpo })).status, 409, `${m} ${ruta} ${JSON.stringify(cuerpo)}`);
    assert.deepEqual(copia(e.bd), antes);
  });

  test('ajena con un cuerpo no válido → 404 (no 422): no revela nada de la oportunidad (R2)', async () => {
    const intentos = [
      ['PATCH', '/oportunidades/101', { titulo: '' }],
      ['PATCH', '/oportunidades/101/etapa', { etapa: 'perdida' }],
      ['POST', '/oportunidades/101/productos', { producto_id: 'x', cantidad: 0 }],
      ['PATCH', '/oportunidades/101/productos/502', { cantidad: 0 }],
    ];
    for (const [m, ruta, cuerpo] of intentos) assert.equal((await e.llamar(4, m, ruta, { cuerpo })).status, 404, `${m} ${ruta}`);
  });

  test('una línea de un producto desactivado después de agregarla puede editarse y ganarse', async () => {
    enNegociacion(e.bd, 411, [[1, 1]]);
    prod(e.bd, 1).activo = 0;
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/411/productos/4110', { cuerpo: { cantidad: 2 } })).status, 200);
    assert.equal((await e.llamar(4, 'PATCH', '/oportunidades/411/etapa', { cuerpo: { etapa: 'ganada' } })).status, 200);
    prod(e.bd, 1).activo = 1;
  });
});

describe('S8 y A2: vendedor bloqueado al inicio de cada escritura', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('cuenta desactivada entre el middleware y la transacción → 401 sin crear, ganar ni editar', async () => {
    enNegociacion(e.bd, 600, [[3, 1]]);
    const antes = copia(e.bd);
    const desactivar = (sql) => { if (/FROM users WHERE id = \?.*FOR UPDATE/.test(sql)) e.bd.users.find((u) => u.id === 4).activo = 0; };
    for (const [m, ruta, cuerpo] of [
      ['POST', '/oportunidades', { cliente_id: 10, titulo: 'X' }],
      ['PATCH', '/oportunidades/600/etapa', { etapa: 'ganada' }],
      ['PATCH', '/oportunidades/600', { titulo: 'Y' }],
      ['POST', '/oportunidades/600/productos', { producto_id: 2, cantidad: 1 }],
      ['PATCH', '/oportunidades/600/productos/6000', { cantidad: 2 }],
      ['DELETE', '/oportunidades/600/productos/6000'],
    ]) {
      e.bd.ganchos.antes = desactivar;
      const r = await e.llamar(4, m, ruta, { cuerpo });
      e.bd.ganchos.antes = null;
      e.bd.users.find((u) => u.id === 4).activo = 1;
      assert.equal(r.status, 401, `${m} ${ruta}`);
    }
    assert.deepEqual(copia(e.bd), antes);
  });

  test('crear una oportunidad bloquea vendedor → cliente (mismo orden que tomar clientes en B3)', async () => {
    e.bd.llamadas.length = 0;
    assert.equal((await e.llamar(4, 'POST', '/oportunidades', { cuerpo: { cliente_id: 10, titulo: 'Orden' } })).status, 201);
    const tx = e.bd.llamadas.filter((l) => l.transaccion).map((l) => l.sql);
    assert.match(tx[0], /FROM users WHERE id = \?.*FOR UPDATE$/);
    assert.match(tx[1], /FROM clientes WHERE id = \? AND vendedor_id = \? FOR UPDATE$/);
  });

  test('la toma de un cliente y la creación de una oportunidad sobre él a la vez terminan sin interbloqueo', async () => {
    e.bd.clientes.push({ id: 60, vendedor_id: null, nombre: 'Disponible para B4', nit: null, telefono: '23236060', correo: null });
    const rs = await Promise.race([
      Promise.all([
        e.llamar(4, 'POST', '/clientes/60/tomar'),
        e.llamar(4, 'POST', '/oportunidades', { cuerpo: { cliente_id: 60, titulo: 'Carrera' } }),
      ]),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('interbloqueo')), 5000)),
    ]);
    assert.equal(rs[0].status, 200);
    assert.ok([201, 422].includes(rs[1].status), String(rs[1].status));
  });
});

describe('B4-21 historial en el detalle', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('ordenado, con etapas anterior y nueva, usuario (nombre) y fecha ISO UTC, como el ejemplo del enunciado', async () => {
    const r = await e.llamar(4, 'GET', '/oportunidades/100');
    assert.deepEqual(r.json.historial, [
      { etapa_anterior: null, etapa_nueva: 'prospecto', usuario: 'Vendedora Uno', fecha: '2026-10-01T15:00:00.000Z' },
      { etapa_anterior: 'prospecto', etapa_nueva: 'calificado', usuario: 'Vendedora Uno', fecha: '2026-10-03T15:00:00.000Z' },
      { etapa_anterior: 'calificado', etapa_nueva: 'propuesta', usuario: 'Vendedora Uno', fecha: '2026-10-05T15:00:00.000Z' },
      { etapa_anterior: 'propuesta', etapa_nueva: 'negociacion', usuario: 'Vendedora Uno', fecha: '2026-10-07T15:00:00.000Z' },
    ]);
    assert.doesNotMatch(r.texto, /password|correo|email/);
  });
});
