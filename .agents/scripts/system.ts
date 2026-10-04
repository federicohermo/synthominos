import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path, { type PlatformPath } from 'node:path';
import type { Git } from './policy.ts';
import type { Response } from './protocol.ts';

/**
 * El borde de los hooks con el sistema: git de verdad, stdin y stdout. Todo lo que decide vive
 * en `policy.ts` y `protocol.ts`; acá sólo se pregunta y se escribe.
 */

/** Cómo se lanza git. Se inyecta para que los tests cubran el `null` sin romper un repo. */
export type RunGit = (args: readonly string[], cwd: string) => string;

const runGit: RunGit = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });

/** La carpeta existente más cercana: una ruta que se va a CREAR todavía no existe. */
function nearestExistingDir(paths: PlatformPath, target: string): string | null {
  let current = target;
  while (!existsSync(current)) {
    const parent = paths.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return statSync(current).isDirectory() ? current : paths.dirname(current);
}

/** El `Git` real, anclado en el repo donde vive el hook. */
export function realGit(hookDir: string, platform: NodeJS.Platform = process.platform, run: RunGit = runGit): Git {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const git = (args: readonly string[], cwd: string): string | null => {
    try {
      return run(args, cwd).trim();
    } catch {
      return null;
    }
  };
  const mainCheckoutOf = (dir: string): string | null => {
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir);
    return common === null ? null : paths.dirname(paths.resolve(common));
  };
  // Perezoso y una sola vez: un `ls` no tiene por qué pagar una consulta a git.
  let own: string | null | undefined;
  return {
    paths,
    ownCheckout: () => (own === undefined ? (own = mainCheckoutOf(hookDir)) : own),
    mainCheckoutOf,
    treeOf(target) {
      const dir = nearestExistingDir(paths, target);
      if (dir === null) return null;
      const tree = git(['rev-parse', '--show-toplevel'], dir);
      return tree === null ? null : paths.resolve(tree);
    },
    branchOf(tree) {
      const branch = git(['symbolic-ref', '--short', '-q', 'HEAD'], tree);
      if (branch !== null && branch !== '') return branch;
      // HEAD desprendido: si es un rebase, la rama es la que se rebasa. Sin esto, cualquier
      // rebase con conflictos en `src/` quedaría bloqueado a la mitad.
      for (const state of ['rebase-merge', 'rebase-apply']) {
        const file = git(['rev-parse', '--path-format=absolute', '--git-path', `${state}/head-name`], tree);
        if (file !== null && existsSync(file)) return readFileSync(file, 'utf8').trim().replace(/^refs\/heads\//, '');
      }
      return null;
    },
  };
}

/** Todo stdin, de una vez: el payload de un hook es un solo JSON. */
export function readInput(fd: number | string = 0): string {
  return readFileSync(fd, 'utf8');
}

/** Escribe la respuesta. El código de salida es siempre 0: el rechazo viaja en el JSON. */
export function respond(r: Response): void {
  if (r.stdout !== '') process.stdout.write(r.stdout);
  if (r.stderr !== '') process.stderr.write(r.stderr);
}
