// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// app.js — SPA controller for 같이해요 (Together / hobby meetups). DEMO MODE.

import * as store from "./storage.js";
import { recommend, groupBucket } from "./matcher.js";
import { avatarSVG, bannerSVG } from "./svg.js";
import { askAI, aiMode } from "../ai/ai.js";

const state = {
  meetups: [],
  hosts: [],
  categories: [],
  hostsById: {},
  categoriesById: {},
  filters: { q: "", category: "all", region: "all", difficulty: "all", sort: "date" }
};

// ---- utilities ---------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const app = () => $("#app");

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const isPast = (m) => m.date < today();

function toast(msg, kind = "ok") {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast show " + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = "toast"; }, 3200);
}

// current member count = base + (1 if the demo user joined)
function currentJoined(m) {
  return (m.joinedBase || 0) + (store.isJoined(m.id) ? 1 : 0);
}
function isFull(m) {
  return currentJoined(m) >= m.capacity;
}

function allMeetups() {
  return [...state.meetups, ...store.getCreatedMeetups()];
}
function findMeetup(id) {
  return allMeetups().find((m) => m.id === id) || null;
}
function hostOf(m) {
  return state.hostsById[m.hostId] || { name: "익명 호스트", avatarSeed: 0, mannerTemp: 36.5, rating: 4.5, verified: false, bio: "" };
}
function catOf(m) {
  return state.categoriesById[m.category] || { name: m.category, emoji: "🎯", energy: "mid" };
}

// ---- data load ---------------------------------------------------------
async function loadData() {
  const [cats, hosts, meetups] = await Promise.all([
    fetch("data/categories.json").then((r) => r.json()),
    fetch("data/hosts.json").then((r) => r.json()),
    fetch("data/meetups.json").then((r) => r.json())
  ]);
  state.categories = cats;
  state.hosts = hosts;
  state.meetups = meetups;
  state.categoriesById = Object.fromEntries(cats.map((c) => [c.id, c]));
  state.hostsById = Object.fromEntries(hosts.map((h) => [h.id, h]));
}

// ---- shared bits -------------------------------------------------------
function badge(text, cls = "") { return `<span class="badge ${cls}">${esc(text)}</span>`; }

function mannerBar(temp) {
  const pct = Math.max(0, Math.min(100, Math.round(((temp - 36) / 3) * 100)));
  return `<div class="manner" title="매너온도 (mock)"><span style="width:${pct}%"></span></div>
    <small>매너온도 ${esc(temp)}℃</small>`;
}

function meetupCard(m) {
  const c = catOf(m); const h = hostOf(m);
  const joined = currentJoined(m); const full = joined >= m.capacity;
  const left = Math.max(0, m.capacity - joined);
  return `
  <a class="card" href="#/meetup/${esc(m.id)}">
    <div class="card-banner">${bannerSVG(m.category, hashSeed(m.id))}
      <span class="cat-chip">${c.emoji} ${esc(c.name)}</span>
    </div>
    <div class="card-body">
      <h3>${esc(m.title)}</h3>
      <p class="muted">📍 ${esc(m.region)} · 📅 ${esc(m.date)} ${esc(m.time)}</p>
      <div class="tagrow">${badge(m.difficulty, "diff")} ${m.tags.slice(0,3).map((t)=>badge("#"+t)).join(" ")}</div>
      <div class="card-foot">
        <span class="host-mini">${avatarSVG(h.avatarSeed, 24)} ${esc(h.name)} ${h.verified ? "✅" : ""}</span>
        <span class="cap ${full ? "full" : left <= 2 ? "warn" : ""}">${full ? "정원 마감" : `잔여 ${left}/${m.capacity}`}</span>
      </div>
    </div>
  </a>`;
}
function hashSeed(id) { let s = 0; for (const ch of String(id)) s = (s * 31 + ch.charCodeAt(0)) % 100000; return s; }

// ---- view: explore -----------------------------------------------------
function renderExplore() {
  const f = state.filters;
  const cats = state.categories;
  const regions = [...new Set(state.meetups.map((m) => m.region))].sort();

  let list = allMeetups().filter((m) => {
    if (f.category !== "all" && m.category !== f.category) return false;
    if (f.region !== "all" && m.region !== f.region) return false;
    if (f.difficulty !== "all" && m.difficulty !== f.difficulty) return false;
    if (f.q) {
      const hay = (m.title + " " + m.description + " " + m.tags.join(" ") + " " + catOf(m).name).toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });

  if (f.sort === "date") list.sort((a, b) => a.date.localeCompare(b.date));
  else if (f.sort === "capacity") list.sort((a, b) => (a.capacity - currentJoined(a)) - (b.capacity - currentJoined(b)));
  else if (f.sort === "rating") list.sort((a, b) => hostOf(b).rating - hostOf(a).rating);

  app().innerHTML = `
  <section class="hero">
    <h1>취미로 만나요, 같이해요 🌿</h1>
    <p>혼자보다 함께가 즐거운 <strong>공개·소규모</strong> 취미 모임. 등산·러닝·보드게임·전시·스터디·사진출사·요리까지.</p>
    <div class="hero-cta">
      <a class="btn primary" href="#/match">✨ 취향 매칭 받기</a>
      <a class="btn" href="#/create">➕ 모임 만들기</a>
      <a class="btn ghost" href="#/safety">🛡️ 안전 가이드</a>
    </div>
  </section>

  <section class="filters" aria-label="모임 필터">
    <input id="f-q" type="search" placeholder="🔎 제목·태그·활동 검색" value="${esc(f.q)}" />
    <select id="f-cat">
      <option value="all">전체 취미</option>
      ${cats.map((c) => `<option value="${c.id}" ${f.category===c.id?"selected":""}>${c.emoji} ${esc(c.name)}</option>`).join("")}
    </select>
    <select id="f-region">
      <option value="all">전체 지역</option>
      ${regions.map((r) => `<option value="${esc(r)}" ${f.region===r?"selected":""}>${esc(r)}</option>`).join("")}
    </select>
    <select id="f-diff">
      <option value="all">전체 난이도</option>
      ${["초급","중급","고급"].map((d)=>`<option value="${d}" ${f.difficulty===d?"selected":""}>${d}</option>`).join("")}
    </select>
    <select id="f-sort">
      <option value="date" ${f.sort==="date"?"selected":""}>날짜순</option>
      <option value="capacity" ${f.sort==="capacity"?"selected":""}>잔여석순</option>
      <option value="rating" ${f.sort==="rating"?"selected":""}>호스트 평점순</option>
    </select>
  </section>

  <p class="count muted">${list.length}개의 모임</p>
  <div id="grid" class="grid">
    ${list.length ? list.map(meetupCard).join("") : `<p class="empty">조건에 맞는 모임이 없어요. 필터를 바꿔보세요.</p>`}
  </div>`;

  $("#f-q").addEventListener("input", (e) => { f.q = e.target.value; refreshGrid(); });
  $("#f-cat").addEventListener("change", (e) => { f.category = e.target.value; renderExplore(); });
  $("#f-region").addEventListener("change", (e) => { f.region = e.target.value; renderExplore(); });
  $("#f-diff").addEventListener("change", (e) => { f.difficulty = e.target.value; renderExplore(); });
  $("#f-sort").addEventListener("change", (e) => { f.sort = e.target.value; renderExplore(); });
}
function refreshGrid() {
  // lightweight re-filter without rebuilding inputs (keeps search focus)
  const f = state.filters;
  let list = allMeetups().filter((m) => {
    if (f.category !== "all" && m.category !== f.category) return false;
    if (f.region !== "all" && m.region !== f.region) return false;
    if (f.difficulty !== "all" && m.difficulty !== f.difficulty) return false;
    if (f.q) {
      const hay = (m.title + " " + m.description + " " + m.tags.join(" ") + " " + catOf(m).name).toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });
  if (f.sort === "date") list.sort((a, b) => a.date.localeCompare(b.date));
  else if (f.sort === "capacity") list.sort((a, b) => (a.capacity - currentJoined(a)) - (b.capacity - currentJoined(b)));
  else if (f.sort === "rating") list.sort((a, b) => hostOf(b).rating - hostOf(a).rating);
  const grid = $("#grid"); const count = $(".count");
  if (count) count.textContent = `${list.length}개의 모임`;
  if (grid) grid.innerHTML = list.length ? list.map(meetupCard).join("") : `<p class="empty">조건에 맞는 모임이 없어요.</p>`;
}

// ---- view: detail ------------------------------------------------------
function renderDetail(id) {
  const m = findMeetup(id);
  if (!m) { app().innerHTML = `<p class="empty">모임을 찾을 수 없어요. <a href="#/explore">목록으로</a></p>`; return; }
  const c = catOf(m); const h = hostOf(m);
  const joined = currentJoined(m); const full = joined >= m.capacity && !store.isJoined(m.id);
  const mine = store.isJoined(m.id);
  const past = isPast(m);
  const reviews = store.getReviews(m.id);

  app().innerHTML = `
  <a class="back" href="#/explore">← 모임 목록</a>
  <article class="detail">
    <div class="detail-banner">${bannerSVG(m.category, hashSeed(m.id))}<span class="cat-chip big">${c.emoji} ${esc(c.name)}</span></div>
    <h1>${esc(m.title)}</h1>
    <div class="tagrow">${badge(m.difficulty,"diff")} ${m.tags.map((t)=>badge("#"+t)).join(" ")}</div>

    <dl class="facts">
      <div><dt>📅 일정</dt><dd>${esc(m.date)} ${esc(m.time)}</dd></div>
      <div><dt>📍 장소</dt><dd>${esc(m.location)} <small class="muted">(${esc(m.region)})</small></dd></div>
      <div><dt>👥 정원</dt><dd>${joined} / ${m.capacity}명 ${full ? '<span class="badge full">마감</span>' : `<span class="badge">잔여 ${m.capacity - joined}</span>`}</dd></div>
      <div><dt>💳 참가비</dt><dd>${esc(m.fee)} <small class="muted">· 호스트에게 지불하는 돈이 아닌 실비/각자부담</small></dd></div>
    </dl>

    <h2>활동 소개</h2>
    <p class="desc">${esc(m.description)}</p>

    <div class="host-card">
      ${avatarSVG(h.avatarSeed, 56)}
      <div>
        <strong>${esc(h.name)}</strong> ${h.verified ? badge("본인확인 ✅","verify") : badge("미인증","muted-badge")}
        <div class="muted">⭐ ${esc(h.rating)} · 후기 ${esc(h.reviewsCount||0)}개</div>
        ${mannerBar(h.mannerTemp)}
        <p class="muted small">${esc(h.bio)}</p>
      </div>
    </div>

    <div class="join-row">
      <button id="join-btn" class="btn primary big" ${full ? "disabled" : ""}>
        ${mine ? "✅ 신청 완료 — 취소하기" : full ? "정원이 찼어요" : "🙌 참가 신청하기"}
      </button>
      <button id="report-btn" class="btn ghost" title="부적절한 모임 신고">🚩 신고</button>
    </div>
    ${m.capacity <= 6 ? `<p class="tip">💡 소규모(${m.capacity}명) 모임이에요. 서로 얼굴을 익히기 좋아요.</p>` : ""}
    <p class="tip">🛡️ 첫 만남은 <strong>공개된 장소·낮 시간·여럿이 함께</strong>를 권장해요. 부담되면 언제든 취소할 수 있어요.</p>

    <section class="reviews">
      <h2>후기 ${reviews.length ? `(${reviews.length})` : ""}</h2>
      ${past ? reviewForm(m.id) : `<p class="muted">모임이 끝난 뒤(${esc(m.date)} 이후) 후기를 남길 수 있어요.</p>`}
      <div id="review-list">${reviews.map(reviewItem).join("") || `<p class="muted">아직 후기가 없어요.</p>`}</div>
    </section>
  </article>`;

  $("#join-btn").addEventListener("click", () => {
    if (isFull(m) && !store.isJoined(m.id)) return;
    const res = store.toggleJoin(m.id);
    if (res.joined && res.firstEver) toast("🎉 첫 참가를 환영해요! '첫 참가자 환영 배지'를 받았어요.", "ok");
    else if (res.joined) toast("참가 신청 완료! 내 모임에서 확인하세요.", "ok");
    else toast("참가를 취소했어요.", "warn");
    renderDetail(id);
  });
  $("#report-btn").addEventListener("click", () => {
    toast("신고가 접수되었어요 (데모). 운영팀이 검토합니다.", "warn");
  });
  const rf = $("#review-form");
  if (rf) rf.addEventListener("submit", (e) => {
    e.preventDefault();
    const rating = Number($("#rv-rating").value);
    const text = $("#rv-text").value.trim();
    if (!text) { toast("후기 내용을 입력해 주세요.", "warn"); return; }
    store.addReview({ meetupId: m.id, rating, text });
    toast("후기가 등록되었어요. 고마워요!", "ok");
    renderDetail(id);
  });
}
function reviewForm(meetupId) {
  return `
  <form id="review-form" class="review-form" data-meetup="${esc(meetupId)}">
    <label>평점
      <select id="rv-rating">${[5,4,3,2,1].map((n)=>`<option value="${n}">${"⭐".repeat(n)} (${n})</option>`).join("")}</select>
    </label>
    <textarea id="rv-text" rows="2" placeholder="어떤 점이 좋았나요? 다른 참가자에게 도움이 돼요."></textarea>
    <button class="btn primary" type="submit">후기 남기기</button>
  </form>`;
}
function reviewItem(r) {
  return `<div class="review"><span class="stars">${"⭐".repeat(r.rating)}</span> <p>${esc(r.text)}</p>
    <small class="muted">${new Date(r.ts).toLocaleDateString("ko-KR")}</small></div>`;
}

// ---- view: create ------------------------------------------------------
function renderCreate() {
  const cats = state.categories;
  app().innerHTML = `
  <a class="back" href="#/explore">← 모임 목록</a>
  <h1>모임 만들기 ➕</h1>
  <p class="muted">공개된 장소에서 열리는 소규모 취미 모임을 만들어요. (데모: 내 브라우저에만 저장됩니다)</p>
  <form id="create-form" class="form">
    <label>제목 *<input name="title" required maxlength="60" placeholder="예) 북한산 초보 등산" /></label>
    <label>취미 카테고리 *
      <select name="category" required>${cats.map((c)=>`<option value="${c.id}">${c.emoji} ${esc(c.name)}</option>`).join("")}</select>
    </label>
    <div class="two">
      <label>지역 *<input name="region" required placeholder="예) 서울 마포" /></label>
      <label>장소 *<input name="location" required placeholder="예) 홍대입구역 2번 출구" /></label>
    </div>
    <div class="two">
      <label>날짜 *<input name="date" type="date" required /></label>
      <label>시간 *<input name="time" type="time" required /></label>
    </div>
    <div class="two">
      <label>정원 * <small class="muted">(소규모 권장)</small>
        <input name="capacity" type="number" min="2" max="20" value="6" required /></label>
      <label>난이도<select name="difficulty"><option>초급</option><option>중급</option><option>고급</option></select></label>
    </div>
    <label>참가비 안내<input name="fee" value="무료" placeholder="예) 무료 / 재료비 실비" /></label>
    <label>관심사 태그 <small class="muted">(쉼표로 구분)</small><input name="tags" placeholder="초보환영, 소규모, 힐링" /></label>
    <label>활동 소개 *<textarea name="description" rows="4" required placeholder="어떤 활동인지, 누구에게 좋은지 소개해 주세요."></textarea></label>
    <button class="btn primary big" type="submit">모임 등록하기</button>
  </form>`;

  $("#create-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const cap = Math.max(2, Math.min(20, Number(fd.get("capacity")) || 6));
    const tags = String(fd.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean);
    const m = {
      id: "u" + Date.now().toString(36),
      title: String(fd.get("title")).trim(),
      category: fd.get("category"),
      region: String(fd.get("region")).trim(),
      location: String(fd.get("location")).trim(),
      date: fd.get("date"),
      time: fd.get("time"),
      capacity: cap,
      joinedBase: 1, // host counts as first member
      difficulty: fd.get("difficulty"),
      fee: String(fd.get("fee") || "무료"),
      tags: tags.length ? tags : ["초보환영"],
      hostId: state.hosts[0].id, // demo user borrows a host profile
      description: String(fd.get("description")).trim(),
      _mine: true
    };
    store.addCreatedMeetup(m);
    toast("모임이 등록되었어요! 🎉", "ok");
    location.hash = "#/meetup/" + m.id;
  });
}

// ---- view: match (taste survey) ---------------------------------------
function renderMatch() {
  const cats = state.categories;
  const regions = [...new Set(state.meetups.map((m) => m.region))].sort();
  const prev = store.getSurvey();
  app().innerHTML = `
  <h1>취향 매칭 ✨</h1>
  <p class="muted">몇 가지만 알려주시면 규칙 기반으로 어울리는 모임을 추천해요. (로그인·개인정보 없음)</p>
  <form id="survey" class="form survey">
    <fieldset>
      <legend>관심 있는 취미 (여러 개 선택)</legend>
      <div class="chips">
        ${cats.map((c)=>`<label class="chip"><input type="checkbox" name="interests" value="${c.id}"
          ${prev && prev.interests.includes(c.id) ? "checked":""}/> ${c.emoji} ${esc(c.name)}</label>`).join("")}
      </div>
    </fieldset>
    <fieldset>
      <legend>활동 성향</legend>
      <label class="radio"><input type="radio" name="activityLevel" value="high" ${prev&&prev.activityLevel==="high"?"checked":""}/> 활발하게 움직이는 편</label>
      <label class="radio"><input type="radio" name="activityLevel" value="mid" ${!prev||prev.activityLevel==="mid"?"checked":""}/> 적당히 균형있게</label>
      <label class="radio"><input type="radio" name="activityLevel" value="low" ${prev&&prev.activityLevel==="low"?"checked":""}/> 차분하게 즐기는 편</label>
    </fieldset>
    <fieldset>
      <legend>선호하는 모임 규모</legend>
      <label class="radio"><input type="radio" name="groupPref" value="small" ${!prev||prev.groupPref==="small"?"checked":""}/> 소규모(~6)</label>
      <label class="radio"><input type="radio" name="groupPref" value="medium" ${prev&&prev.groupPref==="medium"?"checked":""}/> 보통(7~9)</label>
      <label class="radio"><input type="radio" name="groupPref" value="large" ${prev&&prev.groupPref==="large"?"checked":""}/> 큰 모임(10+)</label>
      <label class="radio"><input type="radio" name="groupPref" value="any" ${prev&&prev.groupPref==="any"?"checked":""}/> 상관없음</label>
    </fieldset>
    <div class="two">
      <label>선호 지역
        <select name="region"><option value="">상관없음</option>
        ${regions.map((r)=>`<option value="${esc(r)}" ${prev&&prev.regions.includes(r)?"selected":""}>${esc(r)}</option>`).join("")}</select>
      </label>
      <label>난이도
        <select name="difficulty">
          <option value="any">상관없음</option>
          ${["초급","중급","고급"].map((d)=>`<option value="${d}" ${prev&&prev.difficulty===d?"selected":""}>${d}</option>`).join("")}
        </select>
      </label>
    </div>
    <button class="btn primary big" type="submit">추천 받기</button>
  </form>
  <div id="match-results"></div>`;

  $("#survey").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const interests = fd.getAll("interests");
    const regionVal = fd.get("region");
    const survey = {
      interests,
      activityLevel: fd.get("activityLevel") || "mid",
      groupPref: fd.get("groupPref") || "any",
      regions: regionVal ? [regionVal] : [],
      difficulty: fd.get("difficulty") || "any"
    };
    if (!interests.length) { toast("관심 취미를 하나 이상 선택해 주세요.", "warn"); return; }
    store.saveSurvey(survey);
    showRecommendations(survey);
  });

  if (prev && prev.interests.length) showRecommendations(prev);
}

function showRecommendations(survey) {
  const ranked = recommend(survey, allMeetups(), state.hostsById, state.categoriesById, currentJoined)
    .filter((r) => r.score > 0)
    .slice(0, 8);
  const box = $("#match-results");
  if (!ranked.length) { box.innerHTML = `<p class="empty">아직 딱 맞는 모임이 없어요. 관심사를 넓혀보세요.</p>`; return; }
  box.innerHTML = `
    <h2>당신에게 어울리는 모임 🎯</h2>
    <div class="grid">
      ${ranked.map((r) => {
        const m = r.meetup;
        return `<div class="card rec">
          <a href="#/meetup/${esc(m.id)}" class="rec-link">
            <div class="card-banner">${bannerSVG(m.category, hashSeed(m.id))}
              <span class="match-pct">${r.percent}% 매치</span></div>
            <div class="card-body">
              <h3>${esc(m.title)}</h3>
              <p class="muted">${catOf(m).emoji} ${esc(catOf(m).name)} · 📍 ${esc(m.region)} · 📅 ${esc(m.date)}</p>
            </div>
          </a>
          <ul class="reasons">${r.reasons.map((x)=>`<li>✔ ${esc(x)}</li>`).join("")}</ul>
          <div class="ai-explain">
            <button type="button" class="btn ghost small-btn" data-ai-explain="${esc(m.id)}">🤖 AI 설명</button>
            <div class="ai-explain-out ai-out" hidden></div>
          </div>
        </div>`;
      }).join("")}
    </div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });

  // AI: explain a recommendation in natural language (mock unless AI_ENDPOINT set)
  box.querySelectorAll("[data-ai-explain]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-ai-explain");
      const r = ranked.find((x) => x.meetup.id === id);
      if (!r) return;
      const out = btn.parentElement.querySelector(".ai-explain-out");
      btn.disabled = true;
      out.hidden = false;
      out.textContent = "";
      try {
        await askAI("explainMatch", {
          survey,
          meetup: r.meetup,
          category: catOf(r.meetup),
          reasons: r.reasons,
          percent: r.percent,
          categoriesById: state.categoriesById
        }, { onToken: (t) => { out.textContent += t; } });
      } catch (err) {
        out.textContent = "AI 설명을 불러오지 못했어요: " + err.message;
      } finally {
        btn.disabled = false;
      }
    });
  });
}

// ---- AI shared context -------------------------------------------------
// The mock provider reuses these (and js/matcher.js); the backend receives
// the same payload with functions stripped out.
function aiContext(extra = {}) {
  return {
    meetups: allMeetups(),
    hostsById: state.hostsById,
    categoriesById: state.categoriesById,
    categories: state.categories,
    getJoined: currentJoined,
    ...extra
  };
}

// ---- view: ai (chatbot + icebreaker) -----------------------------------
function renderAI() {
  const mode = aiMode();
  const cats = state.categories;
  app().innerHTML = `
  <h1>AI 도우미 🤖</h1>
  <p class="muted">취미 모임을 더 쉽게 찾고 소개할 수 있게 도와드려요.
    현재 <strong>${mode === "live" ? "실시간 AI(백엔드 연동)" : "데모(오프라인 Mock)"}</strong> 모드예요.</p>
  <div class="ai-note tip">🛡️ 같이해요 AI는 <strong>공개·소규모 취미 그룹 모임</strong>만 다뤄요.
    유료 데이트·연애·금전 거래는 다루지 않아요.</div>

  <section class="ai-block">
    <h2>💬 AI 모임 추천 챗봇</h2>
    <p class="muted small">관심 취미와 지역을 자유롭게 적어보세요. 예) "주말에 서울에서 등산 초보 모임 있을까요?"</p>
    <div id="ai-chat" class="ai-chat" aria-live="polite"></div>
    <form id="ai-chat-form" class="ai-inputrow">
      <input id="ai-chat-input" type="text" autocomplete="off"
        placeholder="어떤 취미로 만나고 싶으세요?" />
      <button class="btn primary" type="submit">보내기</button>
    </form>
    <div class="ai-quick">
      ${["등산 초보 모임 추천해줘","서울에서 보드게임 같이 할 사람","주말 사진출사 어디 없나요"]
        .map((q)=>`<button type="button" class="chip ai-quick-btn" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
    </div>
  </section>

  <section class="ai-block">
    <h2>✍️ 아이스브레이커 · 모임 소개글 생성</h2>
    <p class="muted small">모임을 하나 고르면 소개글 초안과 아이스브레이커 질문을 만들어 드려요.</p>
    <div class="ai-inputrow">
      <select id="ai-ib-select">
        ${allMeetups().slice(0, 40).map((m)=>`<option value="${esc(m.id)}">${catOf(m).emoji} ${esc(m.title)} · ${esc(m.region)}</option>`).join("")}
      </select>
      <button id="ai-ib-btn" class="btn primary" type="button">생성하기</button>
    </div>
    <pre id="ai-ib-out" class="ai-out" hidden></pre>
  </section>`;

  const chat = $("#ai-chat");
  const addMsg = (who, text) => {
    const el = document.createElement("div");
    el.className = "ai-msg " + who;
    el.textContent = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  };
  addMsg("bot", "안녕하세요! 어떤 취미로 사람들과 만나고 싶으세요? 관심사와 지역을 알려주세요. 🌿");

  async function sendChat(text) {
    const q = text.trim();
    if (!q) return;
    addMsg("me", q);
    const out = addMsg("bot", "");
    out.classList.add("streaming");
    try {
      await askAI("recommend", aiContext({ message: q }), { onToken: (t) => {
        out.textContent += t; chat.scrollTop = chat.scrollHeight;
      }});
    } catch (err) {
      out.textContent = "죄송해요, 답변을 가져오지 못했어요: " + err.message;
    } finally {
      out.classList.remove("streaming");
    }
  }

  $("#ai-chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#ai-chat-input");
    const v = input.value;
    input.value = "";
    sendChat(v);
  });
  app().querySelectorAll(".ai-quick-btn").forEach((b) => {
    b.addEventListener("click", () => sendChat(b.getAttribute("data-q")));
  });

  $("#ai-ib-btn").addEventListener("click", async () => {
    const id = $("#ai-ib-select").value;
    const m = findMeetup(id);
    if (!m) return;
    const out = $("#ai-ib-out");
    const btn = $("#ai-ib-btn");
    btn.disabled = true;
    out.hidden = false;
    out.textContent = "";
    try {
      await askAI("icebreaker", {
        meetup: m,
        category: catOf(m),
        categoriesById: state.categoriesById
      }, { onToken: (t) => { out.textContent += t; } });
    } catch (err) {
      out.textContent = "생성에 실패했어요: " + err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---- view: mine --------------------------------------------------------
function renderMine() {
  const st = store.getState();
  const joined = allMeetups().filter((m) => st.joinedMeetupIds.includes(m.id));
  const created = store.getCreatedMeetups();
  app().innerHTML = `
  <h1>내 모임 🗂️</h1>
  ${st.seenWelcome ? `<p class="welcome-badge">🏅 첫 참가자 환영 배지 획득!</p>` : ""}
  <section>
    <h2>신청한 모임 (${joined.length})</h2>
    <div class="grid">${joined.length ? joined.map(meetupCard).join("") : `<p class="muted">아직 신청한 모임이 없어요. <a href="#/explore">둘러보기</a></p>`}</div>
  </section>
  <section>
    <h2>내가 만든 모임 (${created.length})</h2>
    <div class="grid">${created.length ? created.map(meetupCard).join("") : `<p class="muted">아직 만든 모임이 없어요. <a href="#/create">모임 만들기</a></p>`}</div>
  </section>
  <section>
    <h2>내가 쓴 후기 (${st.reviews.length})</h2>
    <div>${st.reviews.length ? st.reviews.map((r)=>{
      const m = findMeetup(r.meetupId);
      return `<div class="review"><span class="stars">${"⭐".repeat(r.rating)}</span> <strong>${esc(m?m.title:"모임")}</strong>
        <p>${esc(r.text)}</p></div>`;
    }).join("") : `<p class="muted">후기가 없어요.</p>`}</div>
  </section>`;
}

// ---- view: safety ------------------------------------------------------
function renderSafety() {
  app().innerHTML = `
  <h1>안전 가이드 🛡️</h1>
  <p class="muted">같이해요는 <strong>건전한 취미 모임</strong>을 위한 서비스예요. 유료 만남·데이트·금전 거래를 위한 곳이 아닙니다.</p>
  <div class="safety-grid">
    <div class="safety"><h3>📍 공개된 장소에서</h3><p>첫 만남은 사람이 많은 공개 장소, 가급적 낮 시간에 가지세요.</p></div>
    <div class="safety"><h3>👥 소규모·여럿이 함께</h3><p>1:1보다 여러 명이 함께하는 그룹 모임을 권장해요.</p></div>
    <div class="safety"><h3>🚩 신고 기능</h3><p>불쾌하거나 부적절한 언행은 모임 상세의 신고 버튼으로 알려주세요.</p></div>
    <div class="safety"><h3>✅ 본인확인 배지</h3><p>본인확인(mock) 호스트에는 배지가 표시돼요. 실제 서비스에선 신원 인증이 붙습니다.</p></div>
    <div class="safety"><h3>🌡️ 매너온도</h3><p>다른 참가자 평가가 쌓인 매너온도(mock)로 신뢰를 가늠하세요.</p></div>
    <div class="safety"><h3>💳 금전 거래 금지</h3><p>참가비는 실비/각자부담이며 호스트에게 지불하는 돈이 아니에요. 개인 간 송금을 요구하면 신고해 주세요.</p></div>
  </div>
  <div class="noshow">
    <h3>🙅 노쇼 방지 안내</h3>
    <p>참석이 어려우면 미리 취소해 다른 분에게 자리를 양보해 주세요. 무단 불참이 반복되면 매너온도가 내려갈 수 있어요.</p>
  </div>
  <p class="tip"><strong>데모 안내:</strong> 신고·본인확인·매너온도는 모두 목업(mock)이며 실제 심사는 이뤄지지 않습니다.</p>`;
}

// ---- router ------------------------------------------------------------
function router() {
  const hash = location.hash || "#/explore";
  const [, route, param] = hash.split("/");
  const key = ("#/" + (route || "explore"));
  setActiveNav(key);
  window.scrollTo(0, 0);
  switch (route) {
    case "meetup": renderDetail(param); break;
    case "create": renderCreate(); break;
    case "match": renderMatch(); break;
    case "ai": renderAI(); break;
    case "mine": renderMine(); break;
    case "safety": renderSafety(); break;
    case "explore":
    default: renderExplore(); break;
  }
}
function setActiveNav(key) {
  document.querySelectorAll("#topnav a[data-route]").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === key);
  });
}

// ---- boot --------------------------------------------------------------
async function boot() {
  // theme toggle
  const themeBtn = $("#theme-toggle");
  const saved = (() => { try { return localStorage.getItem("gh.theme"); } catch { return null; } })();
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  themeBtn?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("gh.theme", next); } catch { /* ignore */ }
  });
  $("#reset-btn")?.addEventListener("click", () => {
    if (confirm("내 참가·모임·후기 데이터를 모두 초기화할까요? (데모)")) {
      store.resetAll(); toast("초기화했어요.", "warn"); router();
    }
  });
  if (!store.storageHealthy()) toast("이 브라우저는 저장이 제한돼요. 세션 동안만 유지됩니다.", "warn");

  try {
    await loadData();
  } catch (err) {
    app().innerHTML = `<p class="empty">데이터를 불러오지 못했어요. 로컬 서버(예: <code>python -m http.server</code>)로 열어주세요.<br><small>${esc(err.message)}</small></p>`;
    return;
  }
  window.addEventListener("hashchange", router);
  router();
}

document.addEventListener("DOMContentLoaded", boot);
