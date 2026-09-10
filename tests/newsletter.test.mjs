import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NEWSLETTER_CONSENT_VERSION, normalizeNewsletterEmail, subscribeToNewsletter, validNewsletterEmail } from "../server/newsletter.mjs";
import worker from "../worker/index.js";

test("email подписки приводится к одному виду и проверяется", () => {
  assert.equal(normalizeNewsletterEmail("  Reader@Example.COM "), "reader@example.com");
  assert.equal(validNewsletterEmail("reader@example.com"), true);
  for (const value of ["", "reader", "reader@", "@example.com", `${"a".repeat(150)}@example.com`]) {
    assert.equal(validNewsletterEmail(value), false, value);
  }
});

test("подписка хранит адрес отдельно и повторно активирует ту же запись", async () => {
  let call;
  const database = {
    async query(sql, values) {
      call = { sql, values };
      return { rows:[{ email:values[0], status:"active" }] };
    },
  };
  const result = await subscribeToNewsletter(" Reader@Example.COM ", database);
  assert.deepEqual(result, { email:"reader@example.com", status:"active" });
  assert.deepEqual(call.values, ["reader@example.com", NEWSLETTER_CONSENT_VERSION]);
  assert.match(call.sql, /INSERT INTO newsletter_subscribers/);
  assert.match(call.sql, /ON CONFLICT \(\(lower\(email\)\)\) DO UPDATE/);
  assert.match(call.sql, /unsubscribed_at=NULL/);
});

test("Sites сохраняет email только после явного согласия со своей страницы", async () => {
  const executed = [];
  const DB = {
    prepare(sql) {
      const statement = {
        values:[],
        bind(...values) { this.values = values; return this; },
        async run() { executed.push({ sql, values:this.values }); return { meta:{ changes:1 } }; },
      };
      return statement;
    },
  };
  const env = { DB, ASSETS:{ fetch:async () => new Response("missing", { status:404 }) } };
  const response = await worker.fetch(new Request("https://example.test/api/newsletter", {
    method:"POST",
    headers:{ origin:"https://example.test", "content-type":"application/json" },
    body:JSON.stringify({ email:" Reader@Example.COM ", consent:true }),
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok:true });
  assert.equal(executed.length, 2);
  assert.deepEqual(executed[1].values.slice(0, 1), ["reader@example.com"]);

  const rejected = await worker.fetch(new Request("https://example.test/api/newsletter", {
    method:"POST",
    headers:{ origin:"https://outside.test", "content-type":"application/json" },
    body:JSON.stringify({ email:"other@example.com", consent:true }),
  }), env);
  assert.equal(rejected.status, 403);
  assert.equal(executed.length, 2);
});

test("форма открывает подтверждение только после сохранения email", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /fetch\("\/api\/newsletter"/);
  assert.match(app, /body:JSON\.stringify\(\{ email, consent:true \}\)/);
  assert.match(app, /if \(!response\.ok\) throw new Error/);
  assert.match(app, /onSubmit=\{subscribeNewsletter\} noValidate/);
  assert.match(app, /Введите адрес электронной почты\./);
  assert.match(app, /id="footer-newsletter-error"[^>]+role="alert"/);
  assert.match(app, /footer-newsletter-status-reveal.*is-visible/);
  assert.match(app, /Вы подписались на рассылку/);
  assert.match(app, /Отписаться можно в любой момент/);
  assert.match(app, /newsletter-subscribed-icon[^>]+newsletter-mailbox\.png[^>]+width="80" height="80"/);
  assert.match(app, /<button[^>]+>Готово<\/button>[\s\S]*newsletter-subscribed-unsubscribe/);
  assert.doesNotMatch(app, /Рассылка скоро появится/);
});

test("дисклеймер плавно раскрывается только при фокусе в поле email", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /footer-newsletter-consent-reveal/);
  assert.match(styles, /\.footer-newsletter-consent-reveal\s*\{[^}]*grid-template-rows:\s*0fr/s);
  assert.match(styles, /input:focus\) \.footer-newsletter-consent-reveal\s*\{[^}]*grid-template-rows:\s*1fr/s);
  assert.match(styles, /transition:[^}]*grid-template-rows/s);
  assert.match(styles, /\.footer-newsletter-status-reveal\.is-visible\s*\{[^}]*grid-template-rows:\s*1fr/s);
});

test("подтверждение подписки сохраняет свободные поля и мелкую подпись", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /newsletter-subscribed-modal\s*\{[^}]*width:\s*min\(460px, 100%\)/s);
  assert.match(styles, /lead-modal > \.newsletter-subscribed-unsubscribe\s*\{[^}]*font-size:\s*14px/s);
});
