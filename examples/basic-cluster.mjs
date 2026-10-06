/**
 * Basic cluster example for c-cache.
 *
 * Run from the package root after building:
 *   node examples/basic-cluster.mjs
 *
 * Important: createCache() must run on the primary as well as on workers.
 * On the primary it registers the data store and installs IPC handlers.
 * On workers it proxies operations to the primary over cluster IPC.
 */
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { createCache } from '../dist/index.js';

const WORKERS = availableParallelism();

// Always create the cache in every process (primary + workers).
// Primary: owns storage + IPC handlers. Workers: proxy via IPC.
const cache = createCache({
  max: 1000,
  ttl: 60_000,
});

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} starting ${WORKERS} workers`);

  let remaining = WORKERS;
  for (let i = 0; i < WORKERS; i++) {
    const worker = cluster.fork({ WORKER_INDEX: String(i) });
    worker.on('message', (msg) => {
      if (msg === 'done') {
        remaining -= 1;
        if (remaining === 0) {
          console.log('All workers finished — shutting down');
          for (const id in cluster.workers) {
            cluster.workers[id]?.kill();
          }
          process.exit(0);
        }
      }
    });
  }
} else {
  const index = process.env.WORKER_INDEX ?? '?';

  // Each worker stores its own greeting
  const myKey = `worker:${index}`;
  await cache.set(myKey, { pid: process.pid, index });

  // Small delay so other workers have a chance to write
  await new Promise((r) => setTimeout(r, 100));

  // Read a key from worker 0 (every worker can see it)
  const fromZero = await cache.get('worker:0');
  console.log(
    `Worker ${index} (pid ${process.pid}) saw worker:0 =>`,
    fromZero ?? '(not yet)',
  );

  // Confirm our own key is present
  const mine = await cache.get(myKey);
  console.log(`Worker ${index} read back own key =>`, mine);

  process.send?.('done');
}
