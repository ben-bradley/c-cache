# Examples

## basic-cluster.mjs

Minimal multi-process demo using the default Map storage with `max` and `ttl`.

```bash
# from package root
npm run build
node examples/basic-cluster.mjs
```

`createCache()` runs at module scope in **every** process. On the primary that
registers the data store and installs IPC handlers; on workers it proxies
operations to the primary.

Each worker writes `worker:<index>` into the shared cache and reads `worker:0`,
showing that data is visible across processes.
