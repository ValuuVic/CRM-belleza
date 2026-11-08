// Pruebas de los hooks de Claude Code de CRM Belleza.
// Ejecutar desde la raíz del proyecto:
//   node --test .claude/hooks/pruebas/hooks.test.mjs
// (node --test no acepta una carpeta como argumento.)
//
// Envían a cada hook el JSON que enviaría Claude Code y comprueban su decisión.
// Los casos que necesitan una rama b/… o un estado concreto de spec-v1 usan
// repositorios Git temporales; los que usan el repositorio real no dependen
// de la rama actual ni de si spec-v1 existe (ver docs/bitacora-ia.md, IA-05).
// Las pruebas no modifican el proyecto: .claude/bloqueos.log se restaura al final.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROY = path.resolve(HOOKS, '..', '..');

// Estado real del repositorio (para no suponerlo en las pruebas).
const gitReal = (...a) => {
  try { return execFileSync('git', a, { cwd: PROY, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};
const RAMA_REAL = gitReal('rev-parse', '--abbrev-ref', 'HEAD');
const SPEC_V1_REAL = gitReal('rev-parse', '-q', '--verify', 'refs/tags/spec-v1') !== null;

// Se conserva .claude/bloqueos.log tal como estaba y se borran los repos temporales.
const LOG = path.join(PROY, '.claude', 'bloqueos.log');
const LOG_ORIGINAL = existsSync(LOG) ? readFileSync(LOG, 'utf8') : null;
const TEMPORALES = [];
after(() => {
  if (LOG_ORIGINAL === null) rmSync(LOG, { force: true });
  else writeFileSync(LOG, LOG_ORIGINAL, 'utf8');
  for (const d of TEMPORALES) rmSync(d, { recursive: true, force: true });
});

function correr(hook, entrada, env = {}, raiz = PROY) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, hook)], {
    input: JSON.stringify({ cwd: raiz, ...entrada }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz, CRM_PARTE: '', ...env },
  });
  let json = null;
  try { json = r.stdout ? JSON.parse(r.stdout) : null; } catch {}
  return { code: r.status, json, stdout: r.stdout, stderr: r.stderr };
}
const decision = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? 'none';

// Repositorio temporal con rama b/… y etiqueta spec-v1
function repoTemporal({ rama = 'b/base-api', tag = true } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crmhook-'));
  TEMPORALES.push(dir);
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  writeFileSync(path.join(dir, 'README.md'), 'x');
  g('add', '.'); g('commit', '-qm', 'init');
  if (tag) g('tag', 'spec-v1');
  if (rama !== 'main') g('checkout', '-qb', rama);
  return dir;
}

// ---------- proteger-archivos ----------
const pa = (tool, file, env, raiz) => decision(correr('proteger-archivos.mjs', { tool_name: tool, tool_input: { file_path: file } }, env, raiz));

test('PA1 .env: lectura y escritura denegadas; .env.example permitido', () => {
  assert.equal(pa('Read', 'api/.env', { CRM_PARTE: 'B' }), 'deny');
  assert.equal(pa('Edit', `${PROY}/laravel/.env`, { CRM_PARTE: 'B' }), 'deny');
  assert.equal(pa('Write', 'api\\.env.local', { CRM_PARTE: 'B' }), 'deny');
  assert.equal(pa('Read', 'api/.env.example', { CRM_PARTE: 'B' }), 'none');
});
test('PA2 migraciones denegadas incluso para Parte A', () => {
  assert.equal(pa('Edit', 'laravel/database/migrations/0001_01_01_000000_create_users_table.php', { CRM_PARTE: 'A' }), 'deny');
});
test('PA3 Parte B no escribe en laravel/ pero sí puede leer', () => {
  assert.equal(pa('Write', 'laravel/app/Models/User.php', { CRM_PARTE: 'B' }), 'deny');
  assert.equal(pa('Read', 'laravel/app/Models/User.php', { CRM_PARTE: 'B' }), 'none');
});
test('PA4 Parte B no escribe las rutas exactas de la Parte A; otros nombres parecidos sí', () => {
  const r = repoTemporal();
  assert.equal(pa('Write', 'api/src/rutas/reportes.js', {}, r), 'deny');
  assert.equal(pa('Write', 'frontend\\js\\vistas\\resumen.js', {}, r), 'deny');
  assert.equal(pa('Write', 'api/src/servicios/reporte-util.js', {}, r), 'none');
  assert.equal(pa('Write', 'frontend/js/vistas/resumen-cartera.js', {}, r), 'none');
  assert.equal(pa('Write', 'api/src/rutas/reportes.js', { CRM_PARTE: 'A' }, r), 'none');
});
test('PA4b api/src/app.js es compartido (ask) con spec-v1 y se deniega sin ella', () => {
  const r = repoTemporal();
  assert.equal(pa('Edit', 'api/src/app.js', {}, r), 'ask');
  const sinTag = repoTemporal({ tag: false });
  assert.equal(pa('Edit', 'api/src/app.js', {}, sinTag), 'deny');
});
test('PA5 sin spec-v1 se bloquea api/ y frontend/ (repo temporal sin etiqueta)', () => {
  const sinTag = repoTemporal({ tag: false });
  assert.equal(pa('Write', 'api/src/server.js', {}, sinTag), 'deny');
  assert.equal(pa('Write', 'frontend/js/app.js', {}, sinTag), 'deny');
});
test('PA5b repo real: api/src/server.js se permite con spec-v1 y se deniega sin ella', () => {
  assert.equal(pa('Write', 'api/src/server.js', { CRM_PARTE: 'B' }), SPEC_V1_REAL ? 'none' : 'deny');
});
test('PA6 con spec-v1 y rama b/… se permite api/ y frontend/', () => {
  const r = repoTemporal();
  assert.equal(pa('Write', 'api/src/server.js', {}, r), 'none');
  assert.equal(pa('Edit', 'frontend/js/app.js', {}, r), 'none');
});
test('PA7 parte desconocida (main) → ask en laravel/', () => {
  const r = repoTemporal({ rama: 'main' });
  assert.equal(pa('Write', 'laravel/routes/web.php', {}, r), 'ask');
});
test('PA8 compartidos y hooks → ask; docs/specs libre', () => {
  assert.equal(pa('Edit', 'docs/especificacion.md', { CRM_PARTE: 'B' }), 'ask');
  assert.equal(pa('Edit', 'CLAUDE.md', { CRM_PARTE: 'B' }), 'ask');
  assert.equal(pa('Edit', '.claude/settings.json', { CRM_PARTE: 'B' }), 'ask');
  assert.equal(pa('Write', 'docs/specs/B1-base.md', { CRM_PARTE: 'B' }), 'none');
  assert.equal(pa('Edit', 'docs/verificacion.md', { CRM_PARTE: 'B' }), 'ask');
  assert.equal(pa('Edit', 'docs/bitacora-ia.md', { CRM_PARTE: 'B' }), 'none');
});
test('PA9 rutas fuera del proyecto no se evalúan', () => {
  assert.equal(pa('Write', path.join(os.tmpdir(), 'otra-carpeta', '.env'), { CRM_PARTE: 'B' }), 'none');
});

// ---------- vigilar-bash ----------
const vb = (cmd, env = { CRM_PARTE: 'B' }, tool = 'Bash') => decision(correr('vigilar-bash.mjs', { tool_name: tool, tool_input: { command: cmd } }, env));

test('VB1 .env y variables de entorno', () => {
  assert.equal(vb('cat api/.env'), 'deny');
  assert.equal(vb('Get-Content laravel\\.env', undefined, 'PowerShell'), 'deny');
  assert.equal(vb('echo X >> .env'), 'deny');
  assert.equal(vb('cat api/.env.example'), 'none');
  assert.equal(vb('node --env-file=.env src/server.js'), 'none');
  assert.equal(vb('printenv'), 'deny');
  assert.equal(vb('git add .env'), 'deny');
});
test('VB2 SQL y Docker destructivos', () => {
  assert.equal(vb('docker exec db mysql -e "DROP TABLE clientes"'), 'deny');
  assert.equal(vb('mysql -e "truncate table ventas"'), 'deny');
  assert.equal(vb('docker compose down -v'), 'deny');
  assert.equal(vb('docker volume rm crm_mysql'), 'deny');
  assert.equal(vb('docker compose up -d'), 'none');
  assert.equal(vb('php artisan migrate:fresh --seed'), 'ask');
  assert.equal(vb('php artisan migrate'), 'none');
});
test('VB3 Git', () => {
  assert.equal(vb('git push --force origin b/x'), 'deny');
  assert.equal(vb('git push -f'), 'deny');
  assert.equal(vb('git push origin b/base-api'), 'ask');
  assert.equal(vb('git merge main'), 'ask');
  assert.equal(vb('git reset --hard HEAD~1'), 'ask');
  assert.equal(vb('git commit --no-verify -m x'), 'deny');
  assert.equal(vb('git status'), 'none');
  assert.equal(vb('git diff'), 'none');
  assert.equal(vb('git commit -m "feat(api): x"'), 'none');
});
test('VB3b subcomandos exactos de Git (falso positivo merge-base)', () => {
  // consultas permitidas
  for (const c of ['git merge-base HEAD main', 'git merge-base --is-ancestor a b', 'git -C api merge-base HEAD HEAD',
    'git log --merges', 'git rebase-helper', 'git show-branch', 'git push-status', 'git tag', 'git tag -l', 'git tag --list "spec*"',
    'git branch -d vieja', 'git restore --staged api/x.js', 'git checkout -b b/base-api', 'git switch main', 'git fetch',
    'git commit -m "merge de ramas"', 'git stash list', 'git reset HEAD api/x.js', 'git clean -n']) {
    assert.equal(vb(c), 'none', c);
  }
  // confirmación
  for (const c of ['git merge main', 'git merge --no-ff b/x', 'git -C api merge main', 'git --no-pager rebase main', 'git pull',
    'git push', 'git push origin b/base-api', 'git -c core.editor=true push', 'git status && git push',
    'git tag spec-v1', 'git tag -a spec-v1 -m x', 'git tag -d viejo', 'git reset --hard', 'git clean -fd',
    'git checkout -- .', 'git restore api/x.js', 'git branch -D vieja', 'git stash drop', '"C:/Program Files/Git/cmd/git.exe" merge main']) {
    assert.equal(vb(c), 'ask', c);
  }
  // prohibidos
  for (const c of ['git push --force', 'git push -f origin main', 'git push -uf origin b/x', 'git push --force-with-lease',
    'git push origin +main', 'git push origin :b/x', 'git push --delete origin b/x', 'git commit --no-verify -m x',
    'git merge-base HEAD main && git push --force', 'rm -rf api/src && git push -f', 'git add api/.env']) {
    assert.equal(vb(c), 'deny', c);
  }
});
test('VB4 dependencias', () => {
  assert.equal(vb('cd api && npm install sequelize'), 'deny');
  assert.equal(vb('npm i @prisma/client'), 'deny');
  assert.equal(vb('npm install knex@3'), 'deny');
  assert.equal(vb('npm install supertest'), 'ask');
  assert.equal(vb('npm install'), 'none');
  assert.equal(vb('npm ci'), 'none');
});
test('VB5 escritura en laravel/ y migraciones', () => {
  assert.equal(vb("sed -i 's/a/b/' laravel/routes/web.php"), 'deny');
  assert.equal(vb('rm laravel/database/migrations/x.php', { CRM_PARTE: 'A' }), 'deny');
  assert.equal(vb('ls laravel/app 2>/dev/null'), 'none');
  assert.equal(vb('cat laravel/routes/web.php'), 'none');
  assert.equal(vb("sed -i 's/a/b/' laravel/routes/web.php", { CRM_PARTE: 'A' }), 'none');
  assert.equal(vb('Set-Content -Path .claude\\settings.json -Value x', undefined, 'PowerShell'), 'ask');
  assert.equal(vb('echo x > frontend/js/vistas/resumen.js'), 'deny');
  assert.equal(vb('echo x > frontend/js/vistas/cartera.js'), 'none');
});
test('VB6 borrado recursivo', () => {
  assert.equal(vb('rm -rf api/src'), 'ask');
  assert.equal(vb('Remove-Item -Recurse -Force frontend\\js', undefined, 'PowerShell'), 'ask');
});

// Regresión IA-07: `npm install` sin paquetes seguido de tuberías o redirecciones.
test('VB7 npm install sin paquetes no se confunde con una dependencia nueva', () => {
  // permitidos: reinstalan lo declarado en package-lock.json
  for (const c of [
    'npm install 2>&1 | tail -5', 'npm install | tail -5', 'cd api && npm install 2>&1 | tail -5', 'npm install > /dev/null',
    'npm install --no-audit --no-fund', 'npm i', 'npm ci 2>&1 | tail', 'npm --prefix api install', 'yarn install | tail',
    'pnpm install; npm test', 'npm install && npm test', 'npm run test:bd 2>&1 | grep -E "ℹ"',
  ]) {
    assert.equal(vb(c), 'none', c);
  }
  // siguen pidiendo confirmación: agregan dependencias nuevas
  for (const c of [
    'npm install supertest', 'npm install supertest 2>&1 | tail -5', 'npm i -D supertest', 'npm install --save-dev supertest | tail',
    'cd api && npm install lodash', 'yarn add dayjs', 'pnpm add zod', 'npm install 2>&1 | tail -5 && npm install supertest',
    'bash -c "npm install supertest"', 'composer require laravel/sanctum',
  ]) {
    assert.equal(vb(c), 'ask', c);
  }
  // siguen prohibidos: ORM y query builders
  for (const c of [
    'npm install sequelize 2>&1 | tail -5', 'npm i -D @prisma/client | tail', 'npm install knex@3 > /dev/null', 'yarn add typeorm',
    'npx prisma init', 'npm install | tail -5; npm install knex', 'powershell -Command "npm install sequelize"',
  ]) {
    assert.equal(vb(c), 'deny', c);
  }
});

// Regresión IA-07: palabras como "del" dentro de argumentos, rutas o textos.
test('VB8 "del", "copy", "move"… en textos o rutas no son comandos de borrado o escritura', () => {
  for (const c of [
    'echo "--- registros del hook"; grep "x" .claude/bloqueos.log; node --test .claude/hooks/pruebas/hooks.test.mjs',
    'grep -n "registros del hook" .claude/hooks/comun.mjs',
    'cat .claude/hooks/vigilar-bash.mjs | grep "del"',
    'git log --oneline -- .claude/hooks/del.txt',
    'echo "copy move rm del" && ls .claude/hooks',
    'grep -rn "rm -f" .claude/hooks/vigilar-bash.mjs',
    'node -e "console.log(1 > 0)" && ls .claude/hooks',
    'echo "a > b" ; cat .claude/settings.json',
    'cat laravel/routes/web.php | grep "move del registro"',
    'node --test .claude/hooks/pruebas/hooks.test.mjs 2>&1 | grep -E "^(✖|ℹ)"',
  ]) {
    assert.equal(vb(c), 'none', c);
  }
});
test('VB9 las escrituras reales en zonas protegidas siguen detectándose', () => {
  // Parte A y migraciones
  for (const c of [
    'del laravel\\routes\\web.php', 'cmd /c del laravel\\routes\\web.php', 'echo x > laravel/routes/web.php',
    'cat > laravel/routes/web.php <<\'EOF\'\nhola del mundo\nEOF', 'cp x.php laravel/app/x.php', 'mv a laravel/b',
    'tee laravel/x.txt < a', 'Copy-Item a laravel\\b', 'bash -c "rm laravel/routes/web.php"', 'git checkout -- laravel/routes/web.php',
    'echo "texto" && del frontend\\js\\vistas\\resumen.js',
  ]) {
    assert.equal(vb(c), 'deny', c);
  }
  assert.equal(vb('rm laravel/database/migrations/x.php', { CRM_PARTE: 'A' }), 'deny');
  // configuración de hooks
  for (const c of [
    'del .claude\\hooks\\comun.mjs', 'echo x >> .claude/settings.json', 'cp a.mjs .claude/hooks/a.mjs',
    'Set-Content .claude\\hooks\\x.mjs "x"', 'sed -i "s/a/b/" .claude/hooks/vigilar-bash.mjs',
    'cat > .claude/hooks/x.mjs <<EOF\ncontenido\nEOF',
  ]) {
    assert.equal(vb(c), 'ask', c);
  }
  // el cuerpo de un heredoc es contenido, no comandos
  assert.equal(vb("cat > notas.txt <<'EOF'\ndel laravel/routes/web.php\nEOF"), 'none');
});

// ---------- revisar-cambio ----------
function rc(rel, contenido) {
  const r = repoTemporal();
  const abs = path.join(r, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contenido);
  return correr('revisar-cambio.mjs', { tool_name: 'Write', tool_input: { file_path: abs } }, {}, r).json;
}
test('RC1 código correcto: sin salida', () => {
  const j = rc('api/src/db.js', "import mysql from 'mysql2/promise';\nexport const pool = mysql.createPool({ timezone: 'Z', decimalNumbers: true });\nexport const q = (id) => pool.query('SELECT * FROM clientes WHERE id = ?', [id]);\n");
  assert.equal(j, null);
});
test('RC2 error de sintaxis bloquea', () => {
  const j = rc('api/src/x.js', 'export const a = ;\n');
  assert.equal(j.decision, 'block');
  assert.match(j.reason, /sintaxis/);
});
test('RC3 SQL interpolado, ORM, CORS *, secreto JWT, vendedor_id', () => {
  assert.equal(rc('api/src/a.js', 'const s = `SELECT * FROM clientes WHERE id = ${id}`;\n').decision, 'block');
  assert.equal(rc('api/src/b.js', "import { Sequelize } from 'sequelize';\n").decision, 'block');
  assert.equal(rc('api/src/c.js', "app.use(cors({ origin: '*' }));\n").decision, 'block');
  assert.equal(rc('api/src/d.js', "app.use(cors());\n").decision, 'block');
  assert.equal(rc('api/src/e.js', "jwt.sign(p, 'mi-secreto-fijo');\n").decision, 'block');
  assert.equal(rc('api/src/f.js', 'const v = req.body.vendedor_id;\n').decision, 'block');
  assert.equal(rc('api/src/g.js', "jwt.verify(t, s, { algorithms: ['RS256'] });\n").decision, 'block');
});
test('RC4 pool sin timezone/decimalNumbers → aviso', () => {
  const j = rc('api/src/db.js', "import mysql from 'mysql2/promise';\nexport const pool = mysql.createPool({});\n");
  assert.match(j.hookSpecificOutput.additionalContext, /timezone/);
  assert.match(j.hookSpecificOutput.additionalContext, /decimalNumbers/);
});
test('RC5 frontend innerHTML sin escape → aviso; framework → bloqueo', () => {
  const j = rc('frontend/js/v.js', 'el.innerHTML = `<td>${c.nombre}</td>`;\n');
  assert.match(j.hookSpecificOutput.additionalContext, /S7/);
  assert.equal(rc('frontend/js/w.js', "import { createApp } from 'vue';\n").decision, 'block');
  assert.equal(rc('frontend/js/z.js', "import { escaparHtml } from './util.js';\nel.innerHTML = `<td>${escaparHtml(c.nombre)}</td>`;\n"), null);
});
test('RC6 package.json con knex bloquea', () => {
  assert.equal(rc('api/package.json', JSON.stringify({ dependencies: { knex: '^3' } })).decision, 'block');
});
test('RC7 credenciales de prueba permitidas en tests', () => {
  assert.equal(rc('api/test/login.test.js', "const password = 'secreto123';\n"), null);
});

// ---------- pruebas-al-terminar ----------
test('PT1 sin cambios en api/frontend: sin salida', () => {
  const r = repoTemporal();
  const x = correr('pruebas-al-terminar.mjs', { hook_event_name: 'Stop', stop_hook_active: false }, {}, r);
  assert.equal(x.code, 0); assert.equal(x.json, null);
});
test('PT2 prueba fallida bloquea; con stop_hook_active solo informa', () => {
  const r = repoTemporal();
  mkdirSync(path.join(r, 'api/test'), { recursive: true });
  writeFileSync(path.join(r, 'api/package.json'), '{"type":"module"}');
  writeFileSync(path.join(r, 'api/test/a.test.js'), "import t from 'node:test'; import a from 'node:assert'; t('x', () => a.equal(1, 2));\n");
  const x = correr('pruebas-al-terminar.mjs', { stop_hook_active: false }, {}, r);
  assert.equal(x.json.decision, 'block');
  assert.match(x.json.reason, /Fallaron/);
  const y = correr('pruebas-al-terminar.mjs', { stop_hook_active: true }, {}, r);
  assert.equal(y.json.decision, undefined);
  assert.match(y.json.systemMessage, /bucle/);
});
test('PT3 prueba superada informa; sintaxis rota bloquea', () => {
  const r = repoTemporal();
  mkdirSync(path.join(r, 'api/test'), { recursive: true });
  writeFileSync(path.join(r, 'api/package.json'), '{"type":"module"}');
  writeFileSync(path.join(r, 'api/test/a.test.js'), "import t from 'node:test'; import a from 'node:assert'; t('x', () => a.equal(1, 1));\n");
  const x = correr('pruebas-al-terminar.mjs', {}, {}, r);
  assert.match(x.json.systemMessage, /superadas/);
  writeFileSync(path.join(r, 'frontend.js'), '');
  mkdirSync(path.join(r, 'frontend/js'), { recursive: true });
  writeFileSync(path.join(r, 'frontend/js/m.js'), 'let = ;');
  const y = correr('pruebas-al-terminar.mjs', {}, {}, r);
  assert.equal(y.json.decision, 'block');
  assert.match(y.json.reason, /sintaxis/);
});

// ---------- contexto-sesion ----------
test('CS1 contexto en el repo real', () => {
  const x = correr('contexto-sesion.mjs', { hook_event_name: 'SessionStart', source: 'startup' }, { CRM_PARTE: 'B' });
  const ctx = x.json.hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes(`Rama actual: ${RAMA_REAL}`), ctx);
  assert.match(ctx, /Parte B/);
  assert.match(ctx, SPEC_V1_REAL ? /spec-v1: existe/ : /spec-v1: NO existe/);
  const sinTag = repoTemporal({ tag: false, rama: 'main' });
  assert.match(correr('contexto-sesion.mjs', {}, {}, sinTag).json.hookSpecificOutput.additionalContext, /spec-v1: NO existe/);
});
test('CS2 contexto en rama b/ con spec-v1', () => {
  const r = repoTemporal();
  const ctx = correr('contexto-sesion.mjs', {}, {}, r).json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /Parte B/);
  assert.match(ctx, /spec-v1: existe/);
});
