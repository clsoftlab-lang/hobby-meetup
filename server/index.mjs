// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// index.mjs — OPTIONAL, cost-efficient server-side AI proxy for 같이해요.
//
// The browser NEVER holds an API key. When the frontend's ai/config.js has a
// non-empty AI_ENDPOINT pointing here, it POSTs {task,payload} to POST /api/ai
// and this process calls Claude with the key from process.env.ANTHROPIC_API_KEY,
// then streams the text back.
//
// 무인·저비용(autonomous & cost-efficient) design:
//   • Cost-first default model claude-haiku-4-5 (raise via AI_MODEL when needed).
//   • Prompt caching on the stable per-task system prompt (cache_control ephemeral).
//   • Modest max_tokens cap per task.
//   • Per-IP rate limit + a monthly token budget → HTTP 429 {fallback:true},
//     which lets the frontend fall back to its offline mock (never breaks).
//
// Run:
//   cd server && npm install && cp .env.example .env   # put your key in .env
//   ANTHROPIC_API_KEY=sk-ant-... node index.mjs
//   # optional: AI_MODEL=claude-sonnet-5 AI_EFFORT=low node index.mjs
//
// This file is not exercised in CI (no npm install / no network there); it only
// needs to pass `node --check`.

import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT || 8787);

// Cost-first default. AI_MODEL may be raised to `claude-sonnet-5` or
// `claude-opus-5` for higher quality (at higher $/MTok).
const MODEL = process.env.AI_MODEL || "claude-haiku-4-5";

// Modest default output cap; per-task overrides only where truly needed.
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 700);

// Cost guardrails.
const RATE_PER_MIN = Number(process.env.AI_RATE_PER_MIN || 20);
const MONTHLY_TOKEN_CAP = Number(process.env.AI_MONTHLY_TOKEN_CAP || 2000000);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Shared wholesome/safe framing — mirrors ai/ai.js#SAFE_SYSTEM. Kept STABLE so
// it caches well across requests.
const SAFE_SYSTEM = [
  "당신은 '같이해요'의 도우미입니다. '같이해요'는 등산·러닝·보드게임·전시·스터디·",
  "사진출사·요리 등 공개된 장소에서 열리는 건전한 소규모 취미 그룹 모임 서비스입니다.",
  "항상 한국어로 따뜻하고 간결하게 답하세요.",
  "절대 금지: 유료 데이트/연애·거래성 매칭·1:1 유료 만남·회원 간 금전 거래 권유.",
  "안전 우선: 첫 만남은 공개된 장소·낮 시간·여럿이 함께를 권장하세요."
].join(" ");

// Per-task extra instruction (also stable → cached with SAFE_SYSTEM).
const TASK_SYSTEM = {
  recommend: " 아래 JSON의 meetups 목록 안에서만 골라 최대 3개를 추천하고, 각 추천에 한 줄 이유를 붙이세요. 목록에 없는 모임은 지어내지 마세요.",
  weeklyDigest: " 아래 JSON의 meetups 목록(이번 주 참여 가능한 후보) 안에서만 골라 '이번 주 추천 모임'을 최대 3개 요약하세요. 목록에 없는 모임은 지어내지 마세요. 따뜻한 한 문장 인사로 시작하세요.",
  icebreaker: " 모임 소개글 초안 1개와 아이스브레이커 질문 3개를 만드세요.",
  explainMatch: " 매칭 결과를 회원이 이해하기 쉽게 자연어로 설명하세요."
};

// Map a {task,payload} into a cached system-block array + a single user message.
function buildPrompt(task, payload = {}) {
  const data = safeJson(payload);
  const extra = TASK_SYSTEM[task] || "";
  // System sent as a block array so the stable prefix is cache-eligible.
  const system = [
    { type: "text", text: SAFE_SYSTEM + extra, cache_control: { type: "ephemeral" } }
  ];
  let user;
  switch (task) {
    case "recommend":
      user = `사용자 메시지와 데이터입니다. 어울리는 공개·소규모 모임을 추천해 주세요.\n\n${data}`;
      break;
    case "weeklyDigest":
      user = `이번 주 추천 모임 후보 데이터입니다. 회원에게 보여줄 따뜻한 추천 요약을 만들어 주세요.\n\n${data}`;
      break;
    case "icebreaker":
      user = `이 모임을 위한 소개글과 아이스브레이커 질문을 만들어 주세요.\n\n${data}`;
      break;
    case "explainMatch":
      user = `아래 설문과 모임, 매칭 이유를 바탕으로 왜 잘 맞는지 설명해 주세요.\n\n${data}`;
      break;
    default:
      user = `요청(task=${task})과 데이터입니다.\n\n${data}`;
  }
  return { system, user };
}

function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return "{}"; }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error("잘못된 JSON 요청: " + e.message)); }
    });
    req.on("error", reject);
  });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---- cost guardrails ----------------------------------------------------

// Simple in-memory per-IP sliding-window rate limit (best-effort; per process).
const hits = new Map(); // ip -> [timestamps within the last minute]
function rateLimited(ip) {
  const now = Date.now();
  const win = now - 60_000;
  const arr = (hits.get(ip) || []).filter((t) => t > win);
  if (arr.length >= RATE_PER_MIN) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

// Monthly token budget (input+output), resets when the calendar month changes.
let usage = { month: monthKey(), tokens: 0 };
function monthKey() { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth()}`; }
function budgetExceeded() {
  const mk = monthKey();
  if (usage.month !== mk) usage = { month: mk, tokens: 0 };
  return usage.tokens >= MONTHLY_TOKEN_CAP;
}
function addUsage(u) {
  if (!u) return;
  const n = (u.input_tokens || 0) + (u.output_tokens || 0) +
    (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  usage.tokens += n;
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

function tooMany(res) {
  res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ fallback: true }));
}

// ---- server -------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = (req.url || "").split("?")[0];
  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true, model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
      monthlyTokenCap: MONTHLY_TOKEN_CAP, tokensUsedThisMonth: usage.tokens
    }));
    return;
  }
  if (req.method !== "POST" || url !== "/api/ai") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found. Use POST /api/ai");
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("서버에 ANTHROPIC_API_KEY가 설정되지 않았어요.");
    return;
  }

  // Guardrails → 429 {fallback:true} so the client uses its offline mock.
  if (rateLimited(clientIp(req))) { tooMany(res); return; }
  if (budgetExceeded()) { tooMany(res); return; }

  try {
    const { task, payload } = await readBody(req);
    const { system, user } = buildPrompt(task, payload || {});

    // Haiku 4.5 does not accept adaptive thinking / effort → send neither.
    const params = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }]
    };
    if (!MODEL.startsWith("claude-haiku")) {
      params.thinking = { type: "adaptive" };
      params.output_config = { effort: process.env.AI_EFFORT || "low" };
    }

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked"
    });

    const stream = client.messages.stream(params);
    stream.on("text", (delta) => { res.write(delta); });
    const final = await stream.finalMessage();
    addUsage(final && final.usage);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("\n[AI 오류] " + (err && err.message ? err.message : String(err)));
  }
});

server.listen(PORT, () => {
  console.log(`같이해요 AI proxy → http://localhost:${PORT}/api/ai  (model: ${MODEL})`);
  console.log(`  guardrails: ${RATE_PER_MIN}/min per IP · monthly cap ${MONTHLY_TOKEN_CAP} tokens · max_tokens ${MAX_TOKENS}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("경고: ANTHROPIC_API_KEY가 없습니다. .env에 키를 넣어주세요.");
  }
});
