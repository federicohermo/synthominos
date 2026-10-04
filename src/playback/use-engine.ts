import { useEffect } from 'react';
import {
  setSequence,
  setBpm,
  setClicksAudible,
  startClock,
  stopClock,
  clockRunning,
} from './engine.ts';
import { buildSequence } from '../circuit/sequence.ts';
import { DEFAULT_REGIMEN } from '../musical-model/music.ts';
import { GRID_DEFAULT } from '../board-editing/placement.ts';
import type { Sequence } from '../circuit/sequence.ts';
import type { PlacedPiece } from '../board-editing/placement.ts';
import type { MotorDeTransporte } from './engine-bridge.ts';
import { proyectarAlMotor } from './engine-bridge.ts';
import { encolar, reiniciar } from './route-source.ts';

/**
 * Los cuatro efectos de reconciliación que mantienen al motor mirando el mismo tablero que
 * la pantalla: tempo, clicks, la secuencia contra el tablero y la limpieza al desmontar.
 *
 * Estaban en `App.tsx` y se mudaron ENTEROS, en el mismo orden y con
 * sus docblocks: son argumentos ya medidos —el empalme al cierre de ciclo, la limpieza
 * sincrónica bajo StrictMode, por qué el desmontaje usa `DEFAULT_REGIMEN`— y
 * re-derivarlos es la forma más fácil de perderlos.
 *
 * `secuencia` entra POR PARÁMETRO y este hook no la vuelve a derivar. Es lo que
 * garantiza que `encolar` y `setSequence` sigan viendo la MISMA instancia: si el hook
 * llamara a `buildSequence` por su cuenta, el dibujo y el sonido podrían quedar mirando
 * circuitos distintos sin que nada falle, que es exactamente lo que D5
 * existe para cerrar. El shell deriva la regla; el hook recibe el resultado.
 *
 * Es un `.ts` y no un `.tsx`, así que `react-refresh/only-export-components` no lo mira
 * — la misma razón por la que `input.ts` y `route-source.ts` pueden exportar lo que
 * quieran.
 */

/**
 * El transporte real, cableado al rol que espera `alternarTransporte`.
 *
 * Const de módulo y NO exportada, pese a la regla del repo de que los
 * módulos no declaran constantes: esa regla existe para los VALORES FIJOS que tenían que
 * coincidir en dos lados, y esto no es un valor sino el cableado de tres funciones
 * importadas de `playback/engine.ts`. Mandarlo a `constants/`, que hoy sólo tiene datos, la
 * obligaría a importar el singleton del `AudioContext`. Precedente exacto en la misma
 * capa: `route-source.ts` declara `RUTA_VACIA` y `cell-text.ts` su `memo`, los dos consts
 * de módulo y ninguno en `constants/`.
 *
 * Vive acá y no en `engine-bridge.ts` porque éste es el único módulo de la capa que importa la API
 * de transporte del motor de verdad: la pura lo recibe por parámetro justamente para no tener que
 * hacerlo.
 */
export const MOTOR: MotorDeTransporte = {
  arrancar: startClock,
  frenar: stopClock,
  corriendo: clockRunning,
};

/**
 * Frenar el transporte sin alternarlo, para el Reset del shell.
 *
 * Es la única llamada al motor que no es ni reconciliación ni transporte: la orden
 * explícita de volver a cero. Se exporta desde acá en vez de dejar a `App.tsx`
 * importando `playback/engine.ts` por una sola línea.
 */
export function frenarTransporte(): void { stopClock(); }

/**
 * La otra mitad del Reset: devolver a cero la cola de DIBUJO.
 *
 * Va acá al lado de `frenarTransporte()` y por el mismo motivo, que es lo que este spec
 * arregla: el Reset tiene que hablarles a las dos colas, y éste es el único módulo de
 * de la UI por donde el shell le habla a las dos. Si `App.tsx` importara
 * `route-source.ts` para esta línea, la segunda cola se reiniciaría por un camino
 * distinto del de la primera — que es exactamente la asimetría que dejó al velo
 * dibujado sobre un tablero vacío.
 *
 * El porqué del reinicio —y por qué no lo hace `encolar` sola al ver una secuencia
 * vacía— está en el docblock de `reiniciar()` en `route-source.ts`.
 */
export function reiniciarRecorrido(): void { reiniciar(); }

interface Reconciliacion {
  /**
   * El recorrido ya derivado por el shell. No se re-deriva acá — ver el docblock del
   * módulo.
   */
  secuencia: Sequence;
  placed: readonly PlacedPiece[];
  tempo: number;
  clicks: boolean;
}

export function useMotorSincronizado({ secuencia, placed, tempo, clicks }: Reconciliacion): void {
  useEffect(()=>{ setBpm(tempo); }, [tempo]);
  useEffect(()=>{ setClicksAudible(clicks); }, [clicks]);

  // Reconcilia la secuencia del motor contra el tablero. `playing` salió de las
  // dependencias a propósito: la secuencia es función del tablero, no del
  // transporte, y quien corta o arranca el sonido es `togglePlay` llamando a
  // `stopClock`/`startClock`. El `clearJobs()` + `if (!playing) return` de antes
  // era la forma vieja de lograr lo mismo desde acá; con una sola llamada a
  // `setSequence` deja de hacer falta — colocar o quitar con el transporte
  // parado igual deja la secuencia lista para cuando arranque.
  //
  // `setSequence` no interrumpe el ciclo en curso: la secuencia
  // nueva entra recién al cerrar el circuito activo, así que reordenar el
  // tablero puede tardar hasta un ciclo completo en escucharse — 7,5 s con 8
  // piezas a 110 bpm. Es el precio de que el circuito se pueda reordenar entero
  // sin que el patrón salte a mitad de frase.
  //
  // La `Sequence` de `buildSequence` no es la que espera el motor: la proyección vive en
  // `engine-bridge.ts` y su docblock explica qué se cae y por qué. Acá sólo se la llama, y por
  // eso este efecto y el del desmontaje no pueden divergir.
  //
  // Las celdas no se pierden: siguen en la secuencia del dominio, y por eso este efecto
  // encola en DOS colas con la misma `secuencia`. Leerlas de `placed` —que es lo que
  // decía este comentario antes— no alcanza, y ese es justo el punto de
  // AC9: `placed` es el tablero de AHORA, o sea la ruta PENDIENTE, mientras que la
  // cabeza tiene que dibujar la que está sonando. Quien guarda el par es
  // `playback/route-source.ts`, y hace su swap cuando el motor reporta el suyo.
  //
  // Las dos colas se encolan desde acá y con la MISMA instancia a propósito: si cada una
  // llamara a su propio `buildSequence`, el dibujo y el sonido podrían quedar mirando
  // circuitos distintos sin que nada falle.
  useEffect(()=>{
    encolar(secuencia, placed);
    setSequence(proyectarAlMotor(secuencia));
    // `placed` esta en las dependencias aunque `secuencia` ya se derive de el, y no agrega
    // ni una corrida: `secuencia` es un `useMemo` sobre `[placed, regimen]`, asi que cada
    // vez que cambia `placed` cambia tambien `secuencia`. La implicacion va en UN solo
    // sentido —`secuencia` puede cambiar sola, si cambio el regimen— y
    // alcanza, porque lo que hay que descartar es una corrida de mas y no una de menos.
    // El comentario decia `[placed]` a secas, que dejo de ser cierto con el regimen.
    //
    // Y evita callar la regla de exhaustividad con un disable, que taparia el dia en que
    // alguien desacople las dos.
  }, [secuencia, placed]);

  // Al desmontar, frenar el reloj y vaciar la secuencia del motor. La limpieza
  // sigue siendo sincrónica: si fuera asincrónica, en StrictMode podría
  // ejecutarse después de que el efecto de arriba ya volvió a agendar, y
  // pisaría la secuencia nueva con una vacía. Se proyecta `buildSequence([], …)`
  // en vez de escribir el literal vacío a mano, para no meter la forma de un
  // dato de dominio en la capa de la UI.
  //
  // Va `DEFAULT_REGIMEN` y `GRID_DEFAULT` y no lo que hay en el estado, y es la unica
  // llamada del archivo donde fijarlos es correcto: con el tablero vacio `buildSequence`
  // corta en `n === 0` y devuelve la secuencia vacia sin mirar ni el regimen ni las
  // dimensiones, asi que las dos elecciones son inertes. Usar el del estado lo metería en las dependencias de un efecto que existe
  // SOLO para el desmontaje, y entonces la limpieza correria en cada cambio de regimen:
  // frenaria el reloj y vaciaria la secuencia, que es exactamente lo que AC7 prohibe.
  useEffect(()=> ()=>{
    stopClock();
    setSequence(proyectarAlMotor(buildSequence([], DEFAULT_REGIMEN, GRID_DEFAULT)));
  }, []);
}
