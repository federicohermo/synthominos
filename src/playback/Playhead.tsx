import { useEffect, useRef } from 'react';
import { AIRE_RAZON, RADIO_RAZON } from '../board-fit/grid-fit.ts';
import { NOTA, iniciarCabeza, borde } from './playhead-loop.ts';

/** Lo que mide `n` celdas, en CSS. Ver `Board.tsx` y `playhead-loop.ts`. */
const celdas = (n: number) => `calc(var(--cell) * ${n})`;

/**
 * La capa que se dibuja ENCIMA de la grilla al ritmo del audio: la cabeza lectora y el
 * velo de las celdas que todavia no se estrenaron.
 *
 * Sin props y sin estado, igual que `Spectrum.tsx` y por el mismo motivo medido: el
 * intervalo dura entre 0,25 s (60 bpm) y 0,094 s (160 bpm), o sea entre 4 y 10,6
 * cambios por segundo. Llevar eso a `useState` re-renderizaria el tablero entero —60
 * celdas— mas la paleta y la lista. React monta los dos contenedores y arranca el loop;
 * el resto es imperativo.
 *
 * ## Quien es dueno de que nodo
 *
 * React es dueno de los DOS contenedores y de nada mas; el loop es dueno de todo lo que
 * cuelga de ellos, incluidos los nodos del velo, que crea y destruye a mano. Esa linea
 * es la leccion cara del review del 007: lo que NO se puede hacer es partir el estilo de
 * un mismo nodo entre React y el loop. Por eso el velo no atenua la celda de `Board`
 * —que la renderiza React— sino que la tapa con un nodo propio.
 *
 * Antes esto pasaba por estado (`pendingIds` en props de `Board`) y se justificaba como
 * la excepcion declarada a D1, porque cambiaba una vez por ciclo. Dejo de valer cuando
 * el estreno paso a ser CELDA POR CELDA: son cinco cambios al ritmo del intervalo, o
 * sea exactamente la frecuencia que D1 mide y prohibe. La excepcion no se agrando: se
 * elimino, y hoy no hay nada en el arbol de React.
 *
 * ## Va ARRIBA de las celdas, y eso necesita `z-10`
 *
 * Las baldosas de `Board.tsx` son `relative`, asi que son elementos POSICIONADOS y se
 * pintan en orden de documento entre ellos. Como la grilla viene despues de este
 * componente en el DOM, sin `z-index` la capa queda DEBAJO de todas las celdas — y como
 * hasta la celda vacia tiene fondo opaco (`bg-white`), queda directamente invisible.
 *
 * No se ve en el atributo `style`, y por eso durante veintidos specs este comentario
 * decia que ningun test lo atrapaba: el `z-10` es una clase de Tailwind, asi que hay
 * que leer el valor COMPUTADO y sin la hoja de estilos cargada da `auto`. Desde el
 * 029 si lo atrapa `__tests__/Playhead.browser.test.tsx:65`, sobre las dos capas y
 * junto con `pointer-events` y el orden en el DOM. La otra via —preguntarle a
 * `elementFromPoint` quien esta arriba, habilitando el hit-testing un instante porque
 * `pointer-events-none` hace que devuelva lo de abajo— sigue siendo la unica que mira
 * los pixeles de verdad, y no hizo falta.
 *
 * ## Se mueve UN elemento, no cambian sesenta (D2)
 *
 * La alternativa era recalcular la clase de TODAS las celdas en cada cuadro: tocarlas a
 * todas para cambiar una. Aca el costo por cuadro es una lectura aritmetica y, cuando
 * la celda cambio, una escritura de `transform`. Eran sesenta cuando se midio, y desde el
 * hoy son hasta 390 en un escritorio — o sea que el argumento se hizo mas fuerte, no
 * menos.
 *
 * El absoluto se posiciona contra el `relative` que envuelve la grilla (`Board.tsx`), asi
 * que queda alineado con las celdas por construccion. Ese contenedor no scrollea, asi que
 * del argumento queda la mitad que siempre importo: el posicionado. La otra mitad —la capa
 * scrolleando con la grilla debajo de `md`— se fue con el `overflow-x-auto`, spec 031
 * (issue #93).
 *
 * ## Que dibuja y que NO calcula (D5, AC4)
 *
 * Nada de aritmetica de caminos ni de distancias: la celda de cada offset ya viene
 * resuelta en la tabla que devuelve `rutaActiva()`. Este archivo traduce un numero a
 * una posicion en pixeles y nada mas.
 *
 * La cabeza SALTA y no se desliza (D6): el instrumento esta cuantizado a la grilla de
 * intervalos, y un movimiento continuo sugeriria una continuidad que no existe.
 */
export default function Playhead() {
  const capaRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Dos refs para la cabeza y no una: el `transform` va en la caja de una celda —que es la
  // que se mueve sobre la grilla— y el borde en la baldosa de adentro, un aire mas chica
  // por lado (`AIRE_RAZON`, 2 px al piso y 4,93 al techo),
  // que es la que tiene la forma y el redondeo de la celda. Dibujarlo en la caja externa
  // daria un rectangulo que pisa la separacion entre celdas.
  const resalteRef = useRef<HTMLDivElement>(null);

  // Dependencias vacias a proposito: el loop se monta una vez y lee del motor y del
  // par de rutas por su cuenta, asi que no hay nada que re-suscribir cuando la app
  // re-renderiza. Es la misma forma que `Spectrum.tsx`.
  //
  // El cuerpo vive en `playhead-loop.ts` y no aca: mientras estuvo adentro de este
  // `.tsx` no se podia exportar —`react-refresh/only-export-components`— y por lo tanto
  // no se podia testear. Lo que queda es el montaje, que es lo unico propio del
  // componente.
  useEffect(() => iniciarCabeza(capaRef.current, ref.current, resalteRef.current), []);


  // El velo va ANTES que la cabeza en el DOM y con el mismo `z-10`: asi la cabeza se
  // pinta encima, y una celda que todavia no se estreno igual se resalta cuando le toca
  // — que es el mismo cuadro en que deja de estar tapada.
  //
  // `display: none` de arranque en la cabeza: sin reloj no hay nada que marcar, y
  // montarla visible en (0,0) senalaria una celda que no suena hasta el primer cuadro.
  // `pointer-events-none` en las dos porque van ENCIMA de las celdas y no pueden robarles
  // el click de colocar.
  return (
    <>
      <div ref={capaRef} aria-hidden="true" className="absolute top-0 left-0 z-10 pointer-events-none" />
      <div
        ref={ref}
        aria-hidden="true"
        className="absolute top-0 left-0 z-10 pointer-events-none"
        style={{ width: celdas(1), height: celdas(1), padding: celdas(AIRE_RAZON), display: 'none' }}
      >
        {/* Misma caja que la baldosa de `Board.tsx` —el aire y el radio, los dos como razon
            de `--cell`— para que el borde cubra la celda exacta y no medio
            pixel afuera. Eran un `p-0.5` y un `rounded-lg` literales: con la baldosa vuelta
            proporcional y estos dos clavados, a celda 180 el anillo de la cabeza cubriria
            2 px de aire sobre una baldosa que tiene 4,93. */}
        <div ref={resalteRef} className="w-full h-full" style={{ borderRadius: celdas(RADIO_RAZON), boxShadow: borde(NOTA) }} />
      </div>
    </>
  );
}
