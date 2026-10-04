import { clean, realMachine } from './worktrees.ts';

// Destruye worktrees de `.claude/worktrees/`, y sólo de ahí:
//   node .agents/scripts/clean-worktrees.ts .claude/worktrees/a .claude/worktrees/b
// Sin `--todos` a propósito: «todo lo registrado» incluye los worktrees de otros dueños.
process.exitCode = clean(process.argv.slice(2), realMachine(process.platform));
