# Bitácora de inteligencia artificial — CRM Belleza

Registro de casos reales en los que el agente (Claude Code) propuso una solución incorrecta, insegura o distinta de la especificación (CLAUDE.md §16; docs/plan.md §13).
Solo se registran incidentes ocurridos y verificados; no se inventan resultados.

Las pruebas de los hooks citadas abajo están en `.claude/hooks/pruebas/hooks.test.mjs` y se ejecutan desde la raíz del proyecto con:

```
node --test .claude/hooks/pruebas/hooks.test.mjs
```

Durante los casos IA-01 a IA-05 la suite se ejecutó desde una carpeta temporal del agente; después se copió al repositorio, con estos ajustes:
- rutas relativas al propio archivo en lugar de la ruta absoluta del equipo;
- comprobaciones sobre el repositorio real que leen la rama actual y la existencia de `spec-v1` en lugar de suponerlas;
- restauración de `.claude/bloqueos.log` y borrado de los repositorios temporales al terminar.

Resultado desde el repositorio: 30 pruebas, 30 superadas y 0 fallidas.

| ID | Fecha | Parte | Área | Estado | Commit |
|----|-------|-------|------|--------|--------|
| IA-01 | 2026-11-07 | B | Hooks · `vigilar-bash.mjs` | Corregido | `2312f37` |
| IA-02 | 2026-11-07 | B | Hooks · `proteger-archivos.mjs` / `comun.mjs` | Corregido | `2312f37` |
| IA-03 | 2026-11-07 | B | Hooks · `revisar-cambio.mjs` / `pruebas-al-terminar.mjs` | Corregido | `2312f37` |
| IA-04 | 2026-11-07 | B | Hooks · `pruebas-al-terminar.mjs` | Corregido | `2312f37` |
| IA-05 | 2026-11-07 | B | Pruebas de los hooks | Corregido | `2312f37` |
| IA-06 | 2026-11-08 | B | B1 · `api/src/server.js` | Corregido | Pendiente (sin commit) |
| IA-07 | 2026-11-08 | B | Hooks · `vigilar-bash.mjs` | Corregido | Pendiente (sin commit) |

---

## IA-01 — Falso positivo: `git merge-base` tratado como `git merge`

**Descripción.**
El hook `vigilar-bash.mjs` pidió confirmación para `git merge-base HEAD HEAD`, un comando de solo consulta, como si fuera `git merge`.

**Propuesta del agente.**
Se detectaban las operaciones de Git con expresiones regulares sobre el texto completo del comando:

```js
[/\bgit\s+(merge|rebase)\b/i, 'ask', 'No se hacen merges automáticamente…']
```

**Por qué era incorrecto.**
`\b` también es límite de palabra entre `merge` y `-base`, de modo que la regla coincidía con `git merge-base`, y del mismo modo con `git rebase-…` o `git push-…`. Las reglas tampoco reconocían opciones globales (`git -C api merge main`) y, al evaluarse en orden, una regla de confirmación podía tapar una prohibición en un comando compuesto (`rm -rf x && git push -f`).

**Cómo se detectó.**
En la primera prueba real de confirmación con los hooks activos, el agente ejecutó `git merge-base HEAD HEAD` esperando a propósito una confirmación. La usuaria rechazó la operación y señaló que `merge-base` es un comando de consulta y no debía tratarse como `merge`. El registro `.claude/bloqueos.log` muestra la entrada:

```
2026-11-08T05:26:19.796Z  ask  vigilar-bash.mjs  … No se hacen merges automáticamente sin autorización …
```

**Corrección.**
- Se sustituyeron las expresiones regulares de Git por un análisis de cada invocación (`invocacionesGit`). El comando se divide por `&&`, `||`, `;`, `|`, `&` y saltos de línea, se omiten las opciones globales (`-C`, `-c`, `--git-dir`, `--no-pager`, …) y se obtiene el **subcomando exacto**.
- Las decisiones se toman por subcomando (`revisarInvocacionGit`):
  - `push` pide confirmación; con `--force`, `-f` (también combinado, como `-uf`), `--force-with-lease`, `--mirror`, `--delete`, `+ref` o `:ref` se bloquea.
  - `merge`, `rebase` y `pull` piden confirmación.
  - `reset --hard`, `clean -f`, `checkout -- .`, `restore` (salvo `--staged`), `branch -D`, `stash drop|clear` y `tag -d` piden confirmación.
  - Crear una etiqueta (`git tag spec-v1`) pide confirmación, porque requiere la aprobación de ambas integrantes.
  - Los comandos de consulta (`merge-base`, `log`, `status`, `diff`, `show`, `tag -l`, …) se permiten.
- Si en un comando hay varias coincidencias, una prohibición tiene prioridad sobre una confirmación.

**Verificación.**
Se añadió la prueba `VB3b` con 49 casos: 19 permitidos (entre ellos `git merge-base HEAD main` y `git -C api merge-base HEAD HEAD`), 19 de confirmación (`git merge main`, `git push`, `git tag spec-v1`, …) y 11 prohibidos (`git push --force`, `git push -uf`, `rm -rf api/src && git push -f`, …).
Resultado: `node --test` con 29 pruebas, 29 superadas y 0 fallidas.
Comprobación directa: `git merge-base HEAD main` → permitido; `git merge main` → confirmación; `git push origin b/base-api` → confirmación; `git push --force` → bloqueo; `echo DROP TABLE x` → bloqueo; `npm install knex` → bloqueo.

**Commit.** `2312f37` (configurar hooks y pruebas de claude code).

---

## IA-02 — Protección demasiado amplia de los archivos de la Parte A

**Propuesta del agente.**
`proteger-archivos.mjs` trataba como archivo de la Parte A cualquier ruta de `api/` o `frontend/` que contuviera `resumen` o `reporte` (`/^(api|frontend)\/.*(resumen|reporte)/`).

**Por qué era incorrecto.**
`docs/plan.md` §3.4 reserva rutas concretas para la Parte A: `api/src/rutas/reportes.js` y `frontend/js/vistas/resumen.js`. El patrón amplio habría bloqueado a la Parte B archivos legítimos, como un `frontend/js/vistas/resumen-cartera.js`. Además, la lista de archivos compartidos no coincidía con la del plan: faltaban `docs/verificacion.md` y `api/src/app.js`.

**Cómo se detectó.**
Lo señaló la usuaria al revisar el informe del agente, que ya advertía de que se trataba de una suposición.

**Corrección.**
Se crearon en `comun.mjs` las listas `ARCHIVOS_PARTE_A` (rutas exactas) y `ARCHIVOS_COMPARTIDOS` (las del plan §3.4, más `docker-compose.yml` y `.gitignore`). `api/src/app.js` pasó a ser un archivo compartido y sigue sujeto a la etiqueta `spec-v1`. La regla equivalente de `vigilar-bash.mjs` también usa las rutas exactas.

**Verificación.** Pruebas `PA4`, `PA4b`, `PA8` y `VB5`, todas superadas.

**Commit.** `2312f37` (configurar hooks y pruebas de claude code).

---

## IA-03 — `node --check` aceptaba código con errores de sintaxis

**Propuesta del agente.**
Comprobar la sintaxis con `node --check archivo.js`.

**Por qué era incorrecto.**
Fuera de un paquete con `"type": "module"`, Node 24 devolvió código 0 para `export const a = ;`, de modo que el hook daba por válido código roto.

**Cómo se detectó.**
La prueba automatizada `RC2` del propio agente falló. Después se reprodujo a mano: `node --check x.js` terminaba con `exit=0`.

**Corrección.**
Se añadió `revisarSintaxisJs()` en `comun.mjs`, que comprueba `.js` y `.mjs` como módulo ES con `node --input-type=module --check`, leyendo el archivo desde la entrada estándar. Lo usan `revisar-cambio.mjs` y `pruebas-al-terminar.mjs`.

**Verificación.** Pruebas `RC2` y `PT3`, superadas.

**Commit.** `2312f37` (configurar hooks y pruebas de claude code).

---

## IA-04 — Las pruebas fallidas podían terminar con código 0

**Propuesta del agente.**
Ejecutar `node --test` en `api/` heredando todo el entorno del proceso.

**Por qué era incorrecto.**
Si el entorno contiene `NODE_TEST_CONTEXT`, el proceso hijo envía sus resultados a otro ejecutor de pruebas y termina con código 0 aunque haya pruebas fallidas. El hook habría dado por buenas pruebas que no pasaban, y CLAUDE.md §13 prohíbe afirmar que una prueba pasó sin que sea cierto.

**Cómo se detectó.**
La prueba automatizada `PT2` falló, mientras que la ejecución manual del hook sí bloqueaba.

**Corrección.**
`pruebas-al-terminar.mjs` elimina `NODE_TEST_CONTEXT` del entorno antes de lanzar `node --test`.

**Verificación.** Prueba `PT2`, superada.

**Commit.** `2312f37` (configurar hooks y pruebas de claude code).

---

## IA-05 — Pruebas de los hooks que dependían del estado del repositorio real

**Descripción.**
Tres pruebas de la suite de los hooks (`hooks.test.mjs`, ejecutada con `node:test`) fallaron sin que los hooks tuvieran ningún error.

**Propuesta del agente.**
Las pruebas `PA4b`, `PA5` y `CS1` usaban el repositorio real del proyecto y daban por hecho que la etiqueta `spec-v1` **no existía**:
- `PA4b` y `PA5` esperaban `deny` al escribir en `api/src/app.js` dentro del repositorio real.
- `CS1` esperaba que el contexto de sesión dijera `spec-v1: NO existe`.

**Por qué era incorrecto.**
El resultado de esas pruebas dependía del estado externo del repositorio y no del comportamiento del hook. Además, esa suposición estaba destinada a dejar de cumplirse, porque crear `spec-v1` es un paso previsto del proyecto (CLAUDE.md §1).

**Cómo se detectó.**
Después de que la usuaria creara la etiqueta `spec-v1` (commit `4c6aa29`), el agente volvió a ejecutar la suite antes de reactivar los hooks. Resultado: 29 pruebas, 26 superadas y 3 fallidas (`PA4b`, `PA5` y `CS1`). Los mensajes mostraban que los hooks respondían correctamente al nuevo estado: `ask` en lugar de `deny`, y `spec-v1: existe`.

**Corrección.**
- `PA4b`, `PA5` y `CS1` comprueban ahora el caso "sin etiqueta" en un **repositorio temporal creado sin `spec-v1`** (`repoTemporal({ tag: false })`), independiente del repositorio real.
- `CS1` comprueba además que, en el repositorio real, el contexto indica `spec-v1: existe`.
- No se modificó ningún archivo de `.claude/hooks/`.

**Prueba adicional.**
Se añadió `PA5b`: en el repositorio real, con `spec-v1` y `CRM_PARTE=B`, escribir `api/src/server.js` se permite.

**Verificación.**
Resultado final: `node --test` con 30 pruebas, 30 superadas y 0 fallidas.

**Commit.** `2312f37` (configurar hooks y pruebas de claude code).

---

## IA-06 — `server.js` anunciaba "Escuchando" aunque el puerto estuviera ocupado (Express 5)

**Descripción.**
Con el puerto ya ocupado, el servidor de la API mostraba `[API] Escuchando en el puerto N.` y, justo después, `[API] No se pudo iniciar el servidor (código EADDRINUSE).`: un mensaje de éxito falso.

**Propuesta del agente.**
En la fase B1, el agente escribió el arranque con el patrón de Express 4:

```js
const servidor = crearApp().listen(puerto, () => {
  console.log(`[API] Escuchando en el puerto ${puerto}.`);
});
servidor.on('error', (error) => { /* … */ process.exit(1); });
```

**Por qué era incorrecto.**
En Express 5, `app.listen()` también invoca su callback cuando el listen falla, pasándole el error como primer argumento. El callback, que no tenía parámetros, registraba un arranque correcto que no había ocurrido. Esto contradice B1-01 (el servidor escucha en el puerto configurado "sin errores") y daría evidencia falsa al verificar el arranque.

**Cómo se detectó.**
La prueba automatizada `servidor.test.js`, "si el puerto está ocupado termina con código 1 sin mostrar detalles internos", falló: el proceso hijo resolvía como "escuchando". El agente pensó primero que el fallo estaba en la prueba (ocupar solo `127.0.0.1` en Windows) y la cambió para ocupar todas las interfaces. Como seguía fallando, comprobó con sondas que Windows sí devolvía `EADDRINUSE` y reprodujo el caso con el `server.js` real: la salida mostraba los dos mensajes seguidos.

**Corrección.**
El callback de `listen` recibe `(error)`. Si hay error, se registra el código y el proceso sale con código 1; solo si no lo hay se anuncia `Escuchando en el puerto N.`. La prueba ocupa ahora el puerto en todas las interfaces, igual que `app.listen(PORT)`, y exige el código 1 y el mensaje `EADDRINUSE`.

**Verificación.**
- Tras la corrección: `npm test` en `api/` dio 56 pruebas, 54 superadas, 0 fallidas y 2 omitidas (las de integración con MySQL, sin variables `DB_*`), y `npm run test:bd` con MySQL `crm-mysql` en marcha dio 56 de 56.
- Tras aplicar también los hallazgos de `revisor-seguridad` y `revisor-contrato`: `npm test` da 63 pruebas, 61 superadas y 2 omitidas, y `npm run test:bd` da 63 de 63.

**Commit.** Pendiente (sin commit).

---

## IA-07 — Falsos positivos de `vigilar-bash.mjs` con `npm install | …` y con la palabra "del"

**Descripción.**
Durante B1, el hook pidió confirmación para tres comandos inofensivos:
1. `npm install 2>&1 | tail -5`, que reinstala las dependencias ya declaradas, se trató como "paquete nuevo".
2. Dos comandos de solo lectura que contenían el texto "registros del hook" y la ruta `.claude/hooks` se trataron como "modificación de la configuración de hooks".

**Propuesta del agente.**
En la configuración de los hooks, el agente detectó instalaciones y escrituras con expresiones regulares sobre el texto completo del comando:

```js
/\b(npm|pnpm|yarn|bun)\s+(i|install|add)\s+(?!-)[^\s]/i      // "paquete nuevo"
/(>{1,2}|\btee\b|…|\brm\b|\bdel\b|\bcopy\b|\bmove\b|…)/i      // "escribe archivos"
```

**Por qué era incorrecto.**
1. Tras retirar `2>&1`, en `npm install  | tail -5` el primer carácter después de `install` es `|`, y la expresión lo tomaba por el nombre de un paquete.
2. `\bdel\b`, `\bcopy\b`, `\bmove\b`, `>`… coincidían en cualquier parte del texto: dentro de comillas (`echo "registros del hook"`), en rutas o en argumentos. Bastaba que el comando mencionara también `.claude/hooks` o `laravel/` para pedir confirmación o bloquear.
3. Al revisar el código apareció un tercer defecto: la confirmación de Git terminaba el análisis antes de comprobar las escrituras, así que `git checkout -- laravel/routes/web.php` solo pedía confirmación, cuando para la Parte B debe bloquearse.

**Cómo se detectó.**
Al revisar `.claude/bloqueos.log` al final de B1 aparecieron confirmaciones (`ask`) que no correspondían a ninguna operación de riesgo. El agente reprodujo los casos llamando directamente al hook: `npm install 2>&1 | tail -5` → `ask` y `npm install` → permitido. El tercer defecto lo detectó la prueba de regresión `VB9`, que esperaba `deny` y obtuvo `ask`.

**Corrección** (solo en `.claude/hooks/vigilar-bash.mjs` y en sus pruebas):
- **Análisis por segmentos** (`segmentos`, `recorrer`): el comando se divide por `;`, `&&`, `||`, `|`, `&`, saltos de línea y paréntesis, **sin cortar dentro de comillas**. Se omite el cuerpo de los heredocs (`sinHeredocs`), tanto para buscar comandos como para buscar rutas de destino. Se entra en `bash -c`, `sh -c`, `powershell -Command` y `cmd /c`.
- **Escrituras** (`escribeArchivos`): un comando de escritura (`rm`, `del`, `copy`, `Set-Content`, …) solo cuenta si es el **comando** del segmento, es decir, su primera palabra tras las asignaciones `VAR=valor`. También cuentan `sed -i` y `perl -i`, `git checkout|restore|mv|rm|apply`, y una redirección `>` o `>>` fuera de comillas (`=>` y `->` no cuentan).
- **Instalaciones** (`instalaciones`): solo son paquetes nuevos los argumentos posicionales que siguen a `install`, `i` o `add` dentro del mismo segmento. Los ORM prohibidos se comparan con el nombre exacto de cada paquete, y también en `npx`.
- **Decisión final**: se reúnen todos los hallazgos (reglas, Git, dependencias y escrituras) y una prohibición pesa siempre más que una confirmación.
- Las reglas de operaciones peligrosas **no cambian** y siguen analizando el comando completo, heredocs incluidos: archivos de entorno, variables de entorno, omisión de hooks, SQL destructivo, volúmenes de Docker, `migrate:fresh`, borrado recursivo y Git. Lo comprobó un bloqueo real: el agente intentó escribir esta misma entrada con un heredoc que citaba esas reglas, y el hook lo bloqueó por mencionar la omisión de hooks. La entrada se escribió con la herramienta de edición.

**Verificación.**
- Pruebas de regresión nuevas en `.claude/hooks/pruebas/hooks.test.mjs`:
  - `VB7`: 12 casos de `npm install` sin paquetes permitidos, 10 que piden confirmación y 7 prohibidos.
  - `VB8`: 10 comandos con "del", "copy", "move", "rm -f" o `>` en textos o rutas, todos permitidos.
  - `VB9`: 11 escrituras reales en `laravel/` o en archivos de la Parte A bloqueadas, 6 escrituras en la configuración de hooks que piden confirmación, y un heredoc cuyo contenido menciona `del laravel/…`, que se permite.
- Resultado: `node --test .claude/hooks/pruebas/hooks.test.mjs` da 33 pruebas, 33 superadas y 0 fallidas.
- Comprobación en una sesión real de Claude Code, con los hooks activos:
  - `npm install 2>&1 | tail -2` → se ejecuta sin confirmación;
  - `echo "--- registros del hook"; ls .claude/hooks` → se ejecuta sin confirmación;
  - `npm install sequelize --dry-run 2>&1 | tail -2` → bloqueado;
  - `npm install supertest --dry-run 2>&1 | tail -2` → pide confirmación (registrada en `.claude/bloqueos.log`). Con `--dry-run` no se instaló nada.

**Commit.** Pendiente (sin commit).
