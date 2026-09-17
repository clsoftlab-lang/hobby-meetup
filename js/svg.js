// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// svg.js — inline SVG placeholder art. No external images.

// A friendly geometric avatar derived from a numeric hue seed.
export function avatarSVG(seed = 0, size = 56) {
  const hue = ((seed % 360) + 360) % 360;
  const hue2 = (hue + 40) % 360;
  const id = "g" + Math.abs(seed) + "_" + size;
  return `
<svg width="${size}" height="${size}" viewBox="0 0 56 56" role="img" aria-label="프로필 이미지" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 62%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 70% 52%)"/>
    </linearGradient>
  </defs>
  <rect width="56" height="56" rx="16" fill="url(#${id})"/>
  <circle cx="28" cy="22" r="9" fill="rgba(255,255,255,.9)"/>
  <path d="M12 48c0-9 8-14 16-14s16 5 16 14z" fill="rgba(255,255,255,.9)"/>
</svg>`;
}

// Simple activity artwork per category (used as card banner).
const ART = {
  hiking:      "M0 90 L40 40 L70 70 L110 20 L160 90 Z",
  running:     "M20 80 q30 -50 60 0 t60 0",
  cycling:     "M20 80 q30 -50 60 0 t60 0",
  boardgame:   "M40 30 h80 v60 h-80 Z",
  exhibition:  "M30 25 h100 v50 h-100 Z",
  study:       "M30 30 h100 v6 h-100 Z M30 50 h80 v6 h-80 Z M30 70 h90 v6 h-90 Z",
  photography: "M40 40 h80 v40 h-80 Z",
  cooking:     "M40 70 q40 -60 80 0 Z",
  climbing:    "M30 90 L60 30 L90 70 L130 20"
};

export function bannerSVG(categoryId = "study", seed = 0) {
  const hue = ((seed * 37) % 360 + 360) % 360;
  const path = ART[categoryId] || ART.study;
  const id = "b" + Math.abs(seed) + categoryId;
  return `
<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="활동 이미지" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 65% 60%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 50) % 360} 65% 45%)"/>
    </linearGradient>
  </defs>
  <rect width="160" height="100" fill="url(#${id})"/>
  <path d="${path}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
