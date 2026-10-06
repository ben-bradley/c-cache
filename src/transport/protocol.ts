/** Namespace used on every IPC message so we don't collide with other libraries. */
export const MSG_TYPE = 'c-cache' as const;
export const REPLY_TYPE = 'c-cache-reply' as const;

/** Cache operations forwarded over IPC. */
export type Op = 'get' | 'set' | 'delete' | 'has' | 'clear';

/** Worker → primary request envelope. */
export interface RequestMessage {
  type: typeof MSG_TYPE;
  id: string;
  op: Op;
  key?: unknown;
  value?: unknown;
}

/** Primary → worker reply envelope. */
export interface ReplyMessage {
  type: typeof REPLY_TYPE;
  id: string;
  result?: unknown;
  error?: string;
}

/** Pending request waiting for a reply from the primary. */
export interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
