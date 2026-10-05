import type { z } from 'zod';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server';

/**
 * The contract of a tool: name, title, annotations, description, schema and handler
 * TOGETHER in one file.
 *
 * A new tool is one new file plus one line in `tools/index.ts`. The entry point does not
 * change and there is no `switch`.
 *
 * What is NOT here is a layer of argument validation: the SDK validates against the zod
 * schema before it calls the handler. That is the difference from the low-level server,
 * where a missing argument degrades to `""` and the tool answers something plausible
 * and does not fail.
 */

/**
 * `title` and `annotations` are OPTIONAL on purpose.
 *
 * With a required field, the commit that widens the contract does not compile until every tool
 * is done. The test in `__tests__/tools.test.ts` makes sure no tool skips them, including the
 * next tool someone adds.
 *
 * `ToolAnnotations` is IMPORTED from the SDK, not redeclared: a local copy would miss a hint the
 * protocol adds later.
 *
 * **`openWorldHint: false` on every tool, and the reason lives HERE once**: this server's set
 * of entities is CLOSED (twelve pieces, one `src/`), and that is what makes it reliable.
 */

/** What a tool file writes: the handler receives the arguments already typed. */
export interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  title?: string;
  annotations?: ToolAnnotations;
  inputSchema: S;
  run: (args: z.output<S>) => CallToolResult;
}

/** What the registry consumes: the schema is not in the type of the handler. */
export interface ToolDef {
  name: string;
  description: string;
  title?: string;
  annotations?: ToolAnnotations;
  inputSchema: z.ZodType;
  run: (args: unknown) => CallToolResult;
}

/**
 * Erases the schema's type parameter so every tool fits in one array.
 *
 * The `parse` inside is not a second layer of validation: the SDK has already validated
 * against THIS same schema. To parse again is how the code crosses the generic boundary
 * **with no cast that can lie**. It costs one parse of an object of four fields, once
 * for each call.
 */
export function defineTool<S extends z.ZodType>(spec: ToolSpec<S>): ToolDef {
  return {
    name: spec.name,
    description: spec.description,
    title: spec.title,
    annotations: spec.annotations,
    inputSchema: spec.inputSchema,
    run: (args: unknown) => spec.run(spec.inputSchema.parse(args)),
  };
}

/**
 * The normal answer: JSON serialized as text. It has no freshness stamp, because no
 * index can go stale.
 *
 * **Compact and not indented on purpose.** The consumer is an agent, and what is
 * measured is how many tokens the answer costs. An indent of two spaces puts each
 * coordinate of `cells` on its own line and triples the cost of the most repetitive part
 * of the output.
 */
export const json = (value: unknown): CallToolResult =>
  ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
