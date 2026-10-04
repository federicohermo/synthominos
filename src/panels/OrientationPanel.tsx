import { memo } from 'react';
import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import { MINI_BOX, MINI_CELL_PX, MINI_PISTA_PX } from '../pieces/piece-mini.ts';
import { PIECE_COLOR } from '../pieces/palette.ts';
import { miniCells } from '../pieces/piece-mini.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import type { Orientacion, MemoriaDeOrientacion } from '../pieces/orientation.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';

/**
 * Los dos objetos de props de la tarjeta de piezas, que llegaron a ser
 * dieciséis props planas sobre `PiecePalette`.
 *
 * Adentro hay dos paneles distintos —la orientación de la pieza en la mano y el
 * transporte del instrumento— y con las props sueltas la firma no decía qué agrupaba con
 * qué: enumeraba en vez de documentar.
 *
 * Los tres criterios de reparto, que no son obvios y por eso van escritos:
 *
 * - `regimen` va con la ORIENTACIÓN aunque sea global como el tempo, porque gobierna QUÉ
 *   HACE la rotación: con `escala` cambia la fórmula de escala y con `orden`
 *   cambia por dónde arranca el arpegio, así que sin él la orientación no dice qué suena.
 * - `noteSet` va del mismo lado por lo mismo: es el arpegio de la pieza en la mano EN ESA
 *   orientación, y su `useMemo` en el shell ya depende de los cuatro campos de acá.
 * - `onReset` va con el TRANSPORTE y no con la orientación porque `resetBoard` frena el
 *   reloj además de vaciar el tablero, que es la mitad que su propio comentario declara
 *   «no cosmética».
 */

/** La pieza en la mano: cuál es, cómo está puesta, y qué hace girarla. */
export interface PropsDeOrientacion {
  selected: PieceKey;
  /**
   * Las DOCE orientaciones y no la de la seleccionada.
   *
   * Baja entera porque la grilla de miniaturas necesita las doce: cada botón se dibuja en
   * **su** orientación recordada, que es de lo que trata ese spec. Y los lectores que sólo
   * quieren la de la pieza en la mano —la línea de texto del 019, el arpegio— la derivan
   * con `orientaciones[selected]` en vez de recibirla como un par de props sueltas: dos
   * props para la misma verdad son dos formas de que discrepen.
   *
   * `Board` es la excepción y sigue recibiendo el par suelto por su prop propia: es el
   * único consumidor que no necesita las doce.
   */
  orientaciones: MemoriaDeOrientacion;
  /**
   * Que hace la rotacion.
   *
   * Hasta el 019 completaba la frase de su propia fila —«Rotacion … cambia escala /
   * orden»—; al borrarse los cuatro botones de grados la frase se quedo sin sujeto y el
   * regimen paso a ser la fila.
   */
  regimen: RegimenDeRotacion;
  noteSet: readonly number[];
  onSelect: (piece: PieceKey) => void;
  onRegimen: (regimen: RegimenDeRotacion) => void;
  /**
   * El botón `0°`: devuelve la pieza en la mano —y sólo esa— a 0° sin reflejar.
   *
   * No lleva la pieza como argumento: el shell ya sabe cuál está en la mano, y pasársela
   * desde el panel sería que el componente decida sobre qué escribe. `PiecePalette` es
   * presentacional (`.claude/rules/ui.md`): recibe callbacks y no toca estado.
   */
  onResetOrientacion: () => void;
}

/**
 * Las doce miniaturas, cada una en la orientacion actual: elegir la pieza que va a la
 * mano.
 *
 * Presentacional: sin estado, sin efectos. Recibe UN objeto —el de la orientacion— y
 * nada mas.
 *
 * Devuelve el mismo `div` de la grilla que tenia `PiecePalette` y no lo envuelve en
 * nada: es un hijo directo de la tarjeta, y agregarle un nodo cambiaria el ritmo
 * vertical con las clases intactas.
 *
 * Va envuelto en `memo`, y el motivo es un numero. `hover` vive en
 * `App.tsx`, asi que cada celda que el cursor cruza re-renderiza el arbol entero — y esto
 * son 337 elementos de los que ninguno depende del hover. Medido con `Profiler`, el commit
 * por celda cruzada pasa de 4,9 ms a 1,9 ms: el 61 % del trabajo era este subarbol
 * reconciliandose para llegar al mismo DOM.
 *
 * La otra mitad de la barrera es el `useMemo` del objeto `orientacion` en `App.tsx`: sin el,
 * la prop tiene identidad nueva por render y la memo no cierra nunca. El argumento entero
 * —incluido por que el que habia antes era circular— esta ahi, que es donde estaba escrita
 * la decision contraria.
 */
export default memo(function OrientationPanel({ orientacion }: { orientacion: PropsDeOrientacion }) {
  const { selected, orientaciones, onSelect } = orientacion;
  // La MISMA derivacion que la linea visible del panel, en el otro formato. Los
  // dos textos no se pueden unificar —bajar este al visible le saca el sustantivo
  // "rotación" y le mete un separador que el lector de pantalla deletrea— pero el CALCULO
  // si, que era lo que estaba escrito dos veces y desde el 022 ni siquiera en el mismo
  // archivo.
  //
  // Se compone DOCE veces y no una: cada boton dice SU orientacion,
  // no la de la pieza en la mano. Con una orientacion global las doce miniaturas se
  // dibujaban con el mismo par —medido, 11 de 12 se movian en cada cuarto de vuelta— y
  // el `aria-label` repetia esa mentira al oido.
  const hablada = (o: Orientacion) => {
    const { grados, reflejada } = textoDeOrientacion(o.rotation, o.mirror);
    return `rotación ${grados}${reflejada === null ? '' : `, ${reflejada}`}`;
  };
  return (
    /* El ancho lo gobierna la caja de la miniatura, que mide 5 × `MINI_CELL_PX` = 40 px
       y **no depende ni de la pieza ni de la orientacion**: el peor caso es el mismo
       para las doce.

       La METRICA a mirar es el **padding efectivo**, `(pista - 42) / 2` con los 40 de la
       caja mas 2 de borde, y no el scroll: el `1fr` no produce scroll —el contenido se
       sale del PADDING del boton, que tiene `overflow: visible`— asi que un desborde no
       se ve como desborde sino como aire que desaparece. Es la metrica que atrapo el bug
       del esquema anterior.

       **La tabla de columnas la resuelve el navegador y no un breakpoint**, y ese es el
       cambio. Hasta ahi eran cuatro escalones
       —`grid-cols-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6`— atados al ancho del
       VIEWPORT, que era una buena aproximacion del ancho de esta caja mientras la caja era
       una tarjeta de `md:col-span-4`. Con el dock dejaron de ser la misma variable:
       el dock mide `calc(var(--cell) * 2)` y el viewport puede estar en `xl` igual.
       Medido: a 1366 x 768 el breakpoint pedia SEIS columnas adentro de una caja de 256 px,
       y con la celda al piso pedia tres adentro de 146. La celda ronda
       siempre los 73 px, asi que la caja ronda siempre los 146 y el desacople es total —el
       ancho del dock no depende del viewport y el del breakpoint si—.
       A 146 entra una sola columna de miniaturas, y eso sigue sin resolverse.

       `repeat(auto-fill, minmax(MINI_PISTA_PX, 1fr))` hace la cuenta contra la caja real.
       `MINI_PISTA_PX` sale de la caja del mini mas el `px-2` del boton mas su borde, o sea
       de los mismos numeros que dibujan la miniatura y no de uno tipeado al lado. Y el
       `1fr` reparte lo que sobra, que es lo que deja el padding efectivo simetrico sin
       tener que calcularlo.

       La METRICA a mirar sigue siendo el padding efectivo y no el scroll, por lo que dice
       el parrafo de arriba. Lo que cambio es quien la garantiza: antes una tabla medida a
       mano contra cuatro anchos, ahora el `minmax`. */
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${MINI_PISTA_PX}px, 1fr))` }}
    >
      {/* El fondo del boton NO toma el color de pieza: ese fondo es el canal de
          "seleccionada" y pintarlo dejaria a la paleta sin decir cual esta activa. La
          identidad entra por la FORMA, pintada del color de la pieza.

          Las celdas de la miniatura llevan borde: varios de los 12 colores (el amarillo
          de `V`, el lima de `F`) casi no se ven contra el gris claro del boton sin
          apoyarse, y ademas es el idioma del tablero, donde todas las
          baldosas tienen borde por el mismo motivo. El color del borde se INVIERTE con el
          estado, y los numeros estan abajo, en la celda. Antes de la miniatura esto era un
          punto de color, que no decia la forma.

          La letra se queda abajo y en chico. No es decoracion: es el vocabulario con
          el que se habla de las piezas en `describe_piece`, en el `title` del tablero
          y en `DESIGN.md`, y ademas es el unico nombre accesible que el boton tenia
          —una forma dibujada con `div`s no tiene ninguno—. El `aria-label` dice
          tambien la orientacion, para que el lector de pantalla diga lo que el ojo
          ve: la miniatura muestra la orientacion ACTUAL, no la canonica. */}
      {(Object.keys(SHAPES) as PieceKey[]).map(key=> {
        // La orientacion de ESTA pieza, no la de la que esta en la mano. El
        // `Record` tiene las doce ranuras garantizadas por su tipo, derivado de `SHAPES`,
        // asi que este acceso no puede dar `undefined`.
        const suya = orientaciones[key];
        const celdas = miniCells(key, suya.rotation, suya.mirror);
        const ocupada = new Set(celdas.map(([x, y]) => `${x},${y}`));
        // Una sola copia de "es la que esta en la mano": la leen el fondo del boton,
        // el borde de la miniatura y el `aria-pressed`, y tienen que invertirse en el
        // mismo momento.
        const activo = selected === key;
        // `type="button"` y no el default, aca y en los otros cuatro sitios de JSX que
        // renderizan los 17 botones de la app: hoy no hay un `<form>`,
        // asi que no hay bug. Pero el default de un `<button>` DENTRO de un formulario es
        // `submit`, y en esta app eso significa recargar la pagina perdiendo el tablero
        // entero, y no hay deshacer. Va sin excepcion y sin discutir
        // caso por caso: un boton de esta app nunca envia nada.
        return (
          <button
            key={key}
            type="button"
            onClick={()=> onSelect(key)}
            aria-label={`${key}, ${hablada(suya)}`}
            aria-pressed={activo}
            className={`px-2 py-1 rounded-lg border text-sm flex flex-col items-center justify-center gap-1 ${activo? 'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
          >
            {/* CINCO pistas fijas y no `min-content` ni `auto`: es lo que hace que el
                tamano de la caja no dependa de que celdas esten ocupadas, y por lo
                tanto que rotar no mueva un pixel de la grilla de botones. Con pistas
                automaticas la `I` sola haria saltar la fila entera entre 5 y 1
                celdas de ancho, que es el reflow que la caja fija existe para evitar.
                Va por estilo inline y no por clase porque el numero sale de una
                constante, y Tailwind escanea el fuente: `grid-cols-[repeat(5,8px)]`
                interpolado no se generaria. */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${MINI_BOX}, ${MINI_CELL_PX}px)`,
                gridTemplateRows: `repeat(${MINI_BOX}, ${MINI_CELL_PX}px)`,
              }}
            >
              {Array.from({ length: MINI_BOX * MINI_BOX }, (_, i) => {
                const x = i % MINI_BOX; const y = Math.floor(i / MINI_BOX);
                const llena = ocupada.has(`${x},${y}`);
                // Inline y no `bg-[...]`: una clase interpolada desde `PIECE_COLOR`
                // no la generaria Tailwind. La celda vacia queda transparente para
                // que se vea el fondo del boton, que es quien dice "seleccionada".
                //
                // El BORDE se INVIERTE con el estado del boton, y no es cosmetica:
                // en cada estado falla un conjunto distinto de piezas, y los dos
                // conjuntos son DISJUNTOS. Razon WCAG 2.1 medida contra los dos
                // fondos — aca aplica 1.4.11, objeto grafico con piso 3:1, y no el
                // APCA con el que `palette.ts` elige el color de TEXTO:
                //
                //   contra `slate-100` (sin seleccionar): 7 de 12 bajo el piso, peor
                //     `V` con 1,02 — el amarillo sobre el gris claro no se ve
                //   contra `slate-900` (seleccionado): 1 de 12, `W` con 2,08 — el
                //     azul puro sobre el casi negro
                //
                // `slate-900` da 16,30 sobre el boton claro y rescata a las siete,
                // pero sobre el seleccionado da 1,00: es el MISMO color del fondo, o
                // sea que ahi el borde no existe y `W` se queda sola. Invertido a
                // `slate-400` da 6,96 sobre el oscuro. Un solo color no cubre los dos
                // estados: fijo en `slate-400` serian 2,34 sobre el claro, o sea las
                // siete apoyadas en un borde que tampoco llega al piso.
                return (
                  <div key={i}
                    className={llena ? (activo ? 'border border-slate-400' : 'border border-slate-900') : ''}
                    style={llena ? { background: PIECE_COLOR[key].bg } : undefined}
                  />
                );
              })}
            </div>
            <span className="text-xs leading-none">{key}</span>
          </button>
        );
      })}
    </div>
  );
});
