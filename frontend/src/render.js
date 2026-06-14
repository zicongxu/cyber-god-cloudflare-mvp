function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAttributes(profile) {
  if (!profile?.attributes) {
    return "";
  }

  const entries = [
    ["智", profile.attributes.wisdom],
    ["纪", profile.attributes.discipline],
    ["勇", profile.attributes.courage],
    ["慈", profile.attributes.compassion],
  ];

  return entries
    .map(([label, value]) => `<span class="stat-chip"><strong>${label}</strong>${escapeHtml(value ?? 0)}</span>`)
    .join("");
}

function renderStepList(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return "";
  }

  return `
    <ol class="step-list">
      ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
    </ol>
  `;
}

function renderTimelineItem(item) {
  const visibleClass = item.visible ? "is-visible" : "is-entering";
  const streamingClass = item.meta?.streaming ? "is-streaming" : "";

  if (item.kind === "user") {
    return `
      <article class="story-item bubble bubble-user ${visibleClass} ${streamingClass}" data-id="${escapeHtml(item.id)}">
        <p class="bubble-label">你</p>
        <p class="bubble-text">${escapeHtml(item.text)}</p>
      </article>
    `;
  }

  if (item.kind === "god") {
    return `
      <article class="story-item bubble bubble-god ${visibleClass} ${streamingClass}" data-id="${escapeHtml(item.id)}">
        ${item.tone ? `<p class="bubble-label">${escapeHtml(item.tone)}</p>` : ""}
        ${item.title ? `<h3 class="bubble-title">${escapeHtml(item.title)}</h3>` : ""}
        <p class="bubble-text">${escapeHtml(item.text)}</p>
      </article>
    `;
  }

  if (item.kind === "card") {
    return `
      <article class="story-item story-card ${visibleClass} ${streamingClass}" data-id="${escapeHtml(item.id)}">
        ${item.tone ? `<p class="card-kicker">${escapeHtml(item.tone)}</p>` : ""}
        ${item.title ? `<h3 class="card-title">${escapeHtml(item.title)}</h3>` : ""}
        ${item.text ? `<p class="card-text">${escapeHtml(item.text)}</p>` : ""}
        ${renderStepList(item.detail)}
        ${renderCtas(item.ctas)}
      </article>
    `;
  }

  return `
    <article class="story-item system-note ${visibleClass} ${streamingClass}" data-id="${escapeHtml(item.id)}">
      <p>${escapeHtml(item.text)}</p>
    </article>
  `;
}

function renderCtas(ctas) {
  if (!Array.isArray(ctas) || ctas.length === 0) {
    return "";
  }

  return `
    <div class="card-actions">
      ${ctas
        .map(
          (cta) => `
            <button
              type="button"
              class="chip-button ${cta.variant === "ghost" ? "is-ghost" : ""}"
              data-action="${escapeHtml(cta.action)}"
              data-value="${escapeHtml(cta.value ?? "")}"
            >
              ${escapeHtml(cta.label)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderComposer(state) {
  const mode = getComposerMode(state);
  const placeholderByMode = {
    confess: "神啊，我今天又干了什么荒唐事……",
    ritual: "把你要给神看的自我证明写在这里",
    settle: state.status === "self_confirmed" ? "别装死，先把这笔账结了。" : "要开始新的忏悔，也可以直接写。",
  };
  const buttonByMode = {
    confess: "提交忏悔",
    ritual: "开启完成仪式",
    settle: state.status === "self_confirmed" ? "结算奖励" : "发起新忏悔",
  };

  const isDecisionMode = state.status === "completion_ritual_started";
  const mainLabel =
    isDecisionMode && state.ritualChoice === "not_completed"
      ? "我没完成，降级任务"
      : isDecisionMode
        ? "我诚实完成了并结算"
        : buttonByMode[mode];

  return `
    <section class="composer-panel">
      ${isDecisionMode ? renderDecisionStrip(state) : ""}
      <form class="composer" data-action="submit-composer">
        <textarea
          name="draft"
          rows="2"
          placeholder="${escapeHtml(placeholderByMode[mode])}"
        >${escapeHtml(state.draft || "")}</textarea>
        <button type="submit" class="submit-button" ${state.loading ? "disabled" : ""}>
          ${state.loading ? "处理中…" : escapeHtml(mainLabel)}
        </button>
      </form>
      <p class="composer-hint">${escapeHtml(getComposerHint(state))}</p>
    </section>
  `;
}

function renderDecisionStrip(state) {
  const completedActive = state.ritualChoice !== "not_completed";
  const notCompletedActive = state.ritualChoice === "not_completed";

  return `
    <div class="decision-strip">
      <button type="button" class="decision-pill ${completedActive ? "is-active" : ""}" data-action="choose-completion" data-value="completed">
        我诚实完成了
      </button>
      <button type="button" class="decision-pill ${notCompletedActive ? "is-active" : ""}" data-action="choose-completion" data-value="not_completed">
        我没完成，给我更小的救赎
      </button>
    </div>
  `;
}

function getComposerMode(state) {
  if (!state.flowId || state.status === "idle" || state.status === "oracle_unlocked" || state.status === "reward_settled") {
    return "confess";
  }

  if (state.status === "waiting_completion") {
    return "ritual";
  }

  if (state.status === "completion_ritual_started") {
    return "ritual";
  }

  return "settle";
}

function getComposerHint(state) {
  if (state.status === "waiting_completion") {
    return "先把任务做完，再来让神盯着你验收。";
  }

  if (state.status === "completion_ritual_started") {
    return "可以改口，也可以诚实。别用同一套糊弄神两次。";
  }

  if (state.status === "self_confirmed") {
    return "诚实已记录，下一步是结算。";
  }

  if (state.status === "reward_settled" || state.status === "oracle_unlocked") {
    return "新的忏悔会开启新的剧情。";
  }

  return "先说事实，再说借口。";
}

function renderProfile(profile) {
  if (!profile) {
    return "";
  }

  return `
    <section class="profile-chip">
      <div class="profile-head">
        <span class="profile-name">${escapeHtml(profile.nickname || "匿名")}</span>
        <span class="profile-level">Lv.${escapeHtml(profile.level ?? 0)} · ${escapeHtml(profile.exp ?? 0)}/${escapeHtml(profile.next_level_exp ?? 0)} XP</span>
      </div>
      <div class="profile-stats">${formatAttributes(profile)}</div>
      <div class="profile-meta">
        <span>完成 ${escapeHtml(profile.stats?.completed_tasks ?? 0)}</span>
        <span>翻车 ${escapeHtml(profile.stats?.failed_tasks ?? 0)}</span>
      </div>
    </section>
  `;
}

function renderError(state) {
  if (!state.error) {
    return "";
  }

  return `
    <section class="error-banner" role="alert">
      <span>出错了</span>
      <p>${escapeHtml(state.error)}</p>
    </section>
  `;
}

function statusLabel(status) {
  const map = {
    idle: "待忏悔",
    confessed: "已忏悔",
    judged: "已审判",
    waiting_completion: "等你完成",
    completion_ritual_started: "完成仪式中",
    self_confirmed: "待结算",
    reward_settled: "已结算",
    oracle_unlocked: "神谕解锁",
    redemption_failed: "未完成",
    downgraded_task_assigned: "降级任务",
    restoring: "恢复中",
  };

  return map[status] || status || "未知";
}

export function renderApp(root, state) {
  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Web 承载 · 移动端 App 风格</p>
          <h1>GodChat</h1>
        </div>
        <div class="status-pill ${state.loading ? "is-loading" : ""}">
          ${escapeHtml(state.loading ? "处理请求中" : statusLabel(state.status))}
        </div>
      </header>

      ${renderProfile(state.profile)}
      ${renderError(state)}

      <section class="feed-shell">
        <div class="feed-meta">
          <span>最新对话</span>
          <span>${escapeHtml(state.timeline.length)} 条关键剧情</span>
        </div>
        <div class="story-feed">
          ${state.timeline.map(renderTimelineItem).join("")}
        </div>
      </section>

      ${renderComposer(state)}
    </main>
  `;
}
