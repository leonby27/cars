// Preliminary planning allowances, not a partner quote. See docs/architecture/ru-pricing.md.
export const RU_PRICING = {
  version: 'ru-moscow-market-logistics-2026-10-01',
  destinationId: 'moscow', destinationName: 'Москва',
  rates: {date:'2026-10-01', RUB:1, USD:83.5588, EUR:94.8810, CNY:12.4732, KRW:0.0615127},
  paymentPercent: 0.02,
  serviceRub: 70000,
  clearanceRub: 100000,
  // Market sample and interpolation: docs/research/2026-10-01-ru-delivery-rates/rates.json.
  logistics: {
    china:{documentsInsuranceUsd:500,transitUsd:{border:225,west:500,center:600,east:700,far:825},deliveryUsd:1650,largeUsd:800},
    korea:{documentsUsd:450,transitUsd:{busan:100,south:150,seoul:225,other:225},seaUsd:1000,deliveryRub:182000,largeRub:40000},
  },
  china: {domesticRub:70000, deliveryRub:210000},
  korea: {domesticRub:85000, seaRub:85000, deliveryRub:225000},
};
