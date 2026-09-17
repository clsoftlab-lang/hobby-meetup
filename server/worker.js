// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// worker.js — Cloudflare Workers variant of the 같이해요 AI proxy (무인/free tier).
//
// Free hosting with no server to babysit: deploy once, set the API key as a
// Worker secret, and it keeps running unmanned. The browser NEVER holds a key;
// it POSTs {task,payload} here and this Worker calls Anthropic's REST API using
// the secret ANTHROPIC_API_KEY.
//
// Same task routing + model/caching rules as server/index.mjs:
//   • cost-first default model claude-haiku-4-5 (raise via the AI_MODEL var)
//   • prompt caching on the stable per-task system prompt (cache_control ephemeral)
//   • Haiku 4.5 → no thinking / no effort; other models → adaptive thinking + effort
//   • modest max_tokens cap
// On any error / missing key it returns HTTP 429 {fallback:true} so the frontend
// falls back to its offline mock and never breaks.
//
// Deploy (see server/README.md):
//   npm i -g wrangler
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler deploy

const SAFE_SYSTEM = [
  "당신은 '같이해요'의 도우미입니다. '같이해요'는 등산·러닝·보드게임·전시·스터디·",
  "사진출사·요리 등 공개된 장소에서 열리는 건전한 소규모 취미 그룹 모임 서비스입니다.",
  "항상 한국어로 따뜻하고 간결하게 답하세요.",
  "절대 금지: 유료 데이트/연애·거래성 매칭·1:1 유료 만남·회원 간 금전 거래 권유.",
  "안전 우선: 첫 만남은 공개된 장소·낮 시간·여럿이 함께를 권장하세요."
].join(" ");

const TASK_SYSTEM = {
  recommend: " 아래 JSON의 meetups 목록 안에서만 골라 최대 3개를 추천하고, 각 추천에 한 줄 이유를 붙이세요. 목록에 없는 모임은 지어내지 마세요.",
  weeklyDigest: " 아래 JSON의 meetups 목록(이번 주 참여 가능한 후보) 안에서만 골라 '이번 주 추천 모임'을 최대 3개 요약하세요. 목록에 없는 모임은 지어내지 마세요. 따뜻한 한 문장 인사로 시작하세요.",
  icebreaker: " 모임 소개글 초안 1개와 아이스브레이커 질문 3개를 만드세요.",
  explainMatch: " 매칭 결과를 회원이 이해하기 쉽게 자연어로 설명하세요."
};

function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return "{}"; }
}

function buildPrompt(task, payload = {}) {
  const data = safeJson(payload);
  const extra = TASK_SYSTEM[task] || "";
  const system = [
    { type: "text", text: SAFE_SYSTEM + extra, cache_control: { type: "ephemeral" } }
  ];
  let user;
  switch (task) {
    case "recommend":
      user = `사용자 메시지와 데이터입니다. 어울리는 공개·소규모 모임을 추천해 주세요.\n\n${data}`; break;
    case "weeklyDigest":
      user = `이번 주 추천 모임 후보 데이터입니다. 회원에게 보여줄 따뜻한 추천 요약을 만들어 주세요.\n\n${data}`; break;
    case "icebreaker":
      user = `이 모임을 위한 소개글과 아이스브레이커 질문을 만들어 주세요.\n\n${data}`; break;
    case "explainMatch":
      user = `아래 설문과 모임, 매칭 이유를 바탕으로 왜 잘 맞는지 설명해 주세요.\n\n${data}`; break;
    default:
      user = `요청(task=${task})과 데이터입니다.\n\n${data}`;
  }
  return { system, user };
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

// Any failure → 429 {fallback:true} so the client uses its offline mock.
function fallback() {
  return new Response(JSON.stringify({ fallback: true }), {
    status: 429,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors() }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        model: env.AI_MODEL || "claude-haiku-4-5",
        hasKey: Boolean(env.ANTHROPIC_API_KEY)
      }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...cors() } });
    }

    if (request.method !== "POST" || url.pathname !== "/api/ai") {
      return new Response("Not found. Use POST /api/ai", { status: 404, headers: cors() });
    }
    if (!env.ANTHROPIC_API_KEY) return fallback();

    let task, payload;
    try {
      const body = await request.json();
      task = body.task; payload = body.payload || {};
    } catch {
      return fallback();
    }

    const MODEL = env.AI_MODEL || "claude-haiku-4-5";
    const MAX_TOKENS = Number(env.AI_MAX_TOKENS || 700);
    const { system, user } = buildPrompt(task, payload);

    const reqBody = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }]
    };
    if (!MODEL.startsWith("claude-haiku")) {
      reqBody.thinking = { type: "adaptive" };
      reqBody.output_config = { effort: env.AI_EFFORT || "low" };
    }

    let apiRes;
    try {
      apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify(reqBody)
      });
    } catch {
      return fallback();
    }
    if (!apiRes.ok) return fallback();

    let data;
    try { data = await apiRes.json(); } catch { return fallback(); }

    // Concatenate all text blocks from the assistant message.
    const text = Array.isArray(data.content)
      ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("")
      : "";

    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...cors() }
    });
  }
};
