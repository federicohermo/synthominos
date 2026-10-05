import type { ReadResourceResult, ResourceMetadata } from '@modelcontextprotocol/server';

/** `config` is the bare `ResourceMetadata`: the excess property check rejects a `cacheHint`. */
export interface ResourceDef {
  name: string;
  uri: string;
  config: ResourceMetadata;
  read: (uri: URL) => ReadResourceResult;
}

export const jsonResource = (uri: URL, value: unknown): ReadResourceResult =>
  ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(value) }] });
