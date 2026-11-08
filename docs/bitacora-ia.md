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
