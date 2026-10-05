# Documentación Técnica — Pentomino Games

Prototipo de instrumento musical basado en pentominós: un tablero donde cada pieza colocada dispara una
secuencia de cinco notas derivada de su identidad y su orientación.

## Índice de Documentación

### Arquitectura
- [Visión General](./architecture/overview.md) — Las cuatro capas, su dirección de dependencia y el stack
- [Estructura de Directorios](./architecture/directory-structure.md) — Qué hay y qué está muerto
- [Modelo Musical](./architecture/modelo-musical.md) — Pieza → tónica, rotación → escala **o** orden según el régimen, reflexión → retrógrado
- [Capa de Audio](./architecture/audio.md) — Grafo Web Audio, envolvente ADSR, scheduler con lookahead

### Guías de Desarrollo
- [Inicio Rápido](./guides/quickstart.md) — Setup y comandos
- [Verificación](./guides/verificacion.md) — `pnpm verify` entero: por qué cada nodo tiene la forma que tiene
- [Convenciones de Código](./guides/conventions.md) — Organización de `src/`, geometría, comentarios, estado
- [Troubleshooting](./guides/troubleshooting.md) — Errores reales que ya se pisaron en este repo
- [MCP server de dominio](./guides/mcp-domain.md) — Las seis tools —cinco que ejecutan el dominio o lo leen, y la que escribe— y el resource `pentomino://constantes`

### Infraestructura
- [Deploy](./infra/deploy.md) — Dónde vive la config, qué corre en el build y cuál de las dos ramas se publica
- [Ramas](./infra/ramas.md) — `staging` integra y es la default, `main` es release; el ruleset, y qué no verifica nadie

### Specs
- [specs/mapa.json](../specs/mapa.json) — El mapa spec↔issue y el estado de cada uno
- [GitHub Issues](https://github.com/federicohermo/pentomino-games/issues) — Lo registrado que todavía no tiene spec
- Qué se aprendió escribiendo o revisando cada spec: como comentario en el [issue](https://github.com/federicohermo/pentomino-games/issues) de ese spec
- [specs/README.md](../specs/README.md) — Convención de formato y flujo de trabajo

---

## Stack Tecnológico

| Tecnología | Versión | Propósito |
|---|---|---|
| Vite | 7.x | Dev server y bundler |
| React | 19.x | Biblioteca UI |
| TypeScript | 5.8 | Tipado estático |
| Tailwind CSS | 4.x | Estilos utility-first, vía `@tailwindcss/vite` |
| Web Audio | — | Síntesis y scheduling, sin librería (`src/audio/`) |

---

## Comandos Principales

```bash
pnpm dev      # Dev server de Vite
pnpm build    # tsc -b && vite build
pnpm lint     # ESLint (flat config v9)
pnpm preview  # Sirve el build de dist/
pnpm test     # Vitest — los dos proyectos, sin instrumentar
pnpm suite    # test y después coverage, con umbral 100; es lo que corre verify
pnpm verify   # lint ‖ typecheck ‖ suite ‖ mcp:test — el nodo de convergencia
pnpm mcp:test # MCP server — typecheck + tests con node --test
```

Vitest corre en **dos proyectos y un solo comando** (spec 029): los `*.test.ts` en `environment: 'node'`
contra `node-web-audio-api`, y los `*.browser.test.tsx` en un Chromium de verdad por Playwright. **En
jsdom no corre ninguno**, y no es una pendiente: jsdom no implementa Web Audio ni da canvas 2D,
`ResizeObserver` o `matchMedia`, así que cubrir `Spectrum.tsx` con él exigiría mockear justo el código
que se quiere cubrir. Los siete componentes, `App.tsx` y los cuatro hooks tienen test — ver
[la sección de tests](./architecture/directory-structure.md#tests).

---

## Variables de Entorno

**Ninguna.** La app es enteramente cliente: sin backend, sin API keys, sin endpoints. Y no hay
excepción escondida en la config del deploy: `vercel.json` no declara ninguna variable de entorno.

Si algún día hace falta una, en Vite debe llevar el prefijo `VITE_` para ser visible desde el cliente
(`import.meta.env.VITE_FOO`). El prefijo `REACT_APP_` de Create React App **no** funciona y falla en
silencio.

---

## Enlaces Rápidos

- [CLAUDE.md](../CLAUDE.md) — Guía para Claude Code
- [vercel.json](../vercel.json) — Config de deploy (vive en la raíz del repo, no acá)
