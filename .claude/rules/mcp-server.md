---
paths:
  - "mcp-server/**/*.ts"
---

# MCP server

Segundo paquete del workspace: `pnpm install` desde la raíz instala los dos y sus deps quedan aisladas
en `mcp-server/node_modules`. Sus tests son de `node --test`, no de Vitest — los `include` no se pisan.
Es tooling: no entra al bundle ni al deploy.

- **Las tools son una fachada sobre `src/domain/` y `src/audio/`, no una copia.** Lo único propio del
  server es el render ASCII, el parseo de los specs, el índice de símbolos y el formato de las
  respuestas. Si al agregar o tocar una tool aparece la tentación de calcular una rotación, una validez
  o una escala acá, falta un export en `src/domain/` — y eso es un cambio de `src/`, en su propio commit.
- **Una tool declara cuatro cosas, no dos.** Además de `description` e `inputSchema` van `title` —el
  nombre legible— y `annotations`, con `readOnlyHint` y `openWorldHint` **siempre**, y
  `destructiveHint` si escribe. Los dos campos son **opcionales** en `ToolDef` a propósito —así el
  commit que amplía el contrato no espera a que las seis estén hechas— y por eso el compilador no
  ataja al que se los olvide: lo ataja `tools.test.ts`, que recorre `tools` y los exige en todas.
  `readOnlyHint` habla de si la tool **modifica** su entorno, no de si toca el filesystem: leer
  `src/` o `specs/` del disco sigue siendo `true`. Y un hint que no sea cierto se **omite** en vez de
  afirmarse: `spec_write` no lleva `idempotentHint` porque `marcar` **falla** si la tarea ya estaba
  marcada, o sea que llamarla dos veces es un error y no un no-op.
- **Un resource tampoco copia números: los importa.** Es la misma regla que la de arriba, del otro lado
  del protocolo. `resources/constantes.ts` no tiene un solo literal numérico — las 14 constantes vienen
  de `src/domain/constants/` y `src/audio/constants/`, agrupadas por archivo con shorthand de propiedad
  para que la clave **sea** el identificador importado. Si aparece la tentación de tipear un valor acá,
  falta un export en `src/`, y eso es un cambio de `src/` en su propio commit. Cada constante viaja con
  **la ruta del archivo que la define**: sin eso el resource es otra copia, sólo que generada. Y **sin
  `cacheHint`**, que `ResourceDef.config` rechaza por tipo: lo que hace confiable a este server es que
  nada pueda quedar viejo. El criterio de entrada de una constante nueva es que hoy esté **copiada en
  `docs/` o en `CLAUDE.md`** —verificable—, no que parezca útil.
- **Un resource se declara en dos lados y el segundo falla en silencio.** Además del array de
  `resources/index.ts`, el entrypoint tiene que anunciar `capabilities: { …, resources: {} }`: sin eso
  el server contesta que no tiene resources, el registro corre igual y no lo ve nadie.
- **`find_symbol` es la única que mira el código como texto, y su índice no se persiste.** Se construye
  en cada consulta desde disco: medido en su momento sobre 36 + 16 archivos daba 112 ms en frío y
  ~50 ms después, y hoy el índice son 92 archivos más 22 que solo aportan aristas. Si alguna vez hace
  falta acelerarlo, cachear por `mtime` — **no** generar un archivo de índice: el server no tiene paso
  de build y lo que lo hace confiable es que no haya artefacto que pueda quedar viejo.
- **El grafo de `find_symbol` incluye a este paquete, y el índice de símbolos no.** Se leen los imports
  de `mcp-server/src/` porque las tools importan 31 símbolos del dominio y sin eso `usedBy` sub-reporta;
  sus exports quedan afuera porque el índice describe la superficie de `src/`. Al agregar un directorio
  nuevo que importe del dominio, sumarlo a `GRAFO` en `tools/findSymbol.ts`.
- **El grafo casa por nombre EXPORTADO y por archivo, no por el nombre local.** Un alias
  (`{ isValid as esValida }`) guarda `propertyName`, y un `import Board from './Board.tsx'` no aporta
  nombre ninguno: el binding por defecto se marca aparte y se casa solo por archivo. Sin eso los seis
  `export default` de `src/` —`App` y los cinco componentes— contestan `usedBy: []`, que se lee como
  código muerto. Un `import * as x` sigue sin verse; no hay ninguno en `src/`.
- **Los imports de `src/` llevan extensión `.ts`.** Node los necesita; Vite no. Un import sin extensión
  rompe el server y **no** rompe la app, así que el error sería invisible del lado del navegador —
  `pnpm mcp:test` es lo que lo ataja.
- **El punto de una regex no matchea el retorno de carro.** Los archivos del repo están en CRLF, así
  que un patrón terminado en `(.*)$` deja de matchear y el parseo devuelve cero resultados sin ningún
  error. Cortar líneas aceptando CRLF.

Detalle en [docs/guides/mcp-domain.md](../../docs/guides/mcp-domain.md).
