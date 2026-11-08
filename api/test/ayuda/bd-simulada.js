// Base de datos simulada para las pruebas de B2 (no necesita MySQL).
// Implementa `execute(sql, params)` solo para las consultas que usa la API en B2 y registra
// cada llamada para poder comprobar que la propiedad sale del token (B2-09).
//
// Los datos imitan la forma de las tablas de docs/especificacion.md §4 (users con rol y activo,
// clientes con vendedor_id). NO son la semilla oficial: VerificacionSeeder es de la Parte A (I1).
import bcrypt from 'bcryptjs';

export const CLAVE_PRUEBA = 'Clave.Prueba-2026';
// Coste bajo para que las pruebas sean rápidas; prefijo $2y$ como en los hashes de Laravel.
const HASH = bcrypt.hashSync(CLAVE_PRUEBA, 4).replace(/^\$2b\$/, '$2y$');

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

  const pool = {
    async execute(sql, params = []) {
      llamadas.push({ sql, params });
      if (/FROM users WHERE email = \?/i.test(sql)) {
        const u = users.find((x) => x.email.toLowerCase() === String(params[0]).toLowerCase());
        return [u ? [{ id: u.id, nombre: u.name, correo: u.email, password: u.password, rol: u.rol, activo: u.activo }] : []];
      }
      if (/FROM users WHERE id = \?/i.test(sql)) {
        const u = users.find((x) => x.id === params[0]);
        return [u ? [{ id: u.id, nombre: u.name, correo: u.email, rol: u.rol, activo: u.activo }] : []];
      }
      if (/FROM clientes WHERE vendedor_id = \?/i.test(sql)) {
        const filas = clientes
          .filter((c) => c.vendedor_id === params[0])
          .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.id - b.id)
          .map(({ id, nombre, nit, telefono, correo }) => ({ id, nombre, nit, telefono, correo }));
        return [filas];
      }
      throw new Error(`Consulta no prevista en la base simulada: ${sql}`);
    },
  };

  return { pool, users, clientes, llamadas };
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
