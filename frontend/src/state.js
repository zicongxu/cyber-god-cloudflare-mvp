const STORAGE_KEY = "godchat.frontend.state.v1";

export function createInitialState() {
  return {
    apiBase: "",
    flowId: null,
    taskId: null,
    status: "idle",
    profile: null,
    confession: null,
    judgement: null,
    task: null,
    ritual: null,
    settlement: null,
    oracle: null,
    ritualChoice: "completed",
    draft: "",
    timeline: [],
    loading: false,
    error: null,
    bootstrapped: false,
    lastSyncedAt: null,
  };
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeTimeline(timeline) {
  if (!Array.isArray(timeline)) {
    return [];
  }

  return timeline
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : randomId("msg"),
      kind: item.kind === "card" || item.kind === "system" || item.kind === "god" || item.kind === "user" ? item.kind : "system",
      tone: typeof item.tone === "string" ? item.tone : "",
      title: typeof item.title === "string" ? item.title : "",
      text: typeof item.text === "string" ? item.text : "",
      detail: Array.isArray(item.detail) ? item.detail.filter((line) => typeof line === "string") : [],
      ctas: Array.isArray(item.ctas) ? item.ctas.filter((cta) => cta && typeof cta === "object") : [],
      meta: item.meta && typeof item.meta === "object" ? item.meta : null,
      visible: true,
      timestamp: typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString(),
    }))
    .slice(-5);
}

export function normalizeState(input) {
  const base = createInitialState();
  const state = input && typeof input === "object" ? input : {};

  return {
    ...base,
    ...state,
    flowId: typeof state.flowId === "string" ? state.flowId : null,
    taskId: typeof state.taskId === "string" ? state.taskId : null,
    status: typeof state.status === "string" ? state.status : base.status,
    profile: state.profile && typeof state.profile === "object" ? state.profile : null,
    confession: state.confession && typeof state.confession === "object" ? state.confession : null,
    judgement: state.judgement && typeof state.judgement === "object" ? state.judgement : null,
    task: state.task && typeof state.task === "object" ? state.task : null,
    ritual: state.ritual && typeof state.ritual === "object" ? state.ritual : null,
    settlement: state.settlement && typeof state.settlement === "object" ? state.settlement : null,
    oracle: state.oracle && typeof state.oracle === "object" ? state.oracle : null,
    ritualChoice: state.ritualChoice === "not_completed" ? "not_completed" : "completed",
    draft: typeof state.draft === "string" ? state.draft : "",
    timeline: normalizeTimeline(state.timeline),
    loading: Boolean(state.loading),
    error: typeof state.error === "string" ? state.error : null,
    bootstrapped: Boolean(state.bootstrapped),
    apiBase: typeof state.apiBase === "string" ? state.apiBase : "",
    lastSyncedAt: typeof state.lastSyncedAt === "string" ? state.lastSyncedAt : null,
  };
}

export function loadState() {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createInitialState();
  }

  const parsed = safeParse(raw);
  if (!parsed) {
    window.localStorage.removeItem(STORAGE_KEY);
    return createInitialState();
  }

  return normalizeState(parsed);
}

export function saveState(state) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}

export function clearSavedState() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

export function randomId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }

  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

