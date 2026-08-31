import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dateKey = (now) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const valid = (value) => value?.schemaVersion === 1 && Array.isArray(value.days) && value.days.length <= 3 && value.days.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isSafeInteger(row.attempts) && row.attempts >= 0 && row.attempts <= 2);

export async function reserveEventSpyAttempt(root, now = Date.now(), options = {}) {
  await mkdir(root, { recursive: true });
  const lock = join(root, ".attempt-ledger.lock");
  try { await mkdir(lock); } catch (error) { if (error.code === "EEXIST") fail("EventSpy collector is locked.", "EVENTSPY_LOCKED"); throw error; }
  const ledgerPath = join(root, "attempt-ledger.json");
  try {
    let ledger = { schemaVersion: 1, days: [] };
    try { ledger = JSON.parse(await readFile(ledgerPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") fail("EventSpy attempt ledger is malformed.", "EVENTSPY_LEDGER_INVALID"); }
    if (!valid(ledger)) fail("EventSpy attempt ledger is malformed.", "EVENTSPY_LEDGER_INVALID");
    const today = dateKey(now); let row = ledger.days.find((item) => item.date === today);
    if (!row) { row = { date: today, attempts: 0 }; ledger.days.push(row); }
    if (row.attempts >= 2) return { allowed: false, outcome: "EVENTSPY_DAILY_LIMIT", date: today, attempts: row.attempts };
    row.attempts += 1; ledger.days = ledger.days.filter((item) => item.date >= today).slice(-2);
    const temporary = join(root, `.attempt-ledger-${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await (options.beforeRename?.() ?? Promise.resolve()); await rename(temporary, ledgerPath);
    return { allowed: true, outcome: "EVENTSPY_ATTEMPT_RESERVED", date: today, attempts: row.attempts };
  } finally { await rm(lock, { recursive: true, force: true }); }
}

export { dateKey as eventSpyPacificDate };
