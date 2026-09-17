<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국) -->

# 같이해요 (Together) — Hobby Meetup & Friend Matching

A wholesome, hobby-based **group meetup** app: connect with people who want to do an
activity *together* — hiking, board games, running, exhibitions, study, photo walks,
cooking classes, cycling, climbing. Companionship through shared hobbies.

> 🌿 **Wholesome reframing (on purpose).** This project deliberately reframes a
> problematic "paid dating" C2C marketplace idea into a **safe, positive, hobby-based
> group-meetup app**. There is **no paid dating, no romantic/transactional matching, and
> no 1:1 paid arrangements** — only public, small-group activities built around shared
> interests.

**🔗 LIVE DEMO: https://clsoftlab-lang.github.io/hobby-meetup/**

*(Korean version: [README.ko.md](README.ko.md))*

---

## ⚠️ DEMO-MODE BOUNDARIES (read this first)

**Everything here runs entirely in your browser. This is a demonstration, not a real service.**

- **All meetups and hosts are fictional** seed data from `data/*.json`.
- **localStorage is used, which is NOT a real database** — your joins, created meetups,
  reviews, and survey are stored only on your device and shared with no one.
- **No real accounts, no PII, no real identity verification.** The 본인확인 badge, 매너온도
  (manner temperature), and 신고 (report) features are **mock/placeholder** only.
- A production build would add: a backend + real database, real identity verification,
  human safety moderation, authentication/authorization, and abuse prevention.

---

## Features (all actually work in demo mode)

- **모임 탐색 (Explore)** — browse meetups; filter by hobby category, region, difficulty;
  full-text search; sort by date / remaining seats / host rating.
- **모임 상세 (Detail)** — activity intro, schedule & public location, capacity & current
  members, host profile with rating and manner temperature, join button.
- **참가 신청 (Join)** — join a meetup and the remaining capacity **decrements live**;
  cancel to free the seat. First-ever join grants a **첫 참가자 환영 배지** (welcome badge).
- **모임 만들기 (Create)** — a form that saves a new meetup to localStorage.
- **취향 매칭 (Taste matching)** — a short survey (interests, activity level, group-size
  preference, region, difficulty) → **rule-based recommendations with reasons**, via
  [`js/matcher.js`](js/matcher.js).
- **내 모임 (My meetups)** — meetups you joined and created, plus reviews you wrote.
- **후기/평점 (Reviews)** — leave a star rating + review *after a meetup's date has passed*.
- **안전장치 (Safety)** — visible safety guide, report button (mock), manner-temperature
  and identity-verification badges (mock), no-show prevention notice, small-capacity tips.
- **관심사 태그, 라이트/다크 테마, 반응형 모바일 우선 UI.**

## How matching works (`matcher.js`, rule-based)

Each meetup is scored against the survey and the best 8 (score > 0) are shown with the
exact reasons they matched:

| Signal | Points |
| --- | --- |
| Meetup category is one of your interests | +40 |
| Category energy matches your activity level (adjacent = +7) | +15 |
| Meetup is in a region you prefer | +20 |
| Difficulty matches your choice | +15 |
| Group-size bucket matches your preference | +15 |
| Host trust signals (verified / warm manner / high rating) | up to +10 |

Results are sorted best-first, **open meetups before full ones**, then by date. A match
percentage is `score / maxScore`. The scoring functions are pure and unit-tested in
`check.mjs`.

## How join & safety work

- **Join:** `storage.js#toggleJoin` records the meetup id in localStorage; the detail and
  card views compute *current members = base + (1 if you joined)*, so capacity reflects
  your action immediately and blocks joining a full meetup.
- **Safety:** the app emphasizes **public places, daytime, small groups**, shows mock
  verification/manner badges to gauge trust, provides a report action, and clearly states
  that any fee is a shared/at-cost amount — **never a payment to a host** and never a
  transactional/romantic arrangement.

## Run locally

No build step, no dependencies. Serve the folder over HTTP (ES modules + `fetch` need it):

```bash
python -m http.server 8996
# then open http://localhost:8996
```

Run the CI checks locally:

```bash
node check.mjs
```

## Deploy (GitHub Pages)

This is a static site with `index.html` at the repo root and relative paths only. Enable
**Settings → Pages → Deploy from branch → `main` / root**. The demo will be live at
`https://clsoftlab-lang.github.io/hobby-meetup/`.

## Project structure

```
hobby-meetup/
├─ index.html            # SPA shell (hash router mounts views into #app)
├─ css/styles.css        # mobile-first, light + dark
├─ js/
│  ├─ app.js             # views, router, filters, join, create, reviews
│  ├─ matcher.js         # rule-based recommendation engine (pure, tested)
│  ├─ storage.js         # localStorage persistence (try/catch + reset)
│  └─ svg.js             # inline SVG avatars & activity art
├─ data/
│  ├─ categories.json    # 9 hobby categories
│  ├─ hosts.json         # 20 fictional hosts
│  └─ meetups.json       # 38 fictional meetups
├─ check.mjs             # CI gate (JSON, node --check, containers, unit tests)
├─ .github/workflows/ci.yml
├─ LICENSE               # Apache-2.0
├─ README.md / README.ko.md
```

## Tech

Plain **HTML + CSS + ES-module JavaScript**. No framework, no bundler, no runtime
dependencies. Data loaded from static JSON via `fetch`. Persistence via `localStorage`.
Avatars/artwork are inline SVG.

## Demo data

9 categories · 20 hosts · 38 meetups (all fictional).

## Contributors

- **Dr. Lee Il-guk (이일국)** — CLSOFTLAB (씨엘소프트랩)
- **LWJ**
- **LMJ**
- **Claude** (Anthropic) — pair-programming assistant

## License

- Code: **Apache-2.0** (see [LICENSE](LICENSE)).
- Documentation: **CC BY 4.0**.
- SPDX headers: `Apache-2.0`, `Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)`.

---

**Not an official Anthropic product.**

## 🎓 Idea origin

The seed idea for this project came from the **entrepreneurship class taught by Dr. Lee Il-guk (이일국) at Yongin University (용인대학교)**. The students in that class produced startup ideas of remarkable, standout creativity — this project is one of those exceptional ideas, finally brought to life as a working service. Built with deep admiration and gratitude for those students' imagination. *(No student personal information is included; only the idea itself was used, implemented clean-room.)*
