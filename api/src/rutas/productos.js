// GET /api/productos — catálogo activo para vendedores (contrato §8; B4-01).
// Solo lectura: la API de vendedores no crea, edita ni desactiva productos (L3 es de la Parte A).
// Campos (decisión de B4): { id, nombre, precio, stock }; stock NULL = sin control de inventario.

import { Router } from 'express';
import { crearAutenticacion } from '../middleware/auth.js';
import { exigirConsulta } from '../utils/validaciones.js';

export function crearRutasProductos({ pool }) {
  const router = Router();
  router.use(crearAutenticacion({ pool }));

  router.get('/', async (req, res) => {
    exigirConsulta(req);
    const [filas] = await pool.execute(
      'SELECT id, nombre, precio, stock FROM productos WHERE activo = 1 ORDER BY nombre, id',
    );
    res.status(200).json(filas.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio),
      stock: p.stock ?? null,
    })));
  });

  return router;
}
