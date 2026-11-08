// Stop
// Al terminar un turno, si hay cambios sin confirmar en api/ o frontend/:
//   1. Comprueba la sintaxis de los archivos JavaScript modificados.
//   2. Si hay cambios en api/ y existen pruebas, ejecuta `node --test` en api/.
// Si algo falla, impide terminar (decision "block") para que Claude lo corrija.
// Si ya se bloqueó una vez en este ciclo (stop_hook_active), solo informa,
// para no crear un bucle infinito.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ejecutarHook, raizProyecto, git, revisarSintaxisJs } from './comun.mjs';

const EXT_JS = /\.(m?js|cjs)$/i;
const PATRON_PRUEBA = /(\.test\.m?js$|^test\.m?js$)/i;

function archivosModificados(raiz) {
  const salida = git(['status', '--porcelain', '--untracked-files=all', '--', 'api', 'frontend'], raiz);
  if (!salida) return [];
  return salida
    .split('\n')
    .filter(Boolean)
    .filter((l) => !l.startsWith(' D') && !l.startsWith('D '))
    .map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop())
    .filter((r) => !r.includes('node_modules/'));
}

function hayPruebas(dir) {
  if (!existsSync(dir)) return false;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
    const abs = path.join(dir, nombre);
    const st = statSync(abs);
    if (st.isDirectory() ? hayPruebas(abs) : PATRON_PRUEBA.test(nombre)) return true;
  }
  return false;
}

function revisarSintaxis(raiz, archivos) {
  const fallos = [];
  for (const rel of archivos.filter((a) => EXT_JS.test(a))) {
    const abs = path.join(raiz, rel);
    if (!existsSync(abs)) continue;
    const error = revisarSintaxisJs(abs);
    if (error) fallos.push(`${rel}: ${error}`);
  }
  return fallos;
}

function ejecutarPruebas(raiz) {
  const dirApi = path.join(raiz, 'api');
  // NODE_TEST_CONTEXT heredado haría que el proceso hijo informe a otro runner
  // y termine con código 0 aunque fallen las pruebas.
  const { NODE_TEST_CONTEXT, ...envLimpio } = process.env;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec'], {
    cwd: dirApi,
    encoding: 'utf8',
    timeout: 170000,
    env: { ...envLimpio, NODE_ENV: 'test' },
  });
  const salida = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  const resumen = salida.split('\n').filter((l) => /^\s*ℹ\s+(tests|pass|fail|cancelled|skipped|duration)/.test(l));
  return {
    ok: r.status === 0,
    agotado: r.error?.code === 'ETIMEDOUT',
    resumen: resumen.join('\n'),
    cola: salida.split('\n').slice(-25).join('\n'),
  };
}

await ejecutarHook(async (entrada) => {
  const raiz = raizProyecto(entrada);
  const archivos = archivosModificados(raiz);
  if (!archivos.length) return process.exit(0);

  const problemas = [];
  const fallosSintaxis = revisarSintaxis(raiz, archivos);
  if (fallosSintaxis.length) problemas.push(`Errores de sintaxis:\n- ${fallosSintaxis.join('\n- ')}`);

  let informe = '';
  const cambiosApi = archivos.some((a) => a.startsWith('api/'));
  if (cambiosApi && hayPruebas(path.join(raiz, 'api'))) {
    const p = ejecutarPruebas(raiz);
    if (p.agotado) problemas.push('Las pruebas de api/ superaron el tiempo límite.');
    else if (!p.ok) problemas.push(`Fallaron las pruebas de api/ (node --test):\n${p.resumen || p.cola}`);
    else informe = `Pruebas de api/ superadas.\n${p.resumen}`;
  } else if (cambiosApi) {
    informe = 'Hay cambios en api/ pero todavía no existen pruebas *.test.js.';
  }

  if (!problemas.length) {
    if (informe) process.stdout.write(JSON.stringify({ systemMessage: `[hook CRM] ${informe}` }));
    return process.exit(0);
  }

  const texto = `[hook CRM] Verificación al terminar:\n${problemas.join('\n\n')}`;
  if (entrada.stop_hook_active) {
    // Ya se pidió una corrección en este ciclo: se informa sin volver a bloquear.
    process.stdout.write(JSON.stringify({ systemMessage: `${texto}\n(No se bloquea de nuevo para evitar un bucle; informe el fallo a la usuaria.)` }));
  } else {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `${texto}\nCorrija los fallos o informe por qué no puede hacerlo. No afirme que las pruebas pasaron.` }));
  }
  process.exit(0);
});
