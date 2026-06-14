import { createApiClient } from "./api.js";
import { createInitialState, loadState, normalizeState, randomId, saveState } from "./state.js";
import { renderApp } from "./render.js";

const DEFAULT_FLOW_API_BASE = "https://cyber-god-api.hi542994938.workers.dev";
const DEFAULT_CHAT_API_BASE = "https://cyber-god-api.hi542994938.workers.dev";
const LEGACY_LOCAL_API_BASE = "http://localhost:8787";

function readBase(key, fallback) {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get(key);
  if (fromQuery) {
    window.localStorage.setItem(`godchat.${key}`, fromQuery);
    return fromQuery.replace(/\/$/, "");
  }

  const fromStorage = window.localStorage.getItem(`godchat.${key}`);
  if (fromStorage) {
    if (fromStorage.replace(/\/$/, "") === LEGACY_LOCAL_API_BASE) {
      window.localStorage.setItem(`godchat.${key}`, fallback);
      return fallback;
    }

    return fromStorage.replace(/\/$/, "");
  }

  window.localStorage.setItem(`godchat.${key}`, fallback);
  return fallback;
}

function resolveApiBases() {
  const url = new URL(window.location.href);
  void url;
  return {
    flowBase: readBase("flowApiBase", DEFAULT_FLOW_API_BASE),
    chatBase: readBase("chatApiBase", DEFAULT_CHAT_API_BASE),
  };
}

function createMessage(partial) {
  return {
    id: randomId("msg"),
    kind: "system",
    tone: "",
    title: "",
    text: "",
    detail: [],
    ctas: [],
    meta: null,
    visible: false,
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

function keepTimeline(entries) {
  return entries;
}

export function createApp(root) {
  const apiBases = resolveApiBases();
  const api = createApiClient(apiBases);
  const savedState = loadState();
  let state = normalizeState({
    ...savedState,
    apiBase: apiBases.flowBase,
    loading: false,
    error: null,
    bootstrapped: true,
    timeline: savedState.timeline,
  });
  let feedScrollState = {
    top: 0,
    atBottom: true,
  };

  function persist() {
    saveState(state);
  }

  function captureFeedScrollState() {
    const feed = root.querySelector(".story-feed");
    if (!(feed instanceof HTMLElement)) {
      return;
    }

    const maxTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
    feedScrollState = {
      top: feed.scrollTop,
      atBottom: feed.scrollTop >= maxTop - 8,
    };
  }

  function restoreFeedScrollState() {
    scrollFeedToLatest();
  }

  function scrollFeedToLatest() {
    const latestEntryId = state.timeline.at(-1)?.id;

    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const feed = root.querySelector(".story-feed");
          if (!(feed instanceof HTMLElement)) {
            return;
          }

          const latestEntry = Array.from(feed.querySelectorAll(".story-item")).find(
            (item) => item instanceof HTMLElement && item.dataset.id === latestEntryId,
          );

          if (latestEntry instanceof HTMLElement) {
            const feedRect = feed.getBoundingClientRect();
            const latestRect = latestEntry.getBoundingClientRect();
            const nextTop = feed.scrollTop + latestRect.bottom - feedRect.bottom;
            feed.scrollTop = Math.max(0, nextTop);
          } else {
            feed.scrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
          }

          feedScrollState = {
            top: feed.scrollTop,
            atBottom: true,
          };
        });
      });
    }, 16);
  }

  function setState(updater) {
    captureFeedScrollState();
    const next = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    state = normalizeState({
      ...next,
      apiBase: apiBases.flowBase,
      bootstrapped: true,
    });
    persist();
    render();
    scrollFeedToLatest();
  }

  function patch(partial) {
    setState((current) => ({ ...current, ...partial }));
  }

  function updateDraft(value) {
    state = {
      ...state,
      draft: value,
    };
    persist();
  }

  function openOracleModal() {
    if (!state.oracle?.unlocked) {
      return;
    }

    patch({ oracleModalOpen: true });
  }

  function closeOracleModal() {
    patch({ oracleModalOpen: false });
  }

  function enterCompletionConfirm() {
    patch({ awaitingCompletionConfirm: true, error: null });
  }

  function exitCompletionConfirm() {
    patch({ awaitingCompletionConfirm: false });
  }

  function pushTimeline(entries, options = {}) {
    const incoming = entries.map((entry) => createMessage(entry));
    setState((current) => ({
      ...current,
      timeline: keepTimeline([...current.timeline, ...incoming]),
      status: options.status ?? current.status,
      flowId: options.flowId ?? current.flowId,
      taskId: options.taskId ?? current.taskId,
      confession: options.confession ?? current.confession,
      judgement: options.judgement ?? current.judgement,
      task: options.task ?? current.task,
      ritual: options.ritual ?? current.ritual,
      settlement: options.settlement ?? current.settlement,
      oracle: options.oracle ?? current.oracle,
      oracleModalOpen: options.oracleModalOpen ?? current.oracleModalOpen,
      profile: options.profile ?? current.profile,
      ritualChoice: options.ritualChoice ?? current.ritualChoice,
      error: null,
      loading: options.loading ?? current.loading,
    }));

    window.setTimeout(() => {
      setState((current) => ({
        ...current,
        timeline: current.timeline.map((entry) =>
          incoming.some((next) => next.id === entry.id) ? { ...entry, visible: true } : entry,
        ),
      }));
    }, options.revealDelay ?? 24);
  }

  function revealTimeline(ids) {
    window.setTimeout(() => {
      setState((current) => ({
        ...current,
        timeline: current.timeline.map((entry) => (ids.includes(entry.id) ? { ...entry, visible: true } : entry)),
      }));
    }, 24);
  }

  function updateTimelineEntry(entryId, patch) {
    setState((current) => ({
      ...current,
      timeline: current.timeline.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
    }));
  }

  function appendTimelineEntry(entry) {
    const next = createMessage(entry);
    setState((current) => ({
      ...current,
      timeline: keepTimeline([...current.timeline, next]),
    }));
    revealTimeline([next.id]);
    return next;
  }

  function buildStreamMessages(userText, flowData = {}) {
    const promptParts = [
      "你是赛博上帝，幽默、毒舌，但只审判行为，不羞辱人格。",
      "你正在和用户进行一段单页原型里的聊天回复。",
      "要求：只输出中文，保持简短、锋利、带一点戏谑。",
      "如果有任务或审判结果，优先围绕行为和下一步行动回应，不要长篇大论。",
    ];

    if (flowData.judgement?.sin_name || flowData.judgement?.sentence) {
      promptParts.push(
        `当前审判：${flowData.judgement.sin_name || "未命名罪行"}。判词：${flowData.judgement.sentence || "无"}`,
      );
    }

    if (flowData.task?.title) {
      promptParts.push(`当前任务：${flowData.task.title}`);
    }

    return [
      { role: "system", content: promptParts.join("\n") },
      { role: "user", content: userText },
    ];
  }

  async function streamGodReply(userText, flowData) {
    const streamId = randomId("god");
    appendTimelineEntry({
      id: streamId,
      kind: "god",
      tone: "神明回应",
      title: "赛博上帝",
      text: "……",
      meta: { streaming: true },
    });

    let text = "";
    try {
      await api.streamAgentChat(
        {
          messages: buildStreamMessages(userText, flowData),
        },
        {
          onChunk({ text: nextText }) {
            text = nextText;
            updateTimelineEntry(streamId, {
              text: text || "……",
              meta: { streaming: true },
            });
          },
        },
      );

      updateTimelineEntry(streamId, {
        text: text || "……",
        meta: { streaming: false },
      });
      scrollFeedToLatest();
      return text;
    } catch (error) {
      updateTimelineEntry(streamId, {
        title: "神明开小差了",
        text: error.message || "这位神今天网络不太稳。",
        meta: { streaming: false },
      });
      scrollFeedToLatest();
      throw error;
    }
  }

  async function bootstrap() {
    if (!state.flowId) {
      persist();
      render();
      return;
    }

    patch({ loading: true, error: null, status: "restoring" });

    try {
      const [flow, profile] = await Promise.all([api.getConfessionFlow(state.flowId), api.getProfile()]);
      hydrateFromFlow(flow, profile);
    } catch (error) {
      console.warn("restore failed", error);
      clearFlow();
      setState((current) => ({
      ...createInitialState(),
        apiBase: apiBases.flowBase,
        profile: current.profile,
        bootstrapped: true,
      }));
      pushTimeline([
        {
          kind: "system",
          text: "上次那条线索断了，先从新的忏悔开始。",
        },
      ]);
    }
  }

  function clearFlow() {
    window.localStorage.removeItem("godchat.frontend.state.v1");
  }

  function buildTimelineFromFlow(flow, profile) {
    const items = [];

    if (flow.confession?.content) {
      items.push({
        kind: "user",
        text: flow.confession.content,
      });
    }

    if (flow.judgement) {
      items.push({
        kind: "god",
        tone: "神明判词",
        title: flow.judgement.sin_name || "审判已下",
        text: `${flow.judgement.rap_intro || ""} ${flow.judgement.sentence || ""}`.trim(),
      });
    }

    if (flow.task) {
      items.push({
        kind: "card",
        tone: "救赎任务",
        title: flow.task.title || "当前任务",
        text: "只保留现在这一步。别把神当成一次性客服。",
        detail: flow.task.steps || [],
        meta: flow.task,
      });
    }

    if (flow.status === "completion_ritual_started") {
      items.push({
        kind: "card",
        tone: "完成仪式",
        title: "赛博上帝正在凝视你",
        text: "你要么诚实，要么继续骗自己。别装忙。",
        ctas: [
          { action: "choose-completion", value: "completed", label: "我诚实完成了" },
          { action: "choose-completion", value: "not_completed", label: "我没完成，给我更小的救赎", variant: "ghost" },
        ],
      });
    }

    if (flow.status === "redemption_failed" || flow.status === "downgraded_task_assigned") {
      items.push({
        kind: "system",
        text: "你没骗过神，只骗过了自己。新任务已经变小了，别再把简单事做成史诗。",
      });
    }

    if (flow.status === "reward_settled" || flow.status === "oracle_unlocked") {
      items.push({
        kind: "card",
        tone: "结算完成",
        title: flow.status === "oracle_unlocked" ? "神谕已解锁" : "奖励已结算",
        text: "闭环已完成。下次别拖到系统开始替你记账。",
        ctas:
          flow.status === "oracle_unlocked"
            ? [
                {
                  action: "open-oracle-modal",
                  label: "查看神谕",
                },
              ]
            : [],
        meta: {
          oracleUnlocked: flow.status === "oracle_unlocked",
        },
      });
    }

    return {
      timeline: keepTimeline(items).map((item) => ({ ...createMessage(item), visible: true })),
      profile,
      status: flow.status,
      flowId: flow.flow_id,
      taskId: flow.task?.task_id ?? state.taskId,
      confession: flow.confession || null,
      judgement: flow.judgement || null,
      task: flow.task || state.task,
      ritual:
        flow.status === "completion_ritual_started"
          ? {
              title: "赛博上帝正在凝视你",
              content: "你不需要向我证明。但你心里知道，这一次，你有没有真的完成救赎。",
              options: [
                { value: "completed", label: "我诚实完成了" },
                { value: "not_completed", label: "我没有完成，请给我一个更小的救赎任务" },
              ],
            }
          : state.ritual,
      settlement: state.settlement,
      oracle: state.oracle,
      oracleModalOpen: Boolean(state.oracleModalOpen && flow.status === "oracle_unlocked"),
      ritualChoice: state.ritualChoice,
      loading: false,
      error: null,
    };
  }

  function hydrateFromFlow(flow, profile) {
    state = normalizeState({
      ...state,
      ...buildTimelineFromFlow(flow, profile),
      apiBase: apiBases.flowBase,
      bootstrapped: true,
      lastSyncedAt: new Date().toISOString(),
    });
    persist();
    render();
  }

  async function refreshProfile() {
    try {
      const profile = await api.getProfile();
      patch({ profile, lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      console.warn("profile refresh failed", error);
    }
  }

  async function submitConfession(content) {
    const trimmed = content.trim();
    if (!trimmed) {
      patch({ error: "先写一条像样的忏悔，别让神替你补作业。" });
      return;
    }

    patch({ loading: true, error: null, draft: "" });
    pushTimeline([{ kind: "user", text: trimmed }], {
      status: state.status,
      flowId: state.flowId,
      taskId: state.taskId,
      confession: { content: trimmed },
      loading: true,
    });

    try {
      const response = await api.createConfessionFlow({
        content: trimmed,
        roast_level: 3,
      });
      const confession = { content: trimmed, behavior_type: response.diagnosis?.behavior_type || "" };

      setState((current) => ({
        ...current,
        flowId: response.flow_id,
        taskId: response.task?.task_id || null,
        status: response.status,
        confession,
        judgement: response.judgement || null,
        task: response.task || null,
        ritual: null,
        settlement: null,
        oracle: null,
        oracleModalOpen: false,
        awaitingCompletionConfirm: false,
        ritualChoice: "completed",
        loading: true,
        error: null,
        lastSyncedAt: new Date().toISOString(),
      }));

      try {
        await streamGodReply(trimmed, {
          judgement: response.judgement,
          task: response.task,
        });
      } catch {
        // Streaming 是增强体验，不应阻断主流程。
      }

      const taskCard = createMessage({
        kind: "card",
        tone: "救赎任务",
        title: response.task?.title || "当前任务",
        text: "先把这一步做完，别急着跟命运辩论。",
        detail: response.task?.steps || [],
      });
      setState((current) => ({
        ...current,
        timeline: keepTimeline([...current.timeline, taskCard]),
        loading: false,
      }));
      revealTimeline([taskCard.id]);
      scrollFeedToLatest();

      api
        .getProfile()
        .then((profile) => patch({ profile, lastSyncedAt: new Date().toISOString() }))
        .catch(() => {});
    } catch (error) {
      patch({
        loading: false,
        error: error.message || "忏悔提交失败",
      });
    }
  }

  async function startRitual() {
    if (!state.flowId || !state.taskId) {
      patch({ error: "先忏悔，神才知道要审谁。" });
      return;
    }

    patch({ loading: true, error: null });
    pushTimeline(
      [
        {
          kind: "user",
          text: "请求神明见证，我准备验收了。",
        },
      ],
      { status: state.status },
    );

    try {
      const response = await api.startCompletionRitual(state.taskId, { flow_id: state.flowId });
      const ritual = {
        title: response.ritual?.title || "完成仪式",
        content: response.ritual?.content || "",
        options: response.ritual?.options || [],
      };
      const item = createMessage({
        kind: "card",
        tone: "完成仪式",
        title: ritual.title,
        text: ritual.content,
        ctas: ritual.options.map((option) => ({
          action: "choose-completion",
          value: option.value,
          label: option.label,
          variant: option.value === "not_completed" ? "ghost" : "solid",
        })),
      });

      setState((current) => ({
        ...current,
        status: response.status,
        ritual,
        loading: false,
        error: null,
        timeline: keepTimeline([...current.timeline, item]),
        lastSyncedAt: new Date().toISOString(),
      }));
      revealTimeline([item.id]);
      scrollFeedToLatest();
    } catch (error) {
      patch({
        loading: false,
        error: error.message || "仪式开启失败",
      });
    }
  }

  async function handleCompletionChoice(choice) {
    if (!state.flowId || !state.taskId) {
      patch({ error: "流程已经断了，先重新忏悔。" });
      return;
    }

    patch({ loading: true, error: null, ritualChoice: choice });

    if (choice === "not_completed") {
      pushTimeline([{ kind: "user", text: "我没完成，别逼我装完成。" }], { status: state.status });
      try {
        const response = await api.downgradeTask(state.taskId, { flow_id: state.flowId });
        const profile = await api.getProfile();
        const godItem = createMessage({
          kind: "god",
          tone: "神明判词",
          title: "诚实，没有丢人",
          text: response.message || "诚实，比伪装完成更接近救赎。",
        });
        const taskItem = createMessage({
          kind: "card",
          tone: "降级任务",
          title: response.task?.title || "更小的救赎任务",
          text: "别把简单事再做成一场拖延艺术。",
          detail: response.task?.steps || [],
        });
        setState((current) => ({
          ...current,
          status: response.status,
          taskId: response.task?.task_id || current.taskId,
          task: response.task || null,
          profile,
          timeline: keepTimeline([...current.timeline, godItem, taskItem]),
          loading: false,
          error: null,
          ritual: null,
          settlement: null,
          oracle: null,
          oracleModalOpen: false,
          awaitingCompletionConfirm: false,
          ritualChoice: "completed",
          lastSyncedAt: new Date().toISOString(),
        }));
        revealTimeline([godItem.id, taskItem.id]);
        scrollFeedToLatest();
      } catch (error) {
        patch({
          loading: false,
          error: error.message || "降级任务失败",
        });
      }
      return;
    }

    const selfConfirmationText = state.draft.trim() || "我确认：这次救赎，我没有糊弄自己。";
    pushTimeline([{ kind: "user", text: selfConfirmationText }], { status: state.status });

    try {
      await api.selfConfirmTask(state.taskId, {
        flow_id: state.flowId,
        witness: {
          witness_type: "text",
          content: "frontend witness",
        },
        self_confirmation_text: selfConfirmationText,
      });

      const settlement = await api.settleTask(state.taskId, {
        flow_id: state.flowId,
      });
      const profile = await api.getProfile();
      const godItem = createMessage({
        kind: "god",
        tone: "神明判词",
        title: settlement.god_reply ? "神明回应" : "诚实记录完毕",
        text: settlement.god_reply || "你没有继续向算法进贡。",
      });
      const settlementItem = createMessage({
        kind: "card",
        tone: "结算完成",
        title: settlement.oracle?.unlocked ? "神谕已解锁" : "奖励已结算",
        text: settlement.oracle?.text || "闭环已完成。",
        detail: [],
        ctas: settlement.oracle?.unlocked
          ? [
              {
                action: "open-oracle-modal",
                label: "打开神谕",
              },
            ]
          : [],
        meta: {
          oracleUnlocked: Boolean(settlement.oracle?.unlocked),
        },
      });

      const nextState = {
        ...state,
        status: settlement.status,
        profile,
        settlement: settlement.settlement || null,
        oracle: settlement.oracle || null,
        oracleModalOpen: Boolean(settlement.oracle?.unlocked),
        awaitingCompletionConfirm: false,
        ritual: null,
        loading: false,
        error: null,
        ritualChoice: "completed",
        timeline: keepTimeline([...state.timeline, godItem, settlementItem]),
        lastSyncedAt: new Date().toISOString(),
      };

      setState(nextState);
      revealTimeline([godItem.id, settlementItem.id]);
      scrollFeedToLatest();
    } catch (error) {
      patch({
        loading: false,
        error: error.message || "确认结算失败",
      });
    }
  }

  function render() {
    renderApp(root, state);
  }

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form");
    if (!form || form.classList.contains("composer") === false) {
      return;
    }

    event.preventDefault();
    const draft = new FormData(form).get("draft");
    const text = typeof draft === "string" ? draft : "";

    if (!state.flowId || state.status === "idle" || state.status === "reward_settled" || state.status === "oracle_unlocked") {
      await submitConfession(text);
      return;
    }

    if (state.status === "waiting_completion") {
      await startRitual();
      return;
    }

    if (state.status === "self_confirmed") {
      enterCompletionConfirm();
      return;
    }

    if (state.status === "completion_ritual_started") {
      await handleCompletionChoice(state.ritualChoice);
      return;
    }

    await submitConfession(text);
  });

  root.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionTarget = target.closest("[data-action]");
    const action = actionTarget instanceof HTMLElement ? actionTarget.dataset.action : undefined;
    if (!action) {
      return;
    }

    if (action === "choose-completion") {
      const value = actionTarget.dataset.value === "not_completed" ? "not_completed" : "completed";
      if (state.awaitingCompletionConfirm || state.status === "completion_ritual_started") {
        await handleCompletionChoice(value);
        return;
      }

      patch({ ritualChoice: value, error: null });
      return;
    }

    if (action === "open-oracle-modal") {
      openOracleModal();
      return;
    }

    if (action === "close-oracle-modal") {
      closeOracleModal();
      return;
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    if (target.name !== "draft") {
      return;
    }

    updateDraft(target.value);
  });

  root.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains("story-feed")) {
        return;
      }

      const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
      feedScrollState = {
        top: target.scrollTop,
        atBottom: target.scrollTop >= maxTop - 8,
      };
    },
    true,
  );

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.oracleModalOpen) {
      closeOracleModal();
      return;
    }

    if (event.key === "Escape" && state.error) {
      patch({ error: null });
    }
  });

  bootstrap();
  restoreFeedScrollState();

  return {
    getState() {
      return state;
    },
    refreshProfile,
  };
}

const appRoot = document.querySelector("#app");
if (appRoot) {
  createApp(appRoot);
}
