import { describe, it, expect } from 'vitest';
import { modulesDoc } from '../modules.ts';

const TREE = new Map([
  ['src/App.tsx', "import { useState } from 'react';\nimport './styles/index.css';\nimport Board from './board/Board.tsx';\n"],
  ['src/board/Board.tsx', "import { place } from './placement.ts';\nimport type { Cell } from '../pieces/pieces.ts';\n"],
  ['src/board/placement.ts', "import { SHAPES } from '../pieces/pieces.ts';\n// import { x } from './Board.tsx';\n"],
  ['src/pieces/pieces.ts', 'export const SHAPES = {};\n'],
  ['src/pieces/__tests__/pieces.test.ts', "import { SHAPES } from '../pieces.ts';\n"],
  ['src/vite-env.d.ts', '/// <reference types="vite/client" />\n'],
  ['specs/board/board.md', '# Board\n'],
]);

const blocks = (doc: string) => new Map(doc.split('\n## ').slice(1).map(part => {
  const [title, ...rest] = part.split('\n');
  return [title, rest.filter(line => line.startsWith('  ') && !line.includes('classDef'))];
}));

describe('modulesDoc', () => {
  const doc = modulesDoc(TREE) as string;

  it('a tree with no module of `src/` gives no document', () => {
    expect(modulesDoc(new Map([['specs/board/board.md', '# Board\n'], ['src/a/__tests__/a.test.ts', '']]))).toBeNull();
  });

  it('the overview has one node for each folder and one arrow for each pair that imports', () => {
    expect(blocks(doc).get('Capabilities')).toEqual([
      '  board["board"]', '  pieces["pieces"]', '  shell["shell"]',
      '  board --> pieces', '  shell --> board',
    ]);
  });

  it('a capability shows its files, marks a component, and ends an outside import at the capability', () => {
    expect(blocks(doc).get('board')).toEqual([
      '  Board_tsx["Board.tsx"]:::component', '  pieces[/"pieces"/]', '  placement_ts["placement.ts"]',
      '  Board_tsx --> pieces', '  Board_tsx --> placement_ts', '  placement_ts --> pieces',
    ]);
  });

  it('a file with no import is a node with no arrow', () => {
    expect(blocks(doc).get('pieces')).toEqual(['  pieces_ts["pieces.ts"]']);
  });

  it('the files at the root of `src/` are the shell', () => {
    expect(blocks(doc).get('shell')).toEqual(['  App_tsx["App.tsx"]:::component', '  board[/"board"/]', '  App_tsx --> board']);
  });

  it('a test, a declaration file, a package, a stylesheet and a commented import are not in the map', () => {
    expect(doc).not.toMatch(/_test|vite|react|css|placement_ts --> Board/);
  });

  it('the order of the tree does not change the document', () => {
    expect(modulesDoc(new Map([...TREE].reverse()))).toBe(doc);
  });
});
