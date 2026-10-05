import { useRef } from 'react';
import type { PointerEvent as EventoDePuntero } from 'react';
import { pasoDeRueda, pasoDeTempoDeTecla, tempoAcotado, tempoDeArrastre } from './tempo.ts';
import type { PropsDeTransporte } from './types/panel.types.ts';

/**
 * El transporte del instrumento: tempo, play/pausa, el recorrido en el vacio y el reset.
 *
 * Presentacional: sin estado y sin efectos. El unico `useRef` es el ancla del arrastre del
 * reloj —ver abajo—, que no es ninguna de las dos cosas: no se dibuja y no se suscribe a
 * nada.
 *
 * ## El slider se fue, y con el la fila de tres cosas
 *
 * `Tempo` era una etiqueta, un `input[type=range]` de 107,8 px y un lector `110 bpm`: **dos
 * controles y una palabra para un numero de tres digitos**, en un panel donde el contenido
 * desbordaba 1192 px. La fila entera se apilaba con `flex-wrap` porque no entraba de otra
 * forma, y pesaba ~80 px de los 1407.
 *
 * Queda el numero solo, con `tabular-nums`, y los gestos de un reloj digital: rueda encima,
 * flechas con el foco puesto y arrastre vertical. La conversion de cada gesto a bpm vive en
 * `tempo.ts` y ya sale acotada a `[TEMPO_MIN, TEMPO_MAX]`.
 */
export default function TransportPanel({ transporte }: { transporte: PropsDeTransporte }) {
  const { tempo, playing, clicks, onTempo, onTogglePlay, onToggleClicks, onReset } = transporte;

  /**
   * El ancla del arrastre: donde estaba el puntero y cuanto valia el tempo al empezar.
   *
   * Va en un `ref` y no en un `useState` porque no lo dibuja nadie —lo unico que se dibuja
   * es el `tempo`, que vive en el shell— y un `useState` aca seria un re-render extra por
   * cada `pointerdown`. Es la misma decision que `tapLimpio` en el shell.
   *
   * Se guarda el tempo del COMIENZO y no el actual porque el gesto se ancla ahi: el porque
   * —que acumular paso a paso deja el numero clavado en el extremo cuando el arrastre sale
   * del rango y vuelve— esta en `tempoDeArrastre`.
   */
  const arrastre = useRef<{ y: number; tempo: number } | null>(null);

  const alBajarEnElReloj = (e: EventoDePuntero<HTMLButtonElement>) => {
    arrastre.current = { y: e.clientY, tempo };
    // Con la captura, los `pointermove` y el `pointerup` siguen llegando a ESTE boton aunque
    // el puntero se vaya del nodo, asi que los handlers de abajo alcanzan y no hace falta
    // ningun listener sobre `window` — o sea ningun efecto, que es lo que deja a este
    // componente sin uno.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const alMoverEnElReloj = (e: EventoDePuntero<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (a === null) return;
    onTempo(tempoDeArrastre(a.tempo, e.clientY - a.y));
  };

  // `pointerup` y `pointercancel` comparten handler: sin el segundo, un gesto que el
  // navegador cancela dejaria el ancla puesta y el reloj seguiria al puntero.
  const alTerminarEnElReloj = () => { arrastre.current = null; };

  return (
    <div className="mt-4 border-t pt-3 space-y-2">
      {/* EL RELOJ.
          `<button>` y **nunca** `<div role="spinbutton">`, y no es una preferencia de
          estilo: `esControl` en `use-input.ts:80` es
          `t instanceof HTMLButtonElement || t instanceof HTMLInputElement`, y es lo que veta
          el listener de teclado global. `accionDeTecla` abre con
          `if (e.targetEsControl) return null`, asi que con el foco sobre un boton el atajo
          global esta vetado entero. Un `div` con rol —que es la forma "correcta" de ARIA
          para un control numerico, y por lo tanto la tentacion natural— NO lo veta, y como
          `accionDeTecla` termina en `piezaDeTecla(e.key)`, tipear un tempo dejaria que cada
          letra eligiera una pieza. AC8 es el test que lo fija.

          No lleva `onClick`, y es deliberado: sus gestos son la rueda, las flechas y el
          arrastre. Un click sobre un valor continuo no significa nada, y darle uno haria que
          cada arrastre terminara moviendo el tempo una vez mas — el mismo `click` sintetico
          que obliga a que el asa del chasis sea un boton aparte del que pliega.

          `aria-label` y no `aria-labelledby`: el `<span id="tempo-etiqueta">Tempo</span>` al
          que apuntaba se fue con la palabra, asi que la etiqueta pasa al atributo, que es lo
          que `.claude/rules/ui.md` manda cuando no hay texto visible que referenciar. El
          nombre dice la unidad porque "110" a secas no dice si son bpm o intervalos, y el
          instrumento maneja las dos. `title` con el MISMO texto: el puntero y el lector no
          pueden contar dos historias distintas del mismo boton.

          `touch-none` para que el arrastre vertical funcione con el dedo: sin
          `touch-action: none` el navegador se queda el gesto para scrollear. */}
      <button
        type="button"
        onWheel={e => onTempo(tempoAcotado(tempo + pasoDeRueda(e.deltaY)))}
        onKeyDown={e => {
          const paso = pasoDeTempoDeTecla(e.key);
          if (paso === null) return;
          // Solo cuando la tecla es nuestra: si no, el navegador tiene que quedarse el
          // evento entero. Es la misma regla que `frenaElDefault` en `use-input.ts`.
          e.preventDefault();
          onTempo(tempoAcotado(tempo + paso));
        }}
        onPointerDown={alBajarEnElReloj}
        onPointerMove={alMoverEnElReloj}
        onPointerUp={alTerminarEnElReloj}
        onPointerCancel={alTerminarEnElReloj}
        aria-label={`Tempo: ${tempo} bpm`}
        title={`Tempo: ${tempo} bpm`}
        className="w-full rounded bg-slate-100 hover:bg-slate-200 py-0.5 text-center text-2xl leading-none tabular-nums cursor-ns-resize touch-none"
      >{tempo}</button>
      {/* Los TRES botones del transporte, los tres solo-icono. Esta fila
          es todo el vocabulario del instrumento en marcha: que suene, que se oiga el
          recorrido, y volver a empezar.

          El de play: **el icono ES el estado** —lo que se ve es lo que pasa al apretar— y el
          color lo repite para que se lea de un vistazo. Solo el icono, sin la palabra: ▶ y ⏸
          son el vocabulario universal del transporte y no necesitan glosa. Y medido, la
          etiqueta no entra: con "▶ Reproducir" el boton pide 119 px de min-content contra
          los 148 del interior de la tarjeta a 768 —el ancho mas apretado de aquella
          tarjeta— asi que la fila desbordaba y el texto envolvia a dos
          lineas. Con el icono solo mide 37,8 px.

          `aria-label` en los tres porque al sacar el texto se quedan sin nombre accesible:
          el glifo no lo es, y el SVG menos. `title` para que el puntero tambien lo diga, y
          con el MISMO texto: el puntero y el lector no pueden contar dos historias
          distintas del mismo boton. Son el precedente de lo que el spec 052 le pide al
          resto del dock, y por eso no cambian.

          Corriendo, play usa el `bg-slate-900 text-white` con el que la tarjeta marca lo
          activo — es el mismo idioma que usa el metronomo encendido. En pausa NO cae a
          `bg-slate-100`, que es el "apagado" de ese idioma, porque en la misma fila estan el
          metronomo apagado (`bg-slate-100`) y `↺` (`bg-slate-200`): el boton principal del
          instrumento quedaria indistinguible de los dos secundarios. El verde es lo que un
          transporte pide leer como "apreta esto para que suene". */}
      {/* `flex-wrap` como red y no porque hoy envuelva: los tres botones —tres desde que el
          019 le mudo el metronomo— piden 124,5 px en una linea y la rejilla le da al dock 204
          de interior, medido. Si la rejilla se angosta, envolver es lo unico que no desborda. */}
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
