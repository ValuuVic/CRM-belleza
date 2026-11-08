// B5-01 a B5-15: actividades comerciales con la base simulada (sin MySQL).
// Datos ficticios (test/ayuda/consultas-actividades.js):
//   vendedora 4 (clientes 10 y 11): 700 pendiente vencida (2020) · 701 pendiente futura (2099) ·
//     702 pendiente sin fecha · 703 completada con fecha pasada.
//   vendedor 5 (cliente 12): 704 privada. Cliente 13 disponible: 705 (no la ve nadie).
// Las pruebas reales con MySQL y VerificacionSeeder están en integracion-b5.test.js (pendientes de I1).
import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'secreto_de_prueba_b5_actividades_no_usar_0123';

const { crearApp } = await import('../src/app.js');
const { firmarToken } = await import('../src/config/jwt.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, levantar, pedir } = await import('./ayuda/bd-simulada.js');
const { serializarActividad, validarActividad, LONGITUD_DESCRIPCION } = await import('../src/servicios/actividades.js');
const { SQL_B5 } = await import('./ayuda/consultas-actividades.js');

after(() => poolReal.end()); // el pool real se crea al importar; se cierra sin haber conectado

async function entorno(preparar = () => {}) {
  const bd = crearBdSimulada();
  preparar(bd);
  const api = await levantar(crearApp({ origenPermitido: 'http://127.0.0.1:5500', pool: bd.pool }));
  const llamar = (vendedor, metodo, ruta, { cuerpo, crudo, token = true, cabeceras = {} } = {}) => {
    const headers = { ...cabeceras };
    if (token === true) headers.Authorization = `Bearer ${firmarToken(vendedor)}`;
    else if (typeof token === 'string') headers.Authorization = token;
    let body;
    if (crudo !== undefined) { body = crudo; headers['Content-Type'] = 'application/json'; }
    else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); headers['Content-Type'] = 'application/json'; }
    return pedir(`${api.url}/api${ruta}`, { method: metodo, headers, body });
  };
  return { bd, llamar, cerrar: () => api.servidor.close() };
}

const CLAVES = ['id', 'cliente', 'tipo', 'descripcion', 'vence_en', 'completada', 'vencida'];
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const act = (bd, id) => bd.actividades.find((a) => a.id === id);
const copia = (bd) => JSON.stringify(bd.actividades);
const ids = (lista) => lista.map((a) => a.id);
const valida = { tipo: 'llamada', descripcion: 'Confirmar el pedido de maquillaje', vence_en: '2026-12-01T10:00:00-06:00' };

function comprobarForma(a) {
  assert.deepEqual(Object.keys(a).sort(), [...CLAVES].sort());
  assert.deepEqual(Object.keys(a.cliente).sort(), ['id', 'nombre']);
  assert.ok(['llamada', 'reunion', 'tarea'].includes(a.tipo));
  assert.equal(typeof a.completada, 'boolean');
  assert.equal(typeof a.vencida, 'boolean');
  assert.ok(a.vence_en === null || ISO_UTC.test(a.vence_en), `vence_en ISO UTC: ${a.vence_en}`);
}

// ---------------------------------------------------------------------------

describe('B5-01 listar actividades propias', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('200 solo con actividades de clientes que están HOY en su cartera, en la forma de §8.4', async () => {
    const r = await e.llamar(4, 'GET', '/actividades');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
    // Pendientes primero (vencimiento ascendente, sin fecha al final) y después las completadas.
    assert.deepEqual(ids(r.json), [700, 701, 702, 703]);
    r.json.forEach(comprobarForma);
    assert.deepEqual(r.json[0], {
      id: 700, cliente: { id: 10, nombre: 'Tienda Beta' }, tipo: 'llamada',
      descripcion: 'Llamar para confirmar el pedido de bases', vence_en: '2020-01-15T15:00:00.000Z',
      completada: false, vencida: true,
    });
  });

  test('no incluye actividades de otro vendedor ni de clientes disponibles; no expone vendedor_id', async () => {
    const r = await e.llamar(4, 'GET', '/actividades');
    assert.ok(!ids(r.json).includes(704));
    assert.ok(!ids(r.json).includes(705)); // registrada por la vendedora 4, pero el cliente ya no es suyo
    assert.ok(!/vendedor_id/.test(r.texto));
    const otro = await e.llamar(5, 'GET', '/actividades');
    assert.deepEqual(ids(otro.json), [704]);
  });

  test('la consulta filtra por el vendedor del TOKEN con parámetros (S3, S5)', async () => {
    e.bd.llamadas.length = 0;
    await e.llamar(4, 'GET', '/actividades?estado=pendiente', { cabeceras: { 'X-Vendedor-Id': '5' } });
    const consulta = e.bd.llamadas.find((l) => l.sql === SQL_B5.listarPorEstado);
    assert.deepEqual(consulta.params, [4, 0]);
  });
});

describe('B5-02 y B5-03 filtros de estado', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('?estado=pendiente → solo completada:false', async () => {
    const r = await e.llamar(4, 'GET', '/actividades?estado=pendiente');
    assert.equal(r.status, 200);
    assert.deepEqual(ids(r.json), [700, 701, 702]);
    assert.ok(r.json.every((a) => a.completada === false));
  });

  test('?estado=completada → solo completada:true y ninguna vencida', async () => {
    const r = await e.llamar(4, 'GET', '/actividades?estado=completada');
    assert.equal(r.status, 200);
    assert.deepEqual(ids(r.json), [703]);
    assert.ok(r.json.every((a) => a.completada === true && a.vencida === false));
  });

  test('un vendedor sin actividades recibe un array vacío', async () => {
    const r = await e.llamar(5, 'GET', '/actividades?estado=completada');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, []);
  });
});

describe('B5-04 filtros y parámetros no admitidos (D6)', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  for (const consulta of ['estado=otra', 'estado=', 'estado=PENDIENTE', 'estado=cancelado', 'x=1', 'estado=pendiente&estado=completada', 'estado[]=pendiente']) {
    test(`?${consulta} → 400 { error } sin repetir lo enviado`, async () => {
      const r = await e.llamar(4, 'GET', `/actividades?${consulta}`);
      assert.equal(r.status, 400);
      assert.deepEqual(Object.keys(r.json), ['error']);
      assert.ok(!r.json.error.includes('otra') && !r.json.error.includes('cancelado') && !r.json.error.includes('x=1'));
    });
  }
});

describe('B5-05 crear llamada, reunión o tarea', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  for (const tipo of ['llamada', 'reunion', 'tarea']) {
    test(`tipo ${tipo} → 201 asociada al cliente`, async () => {
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { ...valida, tipo } });
      assert.equal(r.status, 201);
      comprobarForma(r.json);
      assert.equal(r.json.tipo, tipo);
      assert.deepEqual(r.json.cliente, { id: 10, nombre: 'Tienda Beta' });
      assert.equal(r.json.completada, false);
      assert.equal(act(e.bd, r.json.id).cliente_id, 10);
    });
  }

  test('el vendedor sale del token: vendedor_id, cliente_id, completada e id del cuerpo se ignoran (D5)', async () => {
    const r = await e.llamar(4, 'POST', '/clientes/11/actividades', {
      cuerpo: { ...valida, vendedor_id: 5, cliente_id: 12, completada: true, id: 1, vencida: true },
    });
    assert.equal(r.status, 201);
    const fila = act(e.bd, r.json.id);
    assert.equal(fila.vendedor_id, 4);
    assert.equal(fila.cliente_id, 11);
    assert.equal(fila.completada, 0);
    assert.notEqual(r.json.id, 1);
    assert.ok(!('vendedor_id' in r.json));
  });

  test('sin vence_en o con null → se guarda NULL y no está vencida', async () => {
    for (const cuerpo of [{ tipo: 'tarea', descripcion: 'Sin fecha' }, { tipo: 'tarea', descripcion: 'Fecha nula', vence_en: null }]) {
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo });
      assert.equal(r.status, 201);
      assert.equal(r.json.vence_en, null);
      assert.equal(r.json.vencida, false);
      assert.equal(act(e.bd, r.json.id).vence_en, null);
    }
  });

  test('una fecha pasada se acepta y la actividad nace vencida', async () => {
    const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { ...valida, vence_en: '2021-05-01T08:00:00-06:00' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.vencida, true);
  });

  test('la descripción se guarda sin los espacios de los extremos', async () => {
    const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { ...valida, descripcion: '   Llevar muestras  ' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.descripcion, 'Llevar muestras');
  });

  test('aparece después en GET /actividades', async () => {
    const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: valida });
    const lista = await e.llamar(4, 'GET', '/actividades?estado=pendiente');
    assert.ok(ids(lista.json).includes(r.json.id));
  });
});

describe('B5-06 y B5-07 validación de tipo y descripción', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  const casosTipo = { visita: 'visita', ausente: undefined, numero: 1, mayusculas: 'Llamada', con_tilde: 'reunión', nulo: null };
  for (const [nombre, tipo] of Object.entries(casosTipo)) {
    test(`tipo ${nombre} → 422 errores.tipo y sin crear nada`, async () => {
      const antes = e.bd.actividades.length;
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { ...valida, tipo } });
      assert.equal(r.status, 422);
      assert.ok(r.json.errores.tipo);
      assert.equal(e.bd.actividades.length, antes);
    });
  }

  const casosDescripcion = { ausente: undefined, vacia: '', espacios: '    \t ', larga: 'a'.repeat(501), numero: 5, nula: null };
  for (const [nombre, descripcion] of Object.entries(casosDescripcion)) {
    test(`descripción ${nombre} → 422 errores.descripcion`, async () => {
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { ...valida, descripcion } });
      assert.equal(r.status, 422);
      assert.ok(r.json.errores.descripcion);
    });
  }

  test('varios campos inválidos → todos los errores a la vez, en { errores }', async () => {
    const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { tipo: 'visita', descripcion: '', vence_en: '2026-12-01T10:00' } });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json), ['errores']);
    assert.deepEqual(Object.keys(r.json.errores).sort(), ['descripcion', 'tipo', 'vence_en']);
  });
});

describe('B5-07 límite de 500 caracteres con Unicode (VARCHAR(500) utf8mb4)', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  // MySQL cuenta caracteres (puntos de código) en VARCHAR utf8mb4; String#length cuenta unidades UTF-16.
  const casos = [
    ['500 letras ASCII', 'a'.repeat(500), 201],
    ['501 letras ASCII', 'a'.repeat(501), 422],
    ['500 emojis (1000 unidades UTF-16)', '💄'.repeat(500), 201],
    ['501 emojis', '💄'.repeat(501), 422],
    ['500 letras con tilde precompuestas', 'é'.repeat(500), 201],
    ['250 «e» + acento combinado = 500 caracteres', 'é'.repeat(250), 201],
    ['251 «e» + acento combinado = 502 caracteres', 'é'.repeat(251), 422],
    ['100 emojis con ZWJ (5 caracteres cada uno) = 500', '👩‍👩‍👧'.repeat(100), 201],
    ['100 emojis con ZWJ + 1 = 501', `${'👩‍👩‍👧'.repeat(100)}x`, 422],
    ['500 caracteres con espacios en los extremos', `  ${'ñ'.repeat(500)}  `, 201],
  ];
  for (const [nombre, descripcion, esperado] of casos) {
    test(`${nombre} → ${esperado}`, async () => {
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { tipo: 'tarea', descripcion } });
      assert.equal(r.status, esperado, JSON.stringify(r.json));
      if (esperado === 201) {
        assert.equal(r.json.descripcion, descripcion.trim()); // sin cortes ni sustituciones
        assert.ok([...r.json.descripcion].length <= LONGITUD_DESCRIPCION);
      } else {
        assert.ok(r.json.errores.descripcion.includes('500'));
      }
    });
  }
});

describe('B5-08 y B5-09 fechas con zona horaria', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  const validas = {
    '2026-12-01T10:00:00-06:00': '2026-12-01T16:00:00.000Z',
    '2026-12-01T16:00:00Z': '2026-12-01T16:00:00.000Z',
    '2026-12-01T16:00:00+00:00': '2026-12-01T16:00:00.000Z',
    '2026-12-01T10:00-06:00': '2026-12-01T16:00:00.000Z',
    '2026-12-31T22:30:00-06:00': '2027-01-01T04:30:00.000Z', // cambia de día y de año en UTC
    '9999-12-31T17:59:59-06:00': '9999-12-31T23:59:59.000Z', // límites de DATETIME en UTC
    '1000-01-01T00:00:00Z': '1000-01-01T00:00:00.000Z',
  };
  for (const [entrada, salida] of Object.entries(validas)) {
    test(`${entrada} → ${salida}`, async () => {
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { ...valida, vence_en: entrada } });
      assert.equal(r.status, 201);
      assert.equal(r.json.vence_en, salida);
      assert.equal(act(e.bd, r.json.id).vence_en.toISOString(), salida); // se guarda el instante UTC
    });
  }

  const invalidas = ['2026-12-01T10:00', '2026-12-01T10:00:00', '2026-12-01', '2026-02-31T10:00:00Z', '2026-12-01T25:00:00Z',
    '01/12/2026 10:00', '', '   ', 1764604800000, true, {}, [],
    '9999-12-31T23:00:00-06:00', '1000-01-01T00:00:00+01:00', '0999-12-31T23:00:00Z']; // fuera de DATETIME en UTC
  for (const vence_en of invalidas) {
    test(`vence_en ${JSON.stringify(vence_en)} → 422 errores.vence_en sin crear la actividad`, async () => {
      const antes = copia(e.bd);
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { ...valida, vence_en } });
      assert.equal(r.status, 422);
      assert.deepEqual(Object.keys(r.json.errores), ['vence_en']);
      assert.equal(copia(e.bd), antes);
    });
  }
});

describe('B5-10 clientes ajenos (404)', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  const casos = { 'de otro vendedor': 12, disponible: 13, inexistente: 999, 'no numérico': 'abc', cero: 0, negativo: -1, decimal: '1.5' };
  for (const [nombre, id] of Object.entries(casos)) {
    test(`cliente ${nombre} → 404 con el mismo mensaje y sin crear nada`, async () => {
      const antes = copia(e.bd);
      const r = await e.llamar(4, 'POST', `/clientes/${id}/actividades`, { cuerpo: valida });
      assert.equal(r.status, 404);
      assert.deepEqual(r.json, { error: 'Cliente no encontrado' });
      assert.equal(copia(e.bd), antes);
    });
  }

  test('cliente ajeno con cuerpo inválido → 404 antes que 422 (D10)', async () => {
    const r = await e.llamar(4, 'POST', '/clientes/12/actividades', { cuerpo: { tipo: 'visita' } });
    assert.equal(r.status, 404);
    assert.ok(!r.texto.includes('Cliente de Otro Vendedor'));
  });

  test('cuerpo no interpretable → 400; parámetro de consulta → 400', async () => {
    assert.equal((await e.llamar(4, 'POST', '/clientes/10/actividades', { crudo: '{"tipo":' })).status, 400);
    assert.equal((await e.llamar(4, 'POST', '/clientes/10/actividades', { crudo: '[]' })).status, 400);
    assert.equal((await e.llamar(4, 'POST', '/clientes/10/actividades')).status, 400);
    assert.equal((await e.llamar(4, 'POST', '/clientes/10/actividades?x=1', { cuerpo: valida })).status, 400);
  });
});

describe('B5-11 y B5-12 marcar como completada', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  test('{ completada: true } → 200, queda completada y deja de estar vencida', async () => {
    const r = await e.llamar(4, 'PATCH', '/actividades/700', { cuerpo: { completada: true } });
    assert.equal(r.status, 200);
    comprobarForma(r.json);
    assert.equal(r.json.id, 700);
    assert.equal(r.json.completada, true);
    assert.equal(r.json.vencida, false);
    assert.equal(act(e.bd, 700).completada, 1);
  });

  test('repetir el mismo valor → 200 sin error (decisión de B5)', async () => {
    const r = await e.llamar(4, 'PATCH', '/actividades/700', { cuerpo: { completada: true } });
    assert.equal(r.status, 200);
    assert.equal(r.json.completada, true);
  });

  test('{ completada: false } reabre la actividad y vuelve a estar vencida', async () => {
    const r = await e.llamar(4, 'PATCH', '/actividades/700', { cuerpo: { completada: false } });
    assert.equal(r.status, 200);
    assert.equal(r.json.completada, false);
    assert.equal(r.json.vencida, true);
  });

  test('solo cambia completada: tipo, descripcion, vence_en y cliente del cuerpo se ignoran', async () => {
    const antes = { ...act(e.bd, 701) };
    const r = await e.llamar(4, 'PATCH', '/actividades/701', {
      cuerpo: { completada: true, tipo: 'tarea', descripcion: 'cambiada', vence_en: '2020-01-01T00:00:00Z', cliente_id: 12 },
    });
    assert.equal(r.status, 200);
    assert.deepEqual({ ...act(e.bd, 701), completada: antes.completada }, antes);
  });

  for (const valor of ['si', 'true', 'false', 1, 0, null, {}, []]) {
    test(`completada ${JSON.stringify(valor)} → 422 errores.completada`, async () => {
      const antes = copia(e.bd);
      const r = await e.llamar(4, 'PATCH', '/actividades/702', { cuerpo: { completada: valor } });
      assert.equal(r.status, 422);
      assert.deepEqual(Object.keys(r.json.errores), ['completada']);
      assert.equal(copia(e.bd), antes);
    });
  }

  test('sin el campo completada → 400 (D16); sin cuerpo → 400', async () => {
    assert.equal((await e.llamar(4, 'PATCH', '/actividades/702', { cuerpo: {} })).status, 400);
    assert.equal((await e.llamar(4, 'PATCH', '/actividades/702', { cuerpo: { tipo: 'tarea' } })).status, 400);
    assert.equal((await e.llamar(4, 'PATCH', '/actividades/702')).status, 400);
    assert.equal((await e.llamar(4, 'PATCH', '/actividades/702', { crudo: 'no-json' })).status, 400);
  });
});

describe('B5-13 actividades ajenas (404)', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  const casos = { 'de otro vendedor': 704, 'de cliente disponible': 705, inexistente: 99999, 'no numérico': 'abc', cero: 0 };
  for (const [nombre, id] of Object.entries(casos)) {
    test(`actividad ${nombre} → 404 y sin cambios`, async () => {
      const antes = copia(e.bd);
      const r = await e.llamar(4, 'PATCH', `/actividades/${id}`, { cuerpo: { completada: true } });
      assert.equal(r.status, 404);
      assert.deepEqual(r.json, { error: 'Actividad no encontrada' });
      assert.equal(copia(e.bd), antes);
    });
  }

  test('ajena con valor inválido → 404 antes que 422 (D10)', async () => {
    const r = await e.llamar(4, 'PATCH', '/actividades/704', { cuerpo: { completada: 'si' } });
    assert.equal(r.status, 404);
  });
});

describe('B5-14 actividades vencidas con reloj controlado', () => {
  const instante = Date.parse('2026-11-08T12:00:00.000Z');
  const fila = (extra) => ({ id: 1, cliente_id: 10, cliente_nombre: 'Tienda Beta', tipo: 'tarea', descripcion: 'x', completada: 0, ...extra });

  test('pendiente con vencimiento anterior al instante → vencida', () => {
    assert.equal(serializarActividad(fila({ vence_en: new Date(instante - 1) }), instante).vencida, true);
  });
  test('vencimiento igual al instante → todavía no vencida (debe ser anterior)', () => {
    assert.equal(serializarActividad(fila({ vence_en: new Date(instante) }), instante).vencida, false);
  });
  test('vencimiento posterior → no vencida', () => {
    assert.equal(serializarActividad(fila({ vence_en: new Date(instante + 1000) }), instante).vencida, false);
  });
  test('completada con fecha pasada → nunca vencida', () => {
    assert.equal(serializarActividad(fila({ completada: 1, vence_en: new Date(instante - 86400000) }), instante).vencida, false);
  });
  test('sin vencimiento → nunca vencida', () => {
    assert.equal(serializarActividad(fila({ vence_en: null }), instante).vencida, false);
  });

  test('por HTTP, vencida depende del reloj del servidor (Date simulado con mock.timers)', async () => {
    const e = await entorno();
    try {
      mock.timers.enable({ apis: ['Date'], now: Date.parse('2099-03-01T16:00:00.000Z') }); // vence 701
      let r = await e.llamar(4, 'GET', '/actividades?estado=pendiente');
      assert.equal(r.json.find((a) => a.id === 701).vencida, false); // igual al instante
      mock.timers.setTime(Date.parse('2099-03-01T16:00:00.001Z'));
      r = await e.llamar(4, 'GET', '/actividades?estado=pendiente');
      assert.equal(r.json.find((a) => a.id === 701).vencida, true);
      assert.equal(r.json.find((a) => a.id === 702).vencida, false); // sin fecha
    } finally {
      mock.timers.reset();
      e.cerrar();
    }
  });
});

describe('B5-15 reasignación de clientes desde el panel', () => {
  test('Valeria deja de ver y modificar las actividades; Diego las ve, sin duplicarlas ni modificarlas', async () => {
    const e = await entorno();
    try {
      const antes = copia(e.bd);
      e.bd.clientes.find((c) => c.id === 10).vendedor_id = 5; // simula la reasignación de la Parte A

      const valeria = await e.llamar(4, 'GET', '/actividades');
      assert.deepEqual(ids(valeria.json), [701, 703]);
      const diego = await e.llamar(5, 'GET', '/actividades');
      assert.deepEqual(ids(diego.json).sort(), [700, 702, 704]);
      assert.equal(copia(e.bd), antes); // mismas filas, mismo vendedor_id de quien las registró

      assert.equal((await e.llamar(4, 'PATCH', '/actividades/700', { cuerpo: { completada: true } })).status, 404);
      assert.equal((await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: valida })).status, 404);
      assert.equal((await e.llamar(5, 'PATCH', '/actividades/700', { cuerpo: { completada: true } })).status, 200);
      assert.equal(e.bd.actividades.filter((a) => a.id === 700).length, 1);
    } finally { e.cerrar(); }
  });

  test('reasignación justo antes de bloquear el cliente al crear → 404 y sin INSERT', async () => {
    const e = await entorno((bd) => {
      bd.ganchos.antes = (sql) => {
        if (sql === 'SELECT id FROM clientes WHERE id = ? AND vendedor_id = ? FOR UPDATE') bd.clientes.find((c) => c.id === 10).vendedor_id = 5;
      };
    });
    try {
      const antes = e.bd.actividades.length;
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: valida });
      assert.equal(r.status, 404);
      assert.equal(e.bd.actividades.length, antes);
      assert.ok(!e.bd.llamadas.some((l) => l.sql.startsWith('INSERT INTO actividades')));
    } finally { e.cerrar(); }
  });

  test('cliente asignado AL vendedor entre localizar la actividad y bloquearla → 200 con la actividad, nunca null', async () => {
    const e = await entorno((bd) => {
      bd.ganchos.antes = (sql) => {
        if (sql === SQL_B5.clienteDeActividad) bd.clientes.find((c) => c.id === 12).vendedor_id = 4;
      };
    });
    try {
      const r = await e.llamar(4, 'PATCH', '/actividades/704', { cuerpo: { completada: true } });
      assert.equal(r.status, 200);
      assert.equal(r.json.id, 704);
      assert.deepEqual(r.json.cliente, { id: 12, nombre: 'Cliente de Otro Vendedor' });
      assert.equal(r.json.completada, true);
    } finally { e.cerrar(); }
  });

  test('reasignación entre localizar la actividad y bloquear su cliente → 404 y sin UPDATE', async () => {
    const e = await entorno((bd) => {
      bd.ganchos.antes = (sql) => {
        if (sql === SQL_B5.clienteDeActividad) bd.clientes.find((c) => c.id === 10).vendedor_id = 5;
      };
    });
    try {
      const r = await e.llamar(4, 'PATCH', '/actividades/700', { cuerpo: { completada: true } });
      assert.equal(r.status, 404);
      assert.equal(act(e.bd, 700).completada, 0);
      assert.ok(!e.bd.llamadas.some((l) => l.sql === SQL_B5.actualizarCompletada));
      assert.equal(e.bd.estadisticas.rollback, 1);
    } finally { e.cerrar(); }
  });
});

describe('Orden de bloqueos y concurrencia (D17 extendido a B5, S8)', () => {
  const tablaBloqueada = (sql) => /FROM (\w+)/.exec(sql)[1];

  test('PATCH bloquea vendedor → cliente → actividad, sin JOIN … FOR UPDATE', async () => {
    const e = await entorno();
    try {
      e.bd.llamadas.length = 0;
      await e.llamar(4, 'PATCH', '/actividades/701', { cuerpo: { completada: true } });
      const bloqueos = e.bd.llamadas.filter((l) => /FOR UPDATE/.test(l.sql));
      assert.deepEqual(bloqueos.map((l) => tablaBloqueada(l.sql)), ['users', 'clientes', 'actividades']);
      assert.ok(bloqueos.every((l) => !/\bJOIN\b/i.test(l.sql)));
      // La única lectura previa sin bloqueo dentro de la transacción va DESPUÉS del bloqueo del vendedor.
      const enTx = e.bd.llamadas.filter((l) => l.transaccion);
      assert.equal(enTx[0].sql, "SELECT id FROM users WHERE id = ? AND rol = 'vendedor' AND activo = 1 FOR UPDATE");
      // Tras bloquear, no hay más lecturas sin bloqueo: la respuesta sale de las filas bloqueadas
      // (una lectura consistente usaría la instantánea fijada por la búsqueda inicial).
      const sinBloqueo = enTx.filter((l) => l.sql.startsWith('SELECT') && !/FOR UPDATE/.test(l.sql));
      assert.deepEqual(sinBloqueo.map((l) => l.sql), [SQL_B5.clienteDeActividad]);
      assert.ok(!e.bd.llamadas.some((l) => l.sql === SQL_B5.leer));
    } finally { e.cerrar(); }
  });

  test('POST bloquea vendedor → cliente y luego inserta', async () => {
    const e = await entorno();
    try {
      e.bd.llamadas.length = 0;
      await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: valida });
      const bloqueos = e.bd.llamadas.filter((l) => /FOR UPDATE/.test(l.sql));
      assert.deepEqual(bloqueos.map((l) => tablaBloqueada(l.sql)), ['users', 'clientes']);
    } finally { e.cerrar(); }
  });

  test('PATCH simultáneos sobre la misma actividad: todos 200, sin bloqueos colgados', async () => {
    const e = await entorno();
    try {
      const valores = [true, false, true, true, false, true];
      const rs = await Promise.all(valores.map((completada) => e.llamar(4, 'PATCH', '/actividades/702', { cuerpo: { completada } })));
      assert.ok(rs.every((r) => r.status === 200));
      assert.equal(e.bd.bloqueos.size, 0);
      assert.equal(e.bd.estadisticas.abiertas, 0);
      assert.ok([0, 1].includes(act(e.bd, 702).completada));
    } finally { e.cerrar(); }
  });

  test('alta y PATCH simultáneos sobre el mismo cliente con una toma de cliente B3 en paralelo: sin interbloqueo', async () => {
    const e = await entorno();
    try {
      const rs = await Promise.all([
        e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: valida }),
        e.llamar(4, 'PATCH', '/actividades/700', { cuerpo: { completada: true } }),
        e.llamar(4, 'POST', '/clientes/13/tomar'),
        e.llamar(4, 'PATCH', '/clientes/10', { cuerpo: { nombre: 'Tienda Beta Renovada' } }),
        e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { tipo: 'tarea', descripcion: 'Otra' } }),
      ]);
      assert.deepEqual(rs.map((r) => r.status), [201, 200, 200, 200, 201]);
      assert.equal(e.bd.bloqueos.size, 0);
    } finally { e.cerrar(); }
  });
});

describe('Seguridad de las rutas de actividades (S1, S3, S5)', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());

  const rutas = [['GET', '/actividades'], ['POST', '/clientes/10/actividades'], ['PATCH', '/actividades/700']];
  for (const [metodo, ruta] of rutas) {
    test(`${metodo} ${ruta} sin token, con token alterado, de un supervisor o desactivado → 401`, async () => {
      const cuerpo = metodo === 'GET' ? undefined : valida;
      assert.equal((await e.llamar(4, metodo, ruta, { token: false, cuerpo })).status, 401);
      const alterado = `Bearer ${firmarToken(4).slice(0, -2)}xx`;
      assert.equal((await e.llamar(4, metodo, ruta, { token: alterado, cuerpo })).status, 401);
      assert.equal((await e.llamar(2, metodo, ruta, { cuerpo })).status, 401);
      assert.equal((await e.llamar(6, metodo, ruta, { cuerpo })).status, 401); // desactivado
    });
  }

  test('el texto del usuario nunca se concatena en el SQL: viaja en los parámetros', async () => {
    e.bd.llamadas.length = 0;
    const descripcion = "x', 5, 1, NOW(), NOW()); UPDATE actividades SET completada = 1; --";
    const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: { tipo: 'tarea', descripcion } });
    assert.equal(r.status, 201);
    assert.equal(r.json.descripcion, descripcion);
    assert.ok(e.bd.llamadas.every((l) => !l.sql.includes(descripcion) && !l.sql.includes('--') && Array.isArray(l.params ?? [])));
    assert.ok(e.bd.llamadas.some((l) => l.params?.includes(descripcion)));
  });

  test('error inesperado al insertar → 500 genérico y rollback', async () => {
    const e2 = await entorno((bd) => { bd.fallos.patron = /^INSERT INTO actividades/; bd.fallos.error = new Error('Table actividades secreto interno'); });
    const original = console.error;
    console.error = () => {};
    try {
      const antes = e2.bd.actividades.length;
      const r = await e2.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: valida });
      assert.equal(r.status, 500);
      assert.deepEqual(Object.keys(r.json), ['error']);
      assert.ok(!r.texto.includes('secreto'));
      assert.equal(e2.bd.estadisticas.rollback, 1);
      assert.equal(e2.bd.actividades.length, antes);
      assert.equal(e2.bd.bloqueos.size, 0);
    } finally { console.error = original; e2.cerrar(); }
  });
});

describe('Cuenta desactivada entre el middleware y la transacción', () => {
  // Qué se garantiza: las ESCRITURAS empiezan con bloquearVendedor, que vuelve a exigir un vendedor
  // activo bajo bloqueo; si la cuenta se desactivó después del middleware, responde 401 y no escribe.
  // Qué NO se garantiza: el GET no abre transacción; si la desactivación llega después de que el
  // middleware validó la cuenta, esa lectura en curso termina con 200. La siguiente petición ya da 401.
  const desactivarEn = (patron) => (bd) => {
    bd.ganchos.antes = (sql) => { if (patron.test(sql)) bd.users.find((u) => u.id === 4).activo = 0; };
  };
  const BLOQUEO_VENDEDOR = /^SELECT id FROM users WHERE id = \? AND rol = 'vendedor' AND activo = 1 FOR UPDATE$/;

  test('POST: desactivada justo antes del bloqueo del vendedor → 401 y sin INSERT', async () => {
    const e = await entorno(desactivarEn(BLOQUEO_VENDEDOR));
    try {
      const antes = e.bd.actividades.length;
      const r = await e.llamar(4, 'POST', '/clientes/10/actividades', { cuerpo: valida });
      assert.equal(r.status, 401);
      assert.equal(e.bd.actividades.length, antes);
      assert.ok(!e.bd.llamadas.some((l) => l.sql.startsWith('INSERT INTO actividades')));
    } finally { e.cerrar(); }
  });

  test('PATCH: desactivada justo antes del bloqueo del vendedor → 401 y sin UPDATE', async () => {
    const e = await entorno(desactivarEn(BLOQUEO_VENDEDOR));
    try {
      const r = await e.llamar(4, 'PATCH', '/actividades/700', { cuerpo: { completada: true } });
      assert.equal(r.status, 401);
      assert.equal(act(e.bd, 700).completada, 0);
      assert.ok(!e.bd.llamadas.some((l) => l.sql === SQL_B5.actualizarCompletada));
    } finally { e.cerrar(); }
  });

  test('GET: una desactivación posterior al middleware NO interrumpe la lectura en curso (límite documentado)', async () => {
    const e = await entorno(desactivarEn(/^SELECT a\.id/));
    try {
      const r = await e.llamar(4, 'GET', '/actividades');
      assert.equal(r.status, 200);
      assert.equal((await e.llamar(4, 'GET', '/actividades')).status, 401); // la siguiente petición ya no pasa
    } finally { e.cerrar(); }
  });
});

describe('validarActividad (unidad)', () => {
  test('devuelve vence_en como Date UTC y null cuando falta', () => {
    const v = validarActividad({ tipo: 'reunion', descripcion: ' Visita ', vence_en: '2026-12-01T10:00:00-06:00' });
    assert.equal(v.descripcion, 'Visita');
    assert.equal(v.vence_en.toISOString(), '2026-12-01T16:00:00.000Z');
    assert.equal(validarActividad({ tipo: 'tarea', descripcion: 'x' }).vence_en, null);
  });
});
