// Aplicación Express de CRM Belleza (B1).
// Archivo compartido (docs/plan.md §3.4): los cambios se coordinan entre ambas partes.
// No llama a listen(); server.js la arranca y las pruebas la usan directamente.

import express from 'express';
import cors from 'cors';
import { rutaNoEncontrada, manejadorErrores } from './middleware/errores.js';
import { pool as poolPorDefecto } from './config/db.js';
import { crearRutasAuth } from './rutas/auth.js';
import { crearRutasClientes } from './rutas/clientes.js';
import { crearRutasProductos } from './rutas/productos.js';
import { crearRutasOportunidades } from './rutas/oportunidades.js';

/**
 * @param {{ origenPermitido?: string, pool?: { execute: Function } }} [opciones]
 *   origenPermitido: origen exacto aceptado por CORS. Por defecto process.env.CORS_ORIGIN.
 *   pool: conexión a MySQL. Por defecto el pool de config/db.js; las pruebas inyectan uno simulado.
 */
export function crearApp({ origenPermitido = process.env.CORS_ORIGIN, pool = poolPorDefecto } = {}) {
  const app = express();
  app.disable('x-powered-by');

  // CORS (S6): solo el origen configurado. Se compara el origen exacto, para que
  // la cabecera Access-Control-Allow-Origin no se envíe a orígenes no permitidos.
  // Nunca se usa '*'.
  app.use(
    cors({
      origin: (origen, listo) => listo(null, Boolean(origenPermitido) && origen === origenPermitido),
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // `verify` registra cuántos bytes trajo el cuerpo: así una petición sin cuerpo se distingue de
  // un objeto vacío también cuando llega por partes (Transfer-Encoding: chunked, sin Content-Length).
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { req.bytesCuerpo = buf.length; } }));

  // Rutas de la API (fases B2–B5).
  app.use('/api/auth', crearRutasAuth({ pool }));
  app.use('/api/clientes', crearRutasClientes({ pool }));
  app.use('/api/productos', crearRutasProductos({ pool }));
  app.use('/api/oportunidades', crearRutasOportunidades({ pool }));
  // Parte A (docs/plan.md §3.4): aquí se montará el router de api/src/rutas/reportes.js en /api/reportes.

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
