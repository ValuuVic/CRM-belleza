// /api/clientes — B2: solo el listado de la cartera del vendedor (B2-10; R2, R4, S4, S5).
// B3 ampliará este router con búsqueda (?q=), creación, detalle, edición y toma de clientes.

import { Router } from 'express';
import { crearAutenticacion } from '../middleware/auth.js';

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

export function crearRutasClientes({ pool }) {
  const router = Router();
  router.use(crearAutenticacion({ pool }));

  // GET /api/clientes → array plano con los clientes asignados al vendedor del token.
  router.get('/', async (req, res) => {
    const [filas] = await pool.execute(
      'SELECT id, nombre, nit, telefono, correo FROM clientes WHERE vendedor_id = ? ORDER BY nombre, id',
      [req.vendedor.id],
    );
    res.status(200).json(filas.map(serializarCliente));
  });

  return router;
}
