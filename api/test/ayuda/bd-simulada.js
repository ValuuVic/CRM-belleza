// Base de datos simulada para las pruebas de B2 y B3 (no necesita MySQL).
// Implementa `execute(sql, params)` solo para las consultas que usa la API y registra cada llamada
// para poder comprobar que las consultas van parametrizadas y que la propiedad sale del token.
//
// B3 añade `getConnection()` con transacciones y bloqueos que imitan lo necesario de InnoDB:
// - Cada transacción guarda un registro de deshacer con SUS escrituras; el rollback solo revierte
//   esas escrituras, así que nunca se pierden cambios que otras transacciones ya confirmaron.
// - `SELECT … FOR UPDATE` toma un bloqueo exclusivo por fila (users:id o clientes:id) que dura
//   hasta commit/rollback; otra transacción que pida la misma fila espera en una cola.
// - Índices únicos de clientes.nit (si no es NULL) y clientes.telefono: error errno 1062.
// - Cada consulta cede el turno (setImmediate) para que las peticiones simultáneas se intercalen.
// Esto permite probar la LÓGICA de transacciones y bloqueos de la API; no sustituye las pruebas
// contra MySQL real (I1), que son las que verifican el comportamiento de InnoDB.
//
// Los datos imitan la forma de las tablas de docs/especificacion.md §4 (users con rol y activo,
// clientes con vendedor_id). NO son la semilla oficial: VerificacionSeeder es de la Parte A (I1).
import bcrypt from 'bcryptjs';
import { crearConsultasOportunidades } from './consultas-oportunidades.js';

export const CLAVE_PRUEBA = 'Clave.Prueba-2026';
// Coste bajo para que las pruebas sean rápidas; prefijo $2y$ como en los hashes de Laravel.
const HASH = bcrypt.hashSync(CLAVE_PRUEBA, 4).replace(/^\$2b\$/, '$2y$');

const ceder = () => new Promise((r) => setImmediate(r));

function errorDuplicado(indice) {
  const e = new Error(`Duplicate entry for key '${indice}'`);
  e.code = 'ER_DUP_ENTRY';
  e.errno = 1062;
  e.sqlState = '23000';
  e.sqlMessage = e.message;
  return e;
}

/** LIKE con ESCAPE '!' y colación insensible a mayúsculas (como utf8mb4_unicode_ci). */
function coincideLike(valor, patron) {
  if (valor === null || valor === undefined || patron === null || patron === undefined) return false;
  let re = '';
  for (let i = 0; i < patron.length; i++) {
    const c = patron[i];
    if (c === '!' && i + 1 < patron.length) re += patron[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '%') re += '.*';
    else if (c === '_') re += '.';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'is').test(String(valor));
}

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre) || a.id - b.id;
const publico = ({ id, nombre, nit, telefono, correo }) => ({ id, nombre, nit, telefono, correo });

export function crearBdSimulada() {
  const users = [
    { id: 1, name: 'Admin Prueba', email: 'admin@prueba.test', password: HASH, rol: 'administrador', activo: 1 },
    { id: 2, name: 'Supervisora Prueba', email: 'supervisora@prueba.test', password: HASH, rol: 'supervisor', activo: 1 },
    { id: 4, name: 'Vendedora Uno', email: 'vendedora1@prueba.test', password: HASH, rol: 'vendedor', activo: 1 },
    { id: 5, name: 'Vendedor Dos', email: 'vendedor2@prueba.test', password: HASH, rol: 'vendedor', activo: 1 },
    { id: 6, name: 'Vendedor Inactivo', email: 'inactivo@prueba.test', password: HASH, rol: 'vendedor', activo: 0 },
  ];
  const clientes = [
    { id: 10, vendedor_id: 4, nombre: 'Tienda Beta', nit: '4521817K', telefono: '55551234', correo: 'compras@beta.test' },
    { id: 11, vendedor_id: 4, nombre: 'Almacén Alfa', nit: null, telefono: '22334455', correo: null },
    { id: 12, vendedor_id: 5, nombre: 'Cliente de Otro Vendedor', nit: '12345679', telefono: '33445566', correo: 'otro@x.test' },
    { id: 13, vendedor_id: null, nombre: 'Cliente Disponible', nit: null, telefono: '44556677', correo: null },
  ];
  const llamadas = [];
  const estadisticas = { begin: 0, commit: 0, rollback: 0, liberadas: 0, destruidas: 0, abiertas: 0 };
  /** Si se define, la consulta cuyo SQL coincida lanza un error (para probar rollbacks). */
  const fallos = { patron: null, error: null };
  /** ganchos.antes(sql, params): se ejecuta antes de cada consulta (p. ej. desactivar un usuario). */
  const ganchos = { antes: null };

  // ---------- Bloqueos por fila ----------
  const bloqueos = new Map(); // clave → { duenio, cola: [resolve] }

  async function bloquear(tx, clave) {
    if (!tx) return; // fuera de transacción (autocommit) FOR UPDATE no retiene el bloqueo
    for (;;) {
      const b = bloqueos.get(clave);
      if (!b) { bloqueos.set(clave, { duenio: tx, cola: [] }); tx.bloqueos.add(clave); return; }
      if (b.duenio === tx) return;
      await new Promise((r) => b.cola.push(r));
    }
  }

  function liberarBloqueos(tx) {
    for (const clave of tx.bloqueos) {
      const b = bloqueos.get(clave);
      bloqueos.delete(clave);
      for (const r of b?.cola ?? []) r();
    }
    tx.bloqueos.clear();
  }

  // ---------- Escrituras con registro de deshacer ----------
  let siguienteId = Math.max(...clientes.map((c) => c.id)) + 1;

  function comprobarUnicos(fila, excluirId) {
    for (const c of clientes) {
      if (c.id === excluirId) continue;
      if (fila.nit !== null && c.nit === fila.nit) throw errorDuplicado('clientes_nit_unique');
      if (c.telefono === fila.telefono) throw errorDuplicado('clientes_telefono_unique');
    }
  }

  function insertarCliente(tx, fila) {
    comprobarUnicos(fila, null);
    // Como InnoDB: el autoincremento no se reutiliza y siempre supera al id más alto existente,
    // aunque las pruebas o la demo hayan añadido filas directamente después de crear la base.
    siguienteId = Math.max(siguienteId, ...clientes.map((c) => c.id + 1));
    const nueva = { id: siguienteId++, ...fila };
    clientes.push(nueva);
    tx?.deshacer.push(() => { const i = clientes.indexOf(nueva); if (i >= 0) clientes.splice(i, 1); });
    return nueva.id;
  }

  function actualizarCliente(tx, cliente, cambios) {
    comprobarUnicos({ ...cliente, ...cambios }, cliente.id);
    actualizarFila(tx, cliente, cambios);
  }

  // Escrituras genéricas para las demás tablas (B4). Cada una registra cómo deshacerse.
  const siguientes = new Map();
  function insertarFila(tx, tabla, fila) {
    const siguiente = Math.max(siguientes.get(tabla) ?? 1, ...tabla.map((f) => f.id + 1));
    const nueva = { id: siguiente, ...fila };
    siguientes.set(tabla, siguiente + 1);
    tabla.push(nueva);
    tx?.deshacer.push(() => { const i = tabla.indexOf(nueva); if (i >= 0) tabla.splice(i, 1); });
    return nueva;
  }
  function actualizarFila(tx, fila, cambios) {
    const anterior = { ...fila };
    Object.assign(fila, cambios);
    tx?.deshacer.push(() => { for (const k of Object.keys(fila)) delete fila[k]; Object.assign(fila, anterior); });
  }
  function eliminarFila(tx, tabla, fila) {
    const i = tabla.indexOf(fila);
    if (i < 0) return;
    tabla.splice(i, 1);
    tx?.deshacer.push(() => tabla.splice(Math.min(i, tabla.length), 0, fila));
  }

  // Tablas y consultas de B4 (oportunidades, productos, líneas e historial).
  const b4 = crearConsultasOportunidades({
    users, clientes, bloquear, insertarFila, actualizarFila, eliminarFila,
  });

  // ---------- Motor de consultas ----------
  async function ejecutar(sql, params = [], tx = null) {
    llamadas.push({ sql, params, transaccion: Boolean(tx) });
    await ceder();
    ganchos.antes?.(sql, params); // permite simular cambios de otro proceso entre consultas
    if (fallos.patron?.test(sql)) throw fallos.error ?? new Error('Fallo simulado');
    const forUpdate = /\bFOR UPDATE\b/i.test(sql);

    // B4: consultas exactas de servicios/oportunidades.js y rutas de oportunidades y productos.
    const resultadoB4 = await b4.ejecutar(sql, params, tx);
    if (resultadoB4 !== undefined) return resultadoB4;

    // users
    if (/FROM users WHERE email = \?/i.test(sql)) {
      const u = users.find((x) => x.email.toLowerCase() === String(params[0]).toLowerCase());
      return [u ? [{ id: u.id, nombre: u.name, correo: u.email, password: u.password, rol: u.rol, activo: u.activo }] : []];
    }
    if (/^SELECT id FROM users WHERE id = \? AND rol = 'vendedor' AND activo = 1 FOR UPDATE$/i.test(sql)) {
      const u = users.find((x) => x.id === params[0]);
      if (u) await bloquear(tx, `users:${u.id}`);
      return [u && u.rol === 'vendedor' && Number(u.activo) ? [{ id: u.id }] : []];
    }
    if (/FROM users WHERE id = \?/i.test(sql)) {
      const u = users.find((x) => x.id === params[0]);
      return [u ? [{ id: u.id, nombre: u.name, correo: u.email, rol: u.rol, activo: u.activo }] : []];
    }

    // clientes: lecturas
    if (/^SELECT COUNT\(\*\) AS n FROM clientes WHERE vendedor_id = \?$/i.test(sql)) {
      return [[{ n: clientes.filter((c) => c.vendedor_id === params[0]).length }]];
    }
    if (/FROM clientes WHERE vendedor_id = \? AND \(nombre LIKE \? ESCAPE '!' OR nit LIKE \? ESCAPE '!'\) ORDER BY nombre, id$/i.test(sql)) {
      const [vendedor, patronNombre, patronNit] = params;
      return [clientes
        .filter((c) => c.vendedor_id === vendedor && (coincideLike(c.nombre, patronNombre) || coincideLike(c.nit, patronNit)))
        .sort(porNombre).map(publico)];
    }
    if (/FROM clientes WHERE vendedor_id = \? ORDER BY nombre, id$/i.test(sql)) {
      return [clientes.filter((c) => c.vendedor_id === params[0]).sort(porNombre).map(publico)];
    }
    if (/^SELECT id, nombre FROM clientes WHERE vendedor_id IS NULL ORDER BY nombre, id$/i.test(sql)) {
      return [clientes.filter((c) => c.vendedor_id === null).sort(porNombre).map(({ id, nombre }) => ({ id, nombre }))];
    }
    if (/^SELECT (id|id, nombre, nit, telefono, correo) FROM clientes WHERE id = \? AND vendedor_id = \?( FOR UPDATE)?$/i.test(sql)) {
      const c = clientes.find((x) => x.id === params[0] && x.vendedor_id === params[1]);
      if (c && forUpdate) await bloquear(tx, `clientes:${c.id}`);
      if (!c) return [[]];
      return [[/^SELECT id FROM/i.test(sql) ? { id: c.id } : publico(c)]];
    }
    if (/^SELECT id, vendedor_id FROM clientes WHERE id = \? FOR UPDATE$/i.test(sql)) {
      const c = clientes.find((x) => x.id === params[0]);
      if (!c) return [[]];
      await bloquear(tx, `clientes:${c.id}`);
      return [[{ id: c.id, vendedor_id: c.vendedor_id }]]; // valor actual tras obtener el bloqueo
    }
    if (/^SELECT id, nombre, nit, telefono, correo FROM clientes WHERE id = \?$/i.test(sql)) {
      const c = clientes.find((x) => x.id === params[0]);
      return [c ? [publico(c)] : []];
    }

    // clientes: escrituras
    if (/^INSERT INTO clientes \(vendedor_id, nombre, nit, telefono, correo, created_at, updated_at\) VALUES \(\?, \?, \?, \?, \?, UTC_TIMESTAMP\(\), UTC_TIMESTAMP\(\)\)$/i.test(sql)) {
      const [vendedor_id, nombre, nit, telefono, correo] = params;
      const insertId = insertarCliente(tx, { vendedor_id, nombre, nit, telefono, correo });
      return [{ insertId, affectedRows: 1 }];
    }
    if (/^UPDATE clientes SET nombre = IF\(\?, \?, nombre\), nit = IF\(\?, \?, nit\), telefono = IF\(\?, \?, telefono\), correo = IF\(\?, \?, correo\), updated_at = UTC_TIMESTAMP\(\) WHERE id = \? AND vendedor_id = \?$/i.test(sql)) {
      const [fNombre, nombre, fNit, nit, fTel, telefono, fCorreo, correo, id, vendedor] = params;
      const c = clientes.find((x) => x.id === id && x.vendedor_id === vendedor);
      if (!c) return [{ affectedRows: 0 }];
      await bloquear(tx, `clientes:${c.id}`);
      const cambios = {};
      if (fNombre) cambios.nombre = nombre;
      if (fNit) cambios.nit = nit;
      if (fTel) cambios.telefono = telefono;
      if (fCorreo) cambios.correo = correo;
      actualizarCliente(tx, c, cambios);
      return [{ affectedRows: 1 }];
    }
    if (/^UPDATE clientes SET vendedor_id = \?, updated_at = UTC_TIMESTAMP\(\) WHERE id = \? AND vendedor_id IS NULL$/i.test(sql)) {
      const [vendedor, id] = params;
      const existente = clientes.find((x) => x.id === id);
      if (existente) await bloquear(tx, `clientes:${existente.id}`);
      const c = clientes.find((x) => x.id === id && x.vendedor_id === null);
      if (!c) return [{ affectedRows: 0 }];
      actualizarCliente(tx, c, { vendedor_id: vendedor });
      return [{ affectedRows: 1 }];
    }

    throw new Error(`Consulta no prevista en la base simulada: ${sql}`);
  }

  function crearConexion() {
    estadisticas.abiertas++;
    let tx = null;
    let cerrada = false;
    const terminar = () => { if (tx) liberarBloqueos(tx); tx = null; };
    return {
      async execute(sql, params) {
        if (cerrada) throw new Error('Conexión ya liberada');
        return ejecutar(sql, params, tx);
      },
      async beginTransaction() { estadisticas.begin++; tx = { deshacer: [], bloqueos: new Set() }; },
      async commit() { estadisticas.commit++; terminar(); await ceder(); },
      async rollback() {
        estadisticas.rollback++;
        if (tx) for (const deshacer of tx.deshacer.reverse()) deshacer();
        terminar();
        await ceder();
      },
      release() { if (!cerrada) { cerrada = true; estadisticas.abiertas--; estadisticas.liberadas++; terminar(); } },
      destroy() { if (!cerrada) { cerrada = true; estadisticas.abiertas--; estadisticas.destruidas++; terminar(); } },
    };
  }

  const pool = {
    execute: (sql, params) => ejecutar(sql, params, null),
    async getConnection() { await ceder(); return crearConexion(); },
  };

  return { pool, users, clientes, ...b4.tablas, llamadas, estadisticas, fallos, ganchos, bloqueos };
}

/** Levanta una app en un puerto libre de 127.0.0.1. */
export function levantar(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve({ servidor: s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}

/** fetch que devuelve { status, json, texto }. */
export async function pedir(url, opciones = {}) {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no es JSON */ }
  return { status: r.status, json, texto, cabeceras: r.headers };
}
