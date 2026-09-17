// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai.js — AI-KIT client. One entry point: askAI(task, payload, {onToken}).
//
//   • When AI_ENDPOINT is empty (demo default), a deterministic Korean
//     MockProvider answers. It reuses the app's meetups/hosts/categories
//     (passed in via payload) and the rule-based engine in js/matcher.js,
//     so the AI features visibly work with no network and no API key.
//   • When AI_ENDPOINT is set, the same {task,payload} is POSTed to the
//     server-side proxy (server/index.mjs) and the streamed text is relayed
//     token-by-token through onToken.
//
// Tasks:
//   "recommend"    — AI 모임 추천 챗봇 (자유 문장 → 어울리는 모임 추천)
//   "icebreaker"   — 아이스브레이커 질문 + 모임 소개글 생성
//   "explainMatch" — 취향 매칭 결과를 자연어로 설명
//
// SAFETY: every provider keeps the wholesome framing — public small-group
// hobby meetups only. Never paid dating, romantic/transactional matching,
// 1:1 paid arrangements, or money transfer between members.

import { AI_ENDPOINT } from "./config.js";
import { recommend, normalizeSurvey, groupBucket } from "../js/matcher.js";

// Shared safety/system framing. Also sent to the backend so a real model
// stays inside the same wholesome boundaries as the mock.
export const SAFE_SYSTEM = [
  "당신은 '같이해요'의 도우미입니다. '같이해요'는 등산·러닝·보드게임·전시·스터디·",
  "사진출사·요리 등 공개된 장소에서 열리는 건전한 소규모 취미 그룹 모임 서비스입니다.",
  "항상 한국어로 따뜻하고 간결하게 답하세요.",
  "절대 금지: 유료 데이트/연애·거래성 매칭·1:1 유료 만남·회원 간 금전 거래 권유.",
  "안전 우선: 첫 만남은 공개된 장소·낮 시간·여럿이 함께를 권장하세요."
].join(" ");

const BUCKET_LABEL = { small: "소규모(~6명)", medium: "보통(7~9명)", large: "큰 모임(10명+)" };

// ---- public API ---------------------------------------------------------

/**
 * @param {string} task  one of "recommend" | "icebreaker" | "explainMatch"
 * @param {object} payload  task-specific data (see below)
 * @param {{onToken?:(chunk:string)=>void}} [opts]
 * @returns {Promise<string>} the full reply text
 */
export async function askAI(task, payload = {}, { onToken } = {}) {
  const endpoint = String(AI_ENDPOINT || "").trim();
  if (!endpoint) {
    return mockAnswer(task, payload, onToken);
  }
  // 무인(never-breaks): if the backend fails / returns 429 {fallback:true} /
  // network error BEFORE any token streams, quietly fall back to the offline
  // mock so the app keeps working. Streaming still flows through onToken.
  const started = { hit: false };
  const guardedOnToken = onToken
    ? (t) => { started.hit = true; onToken(t); }
    : undefined;
  try {
    return await backendAnswer(endpoint, task, payload, guardedOnToken);
  } catch (err) {
    if (!started.hit && (err && err.fallback)) {
      return mockAnswer(task, payload, onToken);
    }
    throw err;
  }
}

// Expose which provider is active so the UI can label the demo honestly.
export function aiMode() {
  return String(AI_ENDPOINT || "").trim() ? "live" : "mock";
}

// ---- real backend (streaming proxy) -------------------------------------

async function backendAnswer(endpoint, task, payload, onToken) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, payload: stripFunctions(payload) })
    });
  } catch (err) {
    // Network error → signal a fallback to the mock (app never breaks).
    const e = new Error("AI 서버에 연결하지 못했어요: " + err.message);
    e.fallback = true;
    throw e;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Any non-OK (incl. 429 {fallback:true}) → fall back to the offline mock.
    const e = new Error(`AI 서버 오류 (${res.status}) ${detail}`.trim());
    e.fallback = true;
    throw e;
  }
  // Stream the plain-text body chunk by chunk.
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) { full += chunk; onToken && onToken(chunk); }
    }
    const tail = decoder.decode();
    if (tail) { full += tail; onToken && onToken(tail); }
    return full;
  }
  const text = await res.text();
  onToken && onToken(text);
  return text;
}

// payload may carry helper functions (e.g. getJoined) for the mock; those
// can't be serialized, so drop them before sending to the backend.
function stripFunctions(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v !== "function") out[k] = v;
  }
  return out;
}

// ---- MockProvider (deterministic, offline) ------------------------------

async function mockAnswer(task, payload, onToken) {
  let text;
  switch (task) {
    case "recommend": text = mockRecommend(payload); break;
    case "weeklyDigest": text = mockWeeklyDigest(payload); break;
    case "icebreaker": text = mockIcebreaker(payload); break;
    case "explainMatch": text = mockExplainMatch(payload); break;
    default: text = "지원하지 않는 요청이에요. (recommend · weeklyDigest · icebreaker · explainMatch 중 하나를 사용하세요.)";
  }
  await streamOut(text, onToken);
  return text;
}

// Simulate token streaming so the mock feels like the live provider.
async function streamOut(text, onToken) {
  if (!onToken) return;
  // Split on spaces/newlines but keep the separators, for natural chunks.
  const parts = String(text).match(/\S+\s*|\s+/g) || [String(text)];
  for (const p of parts) {
    onToken(p);
    // Tiny delay; content is deterministic even though timing is not.
    await new Promise((r) => setTimeout(r, 12));
  }
}

// -- helpers shared by mock tasks --

function categoryList(payload) {
  if (Array.isArray(payload.categories) && payload.categories.length) return payload.categories;
  if (payload.categoriesById) return Object.values(payload.categoriesById);
  return [];
}

// Detect interested category ids from free text (name, id, or blurb keywords).
function detectInterests(text, categories) {
  const t = String(text || "").toLowerCase();
  const hits = [];
  for (const c of categories) {
    const name = String(c.name || "").toLowerCase();
    if ((name && t.includes(name)) || t.includes(String(c.id).toLowerCase())) {
      if (!hits.includes(c.id)) hits.push(c.id);
    }
  }
  return hits;
}

// Detect preferred regions by matching region strings or their word parts.
function detectRegions(text, meetups) {
  const t = String(text || "");
  const regions = [...new Set((meetups || []).map((m) => m.region))];
  const hits = [];
  for (const r of regions) {
    const parts = String(r).split(/\s+/).filter(Boolean);
    if (t.includes(r) || parts.some((p) => p.length >= 2 && t.includes(p))) {
      if (!hits.includes(r)) hits.push(r);
    }
  }
  return hits;
}

function detectDifficulty(text) {
  for (const d of ["초급", "중급", "고급"]) if (String(text || "").includes(d)) return d;
  return "any";
}

// -- task 1: recommend (chatbot) --

function mockRecommend(payload) {
  const meetups = payload.meetups || [];
  const hostsById = payload.hostsById || {};
  const categoriesById = payload.categoriesById || {};
  const cats = categoryList(payload);
  const getJoined = typeof payload.getJoined === "function" ? payload.getJoined : null;

  const message = payload.message || "";
  const interests = (payload.interests && payload.interests.length)
    ? payload.interests : detectInterests(message, cats);
  const regions = (payload.regions && payload.regions.length)
    ? payload.regions : detectRegions(message, meetups);
  const difficulty = payload.difficulty || detectDifficulty(message);

  if (!interests.length) {
    const names = cats.map((c) => `${c.emoji || "•"} ${c.name}`).join(" · ");
    return [
      "어떤 취미로 사람들과 만나고 싶으세요? 관심사와 지역을 알려주시면 어울리는 공개·소규모 모임을 찾아볼게요. 🌿",
      "",
      `가능한 취미: ${names}`,
      "예) \"주말에 서울에서 등산 초보 모임 있을까요?\""
    ].join("\n");
  }

  const survey = normalizeSurvey({
    interests,
    regions,
    difficulty,
    activityLevel: "mid",
    groupPref: "any"
  });
  const ranked = recommend(survey, meetups, hostsById, categoriesById, getJoined)
    .filter((r) => r.score > 0 && !r.full)
    .slice(0, 3);

  const likeNames = interests
    .map((id) => (categoriesById[id] && categoriesById[id].name) || id)
    .join(", ");
  const regionNote = regions.length ? ` (${regions.join(", ")} 쪽)` : "";

  if (!ranked.length) {
    return [
      `"${likeNames}"${regionNote}에 딱 맞는 자리가 지금은 안 보여요. 😢`,
      "지역을 넓히거나 관심 취미를 하나 더 알려주시면 다시 찾아볼게요.",
      "‘탐색’ 탭에서 직접 필터를 바꿔보셔도 좋아요."
    ].join("\n");
  }

  const lines = [`"${likeNames}"${regionNote} 좋아하시는군요! 이런 모임을 추천해요. 🎯`, ""];
  ranked.forEach((r, i) => {
    const m = r.meetup;
    const cat = categoriesById[m.category] || {};
    const reason = r.reasons[0] || "관심사와 잘 맞아요";
    lines.push(`${i + 1}. ${cat.emoji || "🎯"} ${m.title} — ${m.region} · ${m.date} ${m.time}`);
    lines.push(`   · 매치 ${r.percent}% · ${reason}`);
  });
  lines.push("");
  lines.push("🛡️ 첫 만남은 공개된 장소·낮 시간·여럿이 함께를 권해요. 마음에 드는 모임을 눌러 상세를 확인해 보세요!");
  return lines.join("\n");
}

// -- autonomous task: weekly digest ("이번 주 추천 모임") --
// Runs the same rule-based matcher over a caller-supplied set of upcoming/open
// meetups. Works fully offline; the app calls this on load.
function mockWeeklyDigest(payload) {
  const meetups = payload.meetups || [];
  const hostsById = payload.hostsById || {};
  const categoriesById = payload.categoriesById || {};
  const getJoined = typeof payload.getJoined === "function" ? payload.getJoined : null;
  const cats = categoryList(payload);

  // Prefer the member's saved taste survey; otherwise treat every category as an
  // interest so the matcher can still surface this week's best open meetups.
  const saved = payload.survey && Array.isArray(payload.survey.interests) && payload.survey.interests.length
    ? payload.survey
    : { interests: cats.map((c) => c.id), activityLevel: "mid", groupPref: "any", regions: [], difficulty: "any" };
  const survey = normalizeSurvey(saved);

  const ranked = recommend(survey, meetups, hostsById, categoriesById, getJoined)
    .filter((r) => !r.full)
    .slice(0, 3);

  if (!ranked.length) {
    return "이번 주에 바로 참여할 수 있는 공개·소규모 모임이 아직 없어요. ‘탐색’에서 더 둘러보거나 직접 모임을 만들어 보세요. 🌿";
  }

  const lines = ["이번 주, 이런 모임은 어때요? 🌿", ""];
  ranked.forEach((r, i) => {
    const m = r.meetup;
    const cat = categoriesById[m.category] || {};
    const reason = (r.reasons && r.reasons[0]) || "지금 참여하기 좋아요";
    lines.push(`${i + 1}. ${cat.emoji || "🎯"} ${m.title} — ${m.region} · ${m.date} ${m.time}`);
    lines.push(`   · ${reason}`);
  });
  lines.push("");
  lines.push("🛡️ 첫 만남은 공개된 장소·낮 시간·여럿이 함께!");
  return lines.join("\n");
}

// -- task 2: icebreaker / intro blurb --

function mockIcebreaker(payload) {
  const meetup = payload.meetup || {};
  const categoriesById = payload.categoriesById || {};
  const cat = payload.category || categoriesById[meetup.category] || {};
  const title = meetup.title || payload.title || "우리 모임";
  const catName = cat.name || meetup.category || "취미";
  const tags = (meetup.tags && meetup.tags.length ? meetup.tags : (payload.tags || [])).slice(0, 3);
  const region = meetup.region ? ` ${meetup.region}에서` : "";
  const tagLine = tags.length ? ` (${tags.map((t) => "#" + t).join(" ")})` : "";

  const questions = [
    `${catName}에 처음 빠지게 된 계기가 있다면 무엇인가요?`,
    "오늘 모임에서 가장 기대되는 순간 한 가지를 꼽는다면?",
    "요즘 관심 가는 다른 취미나 가보고 싶은 장소가 있나요?"
  ];

  return [
    `✨ ${title} 소개글 (초안)`,
    `${catName}을(를) 좋아하는 분들과${region} 함께하는 공개·소규모 모임이에요.${tagLine} 처음 오시는 분도 부담 없이 어울릴 수 있도록 서로 배려하며 천천히 즐겨요. 무리한 일정 없이, 안전하고 즐거운 시간을 함께 만들어요! 🌿`,
    "",
    "🧊 아이스브레이커 질문",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "💡 서로 편한 만큼만 이야기하면 돼요. 개인 연락처·금전 요구는 하지 않기로 해요."
  ].join("\n");
}

// -- task 3: explain a match --

function mockExplainMatch(payload) {
  const meetup = payload.meetup || {};
  const categoriesById = payload.categoriesById || {};
  const cat = payload.category || categoriesById[meetup.category] || {};
  const survey = normalizeSurvey(payload.survey || {});
  const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
  const percent = typeof payload.percent === "number" ? payload.percent : null;
  const title = meetup.title || "이 모임";

  const bucket = meetup.capacity ? groupBucket(meetup.capacity) : null;
  const head = percent != null
    ? `"${title}"은(는) 회원님과 약 ${percent}% 맞는 모임이에요.`
    : `"${title}"이(가) 왜 어울리는지 설명해 드릴게요.`;

  const bullets = (reasons.length ? reasons : [
    cat.name ? `${cat.name} 취향과 통해요` : "관심사와 통하는 활동이에요"
  ]).map((r) => `· ${r}`);

  const tail = [];
  if (bucket) tail.push(`규모는 ${BUCKET_LABEL[bucket]}이라 서로 얼굴을 익히기 좋아요.`);
  tail.push("공개된 장소에서 여럿이 함께하는 건전한 모임이라 첫 참여도 부담이 적어요. 🌿");

  return [head, "", ...bullets, "", tail.join(" ")].join("\n");
}
