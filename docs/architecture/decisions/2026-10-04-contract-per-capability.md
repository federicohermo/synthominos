# A contract per capability replaces the numbered specs

**2026-10-04**

Until today a unit of work was a numbered spec: four files (`spec.md`, `research.md`, `plan.md`,
`tasks.md`) published as one GitHub issue, with `specs/mapa.json` as the registry and a
gitignored cache under `specs/`. A spec closed with its PR and nobody read it again.

**Decision: the repo moves to spec-anchored development.** `specs/<capability>/<capability>.md`
is a durable contract per capability, tracked in git, and the code answers to it. The plan of a
change is a GitHub issue in the task-brief format. The model comes from the
[spec-anchored agentic development](https://github.com/w00fx/spec-anchored-agentic-development)
toolkit, through the adaptation the `nosefia` repo made of it.

Why: a spec per task could not be the truth of anything. Once closed it was history, so the code
was again the only source of behavior. With a contract per capability, a gap between the
contract and the code is a finding a gate can see: `specs/__tests__/specs.test.ts` requires a
test that cites every criterion of a `ratified` spec.

The cost: nine contracts to keep current, and typed IDs (`BR-<COD>-###`, `AC-<COD>-###`) that
are never renumbered.

## The numbered specs, frozen

Commit messages, PRs, closed issues and old comments name specs by number. This table is the
only place where a number still resolves to its issue. It is not updated.

| Spec | Issue | Final state | Title |
|---|---|---|---|
| 001 | [#63](https://github.com/federicohermo/pentomino-games/issues/63) | discarded | Asignar cada nota a una celda de la pieza, en orden angular alrededor del centroide |
| 002 | [#64](https://github.com/federicohermo/pentomino-games/issues/64) | implemented | Reemplazar Tone.js por un motor de audio propio sobre Web Audio |
| 003 | [#65](https://github.com/federicohermo/pentomino-games/issues/65) | implemented | Visualización de la señal con AnalyserNode |
| 004 | [#66](https://github.com/federicohermo/pentomino-games/issues/66) | superseded | Fase por pieza: la columna como posición en el compás |
| 005 | [#67](https://github.com/federicohermo/pentomino-games/issues/67) | implemented | `src/` en capas: dominio, audio y UI con dirección de dependencia |
| 006 | [#68](https://github.com/federicohermo/pentomino-games/issues/68) | implemented | MCP server: el dominio ejecutable, no el código indexado |
| 007 | [#69](https://github.com/federicohermo/pentomino-games/issues/69) | implemented | Nota por celda y lenguaje visual |
| 008 | [#70](https://github.com/federicohermo/pentomino-games/issues/70) | implemented | El intervalo como unidad musical, y un solo transporte |
| 009 | [#71](https://github.com/federicohermo/pentomino-games/issues/71) | implemented | El tablero como recorrido |
| 010 | [#72](https://github.com/federicohermo/pentomino-games/issues/72) | implemented | Cabeza lectora por celda |
| 011 | [#73](https://github.com/federicohermo/pentomino-games/issues/73) | implemented | Pisar una pieza cuesta |
| 012 | [#74](https://github.com/federicohermo/pentomino-games/issues/74) | implemented | El arpegio camina la pieza |
| 013 | [#75](https://github.com/federicohermo/pentomino-games/issues/75) | implemented | Control directo |
| 014 | [#76](https://github.com/federicohermo/pentomino-games/issues/76) | implemented | El tablero se edita en el tablero |
| 015 | [#77](https://github.com/federicohermo/pentomino-games/issues/77) | implemented | El click deja de ser ruido |
| 016 | [#78](https://github.com/federicohermo/pentomino-games/issues/78) | implemented | La pieza se ve antes de colocarse |
| 017 | [#79](https://github.com/federicohermo/pentomino-games/issues/79) | implemented | El régimen de rotación |
| 018 | [#80](https://github.com/federicohermo/pentomino-games/issues/80) | implemented | La pieza se elige con su letra |
| 019 | [#81](https://github.com/federicohermo/pentomino-games/issues/81) | implemented | El panel se queda sin botones |
| 020 | [#82](https://github.com/federicohermo/pentomino-games/issues/82) | implemented | La orientación es de la pieza |
| 021 | [#83](https://github.com/federicohermo/pentomino-games/issues/83) | implemented | El tablero es la pantalla |
| 022 | [#84](https://github.com/federicohermo/pentomino-games/issues/84) | implemented | El shell se queda con la composición |
| 023 | [#85](https://github.com/federicohermo/pentomino-games/issues/85) | implemented | La verificación la corre la máquina |
| 024 | [#86](https://github.com/federicohermo/pentomino-games/issues/86) | superseded | Los componentes se verifican en un navegador |
| 025 | [#87](https://github.com/federicohermo/pentomino-games/issues/87) | implemented | El estado que se pinta también se anuncia |
| 026 | [#88](https://github.com/federicohermo/pentomino-games/issues/88) | implemented | El tablero se toca con el teclado |
| 027 | [#89](https://github.com/federicohermo/pentomino-games/issues/89) | implemented | Lo que falla en silencio |
| 028 | [#90](https://github.com/federicohermo/pentomino-games/issues/90) | implemented | La app deja de llamarse React App |
| 029 | [#91](https://github.com/federicohermo/pentomino-games/issues/91) | implemented | Lo que no se cubre no se mergea |
| 030 | [#92](https://github.com/federicohermo/pentomino-games/issues/92) | implemented | El linter verifica lo que CLAUDE.md declara |
| 031 | [#93](https://github.com/federicohermo/pentomino-games/issues/93) | implemented | El tablero crece hasta la pantalla |
| 032 | [#94](https://github.com/federicohermo/pentomino-games/issues/94) | implemented | La documentación también se verifica |
| 033 | [#95](https://github.com/federicohermo/pentomino-games/issues/95) | implemented | El archivo deja de ser la interfaz |
| 034 | [#96](https://github.com/federicohermo/pentomino-games/issues/96) | implemented | El registro deja de vivir en el repo |
| 035 | [#99](https://github.com/federicohermo/pentomino-games/issues/99) | implemented | Los registros se van con los specs |
| 036 | [#103](https://github.com/federicohermo/pentomino-games/issues/103) | implemented | La Z era la N reflejada |
| 037 | [#104](https://github.com/federicohermo/pentomino-games/issues/104) | implemented | Un cambio arranca por el issue |
| 038 | [#105](https://github.com/federicohermo/pentomino-games/issues/105) | implemented | El estado del mapa tiene que ser verdad |
| 039 | [#109](https://github.com/federicohermo/pentomino-games/issues/109) | implemented | Una tarea la cierra un agente |
| 040 | [#110](https://github.com/federicohermo/pentomino-games/issues/110) | implemented | Las tools declaran si escriben |
| 041 | [#111](https://github.com/federicohermo/pentomino-games/issues/111) | implemented | Un número medido no se copia |
| 042 | [#112](https://github.com/federicohermo/pentomino-games/issues/112) | implemented | La deuda no vive en el spec que la parió |
| 043 | [#131](https://github.com/federicohermo/pentomino-games/issues/131) | implemented | El mapa lo deriva la máquina |
| 044 | [#132](https://github.com/federicohermo/pentomino-games/issues/132) | implemented | El issue que parió un spec se cierra con él |
| 045 | [#137](https://github.com/federicohermo/pentomino-games/issues/137) | implemented | El deploy es Vercel y el repo lo sabe |
| 046 | [#138](https://github.com/federicohermo/pentomino-games/issues/138) | proposed | La versión de Node se declara una vez |
| 047 | [#139](https://github.com/federicohermo/pentomino-games/issues/139) | implemented | Dos ramas con roles distintos |
| 048 | [#140](https://github.com/federicohermo/pentomino-games/issues/140) | implemented | La verificación no espera a que alguien la corra |
| 049 | [#141](https://github.com/federicohermo/pentomino-games/issues/141) | implemented | Tres convenciones más dejan de ser prosa |
| 050 | [#142](https://github.com/federicohermo/pentomino-games/issues/142) | implemented | La accesibilidad se verifica en vez de revisarse |
| 051 | [#162](https://github.com/federicohermo/pentomino-games/issues/162) | implemented | Los comentarios dejan de ser prosa |
| 052 | [#169](https://github.com/federicohermo/pentomino-games/issues/169) | proposed | El dock se arrastra sobre el tablero, y las doce forman un rectángulo |
