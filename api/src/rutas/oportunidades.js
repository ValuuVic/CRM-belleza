// /api/oportunidades — oportunidades, etapas y líneas de productos (A4, R2, R5, R6, RP; B4).
// - El dueño sale solo de req.vendedor (token verificado por el middleware de B2): oportunidades
//   ajenas o inexistentes → 404 con el mismo mensaje (S5).
// - Orden de validación: id de ruta (404) → parámetros de consulta (400) → cuerpo no objeto (400) →
//   dentro de la transacción: propiedad (404) → cerrada (409) → campos (422) → transición (409/422)
//   → stock (409). Así una oportunidad ajena siempre da 404 y una cerrada 409 (R2, CA-10, B4-19).
//   En el alta (sin oportunidad previa) los campos se validan antes de la transacción.
// - El precio de cada línea se copia del catálogo; precio_unitario, total, vendedor_id y demás
//   campos del cuerpo se ignoran (B4-07, D5).
// - Todas las escrituras van en una transacción (B1) que empieza bloqueando la oportunidad.

import { Router } from 'express';
import { crearAutenticacion } from '../middleware/auth.js';
import { conTransaccion } from '../utils/transaccion.js';
import { ErrorHttp, ErrorValidacion, noEncontrado, peticionInvalida } from '../utils/errores.js';
import {
  exigirConsulta, exigirCuerpoObjeto, exigirIdRuta as idRuta, exigirCampo, reunir, idCuerpo, cantidadValida,
  textoObligatorio,
} from '../utils/validaciones.js';
import { ETAPA_INICIAL, ETAPAS, esEtapa, validarTransicion } from '../servicios/embudo.js';
import { bloquearVendedor } from '../servicios/vendedores.js';
import {
  MENSAJE_OPORTUNIDAD_NO_ENCONTRADA, leerResumenes, leerDetalle, bloquearOportunidadPropia,
  registrarHistorial, verificarYDescontarStock, aplicarEtapa,
} from '../servicios/oportunidades.js';

export const LONGITUD_TITULO = 150; // oportunidades.titulo VARCHAR(150)
export const LONGITUD_MOTIVO = 255; // motivo_perdida VARCHAR(255), R5

const MENSAJE_CLIENTE = 'Seleccione un cliente de su cartera';
const MENSAJE_PRODUCTO = 'Seleccione un producto activo del catálogo';
const MENSAJE_LINEA_NO_ENCONTRADA = 'Línea de producto no encontrada';

const validarTitulo = (valor) => textoObligatorio(valor, { maximo: LONGITUD_TITULO, vacio: 'Ingrese el título de la oportunidad', etiqueta: 'El título' });
const validarMotivo = (valor) => textoObligatorio(valor, { maximo: LONGITUD_MOTIVO, vacio: 'Indique el motivo de la pérdida', etiqueta: 'El motivo' });

export function crearRutasOportunidades({ pool }) {
  const router = Router();
  router.use(crearAutenticacion({ pool }));

  /**
   * Ejecuta `trabajo` en una transacción que empieza bloqueando al vendedor activo (orden global de
   * bloqueos, servicios/vendedores.js) y devuelve el detalle actualizado de la oportunidad.
   */
  const enTransaccion = (req, trabajo) => conTransaccion(async (conn) => {
    await bloquearVendedor(conn, req.vendedor.id);
    const id = await trabajo(conn);
    return leerDetalle(conn, id, req.vendedor.id);
  }, pool);

  // GET /api/oportunidades?etapa= → resúmenes propios (B4-02). Etapa desconocida → 400 (§8.6).
  router.get('/', async (req, res) => {
    exigirConsulta(req, ['etapa']);
    const { etapa } = req.query;
    if (etapa !== undefined && !esEtapa(etapa)) throw peticionInvalida(`Etapa no válida; use una de: ${ETAPAS.join(', ')}`);
    res.status(200).json(await leerResumenes(pool, req.vendedor.id, etapa));
  });

  // GET /api/oportunidades/:id → detalle propio (B4-03, B4-20, B4-21).
  router.get('/:id', async (req, res) => {
    const id = idRuta(req.params.id, MENSAJE_OPORTUNIDAD_NO_ENCONTRADA);
    exigirConsulta(req);
    const detalle = await leerDetalle(pool, id, req.vendedor.id); // una sola comprobación de propiedad
    if (!detalle) throw noEncontrado(MENSAJE_OPORTUNIDAD_NO_ENCONTRADA);
    res.status(200).json(detalle);
  });

  // POST /api/oportunidades { cliente_id, titulo } → 201 en prospecto con su primer historial (B4-04, B4-05).
  router.post('/', async (req, res) => {
    exigirConsulta(req);
    const cuerpo = exigirCuerpoObjeto(req);
    const datos = reunir({
      cliente_id: idCuerpo(cuerpo.cliente_id, MENSAJE_CLIENTE),
      titulo: validarTitulo(cuerpo.titulo),
    });
    const vendedorId = req.vendedor.id;

    const detalle = await enTransaccion(req, async (conn) => {
      // El cliente debe seguir en la cartera del vendedor; ajeno, disponible o inexistente → mismo 422.
      const [[cliente]] = await conn.execute(
        'SELECT id FROM clientes WHERE id = ? AND vendedor_id = ? FOR UPDATE',
        [datos.cliente_id, vendedorId],
      );
      if (!cliente) throw new ErrorValidacion({ cliente_id: MENSAJE_CLIENTE });
      const [r] = await conn.execute(
        'INSERT INTO oportunidades (cliente_id, vendedor_id, titulo, etapa, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
        [datos.cliente_id, vendedorId, datos.titulo, ETAPA_INICIAL],
      );
      await registrarHistorial(conn, { oportunidadId: r.insertId, usuarioId: vendedorId, anterior: null, nueva: ETAPA_INICIAL });
      return r.insertId;
    });
    res.status(201).json(detalle);
  });

  // PATCH /api/oportunidades/:id { titulo } → 200; cerrada → 409 (B4-11, B4-19).
  router.patch('/:id', async (req, res) => {
    const id = idRuta(req.params.id, MENSAJE_OPORTUNIDAD_NO_ENCONTRADA);
    exigirConsulta(req);
    const cuerpo = exigirCuerpoObjeto(req);
    exigirCampo(cuerpo, 'titulo');

    const detalle = await enTransaccion(req, async (conn) => {
      await bloquearOportunidadPropia(conn, id, req.vendedor.id, { abierta: true });
      const { titulo } = reunir({ titulo: validarTitulo(cuerpo.titulo) }); // tras 404 y 409 (R2, CA-10)
      await conn.execute('UPDATE oportunidades SET titulo = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [titulo, id]);
      return id;
    });
    res.status(200).json(detalle);
  });

  // PATCH /api/oportunidades/:id/etapa { etapa, motivo_perdida? } (B4-12 a B4-19, B4-C1 a B4-C3).
  // Orden de B4 §8: bloquear → propiedad y estado → transición → (ganar) productos y stock →
  // descontar → actualizar la oportunidad → historial → commit o rollback completo.
  router.patch('/:id/etapa', async (req, res) => {
    const id = idRuta(req.params.id, MENSAJE_OPORTUNIDAD_NO_ENCONTRADA);
    exigirConsulta(req);
    const cuerpo = exigirCuerpoObjeto(req);
    const usuarioId = req.vendedor.id;

    const detalle = await enTransaccion(req, async (conn) => {
      // Ajena → 404 y cerrada → 409 antes de validar el cuerpo (R2, CA-10, B4-19).
      const o = await bloquearOportunidadPropia(conn, id, usuarioId, { abierta: true });
      const campos = { etapa: esEtapa(cuerpo.etapa) ? { valor: cuerpo.etapa } : { error: `Seleccione una etapa válida: ${ETAPAS.join(', ')}` } };
      // El motivo solo se exige y se usa al perder; en otras etapas se ignora (D5).
      if (cuerpo.etapa === 'perdida') campos.motivo_perdida = validarMotivo(cuerpo.motivo_perdida);
      const { etapa: nueva, motivo_perdida: motivo } = reunir(campos);
      const t = validarTransicion(o.etapa, nueva);
      if (!t.ok) throw t.status === 422 ? new ErrorValidacion({ etapa: t.mensaje }) : new ErrorHttp(t.status, t.mensaje);
      if (nueva === 'ganada') await verificarYDescontarStock(conn, id);
      await aplicarEtapa(conn, { id, anterior: o.etapa, nueva, motivo: motivo ?? null, usuarioId });
      return id;
    });
    res.status(200).json(detalle);
  });

  // POST /api/oportunidades/:id/productos { producto_id, cantidad } → 201 con el detalle (B4-06 a B4-09).
  router.post('/:id/productos', async (req, res) => {
    const id = idRuta(req.params.id, MENSAJE_OPORTUNIDAD_NO_ENCONTRADA);
    exigirConsulta(req);
    const cuerpo = exigirCuerpoObjeto(req);

    const detalle = await enTransaccion(req, async (conn) => {
      await bloquearOportunidadPropia(conn, id, req.vendedor.id, { abierta: true });
      const datos = reunir({ // tras 404 y 409 (R2, CA-10)
        producto_id: idCuerpo(cuerpo.producto_id, MENSAJE_PRODUCTO),
        cantidad: cantidadValida(cuerpo.cantidad),
      });
      // Lectura con bloqueo compartido: el precio copiado es el vigente al confirmar (orden oportunidad → producto).
      const [[producto]] = await conn.execute('SELECT id, precio, activo FROM productos WHERE id = ? FOR SHARE', [datos.producto_id]);
      if (!producto) throw new ErrorValidacion({ producto_id: MENSAJE_PRODUCTO });
      if (!Number(producto.activo)) throw new ErrorValidacion({ producto_id: 'El producto no está activo en el catálogo' });
      // Precio copiado del catálogo (R6). Un producto repetido lo rechaza el índice único (1062 → 409).
      await conn.execute(
        'INSERT INTO oportunidad_productos (oportunidad_id, producto_id, cantidad, precio_unitario, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
        [id, producto.id, datos.cantidad, producto.precio],
      );
      return id;
    });
    res.status(201).json(detalle);
  });

  /** Bloquea la oportunidad (abierta) y la línea, comprobando que la línea es de esa oportunidad (B4-10). */
  async function bloquearLinea(conn, req, id, lineaId) {
    await bloquearOportunidadPropia(conn, id, req.vendedor.id, { abierta: true });
    const [[linea]] = await conn.execute(
      'SELECT id FROM oportunidad_productos WHERE id = ? AND oportunidad_id = ? FOR UPDATE',
      [lineaId, id],
    );
    if (!linea) throw noEncontrado(MENSAJE_LINEA_NO_ENCONTRADA);
  }

  // PATCH /api/oportunidades/:id/productos/:lineaId { cantidad } → 200 con el detalle (B4-09, B4-10).
  router.patch('/:id/productos/:lineaId', async (req, res) => {
    const id = idRuta(req.params.id, MENSAJE_OPORTUNIDAD_NO_ENCONTRADA);
    const lineaId = idRuta(req.params.lineaId, MENSAJE_LINEA_NO_ENCONTRADA);
    exigirConsulta(req);
    const cuerpo = exigirCuerpoObjeto(req);
    exigirCampo(cuerpo, 'cantidad');

    const detalle = await enTransaccion(req, async (conn) => {
      await bloquearLinea(conn, req, id, lineaId);
      const { cantidad } = reunir({ cantidad: cantidadValida(cuerpo.cantidad) }); // tras 404 y 409
      await conn.execute(
        'UPDATE oportunidad_productos SET cantidad = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND oportunidad_id = ?',
        [cantidad, lineaId, id],
      );
      return id;
    });
    res.status(200).json(detalle);
  });

  // DELETE /api/oportunidades/:id/productos/:lineaId → 204 sin cuerpo (B4-10).
  router.delete('/:id/productos/:lineaId', async (req, res) => {
    const id = idRuta(req.params.id, MENSAJE_OPORTUNIDAD_NO_ENCONTRADA);
    const lineaId = idRuta(req.params.lineaId, MENSAJE_LINEA_NO_ENCONTRADA);
    exigirConsulta(req);
    await conTransaccion(async (conn) => {
      await bloquearVendedor(conn, req.vendedor.id);
      await bloquearLinea(conn, req, id, lineaId);
      await conn.execute('DELETE FROM oportunidad_productos WHERE id = ? AND oportunidad_id = ?', [lineaId, id]);
    }, pool);
    res.status(204).end();
  });

  return router;
}
