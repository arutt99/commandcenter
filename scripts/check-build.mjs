import { buildIsCurrent } from './build-state.mjs';
process.exitCode = (await buildIsCurrent()) ? 0 : 1;
