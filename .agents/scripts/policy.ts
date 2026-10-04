import type { PlatformPath } from 'node:path';
import { isValidWorktreeTarget } from './worktrees.ts';

/**
 * Las reglas del repo sobre QUÉ se puede tocar desde DÓNDE. Es el núcleo de los hooks: no sabe
 * de Claude ni de Codex, ni de shells, ni lanza git. Recibe un `Intent` —qué rutas escribe una
 * llamada y qué worktrees abre— y un puerto `Git` con lo único que necesita saber del repo.
 *
 * ## Las dos reglas
 *
 * 1. **El prefijo de la rama decide si se puede tocar el producto.** `src/` y `mcp-server/src/`
 *    se escriben desde una rama que dice qué clase de cambio es, o desde `staging` para un
 *    `hotfix:`. Mira el NOMBRE y nada más: que una `feature/` parta de un spec lo mira el PR,
 *    porque el spec se escribe en la misma rama. Un gate que obliga a pedir permiso antes de
 *    empezar es un gate que se apaga.
 * 2. **Un worktree de este repo se abre sólo en `.claude/worktrees/`.** Ver `worktrees.ts`.
 *
 * ## Falla abierto, y lo dice
 *
 * Lo que protege es una convención, no un secreto. Un gate que rompe la sesión cuando no puede
 * leer algo se desactiva el mismo día, y ahí no queda gate. Por eso cada regla corre aparte: si
 * una no puede decidir, la otra igual decide, y lo que no se pudo mirar se avisa.
 */

/** Lo que una llamada a una herramienta va a hacer, en rutas absolutas. */
export interface Intent {
  readonly writes: readonly string[];
  /** `gitDir` es el directorio desde el que corre el `git worktree add` (el cwd, o su `-C`). */
  readonly worktrees: readonly { readonly gitDir: string; readonly target: string }[];
}

export type Verdict =
  | { readonly kind: 'no-opinion' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'warn'; readonly reason: string };

/** Lo único que el núcleo sabe de git. Real en `system.ts`, falso en los tests. */
export interface Git {
  /** `path.win32` o `path.posix`: el caso de dos discos se prueba en cualquier plataforma. */
  readonly paths: PlatformPath;
  /** El checkout principal del repo donde vive este harness. `null` si git no contestó. */
  ownCheckout(): string | null;
  /** El toplevel del árbol que contiene `target`, subiendo hasta la carpeta que exista. */
  treeOf(target: string): string | null;
  /** La rama del árbol. Durante un rebase, la que se está rebasando. */
  branchOf(tree: string): string | null;
  /** El checkout principal del repo de `dir`: el padre de su `--git-common-dir`. */
  mainCheckoutOf(dir: string): string | null;
}

export const PROTECTED = ['src', 'mcp-server/src'] as const;
export const PRODUCT_PREFIXES = ['feature/', 'bugfix/', 'refactor/', 'improvement/'] as const;
/** Sólo para el mensaje: no habilitan nada, nombran lo que no toca el producto. */
export const NON_PRODUCT_PREFIXES = ['harness/', 'docs/'] as const;
export const INTEGRATION_BRANCH = 'staging';
export const RELEASE_BRANCH = 'main';

const list = (prefixes: readonly string[]) => prefixes.map(p => `\`${p}\``).join(', ');

const HOW_OUT =
  `Al producto lo tocan ${list(PRODUCT_PREFIXES)}. Lo que no toca \`src/\` se nombra por lo ` +
  `que toca: ${list(NON_PRODUCT_PREFIXES)}. Un hotfix es un commit \`hotfix:\` directo en ` +
  `\`${INTEGRATION_BRANCH}\`. Qué es cada prefijo está en \`docs/infra/ramas.md\`.`;

/** La comparación que hace el sistema: Windows no distingue mayúsculas. */
function same(paths: PlatformPath, a: string, b: string): boolean {
  return paths.sep === '\\' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Si `target` cae dentro de una carpeta protegida del árbol `tree`.
 *
 * Compara por ruta RESUELTA y no por el string, así que `src/../src/x.ts` cae donde cae. La
 * carpeta misma cuenta como adentro: `rm -rf src` es el borrado que más importa. Y «sale de
 * acá» es `..` exacto o `../…`: una hermana que se llame `..notas` no sale de ningún lado. Entre
 * dos discos de Windows `relative` devuelve la ruta absoluta del otro disco, que no está adentro.
 */
export function isProtected(paths: PlatformPath, tree: string, target: string): boolean {
  return PROTECTED.some(dir => {
    const relative = paths.relative(paths.join(tree, dir), target);
    const outside = relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative);
    return !outside;
  });
}

/** Por qué `branch` no puede escribir el producto, o `null` si puede. */
export function branchDenial(branch: string, target: string): string | null {
  if (branch === INTEGRATION_BRANCH || PRODUCT_PREFIXES.some(p => branch.startsWith(p))) return null;
  if (branch === RELEASE_BRANCH) {
    return (
      `Estás parado en \`${RELEASE_BRANCH}\`, y \`${RELEASE_BRANCH}\` sólo cambia por un PR de ` +
      `promoción desde \`${INTEGRATION_BRANCH}\`. ${HOW_OUT}`
    );
  }
  return `La rama \`${branch}\` no dice qué clase de cambio es, y \`${target}\` es producto. ${HOW_OUT}`;
}

/** El checkout principal de `dir` si es ESTE repo, o `null` si es otro o ninguno. */
function ourMainCheckout(git: Git, dir: string): string | null {
  const main = git.mainCheckoutOf(dir);
  const own = git.ownCheckout();
  return main !== null && own !== null && same(git.paths, main, own) ? main : null;
}

function worktreeRule(intent: Intent, git: Git): Verdict {
  for (const w of intent.worktrees) {
    const main = ourMainCheckout(git, w.gitDir);
    // Otro repo, o ninguno: este gate no tiene opinión sobre él.
    if (main === null) continue;
    if (!isValidWorktreeTarget(git.paths, main, w.target)) {
      return {
        kind: 'deny',
        reason:
          `Un worktree de este repo se abre sólo como hijo directo de ` +
          `\`${git.paths.join(main, '.claude', 'worktrees')}\`, que es lo único que barre el ` +
          `limpiador. \`${w.target}\` quedaría fuera de toda limpieza.`,
      };
    }
  }
  return { kind: 'no-opinion' };
}

function branchRule(intent: Intent, git: Git): Verdict {
  for (const write of intent.writes) {
    // Condición necesaria y gratis: toda carpeta protegida termina en un `src`. Sin ella no se
    // le pregunta nada a git, que es lo caro (unos 80 ms por consulta en Windows).
    if (!git.paths.normalize(write).split(git.paths.sep).some(s => s.toLowerCase() === 'src')) continue;
    const tree = git.treeOf(write);
    if (tree === null || ourMainCheckout(git, tree) === null) continue;
    if (!isProtected(git.paths, tree, write)) continue;
    const branch = git.branchOf(tree);
    if (branch === null) {
      return { kind: 'warn', reason: `gate de rama: no pude leer la rama de \`${tree}\`, y dejé pasar \`${write}\`` };
    }
    const denial = branchDenial(branch, git.paths.relative(tree, write));
    if (denial !== null) return { kind: 'deny', reason: denial };
  }
  return { kind: 'no-opinion' };
}

/** Corre una regla sin dejar que su error apague a la otra. */
function isolated(name: string, rule: () => Verdict): Verdict {
  try {
    return rule();
  } catch (error) {
    return { kind: 'warn', reason: `${name} no pudo correr y dejó pasar: ${String(error)}` };
  }
}

/** El veredicto de las dos reglas: el primer rechazo gana; si no hay, el primer aviso. */
export function decide(intent: Intent, git: Git): Verdict {
  const verdicts = [
    isolated('gate de worktrees', () => worktreeRule(intent, git)),
    isolated('gate de rama', () => branchRule(intent, git)),
  ];
  return verdicts.find(v => v.kind === 'deny') ?? verdicts.find(v => v.kind === 'warn') ?? { kind: 'no-opinion' };
}
