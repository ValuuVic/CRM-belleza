// PostToolUse (Write | Edit | MultiEdit)
// Revisa el archivo recién modificado: sintaxis JavaScript y patrones prohibidos
// por CLAUDE.md (§6, §7, §8) y las reglas S2, S3, S6 y S7.
// - Errores graves  → decision "block": Claude recibe el motivo y debe corregirlo.
// - Advertencias    → additionalContext: Claude las recibe como recordatorio.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ejecutarHook, raizProyecto, rutaRelativa, revisarSintaxisJs } from './comun.mjs';

const EXT_JS = /\.(m?js|cjs)$/i;

/** Reglas para api/: [patrón, 'error' | 'aviso', mensaje]. */
const REGLAS_API = [
  [/(from\s+|require\s*\(\s*)['"](sequelize|prisma|@prisma\/client|typeorm|knex)['"]/, 'error',
    'Se importa un ORM/query builder prohibido (Sequelize, Prisma, TypeORM o Knex). Use mysql2/promise (CLAUDE.md §6).'],
  [/['"]mysql['"]\s*\)|from\s+['"]mysql['"]/, 'error',
    'Se importa "mysql". La API debe usar "mysql2/promise" (CLAUDE.md §6).'],
  [/origin\s*:\s*['"`]\*['"`]|Access-Control-Allow-Origin['"`]?\s*,\s*['"`]\*/, 'error',
    'CORS abierto con "*". Configure el origen solo con process.env.CORS_ORIGIN (S6).'],
  [/\bcors\(\s*\)/, 'error',
    'cors() sin opciones permite cualquier origen. Use { origin: process.env.CORS_ORIGIN } (S6).'],
  [/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE)\b/i, 'error',
    'La API no ejecuta DROP ni TRUNCATE (CLAUDE.md §3).'],
  [/`[^`]*\b(SELECT|INSERT|UPDATE|DELETE|WHERE|VALUES)\b[^`]*\$\{[^`]*`/i, 'error',
    'Consulta SQL con interpolación ${...}. Use parámetros ? (S3).'],
  [/['"]\s*\b(SELECT|INSERT|UPDATE|DELETE|WHERE)\b[^'"]*['"]\s*\+/i, 'error',
    'Consulta SQL construida por concatenación. Use parámetros ? (S3).'],
  [/(jwt\.)?(sign|verify)\s*\([^)]*,\s*['"`][^'"`]{4,}['"`]/, 'error',
    'Secreto JWT escrito en el código. Use process.env.JWT_SECRET (CLAUDE.md §7, S2).'],
  [/(JWT_SECRET|DB_PASSWORD|PASSWORD)\s*(=|:)\s*['"`][^'"`]+['"`]/, 'error',
    'Posible secreto o contraseña escrito en el código (S2).'],
  [/algorithms?\s*:\s*\[?\s*['"](?!HS256)[A-Za-z0-9]+['"]/, 'error',
    'El JWT debe usar exclusivamente HS256 (CLAUDE.md §7).'],
  [/\bvendedor_id\b[^;\n]*\breq\.(body|query|params)\b|\breq\.(body|query|params)\.vendedor_id\b/, 'error',
    'Se toma vendedor_id de la petición. El propietario se obtiene del token JWT (CLAUDE.md §6).'],
  [/res\.status\(\s*500\s*\)[^;\n]*(err|error)\.(message|stack|sqlMessage)/, 'error',
    'Una respuesta 500 expone detalles internos del error (CLAUDE.md §6).'],
  [/\b(createPool|createConnection)\s*\(/, 'pool',
    ''], // se revisa aparte
];

const REGLAS_FRONTEND = [
  [/\b(react|vue|angular|@angular\/core|svelte)\b['"]/i, 'error',
    'La SPA no usa frameworks como React, Vue o Angular (CLAUDE.md §8).'],
  [/localStorage\.setItem\(\s*['"`][^'"`]*(password|contrasena|contraseña)/i, 'error',
    'No se guardan contraseñas en localStorage (CLAUDE.md §8).'],
  [/\b(mysql|mysql2)\b['"]/, 'error',
    'La SPA nunca accede directamente a MySQL (CLAUDE.md §8).'],
];

function revisarSintaxis(abs) {
  const error = revisarSintaxisJs(abs);
  return error ? `Error de sintaxis en el archivo: ${error}` : null;
}

function revisarContenido(rel, contenido) {
  const errores = [];
  const avisos = [];
  const reglas = rel.startsWith('api/') ? REGLAS_API : rel.startsWith('frontend/') ? REGLAS_FRONTEND : [];

  // Las pruebas pueden usar las credenciales de prueba de la semilla y, en las pruebas
  // negativas de JWT (B2-07), firmar tokens con un secreto de prueba o con algoritmos
  // no permitidos para comprobar que la API los rechaza. Estas reglas siguen aplicándose
  // a todo el código de api/src.
  const esPrueba = /(^|\/)(test|tests|__tests__)\/|\.test\.m?js$/.test(rel);
  const EXENTAS_EN_PRUEBAS = ['Posible secreto', 'Secreto JWT escrito', 'El JWT debe usar exclusivamente HS256'];

  for (const [patron, nivel, mensaje] of reglas) {
    if (esPrueba && EXENTAS_EN_PRUEBAS.some((m) => mensaje.startsWith(m))) continue;
    if (!patron.test(contenido)) continue;
    if (nivel === 'pool') {
      if (!/timezone\s*:\s*['"]Z['"]/.test(contenido)) avisos.push("El pool de mysql2 debe usar timezone: 'Z' (CLAUDE.md §4).");
      if (!/decimalNumbers\s*:\s*true/.test(contenido)) avisos.push('El pool de mysql2 debe usar decimalNumbers: true (CLAUDE.md §4).');
      continue;
    }
    (nivel === 'error' ? errores : avisos).push(mensaje);
  }

  if (rel.startsWith('frontend/')) {
    // innerHTML con plantillas: recordar escapar el texto de la API (S7).
    if (/\.innerHTML\s*[+]?=\s*`[^`]*\$\{(?![^}]*escap)/.test(contenido)) {
      avisos.push('Se asigna innerHTML con interpolaciones. Verifique que todo texto de la API pase por la función de escape o use textContent (S7).');
    }
    if (/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/.test(contenido) && !/escap/i.test(contenido)) {
      avisos.push('El archivo usa innerHTML/insertAdjacentHTML y no contiene ninguna función de escape (S7).');
    }
  }

  return { errores, avisos };
}

function revisarPackageJson(contenido) {
  try {
    const pkg = JSON.parse(contenido);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const prohibidas = Object.keys(deps).filter((d) => /^(sequelize|prisma|@prisma\/.+|typeorm|knex)$/i.test(d));
    return prohibidas.length
      ? [`package.json incluye dependencias prohibidas: ${prohibidas.join(', ')} (CLAUDE.md §6).`]
      : [];
  } catch {
    return ['package.json no es un JSON válido.'];
  }
}

await ejecutarHook(async (entrada) => {
  const datos = entrada.tool_input || {};
  const ruta = datos.file_path || datos.notebook_path;
  if (!ruta) return;

  const raiz = raizProyecto(entrada);
  const rel = rutaRelativa(ruta, raiz);
  if (rel === null || !(rel.startsWith('api/') || rel.startsWith('frontend/'))) return;
  if (rel.includes('node_modules/')) return;

  const abs = path.resolve(raiz, ruta);
  if (!existsSync(abs)) return;
  const contenido = readFileSync(abs, 'utf8');

  let errores = [];
  let avisos = [];

  if (rel.endsWith('package.json')) {
    errores = revisarPackageJson(contenido);
  } else if (EXT_JS.test(rel)) {
    const sintaxis = revisarSintaxis(abs);
    if (sintaxis) errores.push(sintaxis);
    const r = revisarContenido(rel, contenido);
    errores.push(...r.errores);
    avisos.push(...r.avisos);
  } else if (rel.endsWith('.html')) {
    const r = revisarContenido(rel, contenido);
    errores.push(...r.errores);
    avisos.push(...r.avisos);
  }

  if (errores.length) {
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason: `[hook CRM] Revisión de ${rel}:\n- ${[...errores, ...avisos].join('\n- ')}\nCorrija el archivo antes de continuar.`,
      }),
    );
  } else if (avisos.length) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `[hook CRM] Avisos para ${rel}:\n- ${avisos.join('\n- ')}`,
        },
      }),
    );
  }
  process.exit(0);
});
