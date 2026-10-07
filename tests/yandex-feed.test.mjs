import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

// Фид для Яндекса стоит в цепочке сборки. На рабочей машине сборка идёт без базы,
// и скрипт обязан тихо ничего не делать: `.env.local` мог бы указывать на боевую базу.
const run = promisify(execFile);
const script = new URL("../scripts/yandex-feed.mjs", import.meta.url).pathname;

test("без разрешения читать базу фид не собирается и ничего не пишет", async () => {
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "feed-")), "yandex-cars.xml");
  const { stdout } = await run(process.execPath, [script, `--out=${out}`], { env: { ...process.env, SEO_CARS_FROM_DB: "", ABCARS_YANDEX_FEED_ENABLED:"1" } });
  assert.match(stdout, /фид не собран/);
  assert.equal(existsSync(out), false);
});

test("disabled feed removes stale variants without DB access or reuse", async () => {
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "feed-disabled-")), "yandex-cars.xml");
  for (const suffix of ["", ".gz", ".br", ".meta.json"]) writeFileSync(out+suffix,"old private feed");
  const {stdout} = await run(process.execPath,[script,"--db",`--out=${out}`],{env:{...process.env,ABCARS_YANDEX_FEED_ENABLED:"0",ABCARS_REUSE_FEED:"1",SEO_CARS_FROM_DB:"1",DATABASE_URL:"postgres://invalid:invalid@127.0.0.1:1/no_database"}});
  assert.match(stdout,/публикация отключена/);
  for (const suffix of ["", ".gz", ".br", ".meta.json"]) assert.equal(existsSync(out+suffix),false);
});

test("XML фида и описание используют топливо источника без угадывания", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "feed-fuel-"));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  const out = path.join(dir, "cars.xml");
  const fuelRows = [
    { powertrain:"ДВС", source_fuel_type:"Diesel", fuel_type:"Бензин" },
    { powertrain:"ДВС", source_fuel_type:"Gasoline", fuel_type:"Дизель" },
    { powertrain:"ДВС", source_fuel_type:null, fuel_type:null },
    { powertrain:"Электромобиль", source_fuel_type:"Gasoline", fuel_type:"Бензин" },
    { powertrain:"Гибрид", source_fuel_type:"Gasoline", fuel_type:"Бензин" },
  ];
  const rows = fuelRows.map((fuel, index) => ({
    id:`encar-${10000 + index}`, source:"Encar", brand:"Kia", model:"Carnival", model_year:2023,
    mileage_km:20000, estimated_total_usd:23000, body_type:"Минивэн",
    photos:["https://example.com/car.jpg"], ...fuel,
  }));
  const db = pathToFileURL(path.join(dir, "db.mjs")).href;
  writeFileSync(path.join(dir, "db.mjs"), `export const pool = {
    async query(sql) {
      if (sql.includes('FROM catalog_listings')) {
        if (!sql.includes("l.source_payload->>'sourceFuelType'")) throw new Error('Missing original fuel field');
        return { rows:${JSON.stringify(rows)} };
      }
      return { rows:[{ revision:'fixture' }] };
    }, async end() {}
  };`);
  const loader = path.join(dir, "loader.mjs");
  writeFileSync(loader, `export async function resolve(specifier, context, next) {
    if (specifier === '../server/db.mjs' && context.parentURL.endsWith('/scripts/yandex-feed.mjs'))
      return { url:${JSON.stringify(db)}, shortCircuit:true };
    return next(specifier, context);
  }`);
  await run(process.execPath, ["--loader", loader, script, "--db", `--out=${out}`], { env:{
    ...process.env, ABCARS_YANDEX_FEED_ENABLED:"1", ABCARS_REUSE_FEED:"0",
    DATABASE_URL:"postgres://invalid:invalid@127.0.0.1:1/no_database",
  } });
  const xml = readFileSync(out, "utf8");
  const offer = (index) => xml.match(new RegExp(`<offer id="car-kr-${10000 + index}">([\\s\\S]*?)<\\/offer>`))?.[1];
  for (let index = 0; index < rows.length; index++) assert.ok(offer(index), `Нет предложения ${index}`);
  assert.match(offer(0), /<param name="Топливо">Дизель<\/param>/);
  assert.match(offer(0), /<description>[^<]*дизель\./);
  assert.doesNotMatch(offer(0), /бензин/i);
  assert.match(offer(1), /<param name="Топливо">Бензин<\/param>/);
  assert.match(offer(1), /<description>[^<]*бензин\./);
  assert.doesNotMatch(offer(2), /<param name="Топливо">|бензин/i);
  assert.match(offer(3), /<param name="Топливо">Электро<\/param>/);
  assert.match(offer(4), /<param name="Топливо">Гибрид<\/param>/);
});
