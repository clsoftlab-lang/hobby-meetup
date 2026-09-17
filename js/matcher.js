// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// matcher.js — rule-based recommendation engine for 같이해요 (hobby meetups).
// Pure functions only: no DOM, no storage. Safe to unit-test in Node.
//
// A "survey" describes a person's taste:
//   {
//     interests:     ["hiking","running"],   // category ids they like
//     activityLevel: "high" | "mid" | "low", // 활발 / 균형 / 차분
//     groupPref:     "small" | "medium" | "large" | "any",
//     regions:       ["서울 강남", ...],       // preferred regions (empty = anywhere)
//     difficulty:    "초급" | "중급" | "고급" | "any"
//   }

export const WEIGHTS = Object.freeze({
  interest: 40,      // meetup category is one of my interests
  energy: 15,        // category energy matches my activity level
  energyAdjacent: 7, // one step off
  region: 20,        // meetup region is one I prefer
  difficulty: 15,    // difficulty matches my choice
  group: 15,         // capacity bucket matches my group preference
  hostVerified: 4,   // host has a (mock) verification badge
  hostManner: 3,     // host manner temperature is warm (>= 37.0)
  hostRating: 3      // host rating is high (>= 4.6)
});

const ENERGY_ORDER = { low: 0, mid: 1, high: 2 };

// Map a meetup capacity to a group-size bucket.
export function groupBucket(capacity) {
  if (capacity <= 6) return "small";
  if (capacity <= 9) return "medium";
  return "large";
}

const BUCKET_LABEL = { small: "소규모", medium: "보통 규모", large: "큰 모임" };
const ENERGY_LABEL = { low: "차분한", mid: "적당한", high: "활발한" };

// Score a single meetup against a survey.
// Returns { score, reasons: [string], full: boolean }.
export function scoreMeetup(survey, meetup, ctx = {}) {
  const s = normalizeSurvey(survey);
  const category = ctx.category || null;
  const host = ctx.host || null;
  const joined = typeof ctx.joined === "number" ? ctx.joined : meetup.joinedBase || 0;

  let score = 0;
  const reasons = [];

  // 1) interest category
  if (s.interests.includes(meetup.category)) {
    score += WEIGHTS.interest;
    const catName = category ? category.name : meetup.category;
    reasons.push(`관심 취미 "${catName}"와(과) 일치해요`);
  }

  // 2) activity level vs category energy
  if (category && ENERGY_ORDER[category.energy] !== undefined) {
    const diff = Math.abs(ENERGY_ORDER[category.energy] - ENERGY_ORDER[s.activityLevel]);
    if (diff === 0) {
      score += WEIGHTS.energy;
      reasons.push(`${ENERGY_LABEL[s.activityLevel]} 성향과 잘 맞아요`);
    } else if (diff === 1) {
      score += WEIGHTS.energyAdjacent;
    }
  }

  // 3) region
  if (s.regions.length > 0 && s.regions.includes(meetup.region)) {
    score += WEIGHTS.region;
    reasons.push(`선호 지역 "${meetup.region}"에서 열려요`);
  }

  // 4) difficulty
  if (s.difficulty !== "any" && s.difficulty === meetup.difficulty) {
    score += WEIGHTS.difficulty;
    reasons.push(`난이도 "${meetup.difficulty}"가 딱 맞아요`);
  }

  // 5) group size preference
  const bucket = groupBucket(meetup.capacity);
  if (s.groupPref !== "any" && s.groupPref === bucket) {
    score += WEIGHTS.group;
    reasons.push(`${BUCKET_LABEL[bucket]} 모임을 선호하시는군요`);
  }

  // 6) host trust signals (mock)
  if (host) {
    if (host.verified) { score += WEIGHTS.hostVerified; }
    if (host.mannerTemp >= 37.0) { score += WEIGHTS.hostManner; }
    if (host.rating >= 4.6) { score += WEIGHTS.hostRating; }
    if (host.verified && host.rating >= 4.6) {
      reasons.push(`믿을 만한 호스트예요 (본인확인·평점 ${host.rating})`);
    }
  }

  const full = joined >= meetup.capacity;
  if (full) reasons.push("정원이 마감된 모임이에요");

  return { score, reasons, full };
}

// Maximum achievable score, used to render a match percentage.
export function maxScore() {
  return WEIGHTS.interest + WEIGHTS.energy + WEIGHTS.region +
    WEIGHTS.difficulty + WEIGHTS.group +
    WEIGHTS.hostVerified + WEIGHTS.hostManner + WEIGHTS.hostRating;
}

// Rank all meetups for a survey.
// meetups: array; hostsById / categoriesById: lookup maps; getJoined(meetup)->number optional.
// Returns array of { meetup, score, percent, reasons, full } sorted best-first.
export function recommend(survey, meetups, hostsById = {}, categoriesById = {}, getJoined = null) {
  const max = maxScore();
  const ranked = meetups.map((m) => {
    const ctx = {
      host: hostsById[m.hostId],
      category: categoriesById[m.category],
      joined: getJoined ? getJoined(m) : (m.joinedBase || 0)
    };
    const r = scoreMeetup(survey, m, ctx);
    return {
      meetup: m,
      score: r.score,
      percent: Math.round((r.score / max) * 100),
      reasons: r.reasons,
      full: r.full
    };
  });
  // sort: higher score first; open meetups before full; then sooner date
  ranked.sort((a, b) => {
    if (a.full !== b.full) return a.full ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    return String(a.meetup.date).localeCompare(String(b.meetup.date));
  });
  return ranked;
}

// Defensive normalization so callers/tests can pass partial surveys.
export function normalizeSurvey(survey) {
  const s = survey || {};
  return {
    interests: Array.isArray(s.interests) ? s.interests : [],
    activityLevel: ["high", "mid", "low"].includes(s.activityLevel) ? s.activityLevel : "mid",
    groupPref: ["small", "medium", "large", "any"].includes(s.groupPref) ? s.groupPref : "any",
    regions: Array.isArray(s.regions) ? s.regions : [],
    difficulty: ["초급", "중급", "고급", "any"].includes(s.difficulty) ? s.difficulty : "any"
  };
}
