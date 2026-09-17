// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// index.mjs — OPTIONAL server-side AI proxy for 같이해요.
//
// The browser NEVER holds an API key. When the frontend's ai/config.js has a
// non-empty AI_ENDPOINT pointing here, it POSTs {task,payload} to POST /api/ai
// and this process calls Claude with the key from process.env.ANTHROPIC_API_KEY,
// then streams the text back.
//
// Run:
//   cd server && npm install && cp .env.example .env   # put your key in .env
//   ANTHROPIC_API_KEY=sk-ant-... node index.mjs
//
// This file is not exercised in CI (no npm install / no network there); it only
// needs to pass `node --check`.

import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT || 8787);
const MODEL = "claude-opus-5";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Shared wholesome/safe framing — mirrors ai/ai.js#SAFE_SYSTEM.
const SAFE_SYSTEM = [
  "당신은 '같이해요'의 도우미입니다. '같이해요'는 등산·러닝·보드게임·전시·스터디·",
  "사진출사·요리 등 공개된 장소에서 열리는 건전한 소규모 취미 그룹 모임 서비스입니다.",
  "항상 한국어로 따뜻하고 간결하게 답하세요.",
  "절대 금지: 유료 데이트/연애·거래성 매칭·1:1 유료 만남·회원 간 금전 거래 권유.",
  "안전 우선: 첫 만남은 공개된 장소·낮 시간·여럿이 함께를 권장하세요."
].join(" ");

// Map a {task,payload} into a system prompt + a single user message.
function buildPrompt(task, payload = {}) {
  const data = safeJson(payload);
  switch (task) {
    case "recommend":
      return {
        system: SAFE_SYSTEM + " 아래 JSON의 meetups 목록 안에서만 골라 최대 3개를 추천하고, 각 추천에 한 줄 이유를 붙이세요. 목록에 없는 모임은 지어내지 마세요.",
        user: `사용자 메시지와 데이터입니다. 어울리는 공개·소규모 모임을 추천해 주세요.\n\n${data}`
      };
    case "icebreaker":
      return {
        system: SAFE_SYSTEM + " 모임 소개글 초안 1개와 아이스브레이커 질문 3개를 만드세요.",
        user: `이 모임을 위한 소개글과 아이스브레이커 질문을 만들어 주세요.\n\n${data}`
      };
    case "explainMatch":
      return {
        system: SAFE_SYSTEM + " 매칭 결과를 회원이 이해하기 쉽게 자연어로 설명하세요.",
        user: `아래 설문과 모임, 매칭 이유를 바탕으로 왜 잘 맞는지 설명해 주세요.\n\n${data}`
      };
    default:
      return {
        system: SAFE_SYSTEM,
        user: `요청(task=${task})과 데이터입니다.\n\n${data}`
      };
  }
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

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = (req.url || "").split("?")[0];
  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) }));
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

  try {
    const { task, payload } = await readBody(req);
    const { system, user } = buildPrompt(task, payload || {});

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked"
    });

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: user }]
    });

    stream.on("text", (delta) => { res.write(delta); });
    await stream.finalMessage();
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
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("경고: ANTHROPIC_API_KEY가 없습니다. .env에 키를 넣어주세요.");
  }
});
