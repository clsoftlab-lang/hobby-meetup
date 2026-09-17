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
   (키 없음)                                (ANTHROPIC_API_KEY)       claude-opus-5
```

- 엔드포인트: `POST /api/ai` (본문 `{ "task": "...", "payload": {...} }`)
- 헬스체크: `GET /health`
- 응답은 일반 텍스트로 토큰 단위 스트리밍됩니다.
- 모델: `claude-opus-5`, `max_tokens: 2048`, `thinking: { type: "adaptive" }`.

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
| `PORT` | 리슨 포트 (기본 `8787`). |
| `CORS_ORIGIN` | 허용 오리진 (기본 `*`). 배포 시 사이트 오리진으로 제한 권장. |

## 참고

- CI에서는 이 서버를 설치·실행하지 않습니다(`npm install`/네트워크 없음).
  저장소 검사(`node check.mjs`)는 `node --check`로 구문만 검증합니다.
- 프로덕션에서는 인증·요청 제한(rate limit)·로깅을 추가하세요.
