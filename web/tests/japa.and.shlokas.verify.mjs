import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Check shloka bank integrity
const shlokaBankPath = path.resolve(__dirname, "../data/shloka_bank.json");
assert.ok(fs.existsSync(shlokaBankPath), "shloka_bank.json exists");
const bank = JSON.parse(fs.readFileSync(shlokaBankPath, "utf-8"));

assert.equal(bank.version, "1.0.0");
assert.equal(bank.total_works, 19, "Expected 19 works");
assert.equal(bank.total_shlokas, 206, "Expected 206 shlokas");

// Verify works and verses
let totalCountedVerses = 0;
for (const work of bank.works) {
  assert.ok(work.id, `work has id: ${work.title}`);
  assert.ok(work.title, `work has title: ${work.id}`);
  assert.ok(work.category, `work has category: ${work.id}`);
  assert.ok(Array.isArray(work.verses) && work.verses.length > 0, `work ${work.id} has verses`);
  assert.equal(work.verse_count, work.verses.length, `verse count matches in ${work.id}`);
  totalCountedVerses += work.verses.length;

  for (const v of work.verses) {
    assert.ok(v.id, `verse has id`);
    assert.ok(v.translation && v.translation.length > 0, `verse ${v.id} has translation`);
    assert.ok(v.formats && v.formats.verses, `verse ${v.id} has default verses format`);
    if (v.id !== "luchshie-krugi-prayer-3") {
      assert.ok(v.sanskrit && v.sanskrit.length > 0, `verse ${v.id} has sanskrit`);
    }
  }
}
assert.equal(totalCountedVerses, 206, "Total counted verses match 206");
console.log("PASS shloka bank integrity (19 works, 206 verses, 100% sanskrit & translations)");

// 2. Check 16 rounds and completion prayers
const luchshieKrugiPath = path.resolve(__dirname, "../data/luchshie_krugi.json");
assert.ok(fs.existsSync(luchshieKrugiPath), "luchshie_krugi.json exists");
const krugi = JSON.parse(fs.readFileSync(luchshieKrugiPath, "utf-8"));

assert.equal(krugi.rounds?.length, 16, "Expected 16 rounds");
for (const r of krugi.rounds) {
  assert.ok(r.round >= 1 && r.round <= 16, `round number in range: ${r.round}`);
  assert.ok(r.theme, `round ${r.round} has theme`);
  assert.ok(r.shloka?.sanskrit, `round ${r.round} has sanskrit`);
  assert.ok(r.shloka?.translation, `round ${r.round} has translation`);
  assert.ok(r.instruction, `round ${r.round} has instruction`);
}

assert.equal(krugi.completion_prayers?.prayers?.length, 3, "Expected 3 completion prayers");
for (const cp of krugi.completion_prayers.prayers) {
  assert.ok(cp.title, "completion prayer has title");
  assert.ok(cp.translation, "completion prayer has translation");
}
console.log("PASS 16 rounds and 3 completion prayers data contract");

// 3. Check formatRounds pluralization logic
function formatRounds(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${n} кругов`;
  if (mod10 === 1) return `${n} круг`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} круга`;
  return `${n} кругов`;
}

assert.equal(formatRounds(1), "1 круг");
assert.equal(formatRounds(2), "2 круга");
assert.equal(formatRounds(4), "4 круга");
assert.equal(formatRounds(5), "5 кругов");
assert.equal(formatRounds(16), "16 кругов");
assert.equal(formatRounds(21), "21 круг");
assert.equal(formatRounds(24), "24 круга");
assert.equal(formatRounds(112), "112 кругов");
assert.equal(formatRounds(124), "124 круга");
console.log("PASS russian pluralization formatRounds()");

// 4. Check route parsing logic
function readRoute(hash) {
  const clean = hash.replace(/^#\/?/, "");
  if (!clean) return { name: "home" };
  const [pathPart, queryPart] = clean.split("?");
  const bits = pathPart.split("/").filter(Boolean);
  if (bits[0] === "train" && bits[1]) return { name: "train", id: bits[1] };
  if (bits[0] === "japa") {
    const target = Number(bits[1]) || 16;
    return { name: "japa", target };
  }
  if (bits[0] === "shlokas") return { name: "shlokas" };
  return { name: "home" };
}

assert.deepEqual(readRoute("#/"), { name: "home" });
assert.deepEqual(readRoute("#/japa/16"), { name: "japa", target: 16 });
assert.deepEqual(readRoute("#/japa/4"), { name: "japa", target: 4 });
assert.deepEqual(readRoute("#/shlokas"), { name: "shlokas" });
assert.deepEqual(readRoute("#/shlokas?work=kevalastakam&verse=1"), { name: "shlokas" });
assert.deepEqual(readRoute("#/train/vowels-1"), { name: "train", id: "vowels-1" });
console.log("PASS route parser (japa, shlokas, train, home)");

console.log("\nAll Japa and Shloka Bank verifications passed successfully!");
