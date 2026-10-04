import { midiName } from '../../musical-model/domain/music.ts';
import { CHROMATIC, BASE_MAP } from '../../musical-model/domain/music.constants.ts';
import { REGIMEN } from '../../musical-model/domain/music.constants.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import OrientationPanel from './OrientationPanel.tsx';
import TransportPanel from './TransportPanel.tsx';
import type { PropsDeOrientacion, PropsDeTransporte } from './panel.types.ts';

/**
 * El DOCK de piezas: el panel que flota sobre el tablero, pegado al borde derecho.
 *
 * Presentacional: sin estado, sin efectos. Recibe TRES objetos en vez de dieciseis props
 * planas —`orientacion`, `transporte` y el del plegado—, y cada panel recibe solo el
 * suyo; el criterio de reparto esta en `types/panel.types.ts`. El del plegado es estado
 * del shell como todo lo demas.
 *
 * ## De tarjeta en una columna a dock flotante
 *
 * Hasta el 021 esto era una tarjeta `md:col-span-4` en una fila de dos, y de ahi salia
 * todo: el ancho, el alto de la fila y —por esa via— el tamano de la celda del tablero.
 * Ese razonamiento entero se fue con el `max-w-6xl`. Hoy la caja se mide **en celdas**,
 * `2 x 4`, y flota encima: no le quita un pixel a la grilla.
 *
 * **Se mide en celdas y no en px, y eso es AC9.** Con medidas fijas la cuenta de «que
 * celdas tapa» vale para un solo viewport: un dock de 640 px de alto centrado entra en la
 * fila 5 a 1366 x 768 y tapa `(9,5)`, que es donde arranca la cabeza lectora. Medido en
 * celdas, tapa `(8,1)`…`(9,4)` en cualquier viewport, porque la caja y la grilla se miden
 * con la misma unidad.
 *
 * ## Por que el contenido necesita scroll propio
 *
 * Porque la caja dejo de crecer con el contenido. Al piso —`--cell = 73`— el dock mide
 * 146 x 292 px y lo que va adentro medía del orden de 349 x 428. El `overflow-y-auto` es
 * lo que hace que eso entre sin empujar la grilla; el ANCHO lo resuelven en su casa
 * `OrientationPanel` (la tabla de columnas contra el contenedor) y `TransportPanel` (las
 * dos filas que se apilan).
 *
 * ## Lo que se queda del layout viejo
 *
 * El `space-y-2` de las dos filas del medio: compila a
 * `& > :not([hidden]) ~ :not([hidden])`, un selector de HIJO DIRECTO, asi que cualquier
 * envoltorio nuevo convierte dos hijos en uno y se come un margen con las clases intactas
 * y sin que ningun test lo note. Y mover la grilla de miniaturas adentro de ese
 * `space-y-2` la empujaria 16 px hacia abajo por el `mt-4`.
 */

interface Props {
  orientacion: PropsDeOrientacion;
  transporte: PropsDeTransporte;
  /** El plegado, que vive en el shell: este componente lo lee y lo pide, no lo guarda. */
  abierto: boolean;
  onToggle: () => void;
}

export default function PiecePalette({ orientacion, transporte, abierto, onToggle }: Props) {
  const { selected, orientaciones, regimen, noteSet, onRegimen, onResetOrientacion } = orientacion;
  // La de la pieza en la mano, derivada del `Record` y no recibida como dos props sueltas:
  // dos fuentes de la misma verdad son dos formas de que la linea diga una orientacion y
  // la miniatura dibuje otra.
  const { rotation, mirror } = orientaciones[selected];
  const { grados, reflejada } = textoDeOrientacion(rotation, mirror);
  // La posicion sale de la MEDICION y no de la estetica, y leyendo `fixed right-0 top-1/2`
  // no se adivina: `2 x 4` celdas pegadas al borde derecho y centradas en vertical tapan
  // `(8,1)`…`(9,4)` y dejan libres `(0,0)` y `(9,5)`, que son las dos celdas que no se
  // pueden tapar — ahi es donde el circuito cierra y donde arranca la cabeza
  // lectora. Arriba se descarto por lo mismo: una barra superior tapa el borde
  // de arriba entero, `(0,0)` incluida.
  //
  // El fondo va semiopaco con `backdrop-blur` y no opaco: abajo hay celdas con nota, y un
  // panel opaco las esconde mientras uno translucido dice que estan ahi.
  return (
    <aside
      className="fixed right-0 top-1/2 -translate-y-1/2 z-20 flex flex-col rounded-l-2xl shadow-lg bg-white/85 backdrop-blur p-2 text-sm"
      style={{ width: `calc(var(--cell) * 2)`, maxHeight: `calc(var(--cell) * 4)` }}
    >
      {/* Un `<button>` y no un `<h2>` con `onClick`: es un control, y como control tiene
          que existir para el teclado tambien. `aria-expanded` dice si esta plegado y
          `aria-controls` a que region se refiere. Plegado deja el encabezado y NADA mas —el
          panel sigue diciendo que es, en vez de convertirse en un icono suelto. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls="dock-piezas"
        className="shrink-0 text-left text-base font-semibold mb-2"
      >Piezas</button>
      {/* `hidden` y no desmontar, y de eso dependen dos cosas medidas. Una: el
          `ResizeObserver` del espectro redibuja porque su contenedor CAMBIA DE TAMANO, y
          eso vale para el otro flotante por el mismo mecanismo. Dos: la barrera del `memo`
          de `OrientationPanel` — desmontar y remontar le cuesta exactamente las
          ejecuciones que el memo existe para ahorrar. Con el arbol vivo, las dos siguen
          valiendo. */}
      <div id="dock-piezas" hidden={!abierto} className="min-h-0 overflow-y-auto">
      <OrientationPanel orientacion={orientacion} />
      <div className="mt-4 space-y-2">
        {/* El régimen tiene fila propia, y no es cosmética. Llegó a ser
            la segunda línea de la fila de Rotación, y estaba escrito así a propósito:
            sin rotar el régimen no hace nada, así que en vez de abrir una
            fila completaba una —«Rotación … cambia escala / orden»— y el interruptor no
            necesitaba glosa. El 019 borra los cuatro botones de grados, o sea que la frase
            se queda SIN SUJETO: lo que era una segunda línea pasa a ser la fila, con la
            etiqueta que era de arriba.

            Y no se borra, aunque la tentación sea la misma que con los grados. El
            precedente es el `T070`: propuso borrar el botón de los clicks y el
            015 lo cerró con un «no» porque era la única forma de encender el recorrido. Acá
            está peor: la rotación y la reflexión sobreviven al borrado porque tienen dos
            gestos directos cada una, y el régimen no tiene ninguno. Borrarlo lo dejaría
            inalcanzable. Es una propiedad del instrumento, como el tempo.

            El `title` dice la frase entera porque la palabra que la unía —«cambia»— se fue
            con la fila de arriba, y sin ella `Rotación | escala orden` se puede leer como
            si la rotación tuviera dos valores.

            Dos botones y no un ON/OFF: los dos valores son simétricos y ninguno es la
            ausencia del otro. Un ON/OFF diría que hay un régimen y una desviación, que es
            justo la lectura que D4 rechaza — no son dificultades, son dos reglas. El
            idioma visual sí es el mismo que el resto de la tarjeta usa para lo activo:
            fondo oscuro. */}
        {/* El grupo es `role="group"` y NO `radiogroup`, aunque los dos botones sean un
            conjunto exclusivo. Un `radiogroup` obliga a un modelo de foco —una sola parada
            de tabulación para el grupo entero y flechas para moverse adentro— y ese modelo
            lo fija el modelo de foco del tablero, que es donde esa pregunta se
            contesta. Decidirlo acá de refilón sería decidirlo dos
            veces y probablemente distinto: el `aria-pressed` de cada botón ya anuncia el
            estado sin comprometer el foco. */}
        <div className="flex items-center justify-between gap-1">
          <span id="rotacion-etiqueta" className="font-medium">Rotación</span>
          <div
            role="group"
            aria-labelledby="rotacion-etiqueta"
            title="La rotación cambia la fórmula de escala o el arranque del arpegio"
            className="flex gap-1"
          >
            {([REGIMEN.escala, REGIMEN.orden] as const).map(r=> (
              <button key={r} type="button" onClick={()=> onRegimen(r)} aria-pressed={regimen===r}
                      className={`px-2 py-0.5 rounded text-xs ${regimen===r?'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}>{r}</button>
            ))}
          </div>
        </div>
        <div className="pt-2 text-sm text-slate-600">
          <p><b>{selected}</b> → tónica {CHROMATIC[BASE_MAP[selected]]}</p>
          {/* La orientación EN TEXTO, y es lo único que el 019 suma en vez de restar. Al
              borrar los cuatro botones de grados la orientación queda sólo DERIVABLE: de la
              miniatura, que es ciega en 6 de las 12 piezas —hay 29 de 96 combinaciones que
              suenan distinto sin verse distinto, y la `X` rotada cuatro veces da cuatro
              arpegios y cero cambio en la forma—, o de los cinco nombres de `Notas
              actuales`, que sí las distingue las ocho pero obliga a deducirla. Lo que
              faltaba era un lector DIRECTO, que es exactamente la derivación que un panel
              existe para ahorrar. El argumento entero está en `orientation-text.ts`.

              No devuelve un botón —no se puede apretar— así que no deshace el borrado: lo
              que se fue era el camino lento a rotar, y lo que queda es el lector.

              `min-h-[1lh]` por lo mismo que el `2lh` de la línea de abajo: el peor caso
              (`270° · reflejada`) tiene que tener su alto reservado, para que la línea no
              mueva todo lo que tiene debajo al cambiar de orientación. Uno y no dos porque
              entra en un renglón en todo el rango de anchos — medido en el DOM.

              Dice la de la PIEZA EN LA MANO y cambia al elegir otra, que
              es lo que hace visible la memoria: volver a la `F` que dejaste a 180° tiene
              que decir `180°`, o la memoria existe y no se ve. */}
          {/* El botón `0°` y no un icono: en la misma tarjeta hay un `↺` —en
              `TransportPanel.tsx`, un componente hermano, así que ni siquiera están en el
              mismo archivo para compararlos de un vistazo— y dos «volver atrás» tienen que
              decir cosas distintas. `0°` dice literalmente adónde lleva, recupera el
              vocabulario de los botones de grados que el 019 borró, y es tipográficamente
              incompatible con un glifo.

              Resetea la orientación ENTERA —rotación y reflexión—, no sólo los grados: una
              `X` reflejada suena distinto y no se ve (29 de las 96 orientaciones, spec
              019), así que un botón que la dejara «a 0° pero reflejada» dejaría vivo justo
              el estado invisible. Que la etiqueta diga sólo los grados no engaña, porque la
              línea de al lado dice las dos cosas y cambia junto con el botón — y el
              `aria-label`, que es el nombre para quien no la ve, las dice enteras.

              Y resetea UNA pieza y no las doce: lo que dejaba las doce mal de golpe era
              precisamente la rotación global que este spec borra. Con memoria por pieza, si
              la `T` está a 90° es porque rotaste la `T`. Un «resetear las doce» perdió su
              caso de uso en el mismo movimiento que lo haría posible. */}
          <p className="min-h-[1lh] flex items-center gap-2">
            <span>{grados}{reflejada !== null && ` · ${reflejada}`}</span>
            <button
              type="button"
              onClick={onResetOrientacion}
              aria-label="Volver esta pieza a 0° sin reflejar"
              title="Volver esta pieza a 0° sin reflejar"
              className="px-1.5 rounded text-xs bg-slate-100 hover:bg-slate-200"
            >0°</button>
          </p>
          {/* Las dos lineas van RESERVADAS, no dejadas al contenido: el largo de esta
              linea depende de cuantos sostenidos tenga la escala, que va de 0 a 5
              sobre las 48 combinaciones de pieza x rotacion, y al envolver movia
              todo lo que tiene debajo —Tempo y la fila de transporte— 20 px hacia
              abajo al cambiar de pieza O de rotacion. Un panel de control que se
              acomoda solo cuando lo tocas es el bug: el boton se corre justo cuando
              vas a apretarlo.

              Dos y no tres, medido sobre el peor string de los 48 (`F#4 · G#4 · A#4 ·
              C#5 · D#5`, 5 sostenidos: sale en `N` rot1, `U` rot0 y `Z` rot3): ocupa
              2 lineas desde 148 px de tarjeta —el interior a 768— hasta los 252 de
              `max-w-6xl` saturado. El salto existia solo en la banda mas ancha, que
              es la unica donde el mejor caso entra en una.

              `2lh` y no `min-h-10`: son los mismos 40 px hoy porque `text-sm` da 20
              de interlineado, pero atado a la fuente en vez de a un numero que habria
              que recordar actualizar. */}
          <p className="min-h-[2lh]">Notas actuales: {noteSet.map(m => midiName(m)).join(" · ")}</p>
        </div>
        <TransportPanel transporte={transporte} />
        {/* La leyenda de gestos, mudada aca desde el `<footer>` del shell.
            No se borra: es el UNICO lugar donde los cuatro gestos directos y la letra
            estan escritos, y sacarla los vuelve invisibles otra vez — el problema que
            su propio comentario decia haber resuelto. Y no puede quedar debajo del tablero,
            que es donde estaba: eso le daria scroll vertical a la pagina, que es lo primero
            que AC1 prohibe. */}
        <p className="mt-4 border-t pt-3 text-xs text-slate-500">
          Rotación cambia la fórmula de escala o el arranque del arpegio, según el régimen; Reflexión invierte el orden (retrógrado).
          {' '}Click en tablero para colocar y escuchar.
          {' '}<span className="whitespace-nowrap">Rueda sobre el tablero o <kbd>Shift</kbd> rota</span>;
          {' '}<span className="whitespace-nowrap">botón derecho o <kbd>Ctrl</kbd> refleja</span>;
          {' '}<span className="whitespace-nowrap"><kbd>Espacio</kbd> arranca y para</span>;
          {' '}<span className="whitespace-nowrap">la <kbd>letra</kbd> de una pieza la elige</span>.
        </p>
      </div>
      </div>
    </aside>
  );
}
