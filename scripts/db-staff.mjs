// Пометка служебного аккаунта: свои собственные регистрации, избранное и пробные
// заявки не должны считаться интересом клиентов в разделе аналитики.
//
//   node scripts/db-staff.mjs                     — показать, кто помечен
//   node scripts/db-staff.mjs +375291234567       — пометить аккаунт служебным
//   node scripts/db-staff.mjs --off +375291234567 — снять пометку
import { pool } from "../server/db.mjs";

const args = process.argv.slice(2);
const off = args.includes("--off");
// Телефон в базе лежит одними цифрами, а вводят его как придётся — с плюсом,
// пробелами и скобками. Сравниваем цифры.
const digits = String(args.find((value) => !value.startsWith("--")) || "").replace(/\D/g, "");

const show = async () => {
  const { rows } = await pool.query("SELECT name, phone, created_at FROM customer_accounts WHERE staff ORDER BY created_at");
  if (!rows.length) return console.log("Служебных аккаунтов нет — в аналитику попадают все.");
  console.log("Служебные аккаунты (в аналитике не считаются):");
  for (const row of rows) console.log(`  ${row.name} +${row.phone} — с ${row.created_at.toISOString().slice(0, 10)}`);
};

if (!digits) {
  await show();
} else {
  const { rows } = await pool.query("UPDATE customer_accounts SET staff=$2, updated_at=now() WHERE phone=$1 RETURNING name, phone", [digits, !off]);
  if (!rows.length) console.log(`Аккаунт с телефоном +${digits} не найден.`);
  else console.log(`${rows[0].name} +${rows[0].phone} — ${off ? "снова обычный клиент" : "помечен служебным"}.`);
  await show();
}
await pool.end();
