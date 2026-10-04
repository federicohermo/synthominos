import { useMemo, useState, useRef, useCallback } from "react";
import { playNow } from "./playback/engine.ts";
import { DEFAULT_BPM } from "./playback/scheduler.ts";
import { rotateN, reflect } from "./pieces/transform.ts";
import { arpeggioFor, DEFAULT_REGIMEN } from "./musical-model/music.ts";
import { cabeEn, cellsAt, isValid, occupantAt, MAX_PIEZAS } from "./board-editing/placement.ts";
import { buildSequence } from "./circuit/sequence.ts";
import { SHAPES, ANCHOR_INDEX } from "./pieces/pieces.ts";
import type { Cell } from "./pieces/transform.ts";
import type { PieceKey } from "./pieces/pieces.ts";
import type { PlacedPiece } from "./board-editing/placement.ts";
import type { RegimenDeRotacion } from "./musical-model/music.ts";
import PiecePalette from "./panels/PiecePalette.tsx";
import Board from "./board-editing/Board.tsx";
import Spectrum from "./spectrum/Spectrum.tsx";
import { alternarTransporte } from "./playback/engine-bridge.ts";
import {
  MOTOR,
  frenarTransporte,
  reiniciarRecorrido,
  useMotorSincronizado,
} from "./playback/use-engine.ts";
import { useAtajosDeTeclado, useRuedaRota } from "./board-editing/use-input.ts";
import { useGrilla } from "./board-fit/use-grid.ts";
import {
  rotacionPorRueda,
  siguienteRotacion,
  reflejaElContextMenu,
  accionDeClick,
  esLaPiezaEnLaMano,
  EDICION,
} from "./board-editing/input.ts";
import { anuncioDeEdicion } from "./accessibility/cell-name.ts";
import { ORIENTACION_INICIAL, ORIENTACIONES_INICIALES } from "./pieces/orientation.ts";
import type { MemoriaDeOrientacion, Orientacion } from "./pieces/orientation.ts";

/**
 * Pentomino Music — prototipo de instrumento, no un juego con reglas de resolucion.
 *
 * El usuario coloca pentominos en un tablero de 10x6 y cada pieza dispara un
 * arpegio de cinco notas. Que pieza determina la tonica; la rotacion, una de dos cosas
 * segun el REGIMEN elegido —la formula de escala con `escala`, o por donde
 * arranca el arpegio con `orden`—; la reflexion el orden de las notas; y la posicion en
 * el tablero el orden de reproduccion: un circuito cerrado visita las piezas colocadas
 * por el camino mas corto entre ellas, no por el orden
 * en que se fueron colocando.
 *
 * Este archivo es el shell: estado, derivados, handlers y la composicion — y CERO
 * efectos. La geometria, la musica, las reglas del tablero, el sonido y los
 * componentes viven en su capacidad, `src/<capability>/`; y el puente con el motor, en `playback/use-engine.ts` (los cuatro
 * de reconciliacion) y `board-editing/use-input.ts` (los dos de entrada).
 *
 * Que los seis salieran de aca no fue prolijidad: en un `.tsx`
 * `react-refresh/only-export-components` prohibe exportar cualquier cosa que no sea el
 * componente, asi que nada de lo que viviera en este archivo podia testearse. Es el
 * mismo mecanismo por el que la logica vive en modulos `.ts`.
 *
 * Ver docs/architecture/modelo-musical.md y docs/architecture/audio.md.
 */

export default function App() {
  const [selected, setSelected] = useState<PieceKey>('F');

  // La orientacion es de la PIEZA y no del instrumento. Hasta el 019 habia un
  // `rotation` y un `mirror` para las doce, y eso hacia que girar la rueda para acomodar
  // una `F` reorientara las otras once sin que nadie lo pidiera: medido, 11 de 12
  // miniaturas se movian en cada cuarto de vuelta (la unica quieta era la `X`, que es
  // simetrica). Peor todavia, la orientacion que te encontrabas al elegir otra pieza no
  // era la que habias elegido para ELLA sino la que dejo la ultima que tocaste.
  //
  // Memoria y no "se resetea al elegir otra", que tambien arreglaba la queja: con memoria
  // se pueden dejar preparadas doce orientaciones y alternar entre ellas sin volver a
  // rotar, que es una forma de tocar; con reset, cada cambio de pieza borra trabajo.
  //
  // Las piezas YA COLOCADAS no dependen de esto: cada `PlacedPiece` guarda la suya desde
  // siempre, asi que rotar la que esta en la mano no cambia una nota del tablero.
  const [orientaciones, setOrientaciones] = useState<MemoriaDeOrientacion>(ORIENTACIONES_INICIALES);
  // Arranca del mismo numero que el motor: DEFAULT_BPM es una sola declaracion.
  const [tempo, setTempo] = useState<number>(DEFAULT_BPM);
  const [playing, setPlaying] = useState<boolean>(false);
  // Los clicks del recorrido arrancan APAGADOS, y con el default en `false` el botón de
  // la paleta es la única forma de ENCENDER el recorrido: por eso no se puede borrar.
  //
  // El default vive acá y en `clicksAudible` de `engine.ts`, que el efecto de
  // `use-engine.ts` pisa al montar. Los dos dicen `false`: el mismo valor declarado dos
  // veces no puede discrepar.
  //
  // Apaga solo esos: el cruce por celda ocupada suena su nota y no lo gobierna este
  // flag, porque es modelo y no mezcla.
  //
  // El valor pasó por los dos estados y el argumento del que venía sigue siendo bueno:
  // con el recorrido encendido por defecto los clicks tapaban la frase, así que arranca
  // apagado y el botón es la única forma de encenderlos.
  const [clicks, setClicks] = useState<boolean>(false);
  // Que hace la rotacion. Arranca en `escala`, que es el de siempre: abrir
  // la app suena como sonaba (AC11). Es GLOBAL y no por pieza —D3—: por pieza, dos
  // piezas a 90° sonarian con reglas distintas y no habria forma de saber, mirando el
  // tablero, que hace girar una. Es una propiedad del instrumento, como el tempo.
  //
  // Vive aca y baja por props, sin Context ni singleton: el repo no tiene estado
  // global, y ademas es lo que hace que retirar uno de los dos regimenes cuando se
  // decida cual se queda sea borrar una rama en vez de desenredarla.
  const [regimen, setRegimen] = useState<RegimenDeRotacion>(DEFAULT_REGIMEN);

  // placed pieces
  const [placed, setPlaced] = useState<PlacedPiece[]>([]);

  // Celda del tablero bajo el cursor, para el fantasma de previsualización. Desde el spec
  // 026 tiene DOS escritores —el mouse y el foco del teclado— y sigue siendo UNO solo:
  // la celda enfocada **es** `hover`. De ahí que el fantasma, el cursor `pointer`/
  // `not-allowed` y `hoverEdita` funcionen con teclado sin una línea de dibujo nueva, y de
  // ahí también que no aparezca un segundo «dónde está apuntando» que pueda
  // desincronizarse del primero.
  //
  // Lo que se DIBUJA con esto es `cursor`, más abajo: la grilla cambia de tamaño sola y
  // el par guardado acá puede quedar apuntando a una celda que la grilla nueva no tiene.
  const [hover, setHover] = useState<Cell | null>(null);

  // Si el foco del DOM está adentro del tablero. Es lo único que `hover` no puede contestar
  // solo —el mouse también lo escribe— y hacen falta las dos cosas que dependen de eso:
  // pintar el anillo de foco (que no tiene que aparecer bajo el mouse, que no tiene foco
  // ninguno) y la regla de desempate del `onMouseLeave`, abajo.
  //
  // Es estado nuevo y el spec pedía evitarlo, así que el número: cambia cuando el foco
  // ENTRA o SALE del tablero, no por celda cruzada. Contra los 337 elementos por celda que
  // midió el 027, son dos re-renders por visita — la razón por la que `hover` no puede ser
  // un ref no vale para éste al revés: acá la baja frecuencia es la que lo hace barato.
  const [focoEnTablero, setFocoEnTablero] = useState<boolean>(false);

  // Lo último que cambió en el tablero, dicho para la región `aria-live` (AC10). Vive en el
  // estado y no se escribe en el DOM a mano porque es el shell quien sabe qué edición
  // ocurrió: la región es un nodo más del render, y React lo actualiza como a cualquier
  // otro. El texto sale de `cell-name.ts` y no de una cadena armada acá.
  const [anuncio, setAnuncio] = useState<string>('');

  // El par de la pieza en la mano, derivado y no duplicado: todo lo que antes leia los dos
  // `useState` sigue leyendo estos dos nombres. La memoria tiene las doce ranuras
  // garantizadas por su tipo —el `Record` se deriva de `SHAPES`— asi que esto no puede dar
  // `undefined` y no hace falta un default.
  const { rotation, mirror } = orientaciones[selected];

  const idRef = useRef(0);

  // `selected`, leible sin ser dependencia. Existe por UN consumidor: `alRotar`, el
  // callback de la rueda, que tiene dependencias vacias a proposito
  // —es lo que deja que `useRuedaRota` registre el listener de `wheel` una sola vez por
  // montaje—. Con la orientacion global su cuerpo no leia nada; con la
  // memoria por pieza necesita saber CUAL ranura rotar, y agregarle `selected` a las
  // dependencias romperia esa cardinalidad.
  //
  // El setter funcional no alcanza como salida: `setOrientaciones(prev => ...)` recibe el
  // `Record` anterior y nada mas, asi que no hay forma de que sepa cual es la pieza en la
  // mano sin cerrar sobre `selected` o sin leerlo de un ref.
  //
  // Se escribe DONDE se escribe `selected` y no en el cuerpo del render, que es lo obvio y
  // lo que el linter rechaza («Cannot access refs during render»): un ref leido o escrito
  // durante el render es estado invisible para React, y con `elegirPieza` como unico
  // escritor de los dos el ref no se puede desincronizar. El otro camino era un
  // `useEffect`, y este shell no tiene ninguno.
  //
  // El valor inicial sale de `selected` y no de otra `'F'` escrita al lado: dos literales
  // que tienen que coincidir es exactamente el par que este repo no deja suelto.
  const selectedRef = useRef<PieceKey>(selected);

  /** El unico escritor de la pieza en la mano: el estado que se pinta y el ref que lee la rueda. */
  const elegirPieza = useCallback((pieza: PieceKey) => {
    selectedRef.current = pieza;
    setSelected(pieza);
  }, []);

  /**
   * Escribe la ranura de UNA pieza. Los cuatro gestos de orientacion pasan por aca.
   *
   * `Record` nuevo y objeto nuevo, nunca mutacion: `.claude/rules/ui.md` lo prohibe, y
   * ademas es lo que hace que la barrera del `memo` de `OrientationPanel` siga midiendo
   * lo que dice — la identidad del `Record` cambia cuando cambia una orientacion y no
   * cuando se mueve el cursor.
   */
  const orientar = useCallback((pieza: PieceKey, cambio: (o: Orientacion) => Orientacion) => {
    setOrientaciones(prev => ({ ...prev, [pieza]: cambio(prev[pieza]) }));
  }, []);

  // El nodo del tablero, para colgarle la rueda. Se crea ACA y viaja a `Board` como una
  // prop mas: asi el componente no gana ni estado ni efectos.
  const boardRef = useRef<HTMLDivElement | null>(null);

  // El contenedor RAIZ, para colgarle `--cell`. No es `boardRef`, y la diferencia es la
  // herencia: una custom property baja por el arbol, y los dos paneles flotantes son
  // `fixed` fuera de `Board`, asi que colgada del tablero sus cajas —medidas en celdas— no
  // resolverian `var(--cell)`.
  //
  // El efecto que la escribe vive en `board-fit/use-grid.ts` y no aca: desde el spec
  // 022 este shell **no declara un solo `useEffect`**, y un listener de `resize` es
  // exactamente el caso que `.claude/rules/ui.md` ya resuelve —el listener global vive en
  // un hook `use-*.ts`, con el `ref` creado en el shell—. El precedente literal es
  // `useRuedaRota` recibiendo `boardRef`.
  const raizRef = useRef<HTMLDivElement | null>(null);
  // El hook **contesta** ademas de escribir: cuanto mide el tablero en
  // celdas sale de la misma medicion que el tamano de celda, y a diferencia de ella no la
  // puede resolver el CSS —decide cuantos nodos existen—, asi que vuelve como estado. El
  // hook solo lo cambia cuando cambian los numeros, no en cada pixel del arrastre.
  const dims = useGrilla(raizRef);

  // Las piezas que ENTRAN en el tablero de ahora. Achicar la ventana achica la grilla, y
  // una pieza que queda afuera no se borra: se queda en `placed`, deja de dibujarse y de
  // sonar, y vuelve entera cuando hay lugar otra vez. El repo no tiene deshacer y
  // arrastrar el borde de una ventana no es un gesto de edicion.
  //
  // El criterio —la pieza ENTERA, y por que— vive en `cabeEn` y no aca: es una pura del
  // dominio, y este shell no lleva ninguna (`.claude/rules/ui.md`).
  //
  // **`visibles` es lo que se ve, se toca y suena; `placed` es lo que existe**, y de ahi
  // sale que de esta linea para abajo cada consulta elija una de las dos. Las que miran el
  // tablero DIBUJADO —el ocupante de una celda, el gesto de edicion, el circuito— van con
  // `visibles`, porque una pieza que no se dibuja no puede recibir un click sobre una celda
  // que se ve vacia. Las que miran la LEGALIDAD van con `placed`: una pieza guardada puede
  // tener celdas adentro de la grilla nueva —«no entra entera» no es «esta toda afuera»— y
  // colocar encima dejaria dos solapadas en cuanto la ventana crezca.
  const visibles = useMemo(() => placed.filter(p => cabeEn(p, dims)), [placed, dims]);

  // Y el mismo corte para el CURSOR, que es el otro estado que la grilla nueva puede dejar
  // apuntando a una celda que no tiene. `hover` lo escriben el mouse y el foco (spec
  // 026) y ninguno de los dos se entera de un `resize`: quien mueve el borde de la ventana
  // —o aprieta `Ctrl`+`=`, que es zoom y por lo tanto viewport— no toca ni el mouse ni el
  // teclado, asi que el par que quedo guardado puede caer afuera de `dims`.
  //
  // Y afuera de `dims` NO es inofensivo, que es lo que lo hace un derivado y no una
  // prolijidad: `Board` ancla el roving tabindex en esta celda, asi que con el cursor
  // apuntando a una que no se dibuja **ninguna** celda se queda con `tabIndex={0}` y el
  // tablero entero sale del orden de tabulacion — el estado que el `?? [0, 0]` de
  // `Board.tsx` existe para que no pase, y que hasta el 031 era inalcanzable porque las
  // dimensiones no cambiaban. De paso `previewValid` da `false` con `hover` puesto, o sea
  // que las celdas quedan todas en `cursor-not-allowed` diciendo "aca no entra" donde la
  // jugada es perfectamente valida.
  //
  // `isValid([hover], [], dims)` y no un predicado nuevo: "esta celda esta adentro del
  // tablero" es exactamente lo que `isValid` contesta con el tablero vacio, que es el mismo
  // argumento con el que `cabeEn` se implementa sobre ella en vez de repetir los cuatro
  // limites.
  const cursor = hover !== null && isValid([hover], [], dims) ? hover : null;
  // Y con el cursor apagado el foco tampoco esta en una celda: las dos mitades las escribe
  // `alMoverElFoco` en la misma linea, asi que se caen juntas. Sin esto el anillo de foco
  // se dibujaria sobre la (0,0) —adonde cae el ancla— sin que el foco del DOM este ahi.
  const focoEnCelda = focoEnTablero && cursor !== null;

  // Los dos flotantes arrancan ABIERTOS: un instrumento que arranca con los controles
  // escondidos no se descubre. Plegado, cada panel deja solo su encabezado, y cualquier
  // celda tapada queda a un click. No persiste: recargar los abre, como recargar vacia el
  // tablero.
  const [piezasAbierto, setPiezasAbierto] = useState<boolean>(true);
  const [senalAbierta, setSenalAbierta] = useState<boolean>(true);

  // Si el tap del modificador que esta abajo sigue siendo limpio. Va en un ref y no en
  // `useState` porque cambia varias veces por gesto y no lo dibuja nadie: meterlo al
  // estado re-renderizaria el arbol entero por una tecla apretada.
  const tapLimpio = useRef<boolean>(false);

  const transformedShape = useMemo(() => {
    let c = SHAPES[selected];
    c = rotateN(c, rotation);
    if (mirror) c = reflect(c);
    return c; // normalized
  }, [selected, rotation, mirror]);

  // El recorrido, calculado UNA vez por tablero y consumido por dos: el motor (por la
  // proyeccion sin celdas) y la cabeza lectora (por `encolar`). Eran tres mientras
  // existio la lista lateral, que lo leia por el orden del circuito.
  // Recalcularlo en cada consumidor abriria la puerta a que dos de ellos miren circuitos
  // distintos, y lo que se ve y lo que suena no pueden discrepar.
  //
  // El `regimen` va en las dependencias y no es opcional: es la primera de las tres
  // cachas de derivacion que AC15 obliga a llevarlo. Sin el, cambiar el regimen no
  // re-derivaria el tablero y AC7 quedaria falso — que es justo la consecuencia
  // buscada de que las notas no se guarden en `PlacedPiece`.
  const secuencia = useMemo(() => buildSequence(visibles, regimen, dims), [visibles, regimen, dims]);

  // El arpegio de la pieza SELECCIONADA, para el panel y para el click de colocacion.
  // La derivacion vive en `musical-model/music.ts` y no aca: las piezas ya colocadas la piden
  // por su cuenta —`buildSequence`, para el motor— y tener dos copias de la regla era
  // justo lo que hacia falta cuando `PlacedPiece` guardaba sus notas.
  const noteSet = useMemo(() => arpeggioFor(selected, rotation, mirror, regimen), [selected, rotation, mirror, regimen]);

  // Los cuatro efectos de reconciliación que mantienen al motor mirando este mismo
  // tablero viven en `playback/use-engine.ts`, y la llamada va ACÁ y no
  // arriba con el resto del cableado: `secuencia` es un `const`, así que llamarlo antes
  // de su `useMemo` la leería en su zona muerta temporal y tiraría un `ReferenceError`
  // en el primer render. Sigue estando ANTES de los dos hooks de entrada, que es donde
  // estaban los cuatro efectos, así que el orden de registro no cambia.
  //
  // `visibles` y no `placed`, por lo mismo que arriba: lo que este hook le pasa a la cola
  // de dibujo es el tablero con el que se cruza la secuencia, y la secuencia sale de
  // `visibles`. Con el tablero entero le llegaban piezas que la secuencia no nombra —una
  // pieza que la ventana dejó afuera— y el cruce las ignoraba, que es la clase de dato de
  // más que un día se lee como si estuviera.
  useMotorSincronizado({ secuencia, placed: visibles, tempo, clicks });

  // El tablero se edita EN el tablero: sobre una pieza ya colocada, y solo con
  // esa misma pieza en la mano, el click la quita y `Alt`+click alterna su muteo. Qué
  // gesto es lo decide `accionDeClick`, que es una pura y se testea; acá queda el
  // cableado y las dos consultas al dominio que la pura no puede hacer.
  function handleCellClick(x: number, y: number, altKey: boolean) {
    // `visibles` y no `placed`: la pieza que no entra en la grilla de ahora no se dibuja,
    // asi que la celda que se ve vacia tiene que COMPORTARSE como vacia. Con el tablero
    // entero, arrastrar el borde de la ventana dejaba piezas invisibles interceptando
    // clicks —quitando o muteando algo que no esta en pantalla, y anunciandolo—, que es la
    // misma discrepancia entre lo que se ve y lo que el modelo hace, dada vuelta.
    //
    // Lo que queda de la pieza guardada es su LEGALIDAD, y eso lo sigue mirando el
    // `isValid` de mas abajo con `placed` entero: colocar sobre sus celdas se rechaza igual
    // —el fantasma ya sale rosa— asi que no se puede pisar lo que no se ve.
    const ocupante = occupantAt(visibles, x, y);
    const accion = accionDeClick(ocupante, selected, altKey);
    if (accion === null) return;   // celda ocupada por OTRA pieza: nada, como antes

    // Las dos ramas de edición van anidadas adentro del `ocupante !== null` y no colgadas
    // del `accion`: la pura ya garantiza que `quitar` y `mutear` solo salen con ocupante,
    // y así TypeScript lo sabe sin que haga falta un `!` que afirme lo mismo sin prueba.
    if (ocupante !== null) {
      if (accion === EDICION.quitar) setPlaced(arr => arr.filter(p => p.id !== ocupante.id));
      // Objeto nuevo y no `p.muted = !p.muted`: nunca mutar lo que ya se entregó a React.
      else setPlaced(arr => arr.map(p => p.id === ocupante.id ? { ...p, muted: !p.muted } : p));
      // El anuncio dice el estado en el que la pieza QUEDA, y sale de la misma expresión
      // que el `setPlaced` de arriba acaba de guardar: así el lector de pantalla no puede
      // decir un muteo distinto del que el tablero aplicó. `quitar` lo recibe igual —lo
      // que la frase dice ahí es cuál se fue y de dónde—; el argumento está en el docblock
      // de `anuncioDeEdicion`.
      setAnuncio(anuncioDeEdicion(accion, ocupante.piece, x, y, !ocupante.muted));
      return;
    }

    const cells = cellsAt(transformedShape, ANCHOR_INDEX[selected], x, y);
    if (!isValid(cells, placed, dims)) return;
    // El tope de piezas, que con el tablero fijo lo garantizaba el AREA: 60 celdas ÷ 5 daban
    // 12 y nadie tenia que escribirlo. Con el tablero saliendo del viewport entran 78 en un
    // escritorio, y el circuito se resuelve con Held-Karp exacto —`O(n²·2ⁿ)`, medido: 12
    // piezas 3,1 ms y 16 piezas 18,6 ms—. El porque del numero esta en `MAX_PIEZAS`.
    //
    // Se chequea DESPUES de `isValid` y con el mismo trato: no cambia el tablero. Lo que
    // agrega es el anuncio, porque es el unico rechazo que no se explica solo — una jugada
    // invalida se ve (el fantasma sale rosa) y esta no.
    //
    // Cuenta `placed` y no `visibles`, que es la unica de las tres consultas de este
    // handler que mira el tablero entero: el tope existe para acotar el `2ⁿ` del circuito,
    // y una pieza guardada afuera vuelve a entrar en cuanto la ventana crezca. Contando lo
    // visible se podrian guardar veinte piezas achicando la ventana entre una y otra, y el
    // `buildSequence` del primer agrandamiento las recibiria todas juntas.
    if (placed.length >= MAX_PIEZAS) {
      setAnuncio(`El tablero acepta ${MAX_PIEZAS} piezas y ya tiene ${MAX_PIEZAS}. Quitá una para poder colocar otra.`);
      return;
    }
    // `Alt` significa "muteado" en los dos lados del gesto: colocar así mete una pieza al
    // circuito por su ESPACIO y su TIEMPO —mueve el orden de visita y agrega distancia—
    // sin agregar cinco notas. Es la única forma de componer con silencio.
    const muted = accion === EDICION.colocarMuteada;
    const newPiece: PlacedPiece = {
      id: String(++idRef.current),
      piece: selected, rotation, mirror, cells, muted,
    };
    setPlaced(prev => [...prev, newPiece]);
    // Después del `isValid`, no antes: una jugada que no entra no cambió el tablero, así
    // que anunciarla sería contarle a quien no ve la pantalla algo que no pasó.
    setAnuncio(anuncioDeEdicion(accion, selected, x, y, muted));
    // Con el transporte corriendo, disparar acá duplicaría el arpegio: con D5
    // la pieza nueva ni siquiera entra al recorrido que está sonando
    // —`setSequence` no interrumpe el ciclo en curso, así que hasta que cierre la
    // pieza es muda dentro del loop— y el click sigue siendo la única forma
    // inmediata de escucharla. Con el transporte en pausa pasa lo mismo por otra
    // razón: no hay reloj corriendo que la vaya a tocar. Sin Web Audio `playing`
    // nunca llega a true, de modo que el caso degradado cae solo del lado que suena.
    //
    // Colocar MUTEADA no lo dispara: la pieza se está poniendo justamente para que no
    // suene, y un arpegio de cortesía contradiría el gesto en el momento de hacerlo.
    if (!playing && !muted) playNow(noteSet);
  }

  // Reset frena el transporte ADEMÁS de vaciar el tablero, y esa segunda mitad no es
  // cosmética. Vaciar solo `placed` deja al motor terminando su ciclo activo —la
  // secuencia nueva, vacía, entra recién al cerrar—, o sea hasta 7,5 s
  // sonando sobre un tablero que ya está vacío. Reset es una orden explícita de volver
  // a cero, no una edición del tablero, así que es el único lugar donde saltearse el
  // empalme al cierre de ciclo es
  // lo correcto. Lo que queda es la latencia de pausar, que el motor ya documenta: los
  // 100 ms del lookahead más la cola del arpegio ya agendado.
  //
  // Y ese párrafo vale para UNA de las dos colas. La otra —la de dibujo, en
  // `playback/route-source.ts`— avanza sólo cuando el motor cierra un ciclo, o sea
  // nunca con el reloj parado: sin reiniciarla, el velo de las piezas borradas
  // se sigue dibujando sobre un tablero vacío hasta el próximo Play. Las
  // dos se reinician juntas o vuelve el bug, y las dos entran por `use-engine.ts`, que
  // es el único módulo por el que este shell le habla al motor.
  // Y lo que NO toca, que hay que decirlo porque la constante está justo
  // al lado: `↺` **no** vuelve las doce orientaciones a cero. Es una decisión con un costo
  // escrito —se renuncia al invariante «después de `↺` la app queda como recién abierta»—
  // y a cambio este botón conserva un alcance único y nombrable, las piezas COLOCADAS, en
  // vez de hacer dos cosas de dominios distintos. El estado de orientación tiene su propio
  // botón, el `0°` de la paleta, y ése resetea una sola pieza.
  function resetBoard() {
    frenarTransporte();
    reiniciarRecorrido();
    setPlaying(false);
    setPlaced([]); // el efecto de reconciliación se encarga de vaciar la secuencia
  }

  // `useCallback` y no una función suelta desde que el atajo de la barra espaciadora
  // también la llama: el efecto del teclado la tiene en sus dependencias, y
  // sin memo cambiaría de identidad en cada render y re-suscribiría los dos listeners
  // por cada tecla. Con `[playing]`, la identidad cambia exactamente cuando cambia el
  // transporte, que es la dependencia real que el efecto declara.
  const togglePlay = useCallback(() => {
    // La decisión —pedir lo contrario de lo que pasa y creerle al motor y no a lo que se
    // pidió— vive en `alternarTransporte`, donde tiene test. Acá queda el cableado: el
    // motor real y el `setState` con lo que el motor contestó.
    setPlaying(alternarTransporte(playing, MOTOR));
  }, [playing]);

  // ── Entrada directa ──────────────────────────────────────────────────
  // Los dos efectos viven en `board-editing/use-input.ts`, y reciben CALLBACKS y no
  // setters: por eso, cuando la orientación dejó de ser dos `useState` y pasó a ser una
  // ranura por pieza, lo que cambió fue este bloque y no el hook.
  //
  // `tapLimpio` se queda ACÁ y viaja a los dos: lo lee el teclado y lo escriben los dos,
  // así que el ref es de quien los compone. Está argumentado en `use-input.ts`.

  // Los dos del teclado se memoizan con sus dependencias REALES y no con `[]`. La
  // dependencia real es UNA —`selected`— y no `rotation` o `mirror`: el
  // cambio se calcula adentro del setter funcional sobre la ranura anterior, así que el
  // callback no necesita leer la orientación actual. Con arrows inline el hook se
  // re-suscribiría por render — peor, y en silencio.
  const rotarConTecla = useCallback(
    () => orientar(selected, o => ({ ...o, rotation: siguienteRotacion(o.rotation) })),
    [orientar, selected],
  );
  const reflejarConTecla = useCallback(
    () => orientar(selected, o => ({ ...o, mirror: !o.mirror })),
    [orientar, selected],
  );

  // El botón `0°` de la paleta: devuelve la pieza en la mano —y sólo esa— al arranque.
  const resetearOrientacion = useCallback(
    () => orientar(selected, () => ORIENTACION_INICIAL),
    [orientar, selected],
  );

  // La letra elige la pieza. Es `elegirPieza` tal cual y no un callback nuevo:
  // desde el 020 hay UN solo escritor de la pieza en la mano —el que actualiza el estado y
  // el ref en la misma línea— y darle al hook otro envoltorio sería abrir la puerta a un
  // segundo escritor que no toque el ref. Su identidad es estable por el `useCallback` de
  // dependencias vacías de allá arriba, no porque `setSelected` lo sea.
  //
  // Que el hook reciba un callback y no el setter es lo que hizo que el cambio de forma
  // de la ranura de estado —`rotation` y `mirror` pasando a ser una ranura por pieza—
  // cayera acá y no adentro del hook.
  const seleccionarConTecla = elegirPieza;

  // `useCallback` de dependencias VACÍAS, y no es cosmética: es lo que deja que el
  // listener de `wheel` se registre una sola vez por montaje. Si
  // alguna vez gana una dependencia, el listener pasa a re-suscribirse con ella.
  //
  // Hasta el 019 era posible porque el cuerpo usaba el setter funcional y no leía
  // `rotation`. Con la memoria por pieza (020) el cuerpo SÍ necesita un dato del render
  // —cuál es la pieza en la mano— y el setter funcional no se lo puede dar: recibe el
  // `Record` anterior y nada más. La salida es `selectedRef`, que está argumentado arriba;
  // agregar `selected` a las dependencias era la otra, y rompe la suscripción única.
  const alRotar = useCallback((deltaY: number) => {
    const pieza = selectedRef.current;
    orientar(pieza, o => ({ ...o, rotation: rotacionPorRueda(o.rotation, deltaY) }));
  }, [orientar]);

  useAtajosDeTeclado(
    {
      rotar: rotarConTecla,
      reflejar: reflejarConTecla,
      transporte: togglePlay,
      seleccionar: seleccionarConTecla,
    },
    tapLimpio,
  );
  useRuedaRota(boardRef, alRotar, tapLimpio);

  // El menú contextual no se abre NUNCA sobre el tablero —`preventDefault` siempre—,
  // pero alternar es otra cosa: en macOS `Ctrl`+click llega como `contextmenu` con
  // `ctrlKey: true` y ahí el que alterna es el `keyup` de `Ctrl`. Contar los dos daría
  // neto cero y la reflexión no respondería nunca en una laptop de Apple sin mouse.
  function handleContextMenu(e: { preventDefault: () => void; ctrlKey: boolean }) {
    e.preventDefault();
    // Una sola ranura, como los otros tres gestos de orientación: el botón derecho es el
    // octavo consumidor de la orientación y el único que no pasa por un efecto ni por un
    // `useMemo`, así que es el que se escapa si se los busca a mano en vez de dejar que
    // el typecheck los enumere.
    if (reflejaElContextMenu(e)) orientar(selected, o => ({ ...o, mirror: !o.mirror }));
  }

  // El foco entró a una celda del tablero, o se fue de él (`null`). Las dos mitades en una
  // función porque son el mismo hecho, y las dos líneas dicen exactamente eso: la celda
  // enfocada ES el cursor —al entrar lo escribe, al salir lo apaga (lo mismo que hace hoy
  // `onMouseLeave` con el mouse)— y `focoEnTablero` es «¿llegó una celda?».
  function alMoverElFoco(celda: Cell | null) {
    setFocoEnTablero(celda !== null);
    setHover(celda);
  }

  // LA regla de desempate, escrita una sola vez y en un solo lugar: mientras el foco del
  // DOM esté adentro del tablero, el foco manda sobre el mouse. Sin ella, sacar el mouse de
  // la grilla apagaría el fantasma de la celda enfocada y el roving tabindex se quedaría
  // sin ancla — o sea que «la celda enfocada es el hover» sería una promesa que el mouse
  // rompe. Dos copias de esta condición serían dos formas de que el fantasma parpadee.
  //
  // La otra dirección la resuelve el propio evento y no una segunda regla: el `blur` sabe a
  // quién le pasa el foco, así que `Board` ya distingue «salió del tablero» de «saltó a
  // otra celda» antes de llamar a `alMoverElFoco(null)`.
  function alSalirElMouse() {
    if (!focoEnCelda) setHover(null);
  }

  // Si la celda bajo el cursor está ocupada por la pieza que está en la mano, el click
  // no coloca: edita. La condición sale de la MISMA pura que decide el click, así que el
  // cursor no puede prometer una cosa y el gesto hacer otra — y por eso mira `visibles`,
  // que es lo que `handleCellClick` mira: con `placed` entero, una pieza que la ventana
  // dejó afuera apagaba el fantasma y prometía una edición sobre una celda vacía.
  const hoverEdita = esLaPiezaEnLaMano(cursor ? occupantAt(visibles, cursor[0], cursor[1]) : null, selected);

  // Fantasma: dónde caería la pieza desde la celda bajo el cursor. Las celdas
  // fuera del tablero no se pintan, pero sí cuentan para marcar la jugada
  // como inválida.
  //
  // Sobre una celda propia el fantasma NO se pinta, y esa es la decisión que AC20 pide
  // escrita: ahí la jugada de colocar es inválida —la pieza se choca consigo misma— así
  // que el fantasma saldría rosa entero, diciendo "acá no entra" sobre la única celda
  // donde el click sí hace algo. Lo que se ve es la pieza colocada, que es sobre lo que
  // el gesto va a actuar.
  const previewCells = cursor && !hoverEdita ? cellsAt(transformedShape, ANCHOR_INDEX[selected], cursor[0], cursor[1]) : [];
  const previewValid = cursor && !hoverEdita ? isValid(previewCells, placed, dims) : false;

  // El porque de este `useMemo` —y el numero que lo justifica— esta abajo, al lado del
  // `<PiecePalette>` que lo consume: es donde estaba escrita la decision contraria.
  const orientacion = useMemo(() => ({
    selected, orientaciones, regimen, noteSet,
    onSelect: elegirPieza,
    onRegimen: setRegimen,
    onResetOrientacion: resetearOrientacion,
  }), [selected, orientaciones, regimen, noteSet, elegirPieza, resetearOrientacion]);

  // El tablero ES la pantalla. Murieron el `min-h-screen … p-4` y el
  // `max-w-6xl mx-auto grid grid-cols-12 gap-4`: no hay fila de tarjetas que repartir
  // porque no hay tarjetas. Lo que queda es una caja del tamano exacto del viewport, con
  // el tablero centrado adentro y los dos paneles flotando encima.
  //
  // `100dvh` y no `100vh`: en iOS `100vh` incluye la barra del navegador, asi que el
  // tablero salta al aparecer y desaparecer. `overflow-hidden` es lo que hace cierta la
  // primera mitad de la promesa —cero scroll vertical de pagina— y tambien la
  // otra mitad: el tablero no tiene un `overflow-x-auto` propio donde absorber su
  // desborde, porque no puede desbordar —`grid-fit.ts` elige las celdas contra ESTA caja—.
  // O sea que esta clase paso de ser la red a ser la garantia.
  //
  // `bg-fondo text-slate-900` SOBREVIVEN: este `div` es uno de los cuatro
  // lugares donde vive el color de fondo, y `__tests__/fondo-sincronizado.test.ts`
  // existe para que los cuatro no se desincronicen.
  return (
    <div ref={raizRef} className="h-dvh w-full overflow-hidden bg-fondo text-slate-900">
      {/* Aca llego a decir que los dos objetos se armaban INLINE porque
            memoizarlos "no compra nada": `PiecePalette` no esta memoizado, asi que
            re-renderiza igual. Era cierto y CIRCULAR —no memoizamos las props porque el
            componente no esta memoizado— y encima nunca se habia medido: era el unico caso
            de frecuencia del repo sin numero, en un proyecto donde los otros dos existen
            porque alguien conto 4 a 10,6 cambios por segundo y 60 fps.

            El numero, medido en `__tests__/App.browser.test.tsx`: `hover` vive en este
            archivo, asi que cruzar diez celdas con el cursor re-renderizaba el arbol diez
            veces y `OrientationPanel` se ejecutaba las DIEZ, a 337 elementos cada una
            (1 grilla + 12 x (boton + grilla + 25 celdas + span), con `MINI_BOX = 5`). O sea
            3.370 elementos reconciliados para llegar al MISMO DOM, porque ninguna prop del
            panel depende del hover.

            Y el que dio vuelta la decision fue el costo, medido con `Profiler` sobre el
            commit entero de la app: mediana de 4,9 ms por celda cruzada contra 1,9 ms con la
            barrera puesta. Son 3,0 ms —el 61 %— gastados en el subarbol que no puede haber
            cambiado, a la frecuencia del MOUSE, que arrastrandose sobre el tablero es una
            celda por cuadro dibujado. Es el mismo criterio con el que salieron
            `Spectrum` y `Playhead` de React; a este le alcanza con un `memo`.

            El array de dependencias que el comentario viejo temia no es deuda a mano:
            `react-hooks/exhaustive-deps` lo verifica en el lint, asi que un campo nuevo en
            `PropsDeOrientacion` que se olvide de entrar da rojo y no un panel viejo en
            pantalla.

            Este numero mide SOLO la mitad del mouse. Hay un segundo
            escritor de `hover` con la misma frecuencia por pulsacion —la celda enfocada con
            el teclado ES `hover`, no un estado paralelo—, y su medicion va debajo de esta.

            Y aca esta: el segundo escritor son las flechas, y cada
            pulsacion mueve el foco, el foco escribe `hover` y `hover` re-renderiza este
            arbol — los mismos 337 elementos de `OrientationPanel`, por el mismo motivo (ni
            una sola prop del panel depende del cursor). O sea que la barrera de arriba
            cubre las dos manos sin una linea nueva: el `useMemo` no mira de donde vino el
            cambio de `hover`.

            Lo que cambia es el ALCANCE de la frase, no el numero. Los 4,9 ms → 1,9 ms
            siguen medidos sobre el mouse, que arrastrandose cruza una celda por cuadro
            dibujado; el teclado escribe lo mismo pero a la cadencia de la mano, y con
            auto-repeat a la del sistema. No se remidio —seria el mismo trabajo por
            pulsacion contra un reloj distinto—, asi que lo que hay que leer arriba es
            «por escritura de `hover`» y no «por celda cruzada con el mouse». Desde este
            merge el numero describe el sistema entero y no la mitad.

            `transporte` se sigue armando inline, y ahora por el numero y no por el
            argumento circular: nadie lo consume detras de una barrera, asi que memoizarlo no
            cambiaria un solo render. */}
      <PiecePalette
        orientacion={orientacion}
        transporte={{
          tempo, playing, clicks,
          onTempo: setTempo,
          onTogglePlay: togglePlay,
          onToggleClicks: () => setClicks(c => !c),
          onReset: resetBoard,
        }}
        abierto={piezasAbierto}
        onToggle={() => setPiezasAbierto(v => !v)}
      />

      <Board
        placed={visibles}
        dims={dims}
        previewCells={previewCells}
        previewValid={previewValid}
        hover={cursor}
        selected={selected}
        rotation={rotation}
        mirror={mirror}
        regimen={regimen}
        onCellClick={handleCellClick}
        onCellEnter={setHover}
        onMouseLeave={alSalirElMouse}
        focoEnTablero={focoEnCelda}
        onFoco={alMoverElFoco}
        hoverEdita={hoverEdita}
        onContextMenu={handleContextMenu}
        boardRef={boardRef}
      />

      {/* La señal que sale por el master, como franja flotante abajo a la izquierda.
            No recibe props: lee del motor por su cuenta, para que dibujar a 60
            fps no re-renderice nada de acá.

            La posición sale de la medición igual que la del dock: `3 × 1` celdas en la
            esquina inferior izquierda tapan `(0,5)`, `(1,5)` y `(2,5)` y dejan libre
            `(9,5)`, que es donde arranca la cabeza lectora. Y `(0,0)` queda libre porque la
            franja está abajo — es la celda donde el circuito cierra.

            El alto es UNA celda y el contenido se acomoda adentro con `flex-col`: el canvas
            toma lo que queda después del encabezado. Con el `h-24` de 96 px que `Spectrum`
            tenía, al piso el contenido pedía 132 px contra los 73 de la caja y la franja se
            comía una segunda fila del tablero. */}
      <aside
        className="fixed left-0 bottom-0 z-20 flex flex-col rounded-tr-2xl shadow-lg bg-white/85 backdrop-blur p-2"
        style={{ width: `calc(var(--cell) * 3)`, height: senalAbierta ? `calc(var(--cell) * 1)` : undefined }}
      >
        <button
          type="button"
          onClick={() => setSenalAbierta(v => !v)}
          aria-expanded={senalAbierta}
          aria-controls="franja-senal"
          className="shrink-0 text-left text-sm font-semibold mb-1"
        >Señal</button>
        {/* `hidden` y no desmontar: el `ResizeObserver` de `spectrum-loop.ts` redibuja
              porque su contenedor cambia de TAMAÑO, y si plegar desmontara el `<canvas>` no
              habría observador que se dispare — se ejecutaría la limpieza de
              `iniciarEspectro` y al desplegar se montaría un loop nuevo. */}
        <div id="franja-senal" hidden={!senalAbierta} className="min-h-0 flex-1">
          <Spectrum />
        </div>
      </aside>

      {/* La única región `aria-live` de `src/`.
          Anuncia el resultado de las TRES ediciones —colocar, quitar y mutear— porque son
          lo único que cambia el tablero y lo único que, sin ver la pantalla, no se puede
          confirmar de otra forma: el tablero se edita EN el tablero, y quitar
          no tiene deshacer.

          Y NADA más. Ni el recorrido, ni la cabeza lectora, ni el espectro: la cabeza pasa
          de celda en celda entre 4 y 10,6 veces por segundo, y una región que hable a esa
          frecuencia es hostil —el lector de pantalla nunca termina una frase, y tapa todo
          lo demás—. Cómo contar el recorrido sin narrarlo sigue sin resolverse.

          `polite` y no `assertive`: la edición la pidió quien la escucha, así que puede
          esperar a que el lector termine lo que está diciendo. El nodo existe desde el
          primer render con el texto vacío, que es lo que hace que el primer anuncio se
          escuche: una región recién insertada en el DOM no se anuncia. */}
      <div aria-live="polite" className="sr-only">{anuncio}</div>

    </div>
  );
}
