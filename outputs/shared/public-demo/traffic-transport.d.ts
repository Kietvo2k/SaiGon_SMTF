export type RequestInput = { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; token?: string; signal?: AbortSignal };
export type EventEnvelope = { event: string; t: string; seq: number; data: unknown };
export interface TrafficTransport {
  request<T>(input: RequestInput): Promise<T>;
  subscribe(listener: (message: EventEnvelope) => void, token?: string): () => void;
  readMedia(path: string, options?: { token?: string; signal?: AbortSignal }): Promise<Blob>;
}
export class ApiError extends Error { readonly status: number; readonly code: string; constructor(status: number, code: string, message: string); }
export function createLocalTrafficTransport(options: { apiBase: string; wsUrl?: string }): TrafficTransport;
export function createPublicTrafficTransport(options: { buildId: string }): TrafficTransport;
export function createTrafficTransport(options: { mode: 'local'; apiBase: string; wsUrl?: string } | { mode: 'public'; buildId: string }): TrafficTransport;
