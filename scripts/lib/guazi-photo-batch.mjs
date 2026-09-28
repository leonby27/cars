import {limiter, mapLimit} from './guazi-pilot-io.mjs';

export const GUAZI_WARM_PHOTOS = 2;
export const GUAZI_PHOTO_CONCURRENCY = 8;

// Several cars feed one bounded image queue. A slow car does not idle the pool.
export async function warmPhotoBatch(names, {readCar, download, onComplete, onError, checkDisk, shouldStop = () => false, concurrency = GUAZI_PHOTO_CONCURRENCY}) {
  const schedule = limiter(concurrency);
  let failure;
  await mapLimit(names, concurrency, async name => {
    if (failure || shouldStop()) return;
    try {
      await checkDisk();
      const car = await readCar(name);
      const results = await Promise.allSettled(car.images.slice(0, GUAZI_WARM_PHOTOS).map(url => schedule(async () => {
        if (failure || shouldStop()) return false;
        try { await download(url, car); return true; }
        catch (error) {
          failure ||= error;
          await onError(error, car);
          return false;
        }
      })));
      const rejected = results.find(result => result.status === 'rejected');
      if (rejected) failure ||= rejected.reason;
      if (results.every(result => result.status === 'fulfilled' && result.value)) await onComplete(name, car);
    } catch (error) { failure ||= error; }
  });
  if (failure) throw failure;
}
