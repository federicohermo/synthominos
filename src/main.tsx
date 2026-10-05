import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App.tsx';

// The startup lives apart from the root component: this file touches the DOM and knows
// #root, and App.tsx knows neither. One merged file also costs a full reload on each
// edit of the UI: a module with a startup effect and no component export is not a
// Fast Refresh boundary.
//
// With `jsx: "react-jsx"` the default import of React is not necessary.
//
// The `!` stays. Production code has TWO: the other is the `queue.shift()!` of the BFS
// in `pieces/invariants.ts`, with the same note. It is the idiom of the Vite template on
// a `#root` that `index.html` guarantees: the fact that TypeScript cannot see is written
// two files away, not in the head of a person. The note is here because without it the
// next reader counts the `!` as debt.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
