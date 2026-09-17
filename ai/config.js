// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// config.js — AI-KIT configuration.
//
// AI_ENDPOINT selects the provider used by ai/ai.js#askAI:
//   • ""  (empty, the shipped demo default) → deterministic Korean MockProvider,
//         which reuses the app's own meetups/hosts data + js/matcher.js.
//         Nothing leaves the browser; no API key exists anywhere.
//   • a URL (e.g. "http://localhost:8787/api/ai") → the app POSTs {task,payload}
//         to that endpoint and streams the reply. The endpoint must be the
//         server-side proxy in server/, which holds ANTHROPIC_API_KEY.
//
// SECURITY: never put an API key here or anywhere in the browser/repo. The key
// lives only in the server process's environment. This file ships empty on
// purpose so the demo runs fully offline via the mock.
export const AI_ENDPOINT = "";
