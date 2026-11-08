// =============================================================================
//  MODO DEMOSTRACIÓN LOCAL DE B2 — SOLO PARA DESARROLLO
// =============================================================================
// Levanta la API real de B2 (crearApp, mismas rutas, middleware y validaciones) sobre la
// base de datos SIMULADA de las pruebas (api/test/ayuda/bd-simulada.js), para revisar la SPA
// mientras no existan las migraciones ni VerificacionSeeder de la Parte A (I1).
//
// Protecciones para que no se use en producción:
//   1. Es un punto de entrada aparte: src/server.js (npm start) nunca importa este archivo
//      ni nada de test/; la prueba api/test/demo.test.js lo comprueba.
//   2. Se niega a arrancar si NODE_ENV=production.
//   3. Escucha solo en 127.0.0.1: no es accesible desde otros equipos.
//   4. No lee .env ni se conecta a MySQL; usa un JWT_SECRET aleatorio en cada arranque,
//      así que sus tokens no sirven en la API real y dejan de valer al reiniciar.
//   5. Marca cada respuesta con la cabecera X-CRM-Modo: demostracion-local.
//
// Los usuarios y clientes son FICTICIOS. No son la semilla oficial.
// Uso: npm run demo (desde api/).
// =============================================================================

import { randomBytes } from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  console.error('[DEMO] El modo demostración no puede ejecutarse con NODE_ENV=production.');
  process.exit(1);
}

// Secreto aleatorio solo para esta ejecución (nunca el de .env).
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '2h';

const HOST = '127.0.0.1';
const PUERTO = Number(process.env.DEMO_PUERTO) || 3000; // coincide con URL_API de frontend/js/api.js
const ORIGEN_SPA = process.env.DEMO_ORIGEN || 'http://127.0.0.1:5500'; // Live Server por defecto

const { crearApp } = await import('../src/app.js');
const { pool: poolReal } = await import('../src/config/db.js');
const { crearBdSimulada, CLAVE_PRUEBA } = await import('../test/ayuda/bd-simulada.js');

const bd = crearBdSimulada();
// La base simulada da 2 clientes a la vendedora de prueba; para la demostración se añade un
// tercero (ficticio) que solo existe en memoria mientras corre este proceso.
bd.clientes.push({
  id: 14, vendedor_id: 4, nombre: 'Distribuidora Demo Cosméticos', nit: '12345679', telefono: '24681357', correo: 'compras@demo-cosmeticos.test',
});
const vendedora = bd.users.find((u) => u.id === 4);

const { default: express } = await import('express');
const app = crearApp({ origenPermitido: ORIGEN_SPA, pool: bd.pool });

// Envoltorio: marca cada respuesta como demostración y delega en la app real sin modificarla.
const servidor = express()
  .disable('x-powered-by')
  .use((req, res, next) => { res.set('X-CRM-Modo', 'demostracion-local'); next(); })
  .use(app)
  .listen(PUERTO, HOST, (error) => {
    if (error) {
      console.error(`[DEMO] No se pudo iniciar en ${HOST}:${PUERTO} (código ${error.code ?? 'desconocido'}). ¿Está corriendo otra API en ese puerto?`);
      process.exit(1);
    }
    const cartera = bd.clientes.filter((c) => c.vendedor_id === vendedora.id).length;
    console.log('');
    console.log('  ==========================================================');
    console.log('   MODO DEMOSTRACIÓN LOCAL (datos ficticios, sin MySQL)');
    console.log('  ==========================================================');
    console.log(`   API:        http://${HOST}:${PUERTO}/api`);
    console.log(`   SPA (CORS): ${ORIGEN_SPA}`);
    console.log(`   Vendedora:  ${vendedora.email}`);
    console.log(`   Contraseña: ${CLAVE_PRUEBA}`);
    console.log(`   Cartera:    ${cartera} clientes`);
    console.log('   Detener:    Ctrl+C');
    console.log('  ==========================================================');
    console.log('');
  });

function detener() {
  servidor.close(() => poolReal.end().finally(() => process.exit(0)));
}
process.on('SIGINT', detener);
process.on('SIGTERM', detener);
