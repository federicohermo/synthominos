# mcp-server — el dominio de pentomino-games, ejecutable

Servidor MCP que **importa las funciones puras de `src/` y las ejecuta**. No indexa código: no hay
índice, no hay staleness y no hay paso de build.

Guía de uso y catálogo de tools: [`docs/guides/mcp-domain.md`](../docs/guides/mcp-domain.md).
El spec que lo motivó: [`specs/006`](https://github.com/federicohermo/pentomino-games/issues/68).

## Comandos

```bash
pnpm install                # DESDE LA RAÍZ: el workspace instala los dos paquetes
pnpm mcp:test               # desde la raíz — typecheck + node --test
pnpm mcp:typecheck          # desde la raíz — solo tsc
pnpm --filter mcp-server start   # arranca por stdio, para probarlo a mano
```

Adentro de esta carpeta los scripts son `test`, `typecheck` y `start`.

**Node ≥ 22.18.** El server corre TypeScript sin compilar; con Node 20 no arranca. La app y el deploy
no se ven afectados: esto es tooling.

## Estructura

```text
mcp-server/
├── package.json            deps propias: @modelcontextprotocol/server + zod + typescript
├── tsconfig.json           noEmit; lib incluye DOM (ver abajo)
└── src/
    ├── index.ts            entrypoint: serveStdio + registro de tools y resources
    ├── pieces.ts           las 12 letras, sacadas de SHAPES
    ├── render.ts           ASCII de una pieza (puro)
    ├── symbols.ts          índice de símbolos de src/, por AST (puro + lectura)
    ├── resources/
    │   ├── index.ts        el array de resources; una línea por resource
    │   ├── types.ts        ResourceDef y el helper de respuesta
    │   └── <resource>.ts   uno por archivo: nombre, URI, metadata y handler
    ├── tools/
    │   ├── index.ts        el array de tools; una línea por tool
    │   ├── types.ts        ToolDef, defineTool y los helpers de respuesta
    │   └── <tool>.ts       una por archivo: nombre, título, anotaciones, descripción, schema y handler
    └── __tests__/          node --test, un archivo por módulo
```

## Cómo agregar una tool

1. Un archivo en `src/tools/`, que exporte
   `defineTool({ name, title, description, annotations, inputSchema, run })`.
2. Una línea en `src/tools/index.ts`.

El entrypoint no se toca y no hay ningún `switch`. **No escribir validación de argumentos**: la hace el
SDK contra el schema de zod antes de llamar al handler.

`title` y `annotations` son **opcionales en el tipo y obligatorios en la práctica**: quien los exige es
`__tests__/tools.test.ts`, que recorre el registro entero, y no el compilador. El detalle de qué hint
va en cada caso está en [`.agents/rules/mcp-server.md`](../.agents/rules/mcp-server.md).

Un **resource** se agrega igual, con `src/resources/` en lugar de `src/tools/`: un archivo que exporte
un `ResourceDef` y una línea en `src/resources/index.ts`. Y **no copia valores de `src/`, los importa** —
si uno no se puede importar, falta un export, que es un cambio de `src/` en su propio commit.

La descripción se escribe **por intención** —cuándo conviene llamarla en vez de leer el código—, no por
mecanismo. Sin adopción no hay ahorro, y lo único que decide la adopción es esa descripción.

## Cuatro cosas que no son obvias

**Los imports de `src/` llevan `.ts` explícito, y no es cosmético.** Node los necesita para resolver.
Un import sin extensión dentro de `src/<capability>/domain/` rompe este server y **no** rompe la app, porque Vite
resuelve igual: el error sería invisible del lado del navegador. Lo ataja `pnpm mcp:test`.

**El tsconfig incluye `DOM` en `lib` aunque el server nunca toque el DOM.** Typechequea la cadena
`playback/audio/scheduler.ts → playback/audio/voice.ts`, que declara `BaseAudioContext`, `AudioNode` y `OscillatorType`.
Sin `DOM` son 8 errores TS2304. En runtime nada de eso existe: los tipos se borran y `collectHits` es
aritmética.

**Nada de dominio se escribe acá.** Rotar, reflejar, colocar, validar, calcular notas y chequear
invariantes viene todo de `src/`. Lo propio del server es el render ASCII, el parseo de los specs, el
índice de símbolos y el formato de las respuestas. Si aparece la tentación de calcular una rotación o
una escala en este paquete, es señal de que falta un export en `src/<capability>/domain/` — y eso es un cambio de
`src/`, en su propio commit.

**`typescript` es una dependencia de runtime, no de desarrollo.** `symbols.ts` la importa para parsear
`src/` con el AST del compilador, así que está en `dependencies` aunque `tsc` también la use para el
typecheck. Y el import es del módulo entero y **estático**, así que los ~292 ms de carga se pagan en el
**arranque del server**, lo llame alguien a `find_symbol` o no: cargar las cuatro tools de dominio
cuesta 124 ms y sumarle `find_symbol` lo lleva a 420. Volverlo perezoso es posible —un `createRequire`
dentro de `readIndex`, porque `typescript` es CJS y el resto de la cadena es sincrónico— y no está
hecho a propósito: 292 ms una vez por sesión no pagan tener dos nombres para el mismo módulo.

Por qué AST y no una regex: la pregunta que `find_symbol` contesta es *quién usa* un símbolo, y eso se
resuelve por el grafo de imports —specifier relativo resuelto a archivo—, no por coincidencia de texto.
Una regex además se equivoca en silencio con CRLF, que es el trap documentado de este repo.
