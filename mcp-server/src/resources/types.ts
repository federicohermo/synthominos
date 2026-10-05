import type { ReadResourceResult, ResourceMetadata } from '@modelcontextprotocol/server';

/**
 * The contract of a resource: name, URI, metadata and handler TOGETHER in one file, as
 * in `tools/types.ts`.
 *
 * A new resource is one new file plus one line in `resources/index.ts`. The entry point
 * does not change and there is no `switch`.
 *
 * The difference from a tool is one of INTENT, not of mechanics: a tool is a question
 * with arguments, and a resource is content that the client can fetch whole and attach
 * to the context. That is why `read` takes no arguments: the URI is fixed.
 */

/**
 * `config` has the BARE type `ResourceMetadata`, not `ResourceMetadata & { cacheHint }`,
 * which is what `registerResource` accepts.
 *
 * **This is not an omission: it makes the excess property check reject a `cacheHint`
 * written in a resource.**
 *
 * The reason is the whole property of this server. It is reliable because nothing can go
 * stale: there is no build, no persisted index, and the answer comes from the code of
 * HEAD at the time of the query. A cached answer is the exact opposite, and it would
 * fail silently: the number in the answer would still look plausible. If a cache is ever
 * needed, the change shows in THIS type and needs an explanation.
 *
 * `read` is declared with one parameter and returns a plain `ReadResourceResult`. It
 * does not reuse the `ReadResourceCallback` of the SDK, which also takes a
 * `ServerContext` and allows promises and `InputRequiredResult`. It is the same choice
 * as `ToolDef.run`, for the same reason: nothing here is asynchronous and nothing asks
 * the client. A narrower signature is assignable to the wide one, so the registration
 * compiles.
 */
export interface ResourceDef {
  name: string;
  uri: string;
  config: ResourceMetadata;
  read: (uri: URL) => ReadResourceResult;
}

/**
 * The normal answer of a resource: JSON serialized as text.
 *
 * It is the `json` of the tools in the envelope that the other side of the protocol
 * asks for: a resource answers `contents` and not `content`, and each entry repeats the
 * URI of the request.
 *
 * The URI comes from the parameter and not from the constant of the resource: it is the
 * one the client asked for, and to return a different one is to answer a question nobody
 * asked.
 *
 * Compact and not indented, for the same reason as in the tools: the consumer is an
 * agent, and what is measured is how many tokens the answer costs.
 */
export const jsonResource = (uri: URL, value: unknown): ReadResourceResult =>
  ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(value) }] });
