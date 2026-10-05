/** Fragments, not a string: the visible line and the `aria-label` compose different formats. */
export function textoDeOrientacion(
  rotation: number,
  mirror: boolean,
): { grados: string; reflejada: string | null } {
  return { grados: `${rotation * 90}°`, reflejada: mirror ? 'reflejada' : null };
}
