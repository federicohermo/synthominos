import { MARCA } from './route.constants.ts';

/**
 * Los valores fijos de la cabeza lectora y del velo.
 *
 * Viven aca y no en `playhead-loop.ts` por la regla de `CLAUDE.md`: un `.ts` de capa
 * tiene funciones y nada mas. Mientras el bucle estuvo adentro de `Playhead.tsx` la
 * regla no llegaba —un `.tsx` es un componente, no un modulo de capa—; salieron a un
 * `.ts` para poder testearlos, y con eso pasaron a estar donde la regla mira.
 *
 * Es el primer archivo de `constants/` que importa de otro en vez de importar solo
 * tipos, y es a proposito: `BORDE_POR_KIND` empareja los tres grosores con las tres
 * `MarcaKind`, y ese emparejamiento es exactamente el «par de numeros que tiene que
 * coincidir y nada sincroniza» que la regla existe para evitar. Separarlo del grosor
 * que empareja seria dejar el par en dos archivos otra vez.
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
