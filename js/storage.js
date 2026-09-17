// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// storage.js — DEMO-MODE persistence layer.
// Everything lives in the browser's localStorage. This is NOT a real database:
// data never leaves the device, is shared with no one, and can be wiped anytime.

const KEY = "gatchiHaeyo.v1";

const EMPTY = {
  joinedMeetupIds: [],   // meetups the demo user joined
  createdMeetups: [],    // meetups the demo user created (full objects)
  reviews: [],           // { id, meetupId, rating, text, ts }
  survey: null,          // last taste-survey answers
  seenWelcome: false     // first-join welcome badge shown?
};

let memoryFallback = null; // used when localStorage is unavailable

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed };
  } catch (err) {
    console.warn("[storage] load failed, using in-memory fallback:", err);
    return memoryFallback ? { ...memoryFallback } : { ...EMPTY };
  }
}

function save(state) {
  memoryFallback = { ...state };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn("[storage] save failed (data kept in memory only):", err);
    return false;
  }
}

export function getState() {
  return load();
}

export function resetAll() {
  memoryFallback = { ...EMPTY };
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.warn("[storage] reset failed:", err);
  }
  return { ...EMPTY };
}

// ---- joins -------------------------------------------------------------
export function isJoined(meetupId) {
  return load().joinedMeetupIds.includes(meetupId);
}

// returns { joined:boolean, firstEver:boolean }
export function toggleJoin(meetupId) {
  const state = load();
  const already = state.joinedMeetupIds.includes(meetupId);
  let firstEver = false;
  if (already) {
    state.joinedMeetupIds = state.joinedMeetupIds.filter((id) => id !== meetupId);
  } else {
    state.joinedMeetupIds.push(meetupId);
    if (!state.seenWelcome) {
      firstEver = true;
      state.seenWelcome = true;
    }
  }
  save(state);
  return { joined: !already, firstEver };
}

// ---- created meetups ---------------------------------------------------
export function addCreatedMeetup(meetup) {
  const state = load();
  state.createdMeetups.push(meetup);
  save(state);
  return meetup;
}

export function getCreatedMeetups() {
  return load().createdMeetups;
}

// ---- reviews -----------------------------------------------------------
export function addReview(review) {
  const state = load();
  const entry = { id: "r" + Date.now().toString(36), ts: Date.now(), ...review };
  state.reviews.push(entry);
  save(state);
  return entry;
}

export function getReviews(meetupId = null) {
  const all = load().reviews;
  return meetupId ? all.filter((r) => r.meetupId === meetupId) : all;
}

// ---- survey ------------------------------------------------------------
export function saveSurvey(survey) {
  const state = load();
  state.survey = survey;
  save(state);
  return survey;
}

export function getSurvey() {
  return load().survey;
}

// Report whether persistence is actually working (for the UI banner).
export function storageHealthy() {
  try {
    const probe = "__gh_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
