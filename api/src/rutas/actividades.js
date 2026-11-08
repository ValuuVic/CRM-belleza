// /api/actividades — consulta y actualización de actividades (A5, R2, R8; B5).
// El alta está en rutas/clientes.js (POST /api/clientes/:id/actividades), como fija el contrato (§8).
// - El vendedor sale solo de req.vendedor (middleware de B2); la propiedad es la del dueño ACTUAL
//   del cliente (servicios/actividades.js).
// - Orden de comprobación (D10, §8.7): id de ruta (404) → consulta (400) → cuerpo (400) →
//   propiedad (404) → campos (422).
// - Seguridad de la cuenta: la escritura empieza con bloquearVendedor, que vuelve a exigir un vendedor
//   activo y retiene su fila hasta el commit. El GET no abre transacción: solo lo protege el middleware.

import { Router } from 'express';
import { crearAutenticacion } from '../middleware/auth.js';
import { conTransaccion } from '../utils/transaccion.js';
import { peticionInvalida } from '../utils/errores.js';
import { exigirCampo, exigirConsulta, exigirCuerpoObjeto, exigirIdRuta } from '../utils/validaciones.js';
import { bloquearVendedor } from '../servicios/vendedores.js';
import {
  ESTADOS_ACTIVIDAD, MENSAJE_ACTIVIDAD_NO_ENCONTRADA,
  bloquearActividadPropia, leerActividades, marcarCompletada, validarCompletada,
} from '../servicios/actividades.js';

export function crearRutasActividades({ pool }) {
  const router = Router();
  router.use(crearAutenticacion({ pool }));

  // GET /api/actividades?estado=pendiente|completada → array (B5-01 a B5-04).
  // Otro valor, otro parámetro o un parámetro repetido → 400 con mensaje fijo (D6).
  router.get('/', async (req, res) => {
    exigirConsulta(req, ['estado']);
    const { estado } = req.query;
    if (estado !== undefined && !ESTADOS_ACTIVIDAD.includes(estado)) {
      throw peticionInvalida(`Estado no válido; use uno de: ${ESTADOS_ACTIVIDAD.join(', ')}`);
    }
    res.status(200).json(await leerActividades(pool, req.vendedor.id, estado));
  });

  // PATCH /api/actividades/:id { completada } → 200 con la actividad (B5-11 a B5-13).
  // Repetir el valor actual es válido (200) y `false` reabre la actividad (decisiones de B5).
  router.patch('/:id', async (req, res) => {
    const id = exigirIdRuta(req.params.id, MENSAJE_ACTIVIDAD_NO_ENCONTRADA);
    exigirConsulta(req);
    const cuerpo = exigirCuerpoObjeto(req);
    exigirCampo(cuerpo, 'completada'); // sin el campo no hay nada que actualizar → 400 (D16)
    const vendedorId = req.vendedor.id;

    const actividad = await conTransaccion(async (conn) => {
      await bloquearVendedor(conn, vendedorId); // primera lectura de la transacción (D17)
      const bloqueada = await bloquearActividadPropia(conn, id, vendedorId); // ajena → 404 antes de validar (D10)
      const completada = validarCompletada(cuerpo.completada);
      return marcarCompletada(conn, bloqueada, completada); // respuesta con filas leídas bajo bloqueo
    }, pool);

    res.status(200).json(actividad);
  });

  return router;
}
