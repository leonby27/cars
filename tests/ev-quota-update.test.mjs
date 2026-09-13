import test from "node:test";
import assert from "node:assert/strict";
import { readEvQuotaReport } from "../scripts/ev-quota-report.mjs";

test("recognizes that the personal EV quota is exhausted without a numeric remainder", () => {
  const report = readEvQuotaReport({
    date: "2026-09-05",
    text: "Количественная квота по беспошлинному ввозу физическими лицами электромобилей ИСЧЕРПАНА. При дальнейшем декларировании уплачивается пошлина 15%.",
  });

  assert.deepEqual(report, { date: "2026-09-05", personal: 0, business: null });
});

test("does not mistake the VAT note for personal-quota exhaustion", () => {
  const report = readEvQuotaReport({
    date: "2026-07-24",
    text: "Количественная квота по беспошлинному ввозу юридическими лицами электромобилей ИСЧЕРПАНА. Исчерпание квоты не ограничивает возможность применения физическими лицами освобождения от НДС.",
  });

  assert.deepEqual(report, { date: "2026-07-24", personal: null, business: 0 });
});
