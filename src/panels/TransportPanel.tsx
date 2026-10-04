import { TEMPO_MIN, TEMPO_MAX } from '../board-fit/layout.constants.ts';
import type { PropsDeTransporte } from './panel.types.ts';

/**
 * El transporte del instrumento: tempo, play/pausa, el recorrido en el vacio y el reset.
 *
 * Presentacional: sin estado, sin efectos. Recibe UN objeto —el del transporte— y nada
 * mas.
 *
 * Es el bloque `border-t` que tenia `PiecePalette`, devuelto como el mismo `div` y sin
 * envolverlo en nada: agregarle un nodo cambiaria el ritmo vertical del `space-y-2` que lo
 * contiene con las clases intactas.
 *
 * Llego a ser el unico subarbol CONTIGUO de los dos paneles, porque el boton de
 * los clicks caia entre dos bloques de orientacion. Hoy la fila de abajo
 * son los TRES botones del transporte, y con eso la interpolacion que aquel docblock
 * describia dejo de existir.
 */
export default function TransportPanel({ transporte }: { transporte: PropsDeTransporte }) {
  const { tempo, playing, clicks, onTempo, onTogglePlay, onToggleClicks, onReset } = transporte;
  return (
    <div className="mt-4 border-t pt-3 space-y-2">
      {/* La fila de Tempo se APILA, y no es estetica: el dock mide 146 px al piso, contra
          los ~349 de la tarjeta que reemplaza (spec 021, issue #83). Tres
          cosas en una fila —la etiqueta, el slider y un lector de ancho fijo— no entran, y
          el desborde seria HORIZONTAL: ni el `overflow-y` del dock lo corta ni un
          `overflow-x` lo arregla, porque ese scroll es justamente lo que no puede haber.
          Apilado, el slider toma el ancho que haya y el lector se acomoda debajo. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span id="tempo-etiqueta" className="font-medium">Tempo</span>
        {/* `aria-labelledby` y no `aria-label`: el nombre toma el mismo texto que ya se
            ve en el span de arriba, en vez de escribirlo dos veces. Si alguien cambia la
            etiqueta visible, la anunciada lo sigue sola.

            Y `aria-valuetext` es el argumento del comentario de abajo —"110" a secas no
            dice si son bpm o intervalos, y el instrumento maneja las
            dos unidades— aplicado al oido, donde no hay span al lado que lo salve: un
            `range` se anuncia con su valor numerico crudo salvo que lo tenga. */}
        <input
          type="range"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          value={tempo}
          onChange={e=>onTempo(Number(e.target.value))}
          aria-labelledby="tempo-etiqueta"
          aria-valuetext={`${tempo} bpm`}
          className="w-full min-w-0 order-last"
        />
        {/* Con la unidad: "110" a secas no dice si son bpm o intervalos, y el
            instrumento maneja las dos unidades. El `w-16` que tenia se fue con
            el dock: era el ancho fijo que le reservaba lugar al numero en una fila de tres,
            y en un dock de 146 px es justamente lo que la hacia desbordar. `tabular-nums`
            sigue: es lo que mantiene el numero quieto al arrastrar, que es para lo que
            estaba el ancho fijo — el ancho solo lo reservaba de mas. */}
        <span className="tabular-nums text-right whitespace-nowrap">{tempo} <span className="text-slate-500">bpm</span></span>
      </div>
      {/* Los TRES botones del transporte, los tres solo-icono. Esta fila
          es todo el vocabulario del instrumento en marcha: que suene, que se oiga el
          recorrido, y volver a empezar.

          El de play: **el icono ES el estado** —lo que se ve es lo que pasa al apretar— y el
          color lo repite para que se lea de un vistazo. Solo el icono, sin la palabra: ▶ y ⏸
          son el vocabulario universal del transporte y no necesitan glosa. Y medido, la
          etiqueta no entra: con "▶ Reproducir" el boton pide 119 px de min-content contra
          los 148 del interior de la tarjeta a 768 —el ancho mas apretado, el mismo que
          gobierna la grilla de piezas— asi que la fila desbordaba y el texto envolvia a dos
          lineas. Con el icono solo mide 37,8 px.

          `aria-label` en los tres porque al sacar el texto se quedan sin nombre accesible:
          el glifo no lo es, y el SVG menos. `title` para que el puntero tambien lo diga, y
          con el MISMO texto: el puntero y el lector no pueden contar dos historias
          distintas del mismo boton.

          Corriendo, play usa el `bg-slate-900 text-white` con el que la tarjeta marca lo
          activo — es el mismo idioma que usa el metronomo encendido y el que usaban las
          filas que el 019 borro. En pausa NO cae a `bg-slate-100`, que es el "apagado" de
          ese idioma, porque en la misma fila estan el metronomo apagado (`bg-slate-100`) y
          `↺` (`bg-slate-200`): el boton principal del instrumento quedaria indistinguible
          de los dos secundarios. El verde es lo que un transporte pide leer como "apreta
          esto para que suene". */}
      {/* `flex-wrap` por lo mismo que la fila de arriba: son tres controles desde que el
          019 le mudo el metronomo, y al piso del 021 el dock mide 146 px. Envolver es lo
          unico que no desborda horizontalmente. */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing? 'Pausa':'Reproducir'}
          title={playing? 'Pausa':'Reproducir'}
          className={`px-3 py-1 rounded text-white ${playing? 'bg-slate-900 hover:bg-slate-800':'bg-emerald-600 hover:bg-emerald-700'}`}
        >{playing? '⏸':'▶'}</button>
        {/* El click MUDO del recorrido, mudado aca por el 019: es un interruptor de MEZCLA
            —el recorrido sigue siendo el mismo con los clicks apagados, solo que no se oye—
            y su lugar es al lado del transporte, que es lo que decide que se escucha
            mientras el instrumento corre.

            **Apaga solo una de las dos clases de cruce.** El cruce sobre una celda ocupada
            suena su nota y no se apaga, porque es modelo y no mezcla (D6): apagarlo seria
            silenciar parte de lo que el tablero dice. Por eso la etiqueta dice QUE SE OYE
            cuando esta encendido —el recorrido, y la parte de el que pasa por celdas
            vacias— y no nombra al click: desde el 015 no es un click sino una campana de
            altura fija.

            **Y no se puede borrar**: con el default apagado este boton es la unica forma de
            ENCENDER el recorrido, asi que borrarlo lo dejaria inalcanzable. La propuesta de
            borrarlo existio y quedo cerrada con un "no".

            Al perder el texto perdio el lugar donde escribir ON/OFF, asi que el estado lo
            dice el COLOR — y el `aria-pressed`, que viaja con el boton y es lo
            que impide que el color quede como canal unico. Es el caso que
            `.claude/rules/ui.md` nombra. El `aria-labelledby` no pudo
            venir: el `<span id="recorrido-etiqueta">` murio con la fila, asi que la
            etiqueta pasa a `aria-label`, que es lo que la misma regla manda cuando no hay
            texto visible que referenciar. */}
        {/* SVG INLINE y no un glifo, porque Unicode no tiene metronomo. Los candidatos
            reales son ⏱ (cronometro: mide cuanto tardo algo, no marca el pulso), 🎵 y 🎼
            (dicen "musica", que es lo que dice el ▶ de al lado) y 🎹 (un instrumento). Un
            icono que no distingue este boton del vecino no es un icono, es decoracion.

            Sin archivo propio y sin carpeta de iconos: es el primer y unico SVG del repo, y
            un `icons/` de un solo elemento es una carpeta que promete un sistema que no
            existe. Si algun dia hay un segundo, ahi se extrae.

            `1em` y `currentColor` para que quede al mismo tamano optico que los tres glifos
            vecinos y herede el `text-white` del estado encendido sin una segunda regla.
            `aria-hidden` porque el nombre accesible lo da el boton: sin eso el lector
            anunciaria el grafico ademas de la etiqueta. */}
        <button
          type="button"
          onClick={onToggleClicks}
          aria-label="Recorrido en el vacío"
          title="Recorrido en el vacío"
          aria-pressed={clicks}
          className={`px-3 py-1 rounded flex items-center ${clicks?'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
        >
          <svg
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d="M6.4 1.6h3.2l3.4 12.8H3z" />
            <path d="M8 14.4 11.6 4.2" />
          </svg>
        </button>
        {/* `↺` y no `🗑`: el boton vacia el tablero Y frena el transporte, o sea que vuelve
            al estado inicial. Un tacho promete borrar algo elegido, que es una operacion con
            alcance y no la que hace. El `aria-label` dice las dos mitades porque las dos
            pasan, y el `title` dice lo mismo.

            `ml-auto` lo separa del par ▶/metronomo, y no es estetica: es el unico
            destructivo de los tres y no tiene deshacer. De paso resuelve lo otro que esta
            fila introduce — el metronomo apagado es
            `bg-slate-100` y este `bg-slate-200`, que es exactamente el par que se
            rechazo por indistinguible cuando quedaron pegados. Separados, la duda de cual es
            cual no se plantea. */}
        <button
          type="button"
          onClick={onReset}
          aria-label="Vaciar el tablero y frenar el transporte"
          title="Vaciar el tablero y frenar el transporte"
          className="ml-auto px-3 py-1 rounded bg-slate-200 hover:bg-slate-300"
        >↺</button>
      </div>
    </div>
  );
}
