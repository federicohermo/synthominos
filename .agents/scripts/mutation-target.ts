import { mutationTargetCommand, realMutationSystem } from './mutation.ts';

// Prints the files a mutation run takes: changed since <base>, and in the `mutate` list.
//   node .agents/scripts/mutation-target.ts <base> [--report]
// No branches on purpose: everything it decides lives in `mutation.ts`.
process.exitCode = mutationTargetCommand(process.argv.slice(2), realMutationSystem());
