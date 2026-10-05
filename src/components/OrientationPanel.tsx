import { memo } from 'react';
import { SHAPES } from '../domain/constants/pieces.constants.ts';
import type { PieceKey } from '../domain/types/pieces.types.ts';
import { CASILLA_PX, MINI_BOX, MINI_CELL_PX, REJILLA_GAP_PX } from './constants/layout.constants.ts';
import { PIECE_COLOR } from './constants/palette.constants.ts';
import { COLUMNAS_DEL_DOCK } from './rejilla.ts';
import { miniCells } from './piece-mini.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import type { Orientacion } from './types/orientation.types.ts';
import type { PropsDeOrientacion } from './types/panel.types.ts';

/**
 * Las doce miniaturas como una **tabla periódica**: casillas cuadradas de lado fijo,
 * separadas y alineadas, cada una en la orientación que su pieza recuerda.
 *
 * Presentacional: sin estado, sin efectos. Recibe UN objeto —el de la orientación— y nada
 * más.
 *
 * Va envuelto en `memo`, y el motivo es un número. `hover` vive en `App.tsx`, así que cada
 * celda que el cursor cruza re-renderiza el árbol entero — y esto son 337 elementos de los
 * que ninguno depende del hover. Medido con `Profiler`, el commit por celda cruzada pasa de
 * 4,9 ms a 1,9 ms: el 61 % del trabajo era este subárbol reconciliándose para llegar al
 * mismo DOM. La otra mitad de la barrera es el `useMemo` del objeto `orientacion` en
 * `App.tsx`, y por eso **ni la posición del panel ni la cantidad de columnas entran ahí**:
 * un valor que cambia con cada píxel de arrastre la rompería entera.
 *
 * ## No es el teselado, y conviene dejarlo escrito
 *
 * «Empacar las doce en un rectángulo» tiene una segunda lectura: el teselado clásico, 12 × 5
 * = 60 celdas en 6 × 10. Es hermoso y **no es esto**. Encastradas, las piezas dejan de ser
 * doce botones con su caja propia: la forma de cada una sólo se lee por su color, no hay
 * dónde poner el símbolo, y rotar una —que es lo que estas miniaturas muestran, cada una en
 * SU orientación recordada— rompería el teselado en cada gesto. La tabla periódica es lo
 * contrario del teselado: casillas iguales, separadas y alineadas.
 */

export default memo(function OrientationPanel({ orientacion }: { orientacion: PropsDeOrientacion }) {
  const { selected, orientaciones, onSelect } = orientacion;
  // La MISMA derivacion que hace `PiecePalette` para la pieza en la mano, en el otro
  // formato. Los dos textos no se pueden unificar —bajar este al visible le saca el
  // sustantivo "rotación" y le mete un separador que el lector de pantalla deletrea— pero el
  // CALCULO si, que era lo que estaba escrito dos veces.
  //
  // Se compone DOCE veces y no una: cada boton dice SU orientacion, no la de la pieza en la
  // mano. Con una orientacion global las doce miniaturas se dibujaban con el mismo par
  // —medido, 11 de 12 se movian en cada cuarto de vuelta— y el `aria-label` repetia esa
  // mentira al oido.
  const hablada = (o: Orientacion) => {
    const { grados, reflejada } = textoDeOrientacion(o.rotation, o.mirror);
    return `rotación ${grados}${reflejada === null ? '' : `, ${reflejada}`}`;
  };
  return (
    /* Columnas FIJAS de `CASILLA_PX` y no `1fr`, y las dos mitades importan.
       Las columnas, porque son las que garantizan que la última fila esté llena:
       `COLUMNAS_DEL_DOCK` divide a doce por construcción, y el porqué de cada regla está en
       `rejilla.ts`. El ancho fijo, porque un `1fr` volvería a hacer que la
       casilla cambie de forma con el ancho del contenedor, que es de donde salía el botón de
       107,8 × 65,6 px que esto reemplaza — ancho decidido por el reparto y alto por el
       contenido, o sea una casilla distinta en cada viewport.

       Con la casilla cuadrada la rejilla mide lo que `anchoDeRejilla` cuenta y el panel se
       mide por ella, no al revés. Va por estilo inline y no por clase porque los
       números salen de constantes, y Tailwind escanea el fuente: una clase interpolada no se
       generaría. */
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${COLUMNAS_DEL_DOCK}, ${CASILLA_PX}px)`,
        gap: `${REJILLA_GAP_PX}px`,
      }}
    >
      {/* El fondo del boton NO toma el color de pieza: ese fondo es el canal de
          "seleccionada" y pintarlo dejaria a la paleta sin decir cual esta activa. La
          identidad entra por la FORMA, pintada del color de la pieza.

          Las celdas de la miniatura llevan borde: varios de los 12 colores (el amarillo
          de `V`, el lima de `F`) casi no se ven contra el gris claro del boton sin
          apoyarse, y ademas es el idioma del tablero, donde todas las baldosas tienen borde
          por el mismo motivo. El color del borde se INVIERTE con el estado, y los numeros
          estan abajo, en la celda.

          La letra se queda y pasa a ser el SIMBOLO de la casilla. No es decoracion ni un
          texto que acompana: es el vocabulario con el que se habla de las piezas en
          `describe_piece`, en el `title` del tablero y en `DESIGN.md`, y en una tabla
          periodica el simbolo ES el contenido. Lo que el spec 052 saca del dock es la PROSA
          —227 px de leyenda, `Rotación`, `Notas actuales`— y una `F` de 6 px no es prosa.
          El `aria-label` dice tambien la orientacion, para que el lector de pantalla diga lo
          que el ojo ve: la miniatura muestra la orientacion ACTUAL, no la canonica. */}
      {(Object.keys(SHAPES) as PieceKey[]).map(key=> {
        // La orientacion de ESTA pieza, no la de la que esta en la mano. El
        // `Record` tiene las doce ranuras garantizadas por su tipo, derivado de `SHAPES`,
        // asi que este acceso no puede dar `undefined`.
        const suya = orientaciones[key];
        const celdas = miniCells(key, suya.rotation, suya.mirror);
        const ocupada = new Set(celdas.map(([x, y]) => `${x},${y}`));
        // Una sola copia de "es la que esta en la mano": la leen el fondo del boton,
        // el borde de la miniatura, el fondo del simbolo y el `aria-pressed`, y tienen que
        // invertirse en el mismo momento.
        const activo = selected === key;
        // `type="button"` y no el default, aca y en los otros sitios de JSX que renderizan
        // los botones de la app: hoy no hay un `<form>`, asi que no hay bug. Pero el default
        // de un `<button>` DENTRO de un formulario es `submit`, y en esta app eso significa
        // recargar la pagina perdiendo el tablero entero, y no hay deshacer.
        return (
          <button
            key={key}
            type="button"
            onClick={()=> onSelect(key)}
            aria-label={`${key}, ${hablada(suya)}`}
            aria-pressed={activo}
            // CUADRADA y de lado fijo: es lo que hace que las doce se lean como un conjunto
            // y no como una lista. `relative` porque el simbolo se posiciona contra ella.
            style={{ width: `${CASILLA_PX}px`, height: `${CASILLA_PX}px` }}
            className={`relative rounded-lg border flex items-center justify-center ${activo? 'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
          >
            {/* CINCO pistas fijas y no `min-content` ni `auto`: es lo que hace que el
                tamano de la caja no dependa de que celdas esten ocupadas, y por lo
                tanto que rotar no mueva un pixel de la grilla de botones. Con pistas
                automaticas la `I` sola haria saltar la fila entera entre 5 y 1
                celdas de ancho, que es el reflow que la caja fija existe para evitar.

                5 × 8 = 40 px adentro de una casilla de 48, o sea 4 px de aire por lado: es
                la cuenta que `CASILLA_PX` documenta, y por eso la casilla se achica sola si
                alguna vez se achica la caja. */}
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
                // APCA con el que `palette.constants.ts` elige el color de TEXTO:
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
                //
                // Este bloque NO se toca en el spec 052: es la razon WCAG medida contra
                // los dos fondos y no tiene nada que ver con la forma de la casilla.
                return (
                  <div key={i}
                    className={llena ? (activo ? 'border border-slate-400' : 'border border-slate-900') : ''}
                    style={llena ? { background: PIECE_COLOR[key].bg } : undefined}
                  />
                );
              })}
            </div>
            {/* El simbolo en la esquina, como el numero atomico de una tabla periodica, y
                NO debajo de la miniatura: la casilla mide 48 y la caja de la forma 40, asi
                que apilarlos pediria 50 y la caja de 40 es el minimo que deja leer la forma
                —lo dice `MINI_CELL_PX`—. Lo que cede es la posicion del simbolo, no el
                tamano de la forma.

                Lleva el fondo del boton y no `transparent`: el vertice inferior derecho de
                la caja de 5 × 5 esta ocupado en varias de las 96 orientaciones, y una letra
                sobre el color de la pieza no tiene contraste garantizado contra ninguno de
                los doce. Con el fondo del boton debajo, el par letra/fondo es siempre el
                mismo que el resto de la casilla ya usa.

                `aria-hidden` porque el nombre accesible lo da el boton, y ahi la letra ya
                esta dicha junto con la orientacion: sin esto el lector la anunciaria dos
                veces. */}
            <span
              aria-hidden="true"
              className={`absolute bottom-0 right-0 rounded-tl px-0.5 text-[9px] leading-[1.2] font-medium ${activo? 'bg-slate-900':'bg-slate-100'}`}
            >{key}</span>
          </button>
        );
      })}
    </div>
  );
});
