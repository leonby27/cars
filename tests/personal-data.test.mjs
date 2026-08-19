import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { decryptPersonalField, encryptPersonalField } from "../server/personal-data.mjs";

const withKey = (key, run) => {
  const previous = process.env.PERSONAL_DATA_KEY;
  if (key === null) delete process.env.PERSONAL_DATA_KEY;
  else process.env.PERSONAL_DATA_KEY = key;
  try { run(); } finally {
    if (previous === undefined) delete process.env.PERSONAL_DATA_KEY;
    else process.env.PERSONAL_DATA_KEY = previous;
  }
};

test("паспортные поля шифруются и читаются обратно", () => {
  withKey(crypto.randomBytes(32).toString("hex"), () => {
    const stored = encryptPersonalField("MP1234567");
    assert.notEqual(stored, "MP1234567");
    assert.equal(stored.includes("MP1234567"), false);
    assert.equal(decryptPersonalField(stored), "MP1234567");
    // Пустое поле остаётся пустым: иначе запрос профиля записал бы «не заполнено» как значение.
    assert.equal(encryptPersonalField(""), "");
    assert.equal(decryptPersonalField(""), "");
  });
});

test("два шифрования одного значения дают разные записи", () => {
  withKey(crypto.randomBytes(32).toString("hex"), () => {
    assert.notEqual(encryptPersonalField("1234567A001PB1"), encryptPersonalField("1234567A001PB1"));
  });
});

test("подмена записи не проходит проверку целостности", () => {
  withKey(crypto.randomBytes(32).toString("hex"), () => {
    const stored = encryptPersonalField("г. Минск, ул. Примерная, 1");
    assert.equal(decryptPersonalField(`${stored}x`), "");
  });
});

test("чужой ключ не расшифровывает запись", () => {
  let stored;
  withKey(crypto.randomBytes(32).toString("hex"), () => { stored = encryptPersonalField("MP7654321"); });
  withKey(crypto.randomBytes(32).toString("hex"), () => { assert.equal(decryptPersonalField(stored), ""); });
});

test("без ключа профиль сохраняется как раньше и старые записи читаются", () => {
  withKey(null, () => {
    assert.equal(encryptPersonalField("MP1234567"), "MP1234567");
    assert.equal(decryptPersonalField("MP1234567"), "MP1234567");
  });
});
