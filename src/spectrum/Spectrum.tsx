import { useEffect, useRef } from 'react';
import { iniciarEspectro } from './spectrum-loop.ts';

/**
 * Espectro de la senal que sale por el master, dibujado en un canvas.
 *
 * React monta el <canvas> y arranca/frena el loop; el dibujo es imperativo y NO
 * pasa por estado: 60 renders por segundo de React para pintar barras competirian
 * con el re-render del tablero sin darle nada a nadie. Lo unico que cruza la
 * frontera es la lectura del motor, que el loop hace por su cuenta.
 *
 * El cuerpo del loop vive en `spectrum-loop.ts` y no aca: mientras estuvo adentro de
 * este `.tsx` no se podia exportar —`react-refresh/only-export-components`— y por lo
 * tanto no se podia testear, igual que el de `Playhead`. Lo que queda es el montaje,
 * que es lo unico propio del componente.
 */
export default function Spectrum() {
  const ref = useRef<HTMLCanvasElement>(null);

  // El array de dependencias vacio es intencional: el loop se monta una vez y lee
  // del motor directamente, asi que no hay nada que re-suscribir cuando la app
  // re-renderiza.
  useEffect(() => iniciarEspectro(ref.current), []);

  // `h-full` y no `h-24`: el espectro vive en una franja flotante que
  // mide UNA celda de alto, o sea entre 73 y 180 px segun el viewport. Con los 96 px
  // clavados que tenia, al piso el canvas mas el encabezado pedian 132 contra los 73 de la
  // caja y la franja se comia una segunda fila del tablero — que es justo lo que la cuenta
  // de «que celdas tapa cada flotante» no puede permitirse.
  //
  // El `min-h-0` no es decorativo: este div es hijo de un `flex-col` y un item de flex no
  // se encoge por debajo de su contenido salvo que se lo digan. Sin el, el canvas empuja la
  // franja y la deja mas alta que su celda.
  //
  // Quien redibuja al cambiar de tamano es el `ResizeObserver` de `spectrum-loop.ts`, que
  // observa justamente a este nodo: derivar el alto de la caja es lo que hace que plegar,
  // desplegar y redimensionar la ventana disparen el redibujo sin una linea nueva.
  return (
    <div className="h-full min-h-0 w-full">
      <canvas ref={ref} className="block h-full w-full rounded-xl bg-slate-900" />
    </div>
  );
}
