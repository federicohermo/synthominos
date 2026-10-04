import type { PlatformPath } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Dónde viven los worktrees de este repo y cómo se borran. Lo importan los dos lados de la
 * misma regla —el hook, que decide dónde se ABRE uno, y el limpiador, que decide dónde se
 * BORRA— para que la carpeta exista una sola vez.
 *
 * ## Por qué hay una sola carpeta
 *
 * El 2026-09-22, en el repo del que sale este harness, un limpiador que tomaba todo worktree
 * registrado se llevó uno abierto al lado del repo, con lo que tuviera sin commitear. La regla
 * de dónde se abre tiene que ser ejecutable, igual que la de dónde se borra: si cualquiera de
 * las dos es prosa, la otra no alcanza.
 *
 * Los worktrees que abren otros dueños no son de este módulo y no se tocan: la app de Codex
 * abre los suyos en `~/.codex/worktrees/` y los limpia ella, con un snapshot antes de borrar.
 * Por eso el limpiador no tiene un `--todos`: «todo lo registrado» incluye lo de otros.
 *
 * Este archivo sólo importa `node:*` porque los skills que abren worktrees llevan una copia
 * byte a byte, junto con `clean-worktrees.ts`: un skill es autocontenido.
 */

/** La carpeta, relativa al checkout principal. Un worktree es un hijo DIRECTO de ella. */
export const WORKTREES_DIR = ['.claude', 'worktrees'] as const;

/** Compara rutas como las compara el sistema: Windows no distingue mayúsculas. */
function key(paths: PlatformPath, target: string): string {
  const normal = paths.resolve(target);
  return paths.sep === '\\' ? normal.toLowerCase() : normal;
}

/**
 * Si `target` es un lugar válido para un worktree del repo cuyo checkout principal es
 * `mainCheckout`: un hijo directo de `<mainCheckout>/.claude/worktrees/`.
 *
 * **Directo, y no «adentro».** Un agente parado en un worktree que abre
 * `.claude/worktrees/x` lo abre anidado en el suyo, y el limpiador se lo lleva junto con el
 * padre. Por eso el lugar sale del checkout principal y no del cwd.
 */
export function isValidWorktreeTarget(paths: PlatformPath, mainCheckout: string, target: string): boolean {
  const dir = paths.join(mainCheckout, ...WORKTREES_DIR);
  return key(paths, paths.dirname(paths.resolve(target))) === key(paths, dir);
}

/**
 * Lo que el limpiador necesita de la máquina, y nada más. Real en `realMachine`, falsa en los
 * tests: los dos modos de falla de Windows no se pueden fabricar en el `ubuntu-latest` de la CI.
 */
export interface Machine {
  readonly paths: PlatformPath;
  readonly windows: boolean;
  git(args: readonly string[], cwd: string): { readonly code: number; readonly output: string };
  exists(target: string): boolean;
  /** `null` si la ruta no existe. Resuelve junctions y enlaces: es lo que impide usarlos para salir. */
  realpath(target: string): string | null;
  /** Mata lo que corre adentro de `target` y devuelve una línea por proceso. Sólo en Windows. */
  killProcessesInside(target: string): readonly string[];
  /** Recursivo y SIN cruzar enlaces ni junctions: lo que apunta afuera se desenlaza, no se vacía. */
  remove(target: string): void;
  sleep(ms: number): void;
  log(line: string): void;
}

const USAGE = 'uso: node .agents/scripts/clean-worktrees.ts <ruta-del-worktree> [<ruta> ...]';

/**
 * Destruye los worktrees nombrados, que tienen DOS modos de falla en Windows y no uno, los dos
 * medidos el 2026-08-21:
 *
 * 1. `node_modules` está en `.gitignore`. `git worktree remove` borra lo trackeado y el `.git`,
 *    pero el directorio no queda vacío y el borrado final falla. Git igual saca la metadata,
 *    así que el worktree deja de estar registrado y queda un directorio huérfano.
 * 2. Un proceso vivo adentro. Un `.exe` en ejecución desde el `node_modules` del worktree no se
 *    puede borrar, y su línea de comando puede traer la ruta relativa: sólo lo encuentra un
 *    match por `ExecutablePath`.
 *
 * Por eso el orden es: sacar la metadata, matar lo de adentro, recién ahí borrar. Devuelve el
 * código de salida: 0 todo borrado, 1 algo quedó, 2 mal invocado.
 */
export function clean(args: readonly string[], m: Machine): 0 | 1 | 2 {
  if (args.length === 0 || args.includes('--todos')) {
    m.log(USAGE);
    return 2;
  }
  const common = m.git(['rev-parse', '--path-format=absolute', '--git-common-dir'], '.');
  if (common.code !== 0) {
    m.log('ABORTADO: no es un repo git');
    return 1;
  }
  const mainCheckout = m.paths.dirname(common.output.trim());
  const dir = m.realpath(m.paths.join(mainCheckout, ...WORKTREES_DIR));
  let failed: 0 | 1 = 0;

  for (const target of args) {
    m.log(`== ${target}`);
    const real = m.realpath(target);
    if (real === null) {
      m.log('   no existe: nada que hacer');
      continue;
    }
    // Por la ruta RESUELTA: un junction adentro de `.claude/worktrees/` que apunte afuera
    // resuelve afuera, y se rechaza.
    if (dir === null || key(m.paths, m.paths.dirname(real)) !== key(m.paths, dir)) {
      m.log(`   RECHAZADO: no es un hijo directo de ${WORKTREES_DIR.join('/')}/`);
      failed = 1;
      continue;
    }
    const status = m.git(['status', '--porcelain'], real);
    if (status.code !== 0 || status.output.trim() !== '') {
      m.log('   SALTEADO: tiene cambios sin commitear, o git no pudo leerlo');
      failed = 1;
      continue;
    }
    m.git(['worktree', 'unlock', real], mainCheckout);
    // Se espera que falle en el borrado final (modo 1): lo que importa es que desregistre.
    m.git(['worktree', 'remove', '--force', real], mainCheckout);
    if (m.windows) for (const line of m.killProcessesInside(real)) m.log(line);
    m.remove(real);
    if (m.exists(real)) {
      // Windows tarda en soltar el handle de un `.exe` recién matado. Dos fallos seguidos ya
      // no son timing: es algo que el filtro no ve, típicamente el IDE con la carpeta abierta.
      m.sleep(2000);
      m.remove(real);
    }
    if (m.exists(real)) {
      m.log('   SIGUE AHÍ: algo tiene un handle abierto. Cerralo y volvé a correr esto.');
      failed = 1;
    } else {
      m.log('   borrado');
    }
  }

  m.git(['worktree', 'prune'], mainCheckout);
  return failed;
}

/**
 * El PowerShell que mata lo que corre adentro de `target`. Sólo ASCII: la cadena cruza a
 * `powershell.exe` por la codepage de la consola.
 *
 * El filtro matchea la RUTA, nunca el nombre del proceso —un `pnpm dev` sobre el checkout
 * principal tiene el mismo nombre que uno de adentro— y excluye el propio árbol de procesos,
 * porque su línea de comando también contiene la ruta.
 */
export function processKillScript(target: string): string {
  const literal = target.replaceAll("'", "''");
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    `$a = '${literal}'`,
    "$pats = @($a, $a.Replace('/','\\'))",
    '$all = Get-CimInstance Win32_Process',
    '$mine = @(); $p = $PID',
    'while ($p -and ($mine -notcontains $p)) { $mine += $p; $pr = $all | Where-Object { $_.ProcessId -eq $p }; if (-not $pr) { break }; $p = $pr.ParentProcessId }',
    "$all | Where-Object { $mine -notcontains $_.ProcessId } | Where-Object { $c = $_.CommandLine; $e = $_.ExecutablePath; ($c -and ($pats | Where-Object { $c.Contains($_) })) -or ($e -and ($pats | Where-Object { $e.StartsWith($_) })) } | ForEach-Object { Write-Output ('   matando PID ' + $_.ProcessId + ' - ' + $_.Name); Stop-Process -Id $_.ProcessId -Force }",
  ].join('\n');
}

/** Cómo se lanza un proceso. Se inyecta para que la máquina real tenga test sin lanzar nada. */
export type Run = (program: string, args: readonly string[], cwd: string) => string;

const runForReal: Run = (program, args, cwd) =>
  execFileSync(program, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** La máquina de verdad. */
export function realMachine(platform: NodeJS.Platform, run: Run = runForReal): Machine {
  const windows = platform === 'win32';
  return {
    paths: windows ? path.win32 : path.posix,
    windows,
    git(args, cwd) {
      try {
        return { code: 0, output: run('git', args, cwd) };
      } catch {
        return { code: 1, output: '' };
      }
    },
    exists: existsSync,
    realpath: target => (existsSync(target) ? realpathSync.native(target) : null),
    killProcessesInside(target) {
      try {
        const output = run('powershell', ['-NoProfile', '-NonInteractive', '-Command', processKillScript(target)], '.');
        return output.split(/\r?\n/).filter(line => line.trim() !== '');
      } catch {
        // Sin PowerShell no hay a quién matar: el borrado de abajo dice si quedó algo.
        return ['   no se pudo listar procesos: sigo con el borrado'];
      }
    },
    // `rmSync` recursivo desenlaza un symlink o un junction en vez de entrar: borra la entrada,
    // no lo que hay del otro lado. El test del centinela lo verifica en disco real.
    remove: target => rmSync(target, { recursive: true, force: true, maxRetries: 3 }),
    sleep: ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
    log: line => console.log(line),
  };
}
