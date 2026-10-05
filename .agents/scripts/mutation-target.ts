import { mutationTargetCommand, realMutationSystem } from './mutation.ts';

process.exitCode = mutationTargetCommand(process.argv.slice(2), realMutationSystem());
