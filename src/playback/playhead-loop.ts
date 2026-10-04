import { playheadOffset } from './engine.ts';
import { rutaActiva, velo } from './route-source.ts';
import { AIRE_RAZON, RADIO_RAZON } from '../board-fit/layout.constants.ts';
import { BORDE_COLOR, BORDE_POR_KIND, VELO_CAJA, VELO_TAPA } from './playhead.constants.ts';
import type { CeldaPorEstrenar } from './route.types.ts';

/**
 * El bucle de dibujo de la cabeza lectora y del velo: todo lo que `Playhead.tsx` hacia
 * adentro de su `useEffect`.
 *
 * **Vive en un `.ts` y no en el `.tsx` por una regla del repo, no por gusto.**
 * `react-refresh/only-export-components` prohibe que un `.tsx` exporte algo ademas del
 * componente, asi que mientras esto estuviera adentro de `Playhead.tsx` no se podia
 * exportar y, por lo tanto, no se podia testear — que es exactamente el argumento con el
 * que el dominio salio de `App.tsx` y la proyeccion al motor salio a
 * `engine-bridge.ts`. Es el mismo movimiento, aplicado al ultimo lugar donde quedaba
 * logica encerrada en un componente.
 *
 * El componente queda con lo unico que le corresponde: montar los dos contenedores y
 * pasar sus nodos. No hay cambio de comportamiento — el codigo es el mismo, y lo que se
 * mueve son 100 lineas de las que el 60 % son comentario.
 */

/**
 * Lo que mide `n` celdas, en CSS — la misma funcion que `Board.tsx`, escrita dos veces a
 * proposito.
 *
 * Son dos archivos que no se importan entre si y el string es de una linea: compartirla
 * obligaria a un modulo mas para ahorrar veinte caracteres.
 *
 * El numero vive en la custom property `--cell`, que escribe `use-grid.ts` sobre el
 * contenedor raiz. Escribir `calc()` y no el producto en pixeles es lo que hace que
 * redimensionar la ventana reubique la cabeza y el velo sin que este bucle escriba nada.
 */
const celdas = (n: number) => `calc(var(--cell) * ${n})`;

/** Lo que devuelve `iniciarCabeza` cuando no hay nodos: una limpieza que no limpia nada. */
const SIN_CABEZA = (): void => {};

/**
 * El `box-shadow` de un grosor: el anillo de adentro siempre, el de afuera solo si el
 * escalon lo pide.
 *
 * Los tres grosores y su tabla viven en `playhead.constants.ts`; esto es la funcion que
 * los convierte en CSS.
 */
export const borde = ({ dentro, fuera }: { dentro: number; fuera: number }): string =>
  `inset 0 0 0 ${dentro}px ${BORDE_COLOR}` + (fuera > 0 ? `, 0 0 0 ${fuera}px ${BORDE_COLOR}` : '');

/** Que celda de que pieza. Por pieza y no solo por celda: ver `CeldaPorEstrenar`. */
const claveDe = (e: CeldaPorEstrenar): string => `${e.id}:${e.cell[0]},${e.cell[1]}`;

/**
 * Arranca el bucle y devuelve su limpieza.
 *
 * Los tres nodos entran por parametro y pueden ser `null`: es la firma que tiene un
 * `ref.current` recien montado, y el guardia que sigue es la traduccion de eso. Con el
 * bucle adentro del componente ese guardia no lo podia ejercer nadie —React asigna los
 * refs antes de correr los efectos, asi que los tres estan siempre—; aca es una llamada.
 */
export function iniciarCabeza(
  capa: HTMLElement | null,
  el: HTMLElement | null,
  resalte: HTMLElement | null,
): () => void {
  if (!capa || !el || !resalte) return SIN_CABEZA;

  // Clave de lo ULTIMO escrito, no la marca en si: comparar strings evita comparar
  // tuplas y deja el caso "oculto" expresado como cadena vacia. Es lo que baja de 60
  // escrituras por segundo a entre 4 y 11, y lo que hace que en pausa el loop no
  // toque el DOM ni una vez (AC7).
  let dibujado = '';
  let raf = 0;

  let veloVisto: readonly CeldaPorEstrenar[] | null = null;
  let tapas: { entrada: CeldaPorEstrenar; nodo: HTMLElement }[] = [];
  // El estreno se recuerda ACA y no en `route-source`: es el loop el que ve pasar la
  // cabeza. Sin esto, colocar una segunda pieza rearmaria el velo y volveria a tapar
  // celdas que ya se habian estrenado.
  const estrenadas = new Set<string>();

  const rearmar = (v: readonly CeldaPorEstrenar[]) => {
    capa.replaceChildren();
    tapas = v.map((entrada) => {
      const nodo = document.createElement('div');
      nodo.className = VELO_CAJA;
      nodo.style.left = celdas(entrada.cell[0]);
      nodo.style.top = celdas(entrada.cell[1]);
      nodo.style.width = celdas(1);
      nodo.style.height = celdas(1);
      // El aire y el radio de la baldosa, que llegaron a ser el `p-[2px]` y el
      // `rounded-lg` de `VELO_CAJA`/`VELO_TAPA`. Bajaron aca porque pasaron a depender de
      // `--cell` y una clase de Tailwind no puede interpolarla: son la MISMA caja que la
      // baldosa de `Board.tsx`, y desalinearlos deja el velo cubriendo medio pixel afuera.
      nodo.style.padding = celdas(AIRE_RAZON);
      if (estrenadas.has(claveDe(entrada))) nodo.style.display = 'none';
      const tapa = document.createElement('div');
      tapa.className = VELO_TAPA;
      tapa.style.borderRadius = celdas(RADIO_RAZON);
      nodo.appendChild(tapa);
      capa.appendChild(nodo);
      return { entrada, nodo };
    });
  };

  const draw = () => {
    // `rutaActiva()` PRIMERO y `playheadOffset()` despues, en ese orden. `rutaActiva`
    // es quien hace el swap al detectar que el motor cerro el ciclo; leyendo el
    // offset antes habria un cuadro en que un offset del ciclo NUEVO se dibuja sobre
    // la tabla del VIEJO, y si el ciclo nuevo es mas corto eso ilumina una celda que
    // no es. Asi la ventana queda en cero. `velo()` va en el medio por lo mismo: el
    // swap es lo que lo cambia.
    const marcas = rutaActiva();
    const v = velo();
    if (v !== veloVisto) {
      veloVisto = v;
      rearmar(v);
    }
    const offset = playheadOffset();

    // Una celda se estrena cuando la cabeza la PISA, no cuando arranca el ciclo: es lo
    // unico que hace visible que el orden de reproduccion no es el de colocacion, y que
    // a la pieza le toca su turno en un instante concreto. Las de offset `null` son de
    // una pieza que todavia no entro al ciclo, asi que no hay instante que esperar — se
    // destapan enteras en el swap, cuando `velo()` cambia.
    //
    // `>=` y no `===`: si un cuadro se pierde —la pestana oculta suspende el rAF— el
    // offset ya avanzo, y con igualdad la celda quedaria tapada hasta la vuelta
    // siguiente.
    //
    // Que sea `>=` es tambien lo que ata este bucle a la guarda `now < origin` de
    // `playheadOffset`: el swap se decide DENTRO del lookahead, y si en ese cuadro la
    // cabeza contestara la cola del ciclo nuevo —el offset MAXIMO— este `for`
    // destaparia las cinco celdas de un saque, en el mismo cuadro en que se crearon.
    // Es el bug que el review encontro. Si alguna vez `playheadOffset` deja de
    // devolver `null` antes del origin, esto vuelve callado.
    if (offset !== null) {
      for (const { entrada, nodo } of tapas) {
        if (entrada.offset === null || nodo.style.display === 'none') continue;
        if (offset < entrada.offset) continue;
        nodo.style.display = 'none';
        estrenadas.add(claveDe(entrada));
      }
    }

    const marca = offset === null ? null : marcas[offset] ?? null;
    // `marca.kind` y no un booleano en la clave: con tres casos, dos marcas en la
    // misma celda pero de kind distinto (nota vs. cruce, por ejemplo si la ruta
    // volviera a pasar por ahi en otro offset del mismo cuadro dibujado) no pueden
    // deduplicarse como si fueran la misma.
    const clave = marca ? `${marca.cell[0]},${marca.cell[1]},${marca.kind}` : '';
    if (clave !== dibujado) {
      dibujado = clave;
      if (!marca) {
        el.style.display = 'none';
      } else {
        // Inline y no clases de Tailwind: las coordenadas salen de `var(--cell)` y no de
        // una constante, y esa custom property la resuelve el navegador en cada elemento.
        // La razon de fondo es
        // la misma —Tailwind escanea el fuente, una clase interpolada no se generaria— y
        // se le suma una: con la posicion escrita en `calc()`, redimensionar la ventana
        // reubica la cabeza sin que este bucle vuelva a escribir nada. Es lo que hace que
        // siga alineada mientras se arrastra el borde con el transporte corriendo.
        el.style.display = 'block';
        el.style.transform = `translate(${celdas(marca.cell[0])}, ${celdas(marca.cell[1])})`;
        resalte.style.boxShadow = borde(BORDE_POR_KIND[marca.kind]);
      }
    }

    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(raf);
    capa.replaceChildren();
  };
}
