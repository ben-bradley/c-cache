import cluster from 'node:cluster';

/**
 * True when this process is a cluster worker.
 * When false we treat the process as the owner of the authoritative store
 * (either the primary, or a plain single-process run).
 */
export function isWorker(): boolean {
  return cluster.isWorker === true;
}
