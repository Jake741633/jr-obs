export interface ConnectedQuoteScope { title: string; summary: string; scope: string[]; questions: string[]; exclusions: string[]; }
export function parseQuoteScope(value: unknown): ConnectedQuoteScope | null;
export function quoteScopeNotes(value: ConnectedQuoteScope): string;
export const quoteScopeSchema: Record<string, unknown>;
