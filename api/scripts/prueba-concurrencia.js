// =============================================================================
//  PRUEBA DE CONCURRENCIA POR HTTP (B6-14 a B6-19; S8)
// =============================================================================
// Envía peticiones HTTP reales y simultáneas (fetch + Promise.all) a una API en marcha y comprueba
// que las operaciones críticas respetan las reglas:
//   B6-14  10 tomas simultáneas del mismo cliente disponible  → 1×200 y 9×409, un solo dueño.
//   B6-16  2 altas simultáneas con el mismo NIT               → 1×201 y 1×409, un solo registro.
//   B6-17  2 cambios simultáneos a la misma etapa              → 1×200 y 1×409 (D13), un solo evento.
//   B6-18  2 ventas simultáneas por la última unidad           → 1×200 y 1×409, stock 0, nunca negativo.
//   B6-15  3 altas simultáneas con 9 clientes en cartera       → 1×201 y 2×409, cartera en 10.
//
// Protecciones (B6-19):
//   - No se conecta a MySQL, no ejecuta migraciones ni comandos: solo habla HTTP con la API.
//   - Sin --confirmar-escritura solo inicia sesión y lee; no modifica nada (código de salida 2).
//   - Con --confirmar-escritura solo escribe si la API es el modo demostración (cabecera
//     X-CRM-Modo: demostracion-local) o si se declara CONCURRENCIA_BASE_RESTABLECIBLE=si para una
//     base de PRUEBAS que se pueda restablecer. Nunca la use contra la base compartida ni producción:
//     crea clientes, oportunidades y ventas, y descuenta stock.
//   - No contiene contraseñas: las credenciales llegan por variables de entorno.
//
// Configuración (variables de entorno):
//   CONCURRENCIA_URL                URL base de la API (por omisión http://127.0.0.1:3000/api)
//   CONCURRENCIA_CORREO_A / _CLAVE_A  vendedor A (activo)
//   CONCURRENCIA_CORREO_B / _CLAVE_B  vendedor B (activo, distinto de A)
//   CONCURRENCIA_PRODUCTO_ID        opcional: producto con stock controlado para B6-18
//   CONCURRENCIA_BASE_RESTABLECIBLE si: declara que la base es de pruebas y restablecible
//
// Uso (desde api/):  npm run concurrencia -- --confirmar-escritura [--json]
// Códigos de salida: 0 todo aprobado · 1 algún escenario fallido o pendiente · 2 no se ejecutó.
// =============================================================================

import { normalizarNit } from '../src/utils/validaciones.js';

const argumentos = new Set(process.argv.slice(2));
const CONFIRMAR = argumentos.has('--confirmar-escritura');
const SALIDA_JSON = argumentos.has('--json');
const URL_API = (process.env.CONCURRENCIA_URL || 'http://127.0.0.1:3000/api').replace(/\/+$/, '');
const BASE_RESTABLECIBLE = process.env.CONCURRENCIA_BASE_RESTABLECIBLE === 'si';
const MAXIMO_CARTERA = 10;
const CANTIDAD_MAXIMA = 999;

const log = (...partes) => console.log(...partes);

// ---------- HTTP ----------

async function http(token, metodo, ruta, cuerpo) {
  const cabeceras = { Accept: 'application/json' };
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  const r = await fetch(`${URL_API}${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no es JSON */ }
  return { status: r.status, json, modo: r.headers.get('x-crm-modo') };
}

/** Lanza un error legible si la respuesta no tiene el código esperado (pasos de preparación). */
function exigir(r, status, paso) {
  if (r.status !== status) throw new Error(`${paso}: se esperaba ${status} y se obtuvo ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

const contar = (rs) => rs.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
const textoCodigos = (c) => Object.entries(c).sort().map(([k, v]) => `${v}×${k}`).join(' + ') || '—';

// ---------- Datos únicos de cada ejecución ----------

const sello = Date.now();
let secuencia = 0;

/** Teléfono de Guatemala (8 dígitos, empieza por 6) distinto en cada llamada. */
function telefonoUnico() {
  secuencia += 1;
  return `6${String((sello + secuencia * 7919) % 10_000_000).padStart(7, '0')}`;
}

/** NIT válido (módulo 11, R4) generado al azar; reutiliza la validación de la API. */
function nitUnico() {
  for (;;) {
    const cuerpo = String(1_000_000 + Math.floor(Math.random() * 8_999_999));
    for (const v of '0123456789K') {
      const r = normalizarNit(`${cuerpo}${v}`);
      if (r.valido) return r.nit;
    }
  }
}

// ---------- Escenarios ----------

const resultados = [];

async function escenario(id, titulo, esperado, fn) {
  const res = { id, titulo, esperado, obtenido: '—', estado: 'FALLIDO', detalles: [] };
  try {
    const salida = await fn(res.detalles);
    res.obtenido = salida.obtenido;
    res.estado = salida.aprobado ? 'APROBADO' : 'FALLIDO';
  } catch (error) {
    if (error.pendiente) {
      res.estado = 'PENDIENTE';
      res.detalles.push(error.message);
    } else {
      res.detalles.push(`Error: ${error.message}`);
    }
  }
  resultados.push(res);
  log(`\n[${res.estado}] ${id} — ${titulo}`);
  log(`  Esperado: ${esperado}`);
  log(`  Obtenido: ${res.obtenido}`);
  for (const d of res.detalles) log(`  · ${d}`);
}

const pendiente = (mensaje) => Object.assign(new Error(mensaje), { pendiente: true });
const soloError = (rs) => rs.every((r) => r.json && Object.keys(r.json).length === 1 && typeof r.json.error === 'string');

async function cartera(token) {
  return exigir(await http(token, 'GET', '/clientes'), 200, 'GET /clientes');
}

async function crearOportunidadEnNegociacion(token, clienteId, productoId, cantidad, etiqueta) {
  const o = exigir(await http(token, 'POST', '/oportunidades', { cliente_id: clienteId, titulo: `Concurrencia ${sello} ${etiqueta}` }), 201, `crear oportunidad ${etiqueta}`);
  exigir(await http(token, 'POST', `/oportunidades/${o.id}/productos`, { producto_id: productoId, cantidad }), 201, `agregar producto ${etiqueta}`);
  for (const etapa of ['calificado', 'propuesta', 'negociacion']) {
    exigir(await http(token, 'PATCH', `/oportunidades/${o.id}/etapa`, { etapa }), 200, `avanzar a ${etapa} ${etiqueta}`);
  }
  return o.id;
}

async function ejecutarEscenarios(A, B) {
  // B6-14 — toma simultánea del mismo cliente disponible
  await escenario('B6-14', 'Toma simultánea de un cliente disponible', '1×200 + 9×409; el cliente queda en una sola cartera', async (d) => {
    const disponibles = exigir(await http(A, 'GET', '/clientes/disponibles'), 200, 'GET /clientes/disponibles');
    if (!disponibles.length) throw pendiente('No hay clientes disponibles para tomar.');
    const id = disponibles[0].id;
    const [antesA, antesB] = [(await cartera(A)).length, (await cartera(B)).length];
    if (antesA >= MAXIMO_CARTERA && antesB >= MAXIMO_CARTERA) throw pendiente('A y B ya tienen la cartera llena.');
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => http(i % 2 ? B : A, 'POST', `/clientes/${id}/tomar`)));
    const c = contar(rs);
    const [despuesA, despuesB] = [await cartera(A), await cartera(B)];
    const duenios = [despuesA, despuesB].filter((l) => l.some((x) => x.id === id)).length;
    const sumaOk = despuesA.length + despuesB.length === antesA + antesB + 1;
    d.push(`Cliente ${id}; carteras A ${antesA}→${despuesA.length}, B ${antesB}→${despuesB.length}; en ${duenios} cartera(s).`);
    return { obtenido: textoCodigos(c), aprobado: c[200] === 1 && c[409] === 9 && duenios === 1 && sumaOk && soloError(rs.filter((r) => r.status === 409)) };
  });

  // B6-16 — NIT duplicado en altas simultáneas (A y B, para no serializarse por el bloqueo del vendedor)
  await escenario('B6-16', 'Altas simultáneas con el mismo NIT', '1×201 + 1×409; un solo registro con ese NIT', async (d) => {
    const [la, lb] = [await cartera(A), await cartera(B)];
    if (la.length >= MAXIMO_CARTERA || lb.length >= MAXIMO_CARTERA) throw pendiente('A o B tienen la cartera llena.');
    const nit = nitUnico();
    const rs = await Promise.all([
      http(A, 'POST', '/clientes', { nombre: `Concurrencia ${sello} NIT A`, nit, telefono: telefonoUnico() }),
      http(B, 'POST', '/clientes', { nombre: `Concurrencia ${sello} NIT B`, nit, telefono: telefonoUnico() }),
    ]);
    const c = contar(rs);
    const q = `/clientes?${new URLSearchParams({ q: nit })}`;
    const conNit = [...exigir(await http(A, 'GET', q), 200, 'buscar NIT A'), ...exigir(await http(B, 'GET', q), 200, 'buscar NIT B')].filter((x) => x.nit === nit);
    d.push(`NIT ${nit}; registros con ese NIT: ${conNit.length}.`);
    return { obtenido: textoCodigos(c), aprobado: c[201] === 1 && c[409] === 1 && conNit.length === 1 && soloError(rs.filter((r) => r.status === 409)) };
  });

  // B6-17 — dos cambios simultáneos a la misma etapa
  await escenario('B6-17', 'Cambio simultáneo de etapa', '1×200 + 1×409 (D13); un único evento nuevo en el historial', async (d) => {
    const clientes = await cartera(A);
    if (!clientes.length) throw pendiente('A no tiene clientes para crear una oportunidad.');
    const o = exigir(await http(A, 'POST', '/oportunidades', { cliente_id: clientes[0].id, titulo: `Concurrencia ${sello} etapa` }), 201, 'crear oportunidad');
    const antes = o.historial.length;
    const rs = await Promise.all([1, 2].map(() => http(A, 'PATCH', `/oportunidades/${o.id}/etapa`, { etapa: 'calificado' })));
    const c = contar(rs);
    const despues = exigir(await http(A, 'GET', `/oportunidades/${o.id}`), 200, 'detalle');
    d.push(`Oportunidad ${o.id}: etapa ${despues.etapa}; historial ${antes}→${despues.historial.length}.`);
    return { obtenido: textoCodigos(c), aprobado: c[200] === 1 && c[409] === 1 && despues.etapa === 'calificado' && despues.historial.length === antes + 1 };
  });

  // B6-18 — dos ventas de vendedores distintos compiten por la última unidad de un producto.
  // Si el producto tiene más de una unidad, antes se vende el resto (S − 1) para dejar exactamente 1.
  await escenario('B6-18', 'Competencia por la última unidad', '1×200 + 1×409; stock final 0; la perdedora sigue en negociación', async (d) => {
    const productos = exigir(await http(A, 'GET', '/productos'), 200, 'GET /productos');
    const elegido = process.env.CONCURRENCIA_PRODUCTO_ID
      ? productos.find((p) => String(p.id) === String(process.env.CONCURRENCIA_PRODUCTO_ID))
      : productos.filter((p) => Number.isInteger(p.stock) && p.stock > 0).sort((x, y) => x.stock - y.stock)[0];
    if (!elegido || !Number.isInteger(elegido.stock) || elegido.stock < 1) throw pendiente('No hay un producto activo con stock controlado mayor que 0 (lo prepara la Parte A).');
    if (elegido.stock - 1 > CANTIDAD_MAXIMA) throw pendiente(`El stock del producto ${elegido.id} supera lo que se puede vender en una línea (${CANTIDAD_MAXIMA}); use CONCURRENCIA_PRODUCTO_ID con menos stock.`);
    const [ca, cb] = [await cartera(A), await cartera(B)];
    if (!ca.length || !cb.length) throw pendiente('A y B necesitan al menos un cliente cada uno.');
    const S = elegido.stock;
    if (S > 1) { // preparación: vender S − 1 unidades para que quede solo la última
      const previa = await crearOportunidadEnNegociacion(A, ca[0].id, elegido.id, S - 1, 'stock previa');
      exigir(await http(A, 'PATCH', `/oportunidades/${previa}/etapa`, { etapa: 'ganada' }), 200, 'venta previa de S − 1 unidades');
    }
    const restante = exigir(await http(A, 'GET', '/productos'), 200, 'GET /productos').find((p) => p.id === elegido.id)?.stock;
    if (restante !== 1) throw new Error(`tras la preparación el stock debía ser 1 y es ${restante}`);
    const oa = await crearOportunidadEnNegociacion(A, ca[0].id, elegido.id, 1, 'stock A');
    const ob = await crearOportunidadEnNegociacion(B, cb[0].id, elegido.id, 1, 'stock B');
    const rs = await Promise.all([
      http(A, 'PATCH', `/oportunidades/${oa}/etapa`, { etapa: 'ganada' }),
      http(B, 'PATCH', `/oportunidades/${ob}/etapa`, { etapa: 'ganada' }),
    ]);
    const c = contar(rs);
    const stock = exigir(await http(A, 'GET', '/productos'), 200, 'GET /productos').find((p) => p.id === elegido.id)?.stock;
    const [da, db] = [exigir(await http(A, 'GET', `/oportunidades/${oa}`), 200, 'detalle A'), exigir(await http(B, 'GET', `/oportunidades/${ob}`), 200, 'detalle B')];
    const perdedora = rs[0].status === 409 ? da : db;
    const ganadora = rs[0].status === 409 ? db : da;
    d.push(`Producto ${elegido.id} «${elegido.nombre}»: stock inicial ${S}${S > 1 ? ` (se vendieron ${S - 1} antes)` : ''}; última unidad disputada; stock final ${stock}.`);
    d.push(`Ganadora ${ganadora.id}: ${ganadora.etapa}. Perdedora ${perdedora.id}: ${perdedora.etapa}, historial ${perdedora.historial.length} (esperado 4).`);
    return {
      obtenido: textoCodigos(c),
      aprobado: c[200] === 1 && c[409] === 1 && stock === 0 && ganadora.etapa === 'ganada'
        && perdedora.etapa === 'negociacion' && perdedora.historial.length === 4,
    };
  });

  // B6-15 — límite de cartera con altas simultáneas (al final: deja la cartera de B en 10)
  await escenario('B6-15', 'Límite de cartera con altas simultáneas', '1×201 + 2×409; la cartera termina con 10', async (d) => {
    let actual = (await cartera(B)).length;
    if (actual >= MAXIMO_CARTERA) throw pendiente('B ya tiene la cartera llena: el escenario necesita 9 clientes o menos.');
    const inicial = actual;
    while (actual < MAXIMO_CARTERA - 1) {
      exigir(await http(B, 'POST', '/clientes', { nombre: `Concurrencia ${sello} relleno ${actual}`, nit: 'CF', telefono: telefonoUnico() }), 201, 'completar la cartera a 9');
      actual += 1;
    }
    const rs = await Promise.all([1, 2, 3].map((i) => http(B, 'POST', '/clientes', { nombre: `Concurrencia ${sello} simultáneo ${i}`, nit: 'CF', telefono: telefonoUnico() })));
    const c = contar(rs);
    const final = (await cartera(B)).length;
    d.push(`Cartera de B: ${inicial} → 9 (preparación) → ${final}.`);
    return { obtenido: textoCodigos(c), aprobado: c[201] === 1 && c[409] === 2 && final === MAXIMO_CARTERA && soloError(rs.filter((r) => r.status === 409)) };
  });
}

// ---------- Principal ----------

async function principal() {
  log('Prueba de concurrencia por HTTP — CRM Belleza (B6-14 a B6-19)');
  log(`API: ${URL_API}`);

  const faltan = ['CONCURRENCIA_CORREO_A', 'CONCURRENCIA_CLAVE_A', 'CONCURRENCIA_CORREO_B', 'CONCURRENCIA_CLAVE_B'].filter((v) => !process.env[v]);
  if (faltan.length) {
    log(`\nFaltan variables de entorno: ${faltan.join(', ')}. Consulte el README (sección «Pruebas de concurrencia»).`);
    return 2;
  }
  if (process.env.CONCURRENCIA_CORREO_A === process.env.CONCURRENCIA_CORREO_B) {
    log('\nA y B deben ser dos vendedores distintos.');
    return 2;
  }

  let sesionA;
  let sesionB;
  try {
    sesionA = await http(null, 'POST', '/auth/login', { correo: process.env.CONCURRENCIA_CORREO_A, clave: process.env.CONCURRENCIA_CLAVE_A });
    sesionB = await http(null, 'POST', '/auth/login', { correo: process.env.CONCURRENCIA_CORREO_B, clave: process.env.CONCURRENCIA_CLAVE_B });
  } catch (error) {
    log(`\nNo se pudo conectar con la API (${error.cause?.code ?? error.message}). ¿Está en marcha?`);
    return 2;
  }
  if (sesionA.status !== 200 || sesionB.status !== 200) {
    log(`\nInicio de sesión rechazado (A: ${sesionA.status}, B: ${sesionB.status}). Use dos vendedores activos.`);
    return 2;
  }
  const A = sesionA.json.token;
  const B = sesionB.json.token;

  // Lectura de reconocimiento: modo de la API y datos disponibles (no modifica nada).
  const sonda = await http(A, 'GET', '/productos');
  const modoDemo = sonda.modo === 'demostracion-local';
  const [ca, cb, disp] = [await http(A, 'GET', '/clientes'), await http(B, 'GET', '/clientes'), await http(A, 'GET', '/clientes/disponibles')];
  const conStock = Array.isArray(sonda.json) ? sonda.json.filter((p) => Number.isInteger(p.stock) && p.stock > 0).length : 0;
  log(`Modo: ${modoDemo ? 'demostración local (base simulada en memoria)' : BASE_RESTABLECIBLE ? 'base de pruebas declarada restablecible' : 'desconocido (no es la demostración)'}`);
  log(`Cartera A: ${ca.json?.length ?? '?'} · Cartera B: ${cb.json?.length ?? '?'} · Disponibles: ${disp.json?.length ?? '?'} · Productos con stock: ${conStock}`);

  if (!CONFIRMAR) {
    log('\nNo se ha escrito nada. Para ejecutar los escenarios (crean clientes, oportunidades y ventas)');
    log('añada --confirmar-escritura, y hágalo SOLO contra la demostración o una base de pruebas restablecible.');
    return 2;
  }
  if (!modoDemo && !BASE_RESTABLECIBLE) {
    log('\nSe niega a escribir: la API no es el modo demostración y no se declaró CONCURRENCIA_BASE_RESTABLECIBLE=si.');
    log('Nunca ejecute este script contra la base compartida ni contra producción.');
    return 2;
  }

  await ejecutarEscenarios(A, B);

  const aprobados = resultados.filter((r) => r.estado === 'APROBADO').length;
  log(`\nResumen: ${aprobados} de ${resultados.length} escenarios aprobados.`);
  if (SALIDA_JSON) log(`RESULTADO_JSON ${JSON.stringify({ url: URL_API, modo: modoDemo ? 'demostracion-local' : 'base-restablecible', resultados })}`);
  return aprobados === resultados.length ? 0 : 1;
}

process.exitCode = await principal();
