// Punto de entrada de la API (B1-01, B1-02).
// Las variables se cargan con `node --env-file=.env` (scripts start y dev de package.json).
// Los mensajes nunca muestran valores de configuración ni credenciales.

import { crearApp } from './app.js';
import { pool, verificarConexion } from './config/db.js';

function configuracionInvalida() {
  const problemas = [];
  const puerto = Number(process.env.PORT);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    problemas.push('PORT debe ser un número de puerto válido');
  }
  const origen = (process.env.CORS_ORIGIN ?? '').trim();
  if (!origen) problemas.push('CORS_ORIGIN es obligatorio');
  else if (origen.includes('*')) problemas.push('CORS_ORIGIN no puede ser "*"');
  else if (!esOrigenValido(origen)) problemas.push('CORS_ORIGIN debe ser un origen http(s) exacto, como http://127.0.0.1:5500');
  return problemas;
}

// Un origen válido es esquema://host[:puerto], sin ruta, sin barra final y nunca el literal "null".
function esOrigenValido(origen) {
  try {
    const url = new URL(origen);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === origen;
  } catch {
    return false;
  }
}

const problemas = configuracionInvalida();
if (problemas.length) {
  console.error(`[API] Configuración incompleta: ${problemas.join('; ')}.`);
  process.exit(1);
}

const puerto = Number(process.env.PORT);

// B1-02: si MySQL no está disponible, el servidor arranca igualmente y avisa sin credenciales.
const estadoBd = await verificarConexion();
if (estadoBd.conectado) {
  console.log('[API] Conexión con MySQL establecida.');
} else {
  console.warn(`[API] No se pudo conectar con MySQL (código ${estadoBd.codigo}). Las peticiones que usen la base de datos fallarán hasta que esté disponible.`);
}

// En Express 5, el callback de app.listen() también se invoca cuando el listen falla
// (por ejemplo, EADDRINUSE), y recibe el error como primer argumento.
const servidor = crearApp({ origenPermitido: process.env.CORS_ORIGIN.trim() }).listen(puerto, (error) => {
  if (error) {
    console.error(`[API] No se pudo iniciar el servidor (código ${error.code ?? 'desconocido'}).`);
    process.exit(1);
  }
  console.log(`[API] Escuchando en el puerto ${puerto}.`);
});

function detener() {
  servidor.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGINT', detener);
process.on('SIGTERM', detener);
