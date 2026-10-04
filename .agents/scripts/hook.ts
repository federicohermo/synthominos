import { handle } from './protocol.ts';
import { readInput, realGit, respond } from './system.ts';

// El hook `PreToolUse` de los dos harnesses: `node .agents/scripts/hook.ts <claude|codex>`.
// Sin ramas a propósito: todo lo que decide está en `protocol.ts` y `policy.ts`.
respond(handle(process.argv.slice(2), readInput(), realGit(import.meta.dirname)));
