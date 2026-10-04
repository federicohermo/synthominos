# Solución de Problemas

Errores que ya se pisaron en este repo, con su causa real. No son hipotéticos.

## Build y configuración

### `A config object has a "plugins" key defined as an array of strings`

ESLint no arranca y el mensaje habla de migrar a flat config, aunque la config **ya es** flat. Pasó al
subir `eslint-plugin-react-hooks` de 5.x a 7.x (spec 030).

**Causa:** el plugin invirtió sus exports. En 5.x `configs['recommended-latest']` era el preset flat;
en 6.x y 7.x ese nombre volvió a ser el de eslintrc —con `plugins` como array de strings, que es lo que
flat config rechaza— y el flat pasó a `configs.flat['recommended-latest']`.

**Solución:** `reactHooks.configs.flat['recommended-latest']`. Vale la pena mirar qué trae: en 5.2.0 el
preset activaba 2 reglas y en 7.x activa 17, porque incluye las del React Compiler. Salen por este
plugin y no por uno separado, y sirven aunque el compilador no se adopte.

### `'// eslint-disable-next-line …' has no effect because you have 'noInlineConfig'`

Es a propósito y no hay nada que arreglar en la config: desde el spec 030 el repo no admite
`eslint-disable` en el código, por el mismo argumento que el "cero `any`, cero `@ts-ignore`". Y como
`pnpm lint` corre con `--max-warnings 0`, ese aviso **rompe el build** en vez de quedar como ruido.

**Solución:** arreglar lo que la regla marca. Si de verdad hace falta una excepción, va como override
por archivo en `eslint.config.js`, con el porqué al lado — ahí se ve en el diff.

### `Failed to load PostCSS config: module is not defined in ES module scope`

```text
[plugin:vite:css] Failed to load PostCSS config (searchPath: …/my-app-vite):
[ReferenceError] module is not defined in ES module scope
```

**Síntoma de un problema más grande.** El error inmediato es que `postcss.config.js` usaba
`module.exports` (CommonJS) dentro de un paquete con `"type": "module"`. Pero renombrarlo a `.cjs` solo
destapa el siguiente error, porque el proyecto tiene **Tailwind 4** y en v4 el paquete `tailwindcss` ya
no expone un plugin de PostCSS.

**Solución aplicada:** se eliminaron `postcss.config.js` y `tailwind.config.js`, y Tailwind entra por el
plugin de Vite:

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ plugins: [react(), tailwindcss()] })
```

En v4 la config es CSS-first: no hay archivo de config por defecto y la detección de contenido es
automática. Para customizar el theme se usa `@theme { }` dentro de `styles/index.css`.

### Las clases de Tailwind no aplican

Verificar que `src/styles/index.css` empiece con la sintaxis de v4:

```css
@import "tailwindcss";
```

Las directivas de v3 (`@tailwind base; @tailwind components; @tailwind utilities;`) **no fallan con
error**: simplemente no generan nada, y la app queda sin estilos. Es un fallo silencioso.

Comprobación rápida con el dev server corriendo:

```bash
curl -s http://localhost:5173/src/styles/index.css | grep -c "min-h-screen"
```

### La página carga en blanco, sin errores en consola

Revisar que `src/main.tsx` efectivamente monte la app:

```tsx
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

Ya pasó una vez que el archivo quedó truncado en los imports, sin la llamada a `render`. El build
compila sin quejarse —los imports son válidos— y el `<div id="root">` queda vacío.

**Señal diagnóstica:** contar chunks **ya no sirve**. Cuando Tone entraba por import dinámico el build
emitía dos chunks JS, y ver uno solo delataba que `App` no era alcanzable desde el entry; con el motor
propio hay un único chunk siempre (ver [deploy.md](../infra/deploy.md#check-the-build-locally)).

La comprobación equivalente hoy es buscar código de la app dentro del bundle:

```bash
pnpm build && grep -c "Tablero" dist/assets/*.js   # 0 → App no entró al bundle
```

### `Error: Port XXXX is already in use`

Con `--strictPort`, Vite falla en vez de saltar de puerto. Ver qué hay del otro lado antes de matarlo:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5199/
netstat -ano -p tcp | grep LISTENING | grep 5199
```

Suele ser un dev server anterior que quedó vivo, y sirve reusarlo.

## Tests

### `OfflineAudioContext is not defined` en un test

El entorno del proyecto `node` es `node`, no `jsdom`, **a propósito**: jsdom no implementa Web Audio en
absoluto. Los tests importan `OfflineAudioContext` de `node-web-audio-api`, no de globales del entorno.

Si el test es de un componente, el archivo va en el **otro** proyecto: sufijo `*.browser.test.tsx`, que
corre en un Chromium de verdad (spec 029). Ahí `AudioContext` y el DOM son los del navegador y no hay
que importar nada. Lo que **no** hay que hacer es agregar `jsdom`: se descartó midiendo —no da canvas
2D, `createLinearGradient`, `ResizeObserver` ni `matchMedia`— y cambiar el `environment` global
rompería los tests de audio.

### Los tests no ven `describe` / `it` / `expect`

`globals` está **desactivado** en `vite.config.ts`: hay que importarlos de `vitest`.

```ts
import { describe, it, expect } from 'vitest';
```

Es deliberado, y **el motivo cambió con el spec 022**. Hasta ahí lo forzaba `@types/jest`, que estaba en
el árbol declarando las mismas globales con firmas distintas; ese paquete se fue con las otras seis
`devDependencies` huérfanas, así que hoy `globals: true` está **disponible y sin ejercer**. No se ejerce
porque ejercerlo es sacarle el import a los 50 archivos de test y no compra nada: el import explícito
dice de dónde sale `describe`, que es lo que se pierde con las globales.

## Audio

### No suena nada

1. **¿Hubo un click primero?** `ctx.resume()` necesita un gesto del usuario. Nada suena hasta el
   primer click en el tablero. Verificable: `(await import('/src/playback/audio/engine.ts')).audio().state`
   debe decir `'running'`, no `'suspended'`.
2. **¿Web Audio está disponible?** `audio()` falla de forma suave: loguea `"Web Audio no disponible"` y
   devuelve `null`. La app queda usable pero muda. Revisar la consola.
3. **¿Es el transporte y está parado?** El botón ▶ / ⏸ de la paleta arranca y para el reloj.
   Verificable con `clockRunning()`.
4. **¿Colocaste una pieza y no sonó el arpegio?** Es intencional si el transporte está corriendo:
   `handleCellClick` solo llama a `playNow` cuando `!playing`, para que el disparo de colocación no
   compita con el patrón del transporte. Si el transporte está parado y aun así no suena, seguir con los
   puntos 1 y 2.
5. **¿Hay secuencia activa?** `sequenceInfo().steps` debe ser mayor que 0 con el transporte en marcha y
   piezas colocadas. Si da 0 con piezas puestas, todavía no cerró el ciclo: desde el spec 009 la
   secuencia nueva entra recién en el cierre del ciclo en curso, y eso puede tardar hasta 7,5 s con 8
   piezas a 110 bpm. **Es una decisión (D5), no un bug** — esperar un ciclo antes de seguir buscando.

### Loops que siguen sonando después de borrar la pieza

Era un bug real, corregido. Si reaparece, el sospechoso es que alguien le haya hablado al motor **fuera**
del efecto de reconciliación, que desde el spec 022 vive en `playback/ui/use-engine.ts` y no en el shell.
Desde el spec 009 hay una sola llamada —`setSequence(proyectarAlMotor(secuencia))`— y toda la gestión
tiene que pasar por ese efecto — ver
[audio.md](../architecture/audio.md#reconciliación-de-loops).

**No es `setSequence(buildSequence(placed, regimen))`**, que es como se escribía acá antes del 022: la
`Sequence` del dominio no es la del motor y en el medio va la proyección de `playback/ui/engine-bridge.ts`, que
deja caer `pieceId` y `cell`. Hoy escribirlo así ni siquiera typechequea; el motivo de que igual importe
está en el docblock de `proyectarAlMotor`.

Para ver la secuencia activa desde la consola:

```js
(await import('/src/playback/audio/engine.ts')).sequenceInfo()
```

## MCP server

### El MCP server no arranca: `ERR_MODULE_NOT_FOUND`

```text
node:internal/modules/esm/resolve:274
    throw new ERR_MODULE_NOT_FOUND(
```

Casi siempre es **un import sin extensión dentro de `src/`**. El server corre con node crudo, que
necesita el `./music.constants.ts` completo; Vite resuelve igual sin la extensión, así que el error
**no rompe la app** y solo aparece del lado del server.

Es un modo de falla asimétrico y está verificado: sacándole el `.ts` a un import de `src/<capability>/domain/`, el
server muere con este error y `pnpm build` termina en verde.

**Solución:** poner la extensión. La regla está en
[conventions.md](./conventions.md), y desde el spec 030 la ataja `pnpm lint` antes que nadie — sobre
todo el repo, y no solo sobre lo que el server llega a importar.

### `ERR_UNKNOWN_FILE_EXTENSION: ".tsx"`

El server importó un `.tsx`. El type-stripping de node no transforma JSX: **`App.tsx` y los componentes
son inalcanzables desde el server, y no es cuestión de configuración.** Si una tool necesita algo que
hoy vive en un `.tsx`, eso tiene que bajar a `src/<capability>/domain/` primero — en su propio commit.

### El server arranca pero Claude Code no lo ve

Revisar la versión de node: el server pide **≥ 22.18** y con Node 20 no levanta. `node --version`.
`.mcp.json` está commiteado en la raíz y no hay nada más que configurar.

## Deploy

Ver [infra/deploy.md](../infra/deploy.md) para dónde vive la config y qué corre en el build. **Acá no
hay ningún error de deploy anotado**, y es a propósito: la plataforma cambió con el spec 045 y los dos
que estaban registrados eran de la anterior. Cuando se cometa uno en Vercel, va acá con lo que se midió
—no antes, que sería inventarlo.
