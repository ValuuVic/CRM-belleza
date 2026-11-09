// PreToolUse (Read | Write | Edit | MultiEdit | NotebookEdit)
// Protege archivos sensibles y respeta la división Parte A / Parte B.

import {
  ejecutarHook,
  raizProyecto,
  rutaRelativa,
  clasificarRuta,
  parteActual,
  existeEtiqueta,
  denegar,
  preguntar,
  continuar,
  estaVersionado,
} from './comun.mjs';

const HERRAMIENTAS_ESCRITURA = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

await ejecutarHook(async (entrada) => {
  const herramienta = entrada.tool_name || '';
  const datos = entrada.tool_input || {};
  const ruta = datos.file_path || datos.notebook_path || datos.path;
  if (!ruta) return continuar();

  const raiz = raizProyecto(entrada);
  const rel = rutaRelativa(ruta, raiz);
  if (rel === null) return continuar(); // fuera del proyecto: no es asunto de este hook

  const tipo = clasificarRuta(rel);
  const escribe = HERRAMIENTAS_ESCRITURA.has(herramienta);

  // 1. Archivos .env: ni lectura ni escritura (S2). .env.example sí se permite.
  if (tipo === 'env') {
    return denegar(
      `Acceso bloqueado a "${rel}": los archivos .env contienen secretos y el agente no los lee ni modifica (CLAUDE.md §7, §11; S2). Use .env.example.`,
    );
  }

  if (!escribe) return continuar();

  // 2. Migraciones: las versionadas nunca se modifican; la Parte A crea y ajusta las nuevas.
  if (tipo === 'migracion') {
    if (parteActual(raiz) === 'A' && !estaVersionado(rel, raiz)) return continuar();
    return denegar(
      `"${rel}" es una migración ya versionada o la sesión no es de la Parte A. Las migraciones existentes no se modifican (CLAUDE.md §3).`,
    );
  }

  const parte = parteActual(raiz);

  // 3. Archivos de la otra integrante.
  if (tipo === 'A' || tipo === 'B') {
    if (parte && parte !== tipo) {
      return denegar(
        `"${rel}" pertenece a la Parte ${tipo} y esta sesión trabaja como Parte ${parte}. No se modifican archivos de la otra integrante sin autorización (CLAUDE.md §2).`,
      );
    }
    if (!parte) {
      return preguntar(
        `No se pudo determinar la parte (defina CRM_PARTE o use una rama a/… o b/…). "${rel}" pertenece a la Parte ${tipo}: confirme que tiene autorización.`,
      );
    }
  }

  // 4. Código de implementación (api/ y frontend/, incluido api/src/app.js) solo con spec-v1.
  const esImplementacion = rel.startsWith('api/') || rel.startsWith('frontend/');
  if (esImplementacion && !existeEtiqueta('spec-v1', raiz)) {
    return denegar(
      `No existe la etiqueta Git "spec-v1". No se escribe código de implementación en "${rel}" hasta aprobar la especificación (CLAUDE.md §1).`,
    );
  }

  // 5. Archivos compartidos y configuración de hooks: requieren confirmación.
  if (tipo === 'compartido') {
    return preguntar(
      `"${rel}" es un archivo compartido. Los cambios deben coordinarse entre ambas integrantes (CLAUDE.md §2).`,
    );
  }
  if (tipo === 'hooks') {
    return preguntar(
      `"${rel}" forma parte de la configuración de hooks. No se desactivan hooks para evitar restricciones (CLAUDE.md §11); confirme el cambio.`,
    );
  }

  return continuar();
});
