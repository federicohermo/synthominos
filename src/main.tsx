import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App.tsx';

// El arranque vive aparte del componente raiz: este archivo toca el DOM y conoce
// #root, mientras que App.tsx no sabe nada de eso. Fusionarlos ademas costaria una
// recarga completa en cada edicion de la UI: un modulo con efecto de arranque y
// sin export de componente no es frontera de Fast Refresh.
//
// Con `jsx: "react-jsx"` el import default de React no hace falta.
//
// El `!` se queda, y es una de las DOS que hay en codigo de produccion —la
// otra es el `queue.shift()!` del BFS de `pieces/invariants.ts`, anotada igual—: es el
// idiom de la plantilla de Vite sobre un `#root` que el propio `index.html` garantiza,
// o sea el caso donde el dato que TypeScript no puede ver esta escrito dos archivos mas
// alla y no en la cabeza de nadie. Va anotado porque sin esto la proxima lectura lo
// cuenta como deuda otra vez — que es literalmente como llego a la lista.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
