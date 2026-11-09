// GET /api/reportes/resumen?mes=AAAA-MM — resumen mensual del vendedor (A6, contrato §8.5). Parte A.
// - Autenticación con el middleware de la Parte B: solo vendedores activos; el vendedor sale del token.
// - Solo admite `mes`, una vez (D6, DA6-3). Sin `mes`, el mes actual de Guatemala (DA6-2); un mes mal
//   formado o vacío responde 400 (DA6-1, núcleo A6-02).
// - Las cifras salen de servicios/reportes.js (definición única de A5 §5).

import { Router } from 'express';
import { crearAutenticacion } from '../middleware/auth.js';
import { exigirConsulta } from '../utils/validaciones.js';
import { peticionInvalida } from '../utils/errores.js';
import { MENSAJE_MES_INVALIDO, calcularResumen, mesActualGuatemala, mesValido } from '../servicios/reportes.js';

/**
 * @param {{ pool: { execute: Function }, reloj?: () => Date }} opciones
 *   reloj: hora actual; solo las pruebas lo fijan (app.js usa el valor por defecto).
 */
export function crearRutasReportes({ pool, reloj = () => new Date() }) {
  const router = Router();
  router.use(crearAutenticacion({ pool }));

  router.get('/resumen', async (req, res) => {
    exigirConsulta(req, ['mes']);
    const pedido = req.query.mes;
    if (pedido !== undefined && !mesValido(pedido)) throw peticionInvalida(MENSAJE_MES_INVALIDO);

    const mes = pedido ?? mesActualGuatemala(reloj());
    res.status(200).json(await calcularResumen(pool, req.vendedor.id, mes));
  });

  return router;
}
