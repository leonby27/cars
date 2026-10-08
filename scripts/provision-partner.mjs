#!/usr/bin/env node
// The owner supplies passwords on stdin; no registration endpoint or client secret.
import { readFileSync } from "node:fs";
import { pool, DATABASE_URL } from "../server/db.mjs";
import { provisionPartner } from "../server/partners.mjs";
import crypto from "node:crypto";
const [login, name = "Партнёр abcars", mode] = process.argv.slice(2);
try {
  const password = readFileSync(0, "utf8").trimEnd();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const partner = await provisionPartner({ login, name, password }, { db:client, replace:true });
    if (mode === "--demo") {
      const url = new URL(DATABASE_URL);
      if (!["localhost","127.0.0.1"].includes(url.hostname) || url.port !== "54329") throw new Error("Demo requests are local only");
      for (const [key, title, status, comment] of [["local-partner-demo-1","Zeekr 001 · подбор автомобиля","new","Нужен автомобиль с пробегом до 30 000 км. Уточнить доступные комплектации и сроки доставки."],["local-partner-demo-2","Kia Sorento · проверка наличия","in_progress","Проверить наличие и подготовить предложение по доставке."]]) {
        const snapshot = { kind:"custom_search", createdAt:new Date().toISOString(), customer:{name:"Демонстрационный клиент",phone:"",email:"",telegram:"",city:"Минск"}, car:{title,id:null}, comment, filters:null };
        await client.query(`INSERT INTO partner_requests(id,lead_key,partner_id,snapshot,status,demo,owner_note)
          VALUES($1,$2,$3,$4,$5,true,'Пример для просмотра кабинета') ON CONFLICT(lead_key) DO NOTHING`,[crypto.randomUUID(),key,partner.id,snapshot,status]);
      }
    }
    await client.query("COMMIT");
    console.log(`Partner account ready: ${partner.login}`);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
} finally { await pool.end(); }
