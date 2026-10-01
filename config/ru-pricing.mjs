// Preliminary planning allowances, not a partner quote. See docs/architecture/ru-pricing.md.
export const RU_PRICING = {
  version: 'ru-moscow-preliminary-2026-10-01',
  destinationId: 'moscow', destinationName: 'Москва',
  rates: {date:'2026-10-01', RUB:1, USD:83.5588, EUR:94.8810, CNY:12.4732, KRW:0.0615127},
  paymentPercent: 0.02,
  serviceRub: 70000,
  clearanceRub: 100000,
  china: {domesticRub:70000, deliveryRub:210000},
  korea: {domesticRub:85000, seaRub:85000, deliveryRub:225000},
};
