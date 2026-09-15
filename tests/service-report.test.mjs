import assert from "node:assert/strict";
import test from "node:test";

import { SERVICE_REPORT_EXAMPLE } from "../src/service-copy.js";

test("пример отчёта сохраняет полный список и валидные связи с фотографиями", () => {
  const report = SERVICE_REPORT_EXAMPLE;
  const photos = report.photoGroups.flatMap((group) => group.photos);
  const photoIds = photos.map((photo) => photo.id);
  const knownPhotoIds = new Set(photoIds);
  const pointIds = new Set();
  const allowedStatuses = new Set(["clear", "attention", "limited", "not-applicable"]);

  assert.equal(photos.length, 17);
  assert.equal(knownPhotoIds.size, photoIds.length, "id фотографий должны быть уникальными");
  assert.equal(report.document?.title, undefined, "служебный заголовок отчёта не должен выводиться");
  assert.ok(report.facts.every((fact) => fact.id !== "body"), "тип кузова не должен выводиться в примере отчёта");
  assert.ok(report.risks.every((risk) => !risk.note), "карточки рисков должны оставаться без вторичных описаний");
  assert.deepEqual(report.inspectionSections.map((section) => section.points.length), [70, 31, 23]);

  for (const section of report.inspectionSections) {
    assert.ok(section.id && section.title);
    for (const point of section.points) {
      assert.ok(point.id && point.label);
      assert.ok(!pointIds.has(point.id), `повторяется id пункта ${point.id}`);
      assert.ok(allowedStatuses.has(point.status), `неизвестный статус ${point.status}`);
      pointIds.add(point.id);
      for (const photoId of point.photoIds || []) {
        assert.ok(knownPhotoIds.has(photoId), `пункт ${point.id} ссылается на неизвестное фото ${photoId}`);
      }
    }
  }

  const accidentPoints = new Map(report.inspectionSections[0].points.map((point) => [point.id, point]));
  assert.equal(accidentPoints.get("roof-panel")?.status, "attention");
  assert.match(accidentPoints.get("roof-panel")?.detail || "", /не менее 15 см/);
  assert.deepEqual(accidentPoints.get("roof-panel")?.photoIds, ["roof-repair-1", "roof-repair-2", "roof-repair-3"]);
  assert.equal(accidentPoints.get("left-rear-fender")?.status, "attention");
  assert.match(accidentPoints.get("left-rear-fender")?.detail || "", /до 20 см/);
  assert.deepEqual(accidentPoints.get("left-rear-fender")?.photoIds, ["left-rear-fender-repair"]);
  assert.equal(report.inspectionSections[0].points.filter((point) => point.status === "attention").length, 2);
});
