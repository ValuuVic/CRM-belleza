// Utilidades compartidas por los hooks de CRM Belleza.
// Sin dependencias externas: solo módulos nativos de Node.js.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Lee y analiza el JSON que Claude Code envía por stdin. */
export async function leerEntrada() {
  const trozos = [];
  for await (const t of process.stdin) trozos.push(t);
  const texto = Buffer.concat(trozos).toString('utf8').trim();
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch {
    return {};
  }
}

/** Directorio raíz del proyecto. */
export function raizProyecto(entrada = {}) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd());
}

/**
 * Convierte una ruta (absoluta o relativa, con \ o /) en ruta relativa a la raíz,
 * con separador "/" y en minúsculas para comparar sin depender del sistema.
 * Devuelve null si la ruta queda fuera del proyecto.
 */
export function rutaRelativa(ruta, raiz) {
  if (!ruta) return null;
  const absoluta = path.resolve(raiz, String(ruta));
  const rel = path.relative(raiz, absoluta);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/').toLowerCase();
}

/** Ejecuta git y devuelve stdout recortado, o null si falla. */
export function git(args, raiz) {
  try {
    return execFileSync('git', args, {
      cwd: raiz,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    }).trim();
  } catch {
    return null;
  }
}

export function ramaActual(raiz) {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], raiz);
}

export function existeEtiqueta(etiqueta, raiz) {
  return git(['rev-parse', '-q', '--verify', `refs/tags/${etiqueta}`], raiz) !== null;
}

/**
 * Parte que trabaja en esta sesión: 'A', 'B' o null (desconocida).
 * Prioridad: variable CRM_PARTE → prefijo de la rama (a/…, b/…).
 */
export function parteActual(raiz) {
  const env = (process.env.CRM_PARTE || '').trim().toUpperCase();
  if (env === 'A' || env === 'B') return env;
  const rama = ramaActual(raiz) || '';
  if (/^a\//i.test(rama)) return 'A';
  if (/^b\//i.test(rama)) return 'B';
  return null;
}

/** ¿Es un archivo .env real? (.env.example sí se permite) */
export function esArchivoEnv(rel) {
  const nombre = rel.split('/').pop();
  if (nombre === '.env.example') return false;
  return nombre === '.env' || nombre.startsWith('.env.');
}

/**
 * Archivos de api/ y frontend/ reservados para la Parte A (docs/plan.md §3.4).
 * Rutas exactas, relativas a la raíz y en minúsculas.
 */
export const ARCHIVOS_PARTE_A = new Set([
  'api/src/rutas/reportes.js',
  'api/src/servicios/reportes.js',
  'api/test/reportes-a6.test.js',
  'api/test/integracion-a6.test.js',
  'frontend/js/vistas/resumen.js',
  'frontend/js/acciones-resumen.js',
  'frontend/test/resumen-a6.test.js',
]);

/** Archivos compartidos: requieren coordinación (docs/plan.md §3.4 y CLAUDE.md §2). */
export const ARCHIVOS_COMPARTIDOS = new Set([
  'claude.md',
  'readme.md',
  'docs/especificacion.md',
  'docs/plan.md',
  'docs/verificacion.md',
  'api/src/app.js',
  'docker-compose.yml',
  '.gitignore',
]);

export function esExcepcionParteA(rel) {
  return ARCHIVOS_PARTE_A.has(rel);
}

/**
 * Clasifica una ruta relativa según la división de responsabilidades.
 * Devuelve: 'env' | 'migracion' | 'A' | 'B' | 'compartido' | 'hooks' | 'libre'
 */
export function clasificarRuta(rel) {
  if (esArchivoEnv(rel)) return 'env';
  if (/^laravel\/database\/migrations\//.test(rel)) return 'migracion';
  if (rel.startsWith('laravel/')) return 'A';
  if (esExcepcionParteA(rel)) return 'A';
  if (rel.startsWith('.claude/hooks/') || rel === '.claude/settings.json') return 'hooks';
  if (ARCHIVOS_COMPARTIDOS.has(rel) || rel.startsWith('.claude/agents/')) return 'compartido';
  if (rel.startsWith('api/') || rel.startsWith('frontend/')) return 'B';
  return 'libre';
}

/**
 * Comprueba la sintaxis de un archivo JavaScript. Devuelve null si es válida
 * o el mensaje de error. api/ (type: module) y la SPA usan módulos ES, así que
 * .js y .mjs se comprueban como módulo; `node --check archivo.js` no basta,
 * porque fuera de un paquete "type: module" puede dar por válido código roto.
 */
export function revisarSintaxisJs(abs) {
  const esCjs = abs.toLowerCase().endsWith('.cjs');
  try {
    execFileSync(
      process.execPath,
      esCjs ? ['--check', abs] : ['--input-type=module', '--check'],
      {
        input: esCjs ? undefined : readFileSync(abs, 'utf8'),
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    return null;
  } catch (e) {
    return String(e.stderr || e.message)
      .split('\n')
      .filter((l) => l.trim() && !/^\s+at\s|^Node\.js v/.test(l))
      .slice(0, 4)
      .join(' | ')
      .replace('[stdin]', path.basename(abs));
  }
}

/**
 * Registra bloqueos y confirmaciones en .claude/bloqueos.log (ignorado por Git)
 * como evidencia para docs/verificacion.md y la bitácora de IA.
 * Un fallo al escribir el registro nunca impide la decisión del hook.
 */
export function registrarBloqueo(decision, motivo) {
  try {
    const raiz = raizProyecto();
    const hook = path.basename(process.argv[1] || 'hook');
    const linea = `${new Date().toISOString()}\t${decision}\t${hook}\t${motivo.replace(/\s+/g, ' ')}\n`;
    appendFileSync(path.join(raiz, '.claude', 'bloqueos.log'), linea, 'utf8');
  } catch {
    // sin registro
  }
}

/** Respuestas de PreToolUse. */
export function responderPre(decision, motivo) {
  registrarBloqueo(decision, motivo);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision, // 'deny' | 'ask' | 'allow'
        permissionDecisionReason: motivo,
      },
    }),
  );
  process.exit(0);
}

export const denegar = (motivo) => responderPre('deny', `[hook CRM] ${motivo}`);
export const preguntar = (motivo) => responderPre('ask', `[hook CRM] ${motivo}`);

/** Termina sin opinión (deja actuar al sistema normal de permisos). */
export function continuar() {
  process.exit(0);
}

/** Ejecuta la función principal de un hook capturando errores inesperados. */
export async function ejecutarHook(principal) {
  try {
    await principal(await leerEntrada());
  } catch (error) {
    // Un fallo interno no debe bloquear la sesión: se informa y se continúa.
    process.stderr.write(`[hook CRM] Error interno del hook: ${error?.message || error}\n`);
    process.exit(1);
  }
}

/** ¿El archivo ya está versionado en Git? (las migraciones versionadas no se editan) */
export function estaVersionado(rel, raiz) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: raiz, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}