// /api/clientes — B2-10 y B3 (A3; R2, R3, R4, S3, S4, S5, S8).
// - El dueño de los registros sale solo de req.vendedor (token verificado por el middleware de B2).
// - Todas las consultas usan parámetros `?` con SQL fijo (S3).
// - Clientes ajenos, inexistentes o con identificador no numérico → 404 con el mismo mensaje (S5).
// - Alta y toma de clientes: transacción con bloqueo de la fila del vendedor (SELECT … FOR UPDATE)
//   antes de contar su cartera, para que las peticiones simultáneas no superen el máximo (R3, S8).
// - Los duplicados de NIT o teléfono los detecta el índice único de MySQL (1062 → 409 en el
//   manejador global), sin consulta previa susceptible a carreras (B3-08).

import { Router } from 'express';
import { crearAutenticacion } from '../middleware/auth.js';
import { conTransaccion } from '../utils/transaccion.js';
import { conflicto, noEncontrado, peticionInvalida } from '../utils/errores.js';
import { bloquearVendedor } from '../servicios/vendedores.js';
import { CAMPOS_CLIENTE, exigirConsulta, exigirCuerpoObjeto, idValido, validarCliente } from '../utils/validaciones.js';

export const MAXIMO_CARTERA = 10; // R3
export const LONGITUD_MAXIMA_BUSQUEDA = 100;

const MENSAJE_NO_ENCONTRADO = 'Cliente no encontrado';
const MENSAJE_CARTERA_LLENA = `Su cartera ya tiene el máximo de ${MAXIMO_CARTERA} clientes`;
const MENSAJE_NO_DISPONIBLE = 'El cliente ya no está disponible';

const SQL_CLIENTE_POR_ID = 'SELECT id, nombre, nit, telefono, correo FROM clientes WHERE id = ?';
const SQL_CONTAR_CARTERA = 'SELECT COUNT(*) AS n FROM clientes WHERE vendedor_id = ?';

/**
 * Cliente en el formato del contrato (esp. §8.2). El NIT NULL (consumidor final) se
 * presenta como "CF" (R4). No se expone `vendedor_id` (S4).
 */
export function serializarCliente(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    nit: fila.nit ?? 'CF',
    telefono: fila.telefono,
    correo: fila.correo ?? null,
  };
}

/** Identificador de cliente de la ruta; si no es un entero positivo → 404 sin consultar (B3-06). */
function idDeRuta(req) {
  const id = idValido(req.params.id);
  if (id === null) throw noEncontrado(MENSAJE_NO_ENCONTRADO);
  return id;
}

/** Escapa los comodines de LIKE con "!" (ESCAPE '!'), independiente de NO_BACKSLASH_ESCAPES. */
const escaparLike = (texto) => texto.replace(/[!%_]/g, (c) => `!${c}`);

/**
 * Comprueba que la cartera no esté llena (R3, S8). Debe llamarse después de bloquearVendedor
 * (servicios/vendedores.js): COUNT(*) es una lectura sin bloqueo y solo es fiable si el bloqueo
 * del vendedor fue la primera lectura de la transacción.
 */
async function comprobarEspacio(conn, vendedorId) {
  const [[{ n }]] = await conn.execute(SQL_CONTAR_CARTERA, [vendedorId]);
  if (Number(n) >= MAXIMO_CARTERA) throw conflicto(MENSAJE_CARTERA_LLENA);
}

async function bloquearCarteraConEspacio(conn, vendedorId) {
  await bloquearVendedor(conn, vendedorId);
  await comprobarEspacio(conn, vendedorId);
}

async function leerCliente(conn, id) {
  const [filas] = await conn.execute(SQL_CLIENTE_POR_ID, [id]);
  return serializarCliente(filas[0]);
}

export function crearRutasClientes({ pool }) {
  const router = Router();
  router.use(crearAutenticacion({ pool }));

  // GET /api/clientes?q= → array plano con la cartera del vendedor, filtrada por nombre o NIT (B3-01, B3-03).
  router.get('/', async (req, res) => {
    exigirConsulta(req, ['q']);
    const q = (req.query.q ?? '').trim();
    if (q.length > LONGITUD_MAXIMA_BUSQUEDA) {
      throw peticionInvalida(`La búsqueda no puede superar ${LONGITUD_MAXIMA_BUSQUEDA} caracteres`);
    }

    let filas;
    if (q === '') {
      [filas] = await pool.execute(
        'SELECT id, nombre, nit, telefono, correo FROM clientes WHERE vendedor_id = ? ORDER BY nombre, id',
        [req.vendedor.id],
      );
    } else {
      // El NIT se guarda normalizado (sin espacios ni guiones, en mayúsculas): se busca igual.
      // Si el texto no deja nada comparable con un NIT, se pasa NULL (LIKE NULL nunca coincide).
      const nit = q.replace(/[\s-]/g, '').toUpperCase();
      [filas] = await pool.execute(
        "SELECT id, nombre, nit, telefono, correo FROM clientes WHERE vendedor_id = ? AND (nombre LIKE ? ESCAPE '!' OR nit LIKE ? ESCAPE '!') ORDER BY nombre, id",
        [req.vendedor.id, `%${escaparLike(q)}%`, nit ? `%${escaparLike(nit)}%` : null],
      );
    }
    res.status(200).json(filas.map(serializarCliente));
  });

  // GET /api/clientes/disponibles → [{ id, nombre }] de los clientes sin vendedor (B3-04).
  router.get('/disponibles', async (req, res) => {
    exigirConsulta(req);
    const [filas] = await pool.execute(
      'SELECT id, nombre FROM clientes WHERE vendedor_id IS NULL ORDER BY nombre, id',
    );
    res.status(200).json(filas.map((f) => ({ id: f.id, nombre: f.nombre })));
  });

  // GET /api/clientes/:id → cliente propio; ajeno o inexistente → 404 (B3-05, B3-06).
  router.get('/:id', async (req, res) => {
    const id = idDeRuta(req);
    exigirConsulta(req);
    const [filas] = await pool.execute(
      'SELECT id, nombre, nit, telefono, correo FROM clientes WHERE id = ? AND vendedor_id = ?',
      [id, req.vendedor.id],
    );
    if (!filas[0]) throw noEncontrado(MENSAJE_NO_ENCONTRADO);
    res.status(200).json(serializarCliente(filas[0]));
  });

  // POST /api/clientes → 201 con el cliente creado en la cartera del vendedor del token
  // (B3-07 a B3-10, B3-12, B3-C2). Los campos que no son del contrato se ignoran.
  router.post('/', async (req, res) => {
    exigirConsulta(req);
    const datos = validarCliente(exigirCuerpoObjeto(req));
    const vendedorId = req.vendedor.id;

    const cliente = await conTransaccion(async (conn) => {
      await bloquearCarteraConEspacio(conn, vendedorId);
      const [resultado] = await conn.execute(
        'INSERT INTO clientes (vendedor_id, nombre, nit, telefono, correo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
        [vendedorId, datos.nombre, datos.nit, datos.telefono, datos.correo],
      );
      return leerCliente(conn, resultado.insertId);
    }, pool);

    res.status(201).json(cliente);
  });

  // PATCH /api/clientes/:id → actualiza solo los campos enviados de un cliente propio (B3-05, B3-13).
  // No permite cambiar el vendedor: la columna vendedor_id no aparece en el SET.
  router.patch('/:id', async (req, res) => {
    const id = idDeRuta(req);
    exigirConsulta(req);
    const cuerpo = exigirCuerpoObjeto(req);
    // Sin ningún campo editable no hay nada que actualizar → 400 (D16), antes de consultar la base.
    if (!CAMPOS_CLIENTE.some((c) => Object.hasOwn(cuerpo, c) && cuerpo[c] !== undefined)) {
      throw peticionInvalida('Indique al menos un campo para actualizar: nombre, nit, telefono o correo');
    }
    const vendedorId = req.vendedor.id;

    const cliente = await conTransaccion(async (conn) => {
      // Orden global de bloqueos (D17): vendedor activo → cliente.
      await bloquearVendedor(conn, vendedorId);
      const [propias] = await conn.execute(
        'SELECT id FROM clientes WHERE id = ? AND vendedor_id = ? FOR UPDATE',
        [id, vendedorId],
      );
      if (!propias[0]) throw noEncontrado(MENSAJE_NO_ENCONTRADO);
      // Los campos se validan después de comprobar la propiedad: lo ajeno siempre da 404 (D10, §8.7).
      const datos = validarCliente(cuerpo, { parcial: true });
      const tiene = (campo) => (Object.hasOwn(datos, campo) ? 1 : 0);
      // SQL fijo: cada columna se actualiza solo si su bandera es 1; si no, conserva su valor.
      await conn.execute(
        'UPDATE clientes SET nombre = IF(?, ?, nombre), nit = IF(?, ?, nit), telefono = IF(?, ?, telefono), correo = IF(?, ?, correo), updated_at = UTC_TIMESTAMP() WHERE id = ? AND vendedor_id = ?',
        [
          tiene('nombre'), datos.nombre ?? null,
          tiene('nit'), datos.nit ?? null,
          tiene('telefono'), datos.telefono ?? null,
          tiene('correo'), datos.correo ?? null,
          id, vendedorId,
        ],
      );
      return leerCliente(conn, id);
    }, pool);

    res.status(200).json(cliente);
  });

  // POST /api/clientes/:id/tomar → asigna un cliente disponible al vendedor del token (B3-11, B3-12, B3-C1).
  // Inexistente → 404; ya asignado (a cualquier vendedor) → 409; cartera llena → 409. Sin cuerpo.
  router.post('/:id/tomar', async (req, res) => {
    const id = idDeRuta(req);
    exigirConsulta(req);
    const vendedorId = req.vendedor.id;

    const cliente = await conTransaccion(async (conn) => {
      // Orden fijo de bloqueos en todas las operaciones: vendedor → cliente.
      await bloquearVendedor(conn, vendedorId);
      const [filas] = await conn.execute('SELECT id, vendedor_id FROM clientes WHERE id = ? FOR UPDATE', [id]);
      if (!filas[0]) throw noEncontrado(MENSAJE_NO_ENCONTRADO);
      if (filas[0].vendedor_id !== null) throw conflicto(MENSAJE_NO_DISPONIBLE);
      await comprobarEspacio(conn, vendedorId);

      // Actualización condicional como segunda defensa: solo si sigue disponible.
      const [resultado] = await conn.execute(
        'UPDATE clientes SET vendedor_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND vendedor_id IS NULL',
        [vendedorId, id],
      );
      if (resultado.affectedRows !== 1) throw conflicto(MENSAJE_NO_DISPONIBLE);
      return leerCliente(conn, id);
    }, pool);

    res.status(200).json(cliente);
  });

  return router;
}
