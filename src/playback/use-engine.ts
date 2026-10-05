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

export const MOTOR: MotorDeTransporte = {
  arrancar: startClock,
  frenar: stopClock,
  corriendo: clockRunning,
};

export function frenarTransporte(): void { stopClock(); }

export function reiniciarRecorrido(): void { reiniciar(); }

interface Reconciliacion {
  /** The shell derives it: `encolar` and `setSequence` must get the same instance. */
  secuencia: Sequence;
  placed: readonly PlacedPiece[];
  tempo: number;
  clicks: boolean;
}

export function useMotorSincronizado({ secuencia, placed, tempo, clicks }: Reconciliacion): void {
  useEffect(()=>{ setBpm(tempo); }, [tempo]);
  useEffect(()=>{ setClicksAudible(clicks); }, [clicks]);

  useEffect(()=>{
    encolar(secuencia, placed);
    setSequence(proyectarAlMotor(secuencia));
  }, [secuencia, placed]);

  // A synchronous cleanup: in StrictMode an asynchronous one can overwrite the new sequence.
  // Fixed values and not the state: as dependencies, a regime change would run this cleanup
  // and stop the clock.
  useEffect(()=> ()=>{
    stopClock();
    setSequence(proyectarAlMotor(buildSequence([], DEFAULT_REGIMEN, GRID_DEFAULT)));
  }, []);
}
