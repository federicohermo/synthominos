import { playheadOffset } from './engine.ts';
import { rutaActiva, velo, MARCA } from './route-source.ts';
import { AIRE_RAZON, RADIO_RAZON } from '../board-fit/grid-fit.ts';
import type { CeldaPorEstrenar } from './route-source.ts';

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
 * El resaltado: la celda que suena ENGROSA su borde, hacia adentro y hacia afuera.
 * Nada mas — sin relleno, sin cambio de color y sin `scale`.
 *
 * ## Por que el borde y no un relleno
 *
 * En un secuenciador de fondo oscuro el estandar es ENCENDER el step activo, porque la
 * metafora es un LED. Este tablero es tema claro —panel blanco, celdas vacias blancas—
 * y ahi subir luminancia hace desaparecer la celda: el amarillo de `V` se va a blanco.
 * Un relleno oscuro funciona (medido: al 30 % el peor caso de las 12 piezas, la `W`,
 * da un delta de L* de 8,8 sobre un umbral de ~3) pero tapa la nota que la celda
 * muestra, que es lo que hay que poder leer. El borde marca el limite
 * sin pisar el contenido.
 *
 * ## Por que engorda para los DOS lados
 *
 * Hacia adentro solo no alcanza: TODAS las celdas ya tienen `border-slate-900`, ocupadas o
 * no, asi que engrosarlo es un cambio de grado contra un campo lleno de bordes negros.
 * El anillo exterior es lo que agrega el salto de tamano — la celda se lee mas grande
 * sin que crezca su caja.
 *
 * ## Y por que NO se usa `transform: scale`, que es lo obvio
 *
 * Porque `scale` AGRANDA la caja a efectos de overflow y `box-shadow` es *ink overflow*:
 * pinta afuera sin agrandar nada. La medicion que lo encontro es del layout viejo —con
 * `CELL_PX` en 63, grilla de 630 x 378, la cabeza en (9,5) y `scale(1.10)`, el
 * `scrollHeight` del entonces `overflow-x-auto` de `Board` pasaba de 378 a 381 y aparecian
 * las dos barras de desplazamiento—, y ese contenedor no scrollea: el desborde lo recorta
 * el `overflow-hidden` del raiz, asi que hoy el sintoma no seria una barra sino una celda
 * cortada en el borde. El MECANISMO no cambio, y es lo que decide.
 *
 * Gris pizarra y no un color: el color es IDENTIDAD —que pieza es— y el estado nunca se
 * comunica con hue. Es la misma regla por la que el fantasma es gris y no verde.
 */
export const BORDE_COLOR = '#0f172a';

/** Grosor hacia adentro y hacia afuera, en px. */
export const NOTA = { dentro: 3, fuera: 2 };

/**
 * El cruce: la cabeza pasa sobre una celda OCUPADA que no es su turno pero que igual suena
 * una floritura (`Click.note`).
 *
 * Ni la nota propia de una pieza ni el click mudo de siempre, asi que su borde va en el
 * escalon intermedio entre los otros dos. Los tres numeros —3/2, 2/1, 2/0— estan fijados
 * en DESIGN.md.
 */
export const CRUCE = { dentro: 2, fuera: 1 };

/**
 * Nota fuerte, cruce intermedio, click tenue (D7 mas D8 del 011).
 *
 * Si dos de los tres se vieran igual, el recorrido mentiria sobre cual de las tres cosas
 * paso. El click engorda solo hacia adentro y la mitad — se lee como un roce.
 */
export const CLICK = { dentro: 2, fuera: 0 };

/** Que escalon de borde le toca a cada `MarcaKind` — la tabla de D8 hecha dato. */
export const BORDE_POR_KIND = { [MARCA.nota]: NOTA, [MARCA.cruce]: CRUCE, [MARCA.click]: CLICK } as const;

/**
 * Las clases del velo van como literales enteros y no armadas por concatenacion:
 * Tailwind escanea el fuente, asi que solo genera lo que aparece escrito completo.
 *
 * **La geometria NO esta aca**, y es lo que hay que respetar al tocar estas dos clases: el
 * aire y el radio son razones de `--cell` desde el 021, y una clase de Tailwind no puede
 * interpolar una custom property. Escritos aca, a celda 180 el velo cubriria una baldosa de
 * 4,93 px de aire con un margen de 2 y dejaria un halo. Los escribe `rearmar`, en
 * `playhead-loop.ts`, al lado de las cuatro coordenadas — que es el unico lugar donde ya se
 * hablaba en pixeles.
 *
 * Que estas dos clases repitieran el `p-[2px]` y el `rounded-lg` de la baldosa de
 * `Board.tsx`, y por que dejo de valer: spec 021 (issue #83).
 *
 * Lo que queda en la clase es lo que NO depende del tamano: el posicionamiento, el
 * relleno, el color y el filete. El `border-2 border-dashed` se queda fijo por el mismo
 * argumento que el borde de 1 px de la baldosa, escrito en `Board.tsx`: es un delimitador
 * y no un elemento tipografico, y su grosor es un ESCALON medido contra ese filete base.
 */
export const VELO_CAJA = 'absolute';
export const VELO_TAPA = 'w-full h-full border-2 border-dashed border-slate-900/50 bg-white/60';

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
 * Los tres grosores y su tabla viven en `playhead-loop.ts`; esto es la funcion que
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
