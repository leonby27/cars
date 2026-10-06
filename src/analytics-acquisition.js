// РСЯ определяется по явной метке сети. yclid сам по себе означает Директ,
// но не отличает рекламу на поиске от рекламы в сетях.
export const RSYA_TAG_PATTERN = '(^|[?&])(utm_source|utm_medium)=(rsya|rsy|yan|рся)(&|#|$)';
export const NETWORK_TAG_PATTERN = '(^|[?&])(utm_source_type|source_type)=context(&|#|$)';
export const YANDEX_AD_TAG_PATTERN = '(^|[?&])(yclid=[^&#]+|utm_source=(yandex|yandex-direct|yandex_direct|ya|direct)(&|#|$))';
export const PAID_TAG_PATTERN = '(^|[?&])((yclid|gclid|gbraid|wbraid)=[^&#]+|utm_medium=(cpc|ppc|cpm|cpa|paid|paid_search|paid_social|display|banner|search)(&|#|$)|utm_source=(yandex-direct|yandex_direct)(&|#|$))';

// Старый выбранный срез РСЯ переводим в общий платный срез.
export const analyticsAcquisitionKind = (value) => value === 'rsya' ? 'paid' : ['organic', 'paid'].includes(value) ? value : 'all';

const acquisitionParams = (path) => {
  try {
    const url = new URL(String(path || '/'), 'https://abcars.invalid');
    // Разбираем параметры отдельно: текст внутри одного значения не становится
    // новой меткой. Нормализуем регистр и кодирование, сохраняя исходный адрес.
    return new Map([...url.searchParams].map(([key, value]) => [key.toLowerCase(), value.trim().toLowerCase()]));
  } catch { return new Map(); }
};

export function analyticsAcquisition(path = '/') {
  const params = acquisitionParams(path);
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

// Без метки сети yclid позволяет назвать Директ, но не РСЯ. Это верно и для
// сохранённых заходов, где отсутствие Referer раньше давало «Прямой заход».
export function analyticsAdvertisingSource(path = '/') {
  const acquisition = analyticsAcquisition(path);
  if (acquisition === 'rsya') return 'rsya';
  const params = acquisitionParams(path);
  if (params.get('yclid') || (acquisition === 'paid'
    && /^(yandex|yandex-direct|yandex_direct|ya|direct)$/.test(params.get('utm_source') || ''))) return 'yandex-direct';
  return '';
}
