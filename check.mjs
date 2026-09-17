// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// check.mjs — CI gate. Run with: node check.mjs
//   1. every data/*.json parses and is internally consistent
//   2. `node --check` on every JS file (syntax)
//   3. index.html contains the required containers
//   4. unit tests for matcher.js scoring

import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const pass = (m) => console.log("  ✓ " + m);
const fail = (m) => { console.error("  ✗ " + m); failures++; };
function assert(cond, m) { cond ? pass(m) : fail(m); }

// ---- 1. JSON ------------------------------------------------------------
console.log("[1] data JSON");
const data = {};
for (const name of ["categories", "hosts", "meetups"]) {
  try {
    data[name] = JSON.parse(readFileSync(join(ROOT, "data", name + ".json"), "utf8"));
    pass(`data/${name}.json parses (${data[name].length} entries)`);
  } catch (e) {
    fail(`data/${name}.json parse: ${e.message}`);
  }
}
assert(Array.isArray(data.meetups) && data.meetups.length >= 36, "at least 36 meetups seeded");
assert(Array.isArray(data.hosts) && data.hosts.length >= 10, "at least 10 hosts seeded");
assert(Array.isArray(data.categories) && data.categories.length >= 7, "at least 7 categories seeded");

if (data.meetups && data.hosts && data.categories) {
  const hostIds = new Set(data.hosts.map((h) => h.id));
  const catIds = new Set(data.categories.map((c) => c.id));
  const badHost = data.meetups.filter((m) => !hostIds.has(m.hostId));
  const badCat = data.meetups.filter((m) => !catIds.has(m.category));
  const badCap = data.meetups.filter((m) => !(m.capacity > 0) || m.joinedBase > m.capacity);
  assert(badHost.length === 0, "every meetup references an existing host");
  assert(badCat.length === 0, "every meetup references an existing category");
  assert(badCap.length === 0, "every meetup has valid capacity/joinedBase");
  const ids = data.meetups.map((m) => m.id);
  assert(new Set(ids).size === ids.length, "meetup ids are unique");
}

// ---- 2. node --check ----------------------------------------------------
console.log("[2] JS syntax (node --check)");
const jsFiles = readdirSync(join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => join("js", f));
jsFiles.push("check.mjs");
// AI-KIT: also syntax-check ai/ and server/ sources.
for (const dir of ["ai", "server"]) {
  let entries = [];
  try { entries = readdirSync(join(ROOT, dir)); } catch { /* dir optional */ }
  for (const f of entries) {
    if (f.endsWith(".js") || f.endsWith(".mjs")) jsFiles.push(join(dir, f));
  }
}
for (const rel of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", join(ROOT, rel)], { stdio: "pipe" });
    pass(`${rel} syntax OK`);
  } catch (e) {
    fail(`${rel} syntax: ${e.stderr ? e.stderr.toString() : e.message}`);
  }
}

// ---- 3. index.html containers ------------------------------------------
console.log("[3] index.html containers");
let html = "";
try { html = readFileSync(join(ROOT, "index.html"), "utf8"); } catch (e) { fail("read index.html: " + e.message); }
for (const needle of ['id="app"', 'id="topnav"', 'id="toast"', 'id="demo-banner"', 'js/app.js', 'css/styles.css']) {
  assert(html.includes(needle), `index.html contains ${needle}`);
}

// ---- 4. matcher unit tests ---------------------------------------------
console.log("[4] matcher.js scoring");
const { scoreMeetup, recommend, groupBucket, normalizeSurvey, maxScore } =
  await import("./js/matcher.js");

const categoriesById = Object.fromEntries((data.categories || []).map((c) => [c.id, c]));
const hostsById = Object.fromEntries((data.hosts || []).map((h) => [h.id, h]));

// groupBucket
assert(groupBucket(4) === "small" && groupBucket(8) === "medium" && groupBucket(12) === "large",
  "groupBucket maps capacity to buckets");

// normalizeSurvey defaults
const n = normalizeSurvey({});
assert(n.activityLevel === "mid" && n.groupPref === "any" && n.difficulty === "any" && Array.isArray(n.interests),
  "normalizeSurvey fills safe defaults");

// interest match beats non-match
const survey = { interests: ["hiking"], activityLevel: "high", groupPref: "small", regions: [], difficulty: "any" };
const hikeMeetup = { id: "t1", category: "hiking", region: "서울 강남", difficulty: "초급", capacity: 6, joinedBase: 2, tags: [] };
const gameMeetup = { id: "t2", category: "boardgame", region: "서울 강남", difficulty: "초급", capacity: 6, joinedBase: 2, tags: [] };
const hs = scoreMeetup(survey, hikeMeetup, { category: categoriesById.hiking, host: hostsById.h01 });
const gs = scoreMeetup(survey, gameMeetup, { category: categoriesById.boardgame, host: hostsById.h01 });
assert(hs.score > gs.score, "interest-matching meetup scores higher than non-matching");
assert(hs.reasons.length > 0, "matching meetup produces human-readable reasons");

// region + difficulty add points
const s2 = { interests: ["hiking"], activityLevel: "high", groupPref: "small", regions: ["서울 강남"], difficulty: "초급" };
const withRegion = scoreMeetup(s2, hikeMeetup, { category: categoriesById.hiking, host: hostsById.h01 });
assert(withRegion.score > hs.score, "matching region + difficulty increases score");

// full meetup flagged
const fullMeetup = { ...hikeMeetup, joinedBase: 6 };
assert(scoreMeetup(survey, fullMeetup, { category: categoriesById.hiking }).full === true, "full meetup is flagged full");

// recommend returns sorted, bounded percentages, open-before-full
if (data.meetups) {
  const ranked = recommend(survey, data.meetups, hostsById, categoriesById);
  assert(ranked.length === data.meetups.length, "recommend ranks all meetups");
  let sorted = true, bounded = true;
  for (let i = 0; i < ranked.length; i++) {
    if (ranked[i].percent < 0 || ranked[i].percent > 100) bounded = false;
    if (i > 0 && !ranked[i - 1].full && !ranked[i].full && ranked[i - 1].score < ranked[i].score) sorted = false;
  }
  assert(sorted, "recommendations sorted by score (best first among open)");
  assert(bounded, "match percentages within 0..100");
  assert(ranked[0].meetup.category === "hiking", "top recommendation matches the interest");
  assert(maxScore() > 0, "maxScore is positive");
}

// ---- 5. AI-KIT safety ---------------------------------------------------
console.log("[5] AI-KIT");
try {
  const { AI_ENDPOINT } = await import("./ai/config.js");
  assert(AI_ENDPOINT === "", "ai/config.js ships AI_ENDPOINT empty (demo=mock, no key path)");
} catch (e) {
  fail("import ai/config.js: " + e.message);
}
try {
  const ai = await import("./ai/ai.js");
  assert(typeof ai.askAI === "function", "ai/ai.js exports askAI()");
} catch (e) {
  fail("import ai/ai.js: " + e.message);
}
// Scan repo source for a real Anthropic key format (must find none).
// The pattern is built by concatenation so this scanner never matches itself.
const KEY_RE = new RegExp("sk-" + "ant-[A-Za-z0-9_-]{20,}");
const TEXT_EXT = [".js", ".mjs", ".cjs", ".json", ".html", ".css", ".md", ".yml", ".yaml", ".example", ".env", ".txt"];
const SKIP_DIRS = new Set(["node_modules", ".git", ".cache", "dist"]);
function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(name.name)) continue;
    const full = join(dir, name.name);
    if (name.isDirectory()) out = out.concat(walk(full));
    else if (TEXT_EXT.some((e) => name.name.endsWith(e))) out.push(full);
  }
  return out;
}
let leaked = [];
for (const file of walk(ROOT)) {
  let content = "";
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  if (KEY_RE.test(content)) leaked.push(file.slice(ROOT.length + 1));
}
assert(leaked.length === 0, leaked.length ? `no real API key committed (found in: ${leaked.join(", ")})` : "no real API key committed in repo sources");

// ---- summary ------------------------------------------------------------
console.log("");
if (failures) { console.error(`FAILED: ${failures} check(s) did not pass.`); process.exit(1); }
console.log("ALL CHECKS PASSED ✅");
