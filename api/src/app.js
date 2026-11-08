// Aplicación Express de CRM Belleza (B1).
// Archivo compartido (docs/plan.md §3.4): los cambios se coordinan entre ambas partes.
// No llama a listen(); server.js la arranca y las pruebas la usan directamente.

import express from 'express';
import cors from 'cors';
import { rutaNoEncontrada, manejadorErrores } from './middleware/errores.js';

/**
 * @param {{ origenPermitido?: string }} [opciones]
 *   origenPermitido: origen exacto aceptado por CORS. Por defecto process.env.CORS_ORIGIN.
 */
export function crearApp({ origenPermitido = process.env.CORS_ORIGIN } = {}) {
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

  app.use(express.json({ limit: '100kb' }));

  // Rutas de la API (fases B2–B5).
  // Parte A (docs/plan.md §3.4): aquí se montará el router de api/src/rutas/reportes.js en /api/reportes.

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
