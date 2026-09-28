// Где лежит копия кадра Guazi. Общее для сервера сайта и службы хранения фото:
// служба проверяет, есть ли кадр на диске, не скачивая его заново.
import path from 'node:path';
import {createHash} from 'node:crypto';
export const imageCacheRoot=()=>path.resolve(process.env.GUAZI_IMAGE_CACHE_DIR||'runtime/guazi-image-cache');
export const guaziImageCacheFile=href=>path.join(imageCacheRoot(),createHash('sha256').update(href).digest('hex'));
