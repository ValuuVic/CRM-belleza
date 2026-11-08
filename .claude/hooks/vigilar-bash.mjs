// PreToolUse (Bash | PowerShell)
// Vigila comandos de terminal: secretos, operaciones destructivas, Git,
// dependencias prohibidas y escrituras en zonas protegidas.

import {
  ejecutarHook,
  raizProyecto,
  parteActual,
  ARCHIVOS_PARTE_A,
  denegar,
  preguntar,
  continuar,
} from './comun.mjs';

// Dependencias prohibidas por CLAUDE.md §6.
const PAQUETES_PROHIBIDOS = /(^|[\s"'])(@?sequelize[\w\-/]*|prisma|@prisma\/[\w-]+|typeorm|knex)(@[\w.^~-]+)?(?=$|[\s"'])/i;

// Indicadores de que un comando escribe, mueve o borra archivos.
const ESCRITURA =
  /(>{1,2}|\btee\b|\bsed\s+(-\w*\s+)*-i|\brm\b|\bmv\b|\bcp\b|\btouch\b|\bmkdir\b|\bdel\b|\berase\b|\bren(ame)?\b|\bmove\b|\bcopy\b|set-content|add-content|out-file|new-item|remove-item|move-item|copy-item|rename-item|clear-content|\bgit\s+(checkout|restore)\s+.*--)/i;

/** Reglas: [patrón, 'deny' | 'ask', motivo]. Se evalúan en orden. */
const REGLAS = [
  // --- Secretos (.env) ---
  [/(^|[\s"'\\/=<>|;&(])\.env(?![\w.-]*example)(\.[\w-]+)?(?=$|[\s"'|;&)<>])/i, 'deny',
    'El comando hace referencia a un archivo .env. El agente no lee ni modifica archivos .env (CLAUDE.md §7, §11; S2).'],
  [/\b(printenv|env)\b\s*($|\|)|get-childitem\s+env:|\bgci\s+env:|\bls\s+env:|\$env:\w*(secret|password|pass|token|key)/i, 'deny',
    'El comando podría mostrar variables de entorno con secretos (S2).'],

  // --- Hooks ---
  [/--no-verify\b|disableallhooks|core\.hookspath/i, 'deny',
    'No se omiten ni desactivan hooks para evitar restricciones (CLAUDE.md §11).'],

  // --- SQL destructivo ---
  [/\bdrop\s+(table|database|schema)\b|\btruncate\b(\s+table)?/i, 'deny',
    'DROP y TRUNCATE están prohibidos desde la API y el agente (CLAUDE.md §3).'],

  // --- Docker / volúmenes ---
  [/docker(-|\s+)compose\b.*\bdown\b.*(-v\b|--volumes)|docker\s+volume\s+(rm|prune)|docker\s+system\s+prune/i, 'deny',
    'El comando borra volúmenes de Docker (datos de MySQL). No se ejecuta sin autorización (CLAUDE.md §4).'],

  // --- Laravel destructivo ---
  [/artisan\s+(migrate:(fresh|reset|refresh|rollback)|db:wipe)/i, 'ask',
    'El comando borra o revierte tablas. Solo debe usarse en una base de pruebas restablecible y con autorización (CLAUDE.md §4, §13).'],

  // --- Git: ver revisarGit(), que analiza el subcomando exacto ---

  // --- Borrado masivo ---
  [/\brm\s+(-\w*r\w*f|-\w*f\w*r|-r\s+-f|-f\s+-r)\b|remove-item\b.*-recurse|\brmdir\s+\/s|\brd\s+\/s/i, 'ask',
    'Borrado recursivo de archivos. Confirme que no elimina trabajo existente (CLAUDE.md §17).'],
];

// ---------------------------------------------------------------------------
// Git: se identifica el subcomando EXACTO de cada invocación.
// Una expresión como /git\s+merge\b/ también coincidía con `git merge-base`
// (\b separa "merge" de "-base"), lo que provocaba un falso positivo.
// ---------------------------------------------------------------------------

/** Opciones globales de git que consumen el token siguiente. */
const OPCIONES_GIT_CON_VALOR = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);

/** Divide el comando en invocaciones de git: [{ sub, args }]. */
function invocacionesGit(comando) {
  const resultado = [];
  for (const segmento of comando.split(/&&|\|\||[;|&\n()]/)) {
    const tokens = (segmento.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^(["'])(.*)\1$/, '$2'));
    let i = tokens.findIndex((t) => /^(.*[\\/])?git(\.exe)?$/i.test(t));
    if (i === -1) continue;
    i += 1;
    while (i < tokens.length && tokens[i].startsWith('-')) {
      const op = tokens[i];
      i += OPCIONES_GIT_CON_VALOR.has(op) ? 2 : 1;
    }
    if (i >= tokens.length) continue;
    resultado.push({ sub: tokens[i].toLowerCase(), args: tokens.slice(i + 1) });
  }
  return resultado;
}

const tieneBandera = (args, larga, corta) =>
  args.some((a) => a === larga || a.startsWith(`${larga}=`) || (corta && /^-[a-z]+$/i.test(a) && a.includes(corta)));

const DESCARTA = 'La operación de Git puede descartar trabajo existente (CLAUDE.md §2). Confirme antes de continuar.';

/** Devuelve ['deny' | 'ask', motivo] o null si la invocación es de consulta o segura. */
function revisarInvocacionGit({ sub, args }) {
  switch (sub) {
    case 'push': {
      const forzado =
        tieneBandera(args, '--force', 'f') ||
        tieneBandera(args, '--force-with-lease') ||
        tieneBandera(args, '--force-if-includes') ||
        tieneBandera(args, '--mirror') ||
        args.some((a) => /^\+/.test(a) || /^:/.test(a)) ||
        tieneBandera(args, '--delete', 'd');
      return forzado
        ? ['deny', 'git push forzado o que borra ramas remotas está prohibido sin autorización (CLAUDE.md §15).']
        : ['ask', 'No se hace push sin autorización (CLAUDE.md §2). Confirme el push.'];
    }
    case 'merge':
    case 'rebase':
    case 'pull':
      return ['ask', `git ${sub} integra cambios; no se hacen merges automáticamente sin autorización (CLAUDE.md §2). Confirme la operación.`];
    case 'reset':
      return tieneBandera(args, '--hard') ? ['ask', DESCARTA] : null;
    case 'clean':
      return tieneBandera(args, '--force', 'f') ? ['ask', DESCARTA] : null;
    case 'checkout':
      return args.includes('.') || args.includes('--') || tieneBandera(args, '--force', 'f') ? ['ask', DESCARTA] : null;
    case 'restore': {
      const soloIndice = tieneBandera(args, '--staged', 'S') && !tieneBandera(args, '--worktree', 'W');
      return soloIndice ? null : ['ask', DESCARTA];
    }
    case 'branch':
      return args.includes('-D') || (tieneBandera(args, '--delete', 'd') && tieneBandera(args, '--force', 'f'))
        ? ['ask', DESCARTA]
        : null;
    case 'stash':
      return ['drop', 'clear'].includes((args[0] || '').toLowerCase()) ? ['ask', DESCARTA] : null;
    case 'tag': {
      if (tieneBandera(args, '--delete', 'd')) return ['ask', DESCARTA];
      const lista = args.length === 0 || tieneBandera(args, '--list', 'l') || args.some((a) => /^--(contains|points-at|merged|no-merged|sort|format)/.test(a));
      return lista
        ? null
        : ['ask', 'Se va a crear una etiqueta. Etiquetas como spec-v1 requieren la aprobación de ambas integrantes (CLAUDE.md §1). Confirme.'];
    }
    default:
      return null; // status, diff, log, show, merge-base, rev-parse, fetch, add, commit, switch…
  }
}

function revisarGit(comando) {
  const hallazgos = invocacionesGit(comando).map(revisarInvocacionGit).filter(Boolean);
  return hallazgos.find(([d]) => d === 'deny') || hallazgos[0] || null;
}

await ejecutarHook(async (entrada) => {
  const original = String(entrada.tool_input?.command || '');
  if (!original.trim()) return continuar();

  // Se ignoran construcciones inofensivas que darían falsos positivos:
  // - `node --env-file=.env` carga el archivo sin mostrar su contenido.
  // - Redirecciones a /dev/null, $null, nul o 2>&1 no escriben archivos.
  const comando = original
    .replace(/--env-file(-if-exists)?=\S+/gi, '')
    .replace(/\d?>{1,2}\s*(\/dev\/null|\$null|nul\b|&\d)/gi, '');

  // Se recogen todas las coincidencias; una prohibición pesa más que una confirmación
  // (p. ej. `rm -rf x && git push --force` debe denegarse, no solo preguntar).
  const hallazgos = REGLAS.filter(([patron]) => patron.test(comando)).map(([, d, m]) => [d, m]);
  const git = revisarGit(comando);
  if (git) hallazgos.push(git);
  const elegido = hallazgos.find(([d]) => d === 'deny') || hallazgos[0];
  if (elegido) return elegido[0] === 'deny' ? denegar(elegido[1]) : preguntar(elegido[1]);

  // --- Dependencias ---
  const instala = /\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b|\bnpx\s+/i.test(comando);
  if (instala && PAQUETES_PROHIBIDOS.test(comando)) {
    return denegar('Sequelize, Prisma, TypeORM y Knex están prohibidos; la API usa mysql2/promise con parámetros ? (CLAUDE.md §6).');
  }
  // `npm install` / `npm ci` sin paquetes reinstala lo existente; con paquetes agrega dependencias nuevas.
  if (/\b(npm|pnpm|yarn|bun)\s+(i|install|add)\s+(?!-)[^\s]/i.test(comando)) {
    return preguntar('No se instalan paquetes nuevos sin autorización (CLAUDE.md §17). Confirme la dependencia.');
  }
  if (/\bcomposer\s+(require|remove|update)\b/i.test(comando)) {
    return preguntar('Cambiar dependencias de Laravel requiere autorización de la Parte A (CLAUDE.md §2, §17).');
  }

  // --- Escrituras en zonas protegidas mediante la terminal ---
  if (ESCRITURA.test(comando)) {
    if (/laravel[\\/]+database[\\/]+migrations/i.test(comando)) {
      return denegar('El comando modifica migraciones de Laravel. Las migraciones existentes no se modifican (CLAUDE.md §3).');
    }
    const parte = parteActual(raizProyecto(entrada));
    const normalizado = comando.replace(/\\+/g, '/').toLowerCase();
    const tocaParteA =
      /(^|[\s"'=/])laravel\//.test(normalizado) ||
      [...ARCHIVOS_PARTE_A].some((r) => normalizado.includes(r));
    if (parte !== 'A' && tocaParteA) {
      const msg = 'El comando escribe en archivos de la Parte A (laravel/ o los reservados en docs/plan.md §3.4) (CLAUDE.md §2, §5).';
      return parte === 'B' ? denegar(msg) : preguntar(msg);
    }
    if (/\.claude[\\/]+(settings\.json|hooks)/i.test(comando)) {
      return preguntar('El comando modifica la configuración de hooks. Confirme el cambio (CLAUDE.md §11).');
    }
  }

  return continuar();
});
