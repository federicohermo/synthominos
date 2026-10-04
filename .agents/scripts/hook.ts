import { handle } from './protocol.ts';
import { readInput, realGit, respond } from './system.ts';

// The `PreToolUse` hook of both harnesses: `node .agents/scripts/hook.ts <claude|codex>`.
respond(handle(process.argv.slice(2), readInput(), realGit(import.meta.dirname)));
