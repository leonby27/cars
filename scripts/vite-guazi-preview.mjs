import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildGuaziPreviewCard, GUAZI_PREVIEW_ID, GUAZI_PREVIEW_PATH } from './lib/guazi-preview-card.mjs';

// Private captures stay in runtime: never copy them to public or to a production build.
export function guaziLocalPreview() {
  return {
    name: 'guazi-local-preview', apply: 'serve',
    configureServer(server) {
      const root = join(server.config.root, 'runtime/local-guazi-preview');
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const ids = [GUAZI_PREVIEW_ID, GUAZI_PREVIEW_PATH.split('/').at(-1)];
        const isCard = ids.some(id => pathname === `/api/cars/${id}` || pathname === `/data/cars/${id}.json`);
        const isAsset = request.url.startsWith('/__local-guazi/');
        if (!isCard && !isAsset) return next();
        response.setHeader('X-Robots-Tag', 'noindex, nofollow');
        response.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
        try {
          let body;
          if (isCard) {
            const [source, photos] = await Promise.all(['source.json', 'photos.json'].map(file => readFile(join(root, file), 'utf8').then(JSON.parse)));
            body = JSON.stringify(buildGuaziPreviewCard(source, photos));
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
          } else {
            const relative = pathname.slice('/__local-guazi/'.length);
            if (!/^photos\/y2ud7mtru4\/\d+-[a-f0-9]{16}\.(jpg|png|webp)$/.test(relative)) { response.writeHead(404); response.end(); return; }
            const [source, photos] = await Promise.all(['source.json', 'photos.json'].map(file => readFile(join(root, file), 'utf8').then(JSON.parse)));
            // Old inspection files may remain on disk, but only public gallery photos are served.
            if (!buildGuaziPreviewCard(source, photos).images.includes(pathname)) { response.writeHead(404); response.end(); return; }
            body = await readFile(join(root, relative));
            response.setHeader('Content-Type', `image/${relative.endsWith('.jpg') ? 'jpeg' : relative.split('.').at(-1)}`);
          }
          response.statusCode = 200;
          response.end(request.method === 'HEAD' ? undefined : body);
        } catch (error) {
          server.config.logger.warn(`Guazi local preview: ${error.message}`);
          response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'Локальная карточка Guazi недоступна' }));
        }
      });
    },
  };
}
