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

// Dependencias prohibidas por CLAUDE.md §6 (se comparan con el nombre exacto de cada paquete).
const PAQUETE_PROHIBIDO = /^(@?sequelize[\w\-/]*|prisma|@prisma\/[\w-]+|typeorm|knex)(@[\w.^~-]+)?$/i;

// Comandos que escriben, mueven o borran archivos. Solo cuentan cuando son el COMANDO de un
// segmento (su primera palabra), no cuando aparecen dentro de argumentos, rutas o textos:
// antes, la palabra "del" de "registros del hook" se tomaba por el `del` de Windows.
const COMANDOS_ESCRITURA = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'touch', 'mkdir', 'tee', 'ln', 'dd', 'install',
  'del', 'erase', 'ren', 'rename', 'move', 'copy', 'xcopy', 'robocopy', 'rd', 'md',
  'set-content', 'add-content', 'out-file', 'new-item', 'remove-item', 'move-item',
  'copy-item', 'rename-item', 'clear-content', 'ni', 'ri', 'mi', 'cpi', 'rni',
]);
// Intérpretes que ejecutan un comando recibido como argumento (`bash -c "…"`, `cmd /c …`).
const INTERPRETES = { bash: ['-c'], sh: ['-c'], powershell: ['-command', '-c'], pwsh: ['-command', '-c'], cmd: ['/c', '/k'] };
const GESTORES = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const SUBCOMANDOS_INSTALAR = new Set(['i', 'install', 'add', 'in', 'isntall']);

/**
 * Divide un comando en segmentos separados por ; && || | & saltos de línea y paréntesis,
 * sin cortar dentro de comillas, y descarta el cuerpo de los heredocs (<<'EOF' … EOF),
 * que es contenido de un archivo y no comandos.
 * @returns {{ tokens: string[], sinComillas: string }[]}
 */
/** Quita el cuerpo de los heredocs (<<'EOF' … EOF): es contenido de un archivo, no comandos ni rutas. */
function sinHeredocs(comando) {
  const lineas = [];
  let finHeredoc = null;
  for (const linea of comando.split('\n')) {
    if (finHeredoc) {
      if (linea.trim() === finHeredoc) finHeredoc = null;
      continue;
    }
    lineas.push(linea);
    const m = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(linea);
    if (m) finHeredoc = m[2];
  }
  return lineas.join('\n');
}

function segmentos(comando) {
  const texto = sinHeredocs(comando);

  const crudos = [];
  let actual = '';
  let comilla = null;
  for (const c of texto) {
    if (comilla) {
      actual += c;
      if (c === comilla) comilla = null;
    } else if (c === '"' || c === "'") {
      comilla = c;
      actual += c;
    } else if (';|&\n()'.includes(c)) {
      crudos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  crudos.push(actual);

  return crudos
    .map((s) => ({
      tokens: (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^(["'])([\s\S]*)\1$/, '$2')),
      sinComillas: s.replace(/"[^"]*"|'[^']*'/g, ' '),
    }))
    .filter((s) => s.tokens.length);
}

/** Nombre del comando sin ruta ni extensión .exe/.cmd, en minúsculas. */
const nombreComando = (t) => t.replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();

/** Índice del comando real del segmento, saltando asignaciones VAR=valor y `sudo`/`command`. */
function indiceComando(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[i]) || ['sudo', 'command', 'exec', 'time'].includes(tokens[i]))) i++;
  return i;
}

/**
 * Recorre los segmentos llamando a `visitar({ cmd, args, sinComillas })` y entra en los
 * comandos que se pasan a un intérprete (`bash -c "…"`, `powershell -Command "…"`, `cmd /c …`).
 */
function recorrer(comando, visitar, profundidad = 0) {
  for (const seg of segmentos(comando)) {
    const i = indiceComando(seg.tokens);
    if (i >= seg.tokens.length) continue;
    const cmd = nombreComando(seg.tokens[i]);
    const args = seg.tokens.slice(i + 1);
    visitar({ cmd, args, sinComillas: seg.sinComillas });
    const banderas = INTERPRETES[cmd];
    if (banderas && profundidad < 3) {
      const j = args.findIndex((a) => banderas.includes(a.toLowerCase()));
      if (j !== -1 && j + 1 < args.length) recorrer(args.slice(j + 1).join(' '), visitar, profundidad + 1);
    }
  }
}

/** ¿Algún segmento escribe, mueve o borra archivos? */
function escribeArchivos(comando) {
  let escribe = false;
  recorrer(comando, ({ cmd, args, sinComillas }) => {
    if (COMANDOS_ESCRITURA.has(cmd)) escribe = true;
    else if ((cmd === 'sed' || cmd === 'perl') && args.some((a) => /^-[a-z]*i/i.test(a) || a.startsWith('--in-place'))) escribe = true;
    else if (cmd === 'git' && args.some((a) => ['checkout', 'restore', 'mv', 'rm', 'apply'].includes(a.toLowerCase()))) escribe = true;
    // Redirección a un archivo fuera de comillas (no cuenta "=>" ni "->" ni "2>&1", ya retirado).
    if (/(^|[^=\-<>])>{1,2}(?!&)/.test(sinComillas)) escribe = true;
  });
  return escribe;
}

/**
 * Instalaciones de paquetes de cada segmento: { gestor, paquetes } donde `paquetes` son los
 * argumentos posicionales después de install/add. `npm install` sin paquetes (con o sin
 * banderas, tuberías o redirecciones) reinstala lo que ya declara package-lock.json.
 */
function instalaciones(comando) {
  const resultado = [];
  recorrer(comando, ({ cmd, args }) => {
    if (cmd === 'npx' || (cmd === 'pnpm' && args[0] === 'dlx') || (cmd === 'yarn' && args[0] === 'dlx')) {
      resultado.push({ gestor: cmd, paquetes: args.filter((a) => !a.startsWith('-')), ejecuta: true });
      return;
    }
    if (!GESTORES.has(cmd)) return;
    const k = args.findIndex((a) => SUBCOMANDOS_INSTALAR.has(a.toLowerCase()));
    if (k === -1) return;
    resultado.push({ gestor: cmd, paquetes: args.slice(k + 1).filter((a) => !a.startsWith('-')), ejecuta: false });
  });
  return resultado;
}

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
  for (const { tokens } of segmentos(comando)) {
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

  // Se recogen TODOS los hallazgos y una prohibición pesa más que una confirmación
  // (p. ej. `rm -rf x && git push --force`, o `git checkout -- laravel/…`, deben denegarse).
  const hallazgos = REGLAS.filter(([patron]) => patron.test(comando)).map(([, d, m]) => [d, m]);
  const git = revisarGit(comando);
  if (git) hallazgos.push(git);

  // --- Dependencias ---
  // Se analiza cada segmento: en `npm install 2>&1 | tail -5`, el `|` y `tail` ya no se
  // confunden con el nombre de un paquete.
  const inst = instalaciones(comando);
  if (inst.some((x) => x.paquetes.some((p) => PAQUETE_PROHIBIDO.test(p)))) {
    hallazgos.push(['deny', 'Sequelize, Prisma, TypeORM y Knex están prohibidos; la API usa mysql2/promise con parámetros ? (CLAUDE.md §6).']);
  } else if (inst.some((x) => !x.ejecuta && x.paquetes.length > 0)) {
    hallazgos.push(['ask', 'No se instalan paquetes nuevos sin autorización (CLAUDE.md §17). Confirme la dependencia.']);
  }
  let composer = false;
  recorrer(comando, ({ cmd, args }) => {
    if (cmd === 'composer' && ['require', 'remove', 'update'].includes((args[0] || '').toLowerCase())) composer = true;
  });
  if (composer) {
    hallazgos.push(['ask', 'Cambiar dependencias de Laravel requiere autorización de la Parte A (CLAUDE.md §2, §17).']);
  }

  // --- Escrituras en zonas protegidas mediante la terminal ---
  if (escribeArchivos(comando)) {
    const parte = parteActual(raizProyecto(entrada));
    const normalizado = sinHeredocs(comando).replace(/\\+/g, '/').toLowerCase();
    const tocaParteA =
      /(^|[\s"'=/])laravel\//.test(normalizado) ||
      [...ARCHIVOS_PARTE_A].some((r) => normalizado.includes(r));
    if (/laravel\/+database\/+migrations/.test(normalizado)) {
      hallazgos.push(['deny', 'El comando modifica migraciones de Laravel. Las migraciones existentes no se modifican (CLAUDE.md §3).']);
    } else if (parte !== 'A' && tocaParteA) {
      const msg = 'El comando escribe en archivos de la Parte A (laravel/ o los reservados en docs/plan.md §3.4) (CLAUDE.md §2, §5).';
      hallazgos.push([parte === 'B' ? 'deny' : 'ask', msg]);
    }
    if (/\.claude\/+(settings\.json|hooks)/.test(normalizado)) {
      hallazgos.push(['ask', 'El comando modifica la configuración de hooks. Confirme el cambio (CLAUDE.md §11).']);
    }
  }

  const elegido = hallazgos.find(([d]) => d === 'deny') || hallazgos[0];
  if (elegido) return elegido[0] === 'deny' ? denegar(elegido[1]) : preguntar(elegido[1]);
  return continuar();
});
