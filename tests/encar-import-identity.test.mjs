import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, copyFile, symlink, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createEncarImportIdentity } from "../scripts/lib/encar-import-identity.mjs";
import { buildEncarCar } from "../scripts/lib/encar-parser.mjs";

const { samples } = JSON.parse(readFileSync(new URL("./fixtures/encar-samples.json", import.meta.url)));
const source = samples.find((item) => item.key === "grandeur");
const car = (id, vehicle = 42662037) => ({ externalId: String(id), sourceVehicleId: vehicle });

test("обычное и dummy-объявление дают одну принятую машину в любом порядке", () => {
  const original = structuredClone(source.detail);
  original.vehicleId = 42662037;
  original.manage.dummy = false;
  original.manage.dummyVehicleId = 42665950;
  const dummy = structuredClone(original);
  dummy.manage.dummy = true;
  const pair = [original, dummy].map((detail) => buildEncarCar(detail, { usdPerKrw: 0.0007 }));
  assert.deepEqual(pair.map((item) => item.externalId), ["42662037", "42665950"]);
  for (const cars of [pair, [...pair].reverse()]) {
    const identity = createEncarImportIdentity();
    assert.equal(identity.claim(cars[0]), null);
    assert.equal(identity.claim(cars[1]), "duplicate Encar vehicle");
  }
});

test("после перезапуска активная машина блокирует новый номер объявления", () => {
  const identity = createEncarImportIdentity([
    { external_id: "42665950", source_vehicle_id: "42662037", status: "active" },
  ]);
  assert.equal(identity.claim(car(42662037)), "duplicate Encar vehicle");
  assert.equal(identity.claim(car(42665950)), "already in catalog");
});

test("рабочие потоки резервируют одну машину до записи пачки", async () => {
  const identity = createEncarImportIdentity();
  const results = await Promise.all([42662037, 42665950].map(async (id) => {
    await Promise.resolve();
    return identity.claim(car(id));
  }));
  assert.deepEqual(results, [null, "duplicate Encar vehicle"]);
});

test("одинаковые пробег, цена и фото не объединяют разные номера машин", () => {
  const identity = createEncarImportIdentity();
  for (const id of [42662037, 42662038]) {
    assert.equal(identity.claim({ ...car(id, id), mileage: 113255, sourcePrice: 20500000, image: "same.jpg" }), null);
  }
});

test("снятая машина не мешает принять новое объявление", () => {
  const identity = createEncarImportIdentity([
    { external_id: "42662037", source_vehicle_id: "42662037", status: "unavailable" },
  ]);
  assert.equal(identity.claim(car(42665950)), null);
  assert.equal(identity.claim(car(42665951)), "duplicate Encar vehicle");
});

test("ремонт существующей карточки сохраняет её номер и не принимается дважды", () => {
  const identity = createEncarImportIdentity([
    { external_id: "42665950", source_vehicle_id: "42662037", status: "active" },
  ]);
  identity.knownIds.delete("42665950"); // import --repair освобождает выбранные номера.
  const item = car(42665950);
  assert.equal(identity.claim(item, { repair: true }), null);
  assert.equal(item.externalId, "42665950");
  assert.equal(identity.claim(item, { repair: true }), "already in catalog");
});

test("файл без достоверного номера машины не обходит защиту от дублей", () => {
  const identity = createEncarImportIdentity();
  for (const value of [null, undefined, "", 0, -1, "invalid", 1.5, true, {}, []]) {
    assert.equal(identity.claim({ externalId: "42665950", sourceVehicleId: value }), "missing Encar vehicle identity");
  }
  assert.equal(identity.claim(car(42665950, "42662037")), null);
});

test("импорт из файла отбрасывает dummy до выгрузки, без сети и базы", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const isolated = await mkdtemp(path.join(tmpdir(), "encar-identity-"));
  try {
    await mkdir(path.join(isolated, "scripts"));
    await copyFile(path.join(root, "scripts/import-encar.mjs"), path.join(isolated, "scripts/import-encar.mjs"));
    for (const dir of ["src", "config", "scripts/lib"]) {
      await symlink(path.join(root, dir), path.join(isolated, dir));
    }
    const first = buildEncarCar(source.detail, { id: "42662037", usdPerKrw: 0.0007 });
    first.sourceVehicleId = 42662037;
    const duplicate = { ...first, id: "encar-42665950", externalId: "42665950" };
    const distinct = { ...first, id: "encar-42662038", externalId: "42662038", sourceVehicleId: 42662038 };
    await writeFile(path.join(isolated, "input.json"), JSON.stringify({ cars: [first, duplicate, distinct] }));
    await promisify(execFile)(process.execPath, ["scripts/import-encar.mjs", "--database=0", "--from=input.json", "--out=output.json", "--batch=1"], { cwd: isolated, timeout: 20000 });
    const exported = JSON.parse(await readFile(path.join(isolated, "output.json"), "utf8"));
    const report = JSON.parse(await readFile(path.join(isolated, "runtime/encar-import-report.json"), "utf8"));
    assert.deepEqual(exported.cars.map((item) => item.externalId), ["42662037", "42662038"]);
    assert.equal(report.rejectedByReason["duplicate Encar vehicle"], 1);
    assert.equal(report.requests, 0);
    assert.equal(report.databaseRows, null);
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
});
