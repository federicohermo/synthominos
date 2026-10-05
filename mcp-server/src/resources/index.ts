import type { ResourceDef } from './types.ts';
import { constantes } from './constantes.ts';

/**
 * The registry of resources, with the same shape as `tools/index.ts`: a new resource is
 * one file plus one line here, and the entry point does not change.
 *
 * **It is an array from the first resource, not a lone `registerResource` in
 * `index.ts`**, and the reason is not symmetry. A resource with a parametric URI, such
 * as `piece://{letter}`, comes with `ResourceTemplate` and a different signature. With a
 * version for one element, that day someone must open the entry point, move the
 * registration and check the capabilities. With the array, that day needs one more line.
 */
export const resources: readonly ResourceDef[] = [
  constantes,
];
