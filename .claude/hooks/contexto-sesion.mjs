// SessionStart
// Agrega al contexto de la sesión el estado del proyecto y las reglas clave,
// para que Claude empiece cada sesión sabiendo rama, parte, fase y restricciones.

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ejecutarHook, raizProyecto, ramaActual, existeEtiqueta, parteActual, git } from './comun.mjs';

await ejecutarHook(async (entrada) => {
  const raiz = raizProyecto(entrada);
  const rama = ramaActual(raiz) || '(desconocida)';
  const parte = parteActual(raiz);
  const specV1 = existeEtiqueta('spec-v1', raiz);
  const dirSpecs = path.join(raiz, 'docs', 'specs');
  const specs = existsSync(dirSpecs) ? readdirSync(dirSpecs).filter((f) => f.endsWith('.md')) : [];
  const estado = git(['status', '--porcelain'], raiz);
  const cambios = estado ? estado.split('\n').filter(Boolean).length : 0;

  const lineas = [
    '[hook CRM] Contexto de CRM Belleza',
    `- Rama actual: ${rama}${rama === 'main' ? ' (rama estable: cree una rama a/… o b/… antes de implementar)' : ''}`,
    `- Parte de esta sesión: ${parte ? `Parte ${parte}` : 'no determinada (defina CRM_PARTE=A|B o use una rama a/… o b/…)'}`,
    `- Etiqueta spec-v1: ${specV1 ? 'existe' : 'NO existe → no se escribe código de implementación'}`,
    `- Specs de fase en docs/specs/: ${specs.length ? specs.join(', ') : 'ninguna todavía'}`,
    `- Archivos con cambios sin confirmar: ${cambios}`,
    '',
    'Recordatorios:',
    '- Fuente de verdad: docs/especificacion.md; fases en docs/plan.md; evidencias en docs/verificacion.md.',
    '- Antes de implementar una fase: leer CLAUDE.md, docs/plan.md y su spec, y presentar un plan.',
    '- Parte A: laravel/, migraciones, seeders, GET /api/reportes/resumen y vista de resumen de la SPA.',
    '- Parte B: api/ y frontend/ (salvo resumen mensual). No modificar laravel/, .env ni migraciones.',
    '- SQL solo con parámetros ?; sin ORM; CORS solo con process.env.CORS_ORIGIN; JWT HS256 desde .env.',
    '- No hacer push ni merge sin autorización; no afirmar que una prueba pasó sin ejecutarla.',
  ];

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lineas.join('\n') },
    }),
  );
  process.exit(0);
});
