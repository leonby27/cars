import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

// SSR-проверки не должны очищать кэш зависимостей работающего dev-сервера.
export async function createTestServer(options) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'abcars-vite-test-'));
  try {
    const server = await createServer({ ...options, cacheDir, server:{ ...options.server, hmr:false } });
    const close = server.close.bind(server);
    server.close = async () => {
      try { await close(); }
      finally { await rm(cacheDir, { recursive:true, force:true }); }
    };
    return server;
  } catch (error) {
    await rm(cacheDir, { recursive:true, force:true });
    throw error;
  }
}
