import assert from "node:assert/strict";
import test from "node:test";
import { publicCarWithoutReport, reportGroupsForCar } from "../server/report-access.mjs";

test("public car keeps a report teaser without exposing report values", () => {
  const car = {
    id:"encar-123",
    technicalSpecs:{ count:3, groups:[
      { name:"Характеристики: Общие сведения", items:[{ name:"Год", value:"2025" }] },
      { name:"Осмотр: Двигатель", items:[{ name:"Состояние", value:"private engine result" }] },
      { name:"Страховая история", items:[{ name:"Случаи", value:"private insurance result" }] },
    ] },
  };
  const publicCar = publicCarWithoutReport(car);
  assert.deepEqual(publicCar.reportPreview, [{ name:"Осмотр: Двигатель" }, { name:"Страховая история" }]);
  assert.equal(publicCar.technicalSpecs.count, 1);
  assert.equal(publicCar.technicalSpecs.groups.length, 1);
  assert.ok(!JSON.stringify(publicCar).includes("private"));
  assert.equal(reportGroupsForCar(car).length, 2);
  assert.equal(car.technicalSpecs.groups.length, 3);
});
