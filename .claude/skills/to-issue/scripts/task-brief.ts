import { realDraftSystem, run } from './brief.ts';

// Starts and checks an issue draft against `.github/ISSUE_TEMPLATE/task-brief.md`:
//   node .agents/scripts/task-brief.ts new|check <file>
//   node .agents/scripts/task-brief.ts number <file> <n>
// No branches on purpose: everything it decides lives in `brief.ts`.
process.exitCode = run(process.argv.slice(2), import.meta.dirname, realDraftSystem());
