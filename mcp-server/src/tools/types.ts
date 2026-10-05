import type { z } from 'zod';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server';

export interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  title?: string;
  annotations?: ToolAnnotations;
  inputSchema: S;
  run: (args: z.output<S>) => CallToolResult;
}

export interface ToolDef {
  name: string;
  description: string;
  title?: string;
  annotations?: ToolAnnotations;
  inputSchema: z.ZodType;
  run: (args: unknown) => CallToolResult;
}

/** The `parse` crosses the generic boundary with no cast: the SDK validated against this schema before. */
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

/** Compact: an indent triples the token cost of `cells`. */
export const json = (value: unknown): CallToolResult =>
  ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
