// РСЯ определяется по явной метке сети. yclid сам по себе означает Директ,
// но не отличает рекламу на поиске от рекламы в сетях.
export const RSYA_TAG_PATTERN = '(^|[?&])(utm_source|utm_medium)=(rsya|rsy|yan|рся)(&|#|$)';
export const NETWORK_TAG_PATTERN = '(^|[?&])(utm_source_type|source_type)=context(&|#|$)';
export const YANDEX_AD_TAG_PATTERN = '(^|[?&])(yclid=[^&#]+|utm_source=(yandex|yandex-direct|yandex_direct|ya|direct)(&|#|$))';
export const PAID_TAG_PATTERN = '(^|[?&])((yclid|gclid|gbraid|wbraid)=[^&#]+|utm_medium=(cpc|ppc|cpm|cpa|paid|paid_search|paid_social|display|banner|search)(&|#|$)|utm_source=(yandex-direct|yandex_direct)(&|#|$))';

export const analyticsAcquisitionKind = (value) => ['organic', 'rsya'].includes(value) ? value : 'all';

export function analyticsAcquisition(path = '/') {
  let params;
  try {
    const url = new URL(String(path || '/'), 'https://abcars.invalid');
    // Разбираем параметры отдельно: текст внутри одного значения не становится
    // новой меткой. Нормализуем регистр и кодирование, сохраняя исходный адрес.
    params = new Map([...url.searchParams].map(([key, value]) => [key.toLowerCase(), value.trim().toLowerCase()]));
  } catch { return 'organic'; }
  const source = params.get('utm_source') || '';
  const medium = params.get('utm_medium') || '';
  if ([source, medium].some((value) => /^(rsya|rsy|yan|рся)$/.test(value))) return 'rsya';
  const yandex = Boolean(params.get('yclid')) || /^(yandex|yandex-direct|yandex_direct|ya|direct)$/.test(source);
  if (yandex && [params.get('utm_source_type'), params.get('source_type')].includes('context')) return 'rsya';
  const paid = ['yclid', 'gclid', 'gbraid', 'wbraid'].some((key) => Boolean(params.get(key)))
    || /^(cpc|ppc|cpm|cpa|paid|paid_search|paid_social|display|banner|search)$/.test(medium)
    || /^(yandex-direct|yandex_direct)$/.test(source);
  return paid ? 'paid' : 'organic';
}
