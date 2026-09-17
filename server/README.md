<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국) -->

# 같이해요 — AI 프록시 서버 (선택)

이 폴더는 **선택 사항**입니다. 데모는 서버 없이도 `ai/`의 결정론적 MockProvider로
완전히 동작합니다. 실제 Claude를 붙이고 싶을 때만 이 프록시를 실행하세요.

> **핵심 보안 원칙: API 키는 오직 서버에만 둡니다.** 브라우저나 저장소(repo)에는
> 절대 키를 넣지 않습니다. 프론트엔드는 `AI_ENDPOINT`(이 서버 주소)로 `{task,payload}`만
> 보내고, 키를 사용하는 Claude 호출은 이 프로세스에서만 일어납니다.

## 동작 방식

```
브라우저 ai/ai.js ──POST {task,payload}──▶ server/index.mjs ──▶ Claude (스트리밍)
   (키 없음)                                (ANTHROPIC_API_KEY)     claude-haiku-4-5
```

- 엔드포인트: `POST /api/ai` (본문 `{ "task": "...", "payload": {...} }`)
- 헬스체크: `GET /health`
- 응답은 일반 텍스트로 토큰 단위 스트리밍됩니다.
- 기본 모델: **`claude-haiku-4-5`** (저비용), `max_tokens` 기본 `700`.
  - `AI_MODEL`로 `claude-sonnet-5` / `claude-opus-5` 로 올릴 수 있습니다.
  - **프롬프트 캐싱**: 태스크별 시스템 프롬프트를 `cache_control:{type:'ephemeral'}` 블록으로 보냅니다.
  - Haiku 4.5는 adaptive thinking/effort를 받지 않으므로 Haiku일 때는 `thinking`/`effort`를 보내지 않고,
    그 외 모델은 `thinking:{type:'adaptive'}` + `output_config:{effort: AI_EFFORT||'low'}`를 보냅니다.

## 비용 가드레일 (무인·저비용)

- IP당 요청 제한 (기본 `20/분`, `AI_RATE_PER_MIN`).
- 월간 토큰 예산 (`AI_MONTHLY_TOKEN_CAP`, 기본 `2000000`). 스트림 최종 메시지의 `usage`로 누적합니다.
- 한도 초과 시 **HTTP 429 `{fallback:true}`**를 반환하고, 프론트엔드(`ai/ai.js`)는 자동으로
  오프라인 Mock으로 폴백해 앱이 멈추지 않습니다.

## 실행

```bash
cd server
npm install
cp .env.example .env          # .env 는 git-ignore 됩니다
# .env 안의 ANTHROPIC_API_KEY 에 실제 키(sk-ant-...) 입력
npm start                     # 또는: node index.mjs
```

그다음 프론트엔드 `ai/config.js`에서 엔드포인트를 지정합니다:

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

`AI_ENDPOINT`를 다시 빈 문자열 `""`로 되돌리면 즉시 오프라인 Mock 모드로 돌아갑니다.

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `ANTHROPIC_API_KEY` | **필수.** Anthropic API 키. `.env`에만 두고 커밋 금지. |
| `AI_MODEL` | 모델 (기본 `claude-haiku-4-5`). `claude-sonnet-5`/`claude-opus-5` 가능. |
| `AI_MAX_TOKENS` | 출력 상한 (기본 `700`). |
| `AI_EFFORT` | 비-Haiku 모델의 effort (기본 `low`). |
| `AI_RATE_PER_MIN` | IP당 분당 요청 제한 (기본 `20`). |
| `AI_MONTHLY_TOKEN_CAP` | 월간 토큰 예산 (기본 `2000000`). |
| `PORT` | 리슨 포트 (기본 `8787`). |
| `CORS_ORIGIN` | 허용 오리진 (기본 `*`). 배포 시 사이트 오리진으로 제한 권장. |

## 무료 배포 — Cloudflare Workers (`worker.js`, 무인)

관리할 서버 없이 무료 티어에서 상시 구동됩니다. REST(`POST https://api.anthropic.com/v1/messages`)를
호출하며, 동일한 태스크 라우팅·모델·캐싱 규칙을 따릅니다. 실패 시 429 `{fallback:true}`로 응답해
프론트엔드가 Mock으로 폴백합니다.

```bash
npm i -g wrangler          # 또는: npx wrangler ...
cd server
wrangler secret put ANTHROPIC_API_KEY   # 키는 Worker 시크릿으로만 저장 (repo 커밋 금지)
wrangler deploy                          # wrangler.toml 사용
```

배포 후 프론트엔드 `ai/config.js`의 `AI_ENDPOINT`를 Worker 주소(끝에 `/api/ai`)로 지정하세요.
모델/상한은 `wrangler.toml`의 `[vars]`(또는 대시보드)에서 조정합니다.

## 참고

- CI에서는 이 서버를 설치·실행하지 않습니다(`npm install`/네트워크 없음).
  저장소 검사(`node check.mjs`)는 `node --check`로 구문만 검증합니다.
- 프로덕션에서는 인증·요청 제한(rate limit)·로깅을 추가하세요.
