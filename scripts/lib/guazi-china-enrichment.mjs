import {getText, limiter} from './guazi-pilot-io.mjs';
import {matchChina, parseChinaMarkdown} from './guazi-pilot-data.mjs';

// Serialize optional requests so only one probe can reach a blocked section.
// The cooldown lives in the bulk checkpoint and survives process restarts.
export function chinaEnricher({state, index, textLoader = getText, event, save, now = Date.now, cooldownMs = 30 * 60 * 1000}) {
  const schedule = limiter(1);
  return (card, context = {}) => schedule(async () => {
    if (card.china?.status === 'matched') return;
    const urls = index.entries[card.clueId] || [];
    if (urls.length !== 1) {
      card.china = {status: urls.length ? 'ambiguous' : index.complete ? 'not_found' : 'index_incomplete'};
      return;
    }
    const unavailable = () => ({status: 'temporarily_unavailable', reason: 'access_check', retryAfter: state.chinaPausedUntil});
    if (Date.parse(state.chinaPausedUntil) > now()) { card.china = unavailable(); return; }
    try {
      card.china = matchChina(card, parseChinaMarkdown(await textLoader(urls[0], 'markdown'), urls[0], card.clueId));
    } catch (error) {
      if (error.code === 'CHINA_ACCESS_CHECK') {
        state.chinaPausedUntil = new Date(now() + cooldownMs).toISOString();
        card.china = unavailable();
        await save();
        await event({event: 'warning', ...context, reason: 'china_access_check', retryAfter: state.chinaPausedUntil, message: 'Optional Chinese descriptions paused for 30 minutes; export cards continue'});
      } else {
        card.china = {status: 'error'};
        await event({event: 'warning', ...context, reason: 'china_fetch_failed', message: error.message.split('\n')[0]});
      }
      return;
    }
    if (state.chinaPausedUntil) {
      delete state.chinaPausedUntil;
      await save();
      await event({event: 'china_access_restored', ...context});
    }
  });
}
