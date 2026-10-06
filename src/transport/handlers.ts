import cluster from 'node:cluster';
import type { Worker } from 'node:cluster';
import { MSG_TYPE, REPLY_TYPE, type RequestMessage, type ReplyMessage } from './protocol.js';
import { state } from './state.js';
import { isWorker } from './is-worker.js';

/**
 * Handle an incoming request on the primary and send a reply.
 */
export async function handleRequest(
  msg: RequestMessage,
  reply: (r: ReplyMessage) => void,
): Promise<void> {
  const storage = state.storage;
  if (!storage) {
    reply({
      type: REPLY_TYPE,
      id: msg.id,
      error: 'c-cache: no storage registered on primary',
    });
    return;
  }

  try {
    let result: unknown;

    switch (msg.op) {
      case 'get':
        result = await storage.get(msg.key);
        break;
      case 'set':
        await storage.set(msg.key, msg.value);
        result = undefined;
        break;
      case 'delete':
        result = await storage.delete(msg.key);
        break;
      case 'has':
        result = await storage.has(msg.key);
        break;
      case 'clear':
        await storage.clear();
        result = undefined;
        break;
      default: {
        const exhaustive: never = msg.op;
        reply({
          type: REPLY_TYPE,
          id: msg.id,
          error: `Unknown op: ${String(exhaustive)}`,
        });
        return;
      }
    }

    reply({ type: REPLY_TYPE, id: msg.id, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reply({ type: REPLY_TYPE, id: msg.id, error: message });
  }
}

/**
 * Install process-wide IPC handlers exactly once.
 */
export function ensureInitialized(): void {
  if (state.initialized) return;
  state.initialized = true;

  if (isWorker()) {
    // Worker: listen for replies from the primary
    process.on('message', (msg: unknown) => {
      if (!msg || typeof msg !== 'object') return;
      const m = msg as ReplyMessage;
      if (m.type !== REPLY_TYPE) return;

      const pending = state.pending.get(m.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      state.pending.delete(m.id);
      if (m.error) {
        pending.reject(new Error(m.error));
      } else {
        pending.resolve(m.result);
      }
    });
  } else if (cluster.isPrimary) {
    // Primary: listen for requests from every worker (including ones that fork later)
    const onWorkerMessage = (worker: Worker, msg: unknown): void => {
      if (!msg || typeof msg !== 'object') return;
      const m = msg as RequestMessage;
      if (m.type !== MSG_TYPE) return;

      void handleRequest(m, (replyMsg) => {
        if (worker.isConnected()) {
          worker.send(replyMsg);
        }
      });
    };

    // Existing workers
    for (const id in cluster.workers) {
      const w = cluster.workers[id];
      if (w) w.on('message', (msg) => onWorkerMessage(w, msg));
    }

    // Future workers
    cluster.on('fork', (worker) => {
      worker.on('message', (msg) => onWorkerMessage(worker, msg));
    });
  }
  // When cluster is not used at all we simply use the local storage — no listeners needed.
}
