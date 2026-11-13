// ../../core/tracy-core/src/build-chat/conversation.mjs
var ANSWER_SCHEMA = "tracy-build-answer/v1";
var BUILD_CHAT_STRINGS = {
  "research.title.one": "Read {count} source",
  "research.title.other": "Read {count} sources",
  "review.question": "Approve this plan?",
  "review.summary": "{name}: {pages}, {services}",
  "review.summary.one": "{name}: {part}",
  "review.pages.one": "{count} page",
  "review.pages.other": "{count} pages",
  "review.services.one": "{count} service",
  "review.services.other": "{count} services",
  "review.approve": "Approve",
  "review.change": "Request changes"
};
var MAX_QUESTIONS_AT_ONCE = 3;
var choicesOf = (question) => Array.isArray(question?.choices) ? question.choices : [];
var recommendedOf = (question) => choicesOf(question).find((c) => c.recommended === true);
function askRequestOf(questions, answers) {
  const done = new Set((answers ?? []).map((a) => a.question));
  const open = (questions ?? []).filter((q) => !done.has(q.id)).slice(0, MAX_QUESTIONS_AT_ONCE);
  if (open.length === 0) return null;
  return {
    questions: open.map((q) => {
      const recommended = recommendedOf(q);
      return {
        id: q.id,
        question: q.prompt,
        options: choicesOf(q).map(
          (c) => c.detail ? { label: c.label, description: c.detail } : { label: c.label }
        ),
        multiSelect: false,
        ...recommended ? { recommended: recommended.label } : {}
      };
    })
  };
}
function answerOf(question, item) {
  const text2 = item?.custom?.trim() ?? "";
  if (text2 !== "") return { schema: ANSWER_SCHEMA, question: question.id, text: text2 };
  const label = item?.selected?.[0];
  const choice = choicesOf(question).find((c) => c.label === label);
  return choice ? { schema: ANSWER_SCHEMA, question: question.id, choice: choice.id } : null;
}
function textTooLongOf(question, item) {
  const limit = question?.freeText?.maxLength;
  if (!Number.isInteger(limit)) return null;
  const length = [...item?.custom?.trim() ?? ""].length;
  return length > limit ? { limit, length } : null;
}

// ../../core/tracy-core/src/build-chat/plan.mjs
var PLAN_REVIEW_ID = "plan-review";
var REVIEW_ID = PLAN_REVIEW_ID;
var english = (key, vars = {}) => BUILD_CHAT_STRINGS[key].replace(/\{(\w+)\}/g, (_, name2) => String(vars[name2] ?? ""));
var firstSource = (sources) => sources?.[0]?.name ?? "";
var isWebsite = (alternative) => (alternative.sources ?? []).some((s) => s.kind === "website");
function choiceOf(fact, assumption) {
  const ordered = [...assumption.alternatives].sort((a, b) => Number(isWebsite(b)) - Number(isWebsite(a)));
  return {
    field: assumption.field,
    said: assumption.said,
    options: ordered.map((a) => ({
      value: a.value,
      source: firstSource(a.sources),
      selected: a.value === fact.value
    }))
  };
}
function holdsOf(block, plan, serviceIds) {
  const data = block.data ?? [];
  if (serviceIds.length > 0 && data.length === serviceIds.length && serviceIds.every((id) => data.includes(id)))
    return { services: serviceIds.map((id) => plan.items.find((i) => i.id === id).label) };
  const facts = [];
  const counts = [];
  for (const id of data) {
    const fact = plan.facts.find((f) => f.id === id);
    if (fact) {
      facts.push(fact.label);
      continue;
    }
    const item = plan.items.find((i) => i.id === id);
    if (!item) continue;
    const n = item.count ?? 1;
    const seen = counts.find((c) => c.kind === item.kind);
    if (seen) seen.count += n;
    else counts.push({ kind: item.kind, count: n });
  }
  return { facts, counts };
}
var MAX_LIST_DEPTH = 3;
function listsOf(lists, plan, depth = 1) {
  if (!Array.isArray(lists) || depth > MAX_LIST_DEPTH) return [];
  const out = [];
  for (const list of lists) {
    const rows = [];
    for (const row of list.rows ?? []) {
      const label = rowLabelOf(row, plan);
      if (label === null) continue;
      const nested = listsOf(row.lists, plan, depth + 1);
      rows.push(nested.length > 0 ? { label, lists: nested } : { label });
    }
    if (rows.length === 0) continue;
    const item = list.item ? plan.items.find((i) => i.id === list.item) : null;
    out.push(item ? { head: item.label, rows } : { rows });
  }
  return out;
}
function rowLabelOf(row, plan) {
  if (row.page !== void 0) return plan.pages.find((p) => p.id === row.page)?.name ?? null;
  const id = row.data;
  const found = (plan.rows ?? []).find((r) => r.id === id)?.label ?? plan.facts.find((f) => f.id === id)?.value ?? plan.items.find((i) => i.id === id)?.label;
  return found ?? null;
}
function plainWordsOf(what) {
  const text2 = String(what ?? "").replace(new RegExp("(\\p{L})-(?=\\p{L})", "gu"), "$1 ");
  return text2.charAt(0).toUpperCase() + text2.slice(1);
}
function pluralOf(word) {
  const lower = new RegExp("^\\p{Lu}\\p{Lu}", "u").test(word) ? word : word.charAt(0).toLowerCase() + word.slice(1);
  if (/(s|x|z|ch|sh)$/i.test(lower)) return `${lower}es`;
  if (/[^aeiou]y$/i.test(lower)) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}
function leftOutOf(leftOut) {
  const lines = [];
  const byKey = /* @__PURE__ */ new Map();
  for (const l of leftOut ?? []) {
    const what = plainWordsOf(l.what);
    const key = JSON.stringify([what, l.kind, l.reason]);
    const seen = byKey.get(key);
    if (seen) seen.count += 1;
    else {
      const line = { what, kind: l.kind, reason: l.reason, count: 1 };
      byKey.set(key, line);
      lines.push(line);
    }
  }
  return lines.map(({ count, ...line }) => {
    if (count === 1) return line;
    const what = /\s/.test(line.what) ? `${line.what} (${count})` : `${count} ${pluralOf(line.what)}`;
    return { ...line, what, count };
  });
}
function planCardOf(plan) {
  const disputed = new Map(
    (plan.assumptions ?? []).filter((a) => Array.isArray(a.alternatives) && /^facts\[[^\]]+\]\.value$/.test(a.field)).map((a) => [a.field, a])
  );
  const services = plan.items.filter((i) => i.kind === "service");
  const serviceIds = services.map((s) => s.id);
  const name2 = plan.facts.find((f) => f.kind === "business.name")?.value ?? "";
  return {
    planId: plan.id,
    revision: plan.revision,
    name: name2,
    facts: plan.facts.map((f) => {
      const field = `facts[${f.id}].value`;
      const assumption = disputed.get(field);
      return {
        id: f.id,
        field,
        label: f.label,
        value: f.value,
        source: firstSource(f.sources),
        choice: assumption ? choiceOf(f, assumption) : null
      };
    }),
    language: plan.language,
    look: {
      template: plan.look.template.name,
      accent: plan.look.accent,
      // The dark theme's accent when it differs from the light one (#616); shown, not offered for editing yet.
      accentDark: typeof plan.look.accentDark === "string" ? plan.look.accentDark : null,
      logo: plan.look.logo.kind === "own" ? { kind: "own", source: plan.look.logo.source } : { kind: plan.look.logo.kind }
    },
    services: services.map((s) => ({
      id: s.id,
      field: `items[${s.id}].label`,
      label: s.label,
      source: firstSource(s.sources)
    })),
    pages: plan.pages.map((p) => ({
      id: p.id,
      name: p.name,
      blocks: p.blocks.map((b) => {
        const lists = listsOf(b.lists, plan);
        return {
          id: b.id,
          label: b.label,
          reason: b.reason,
          holds: holdsOf(b, plan, serviceIds),
          ...lists.length > 0 ? { lists } : {}
        };
      })
    })),
    pictures: {
      own: { frames: plan.pictures.own.frames, from: [...plan.pictures.own.from ?? []] },
      generated: {
        frames: plan.pictures.generated.frames,
        ...plan.pictures.generated.reason ? { reason: plan.pictures.generated.reason } : {}
      }
    },
    // A disputed fact is settled at the fact itself; every other assumption is listed.
    assumptions: (plan.assumptions ?? []).filter((a) => !disputed.has(a.field)).map((a) => ({ id: a.id, said: a.said })),
    leftOut: leftOutOf(plan.leftOut),
    counts: { pages: plan.pages.length, services: services.length }
  };
}
function planReviewRequestOf(plan, t = english) {
  const { name: name2, counts } = planCardOf(plan);
  const pages = t(counts.pages === 1 ? "review.pages.one" : "review.pages.other", { count: counts.pages });
  const services = t(counts.services === 1 ? "review.services.one" : "review.services.other", {
    count: counts.services
  });
  const parts = [counts.pages > 0 ? pages : null, counts.services > 0 ? services : null].filter(
    (p) => p !== null
  );
  const summary = parts.length === 2 ? t("review.summary", { name: name2, pages, services }) : parts.length === 1 ? t("review.summary.one", { name: name2, part: parts[0] }) : name2;
  const approve = t("review.approve");
  return {
    questions: [
      {
        id: REVIEW_ID,
        question: t("review.question"),
        detail: `# ${summary}`,
        options: [{ label: approve }, { label: t("review.change") }],
        intent: { kind: "plan-review", approve }
      }
    ]
  };
}

// ../../core/tracy-core/src/build-chat/progress.mjs
function templateChoiceOf(templates) {
  const options = (templates ?? []).filter((t) => t?.quickstart === "released" && t.fits === true);
  const chosen = (options.find((t) => t.recommended === true) ?? options[0])?.slug ?? null;
  return { options, chosen, none: options.length === 0 };
}

// ../../core/tracy-core/src/build-chat/tool-results.mjs
var EMPTY = Object.freeze({ calls: Object.freeze({}), templates: null, plan: null, working: null });

// ../../core/tracy-core/src/build-chat/index.mjs
var BUILD_SESSION = /^session-build-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isBuildChatSession(sessionId) {
  return typeof sessionId === "string" && BUILD_SESSION.test(sessionId);
}

// src/host/build-tool.mjs
var BUILD_WAIT_MS = 9e4;
var BUILD_POLL_MS = 2e3;
var BUILD_DOOR_TIMEOUT_MS = 3e4;
var BUILD_STOPPED_SAY = "Your site plan could not be prepared. The Tracy team has the details and will look into it.";
var BUILD_RUNNING_SAY = "Still working on it. This can take a minute or two.";
var UNCHANGED_FALLBACK_SAY = "Your plan has not changed. You can change any value on the plan card, or tell me to start the plan over.";
var tooLongSay = (question, limit) => question?.topic === "site-name" ? `That name is too long for this design. Please keep it to ${limit} characters or fewer.` : `That answer is too long. Please keep it to ${limit} characters or fewer.`;
var SAY_MAX = 300;
var BUILD_DESCRIPTION = "tracy_build: the build chat engine. action research {links?, description?} first; templates; plan {request?} after the owner chose a template; plan {restart: true} ONLY when the owner clearly asks to start the plan over; edit {changes:[{field,value}]} for one simple change; status to keep waiting when a result says running. Pass ask and review to ask_user_question exactly as given. stopped: say its sentence and stop. unchanged: say its sentence; the plan did not change.";
var BUILD_PARAMETERS = Object.freeze({
  type: "object",
  properties: {
    action: { type: "string", enum: ["research", "templates", "plan", "edit", "status"] },
    links: {
      type: "array",
      items: { type: "string" },
      description: "The business's own links: website, social profiles, map listing."
    },
    description: { type: "string", description: "The owner's own words about the business." },
    request: {
      type: "string",
      description: "For plan: the owner's request for a larger change, in their words."
    },
    restart: {
      type: "boolean",
      description: "For plan: true ONLY when the owner clearly asks to start the plan over. It throws away the current plan and every change made to it. Never set it for a change request."
    },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: { field: { type: "string" }, value: {} }
      },
      description: "For edit: the plan fields to change and their new values."
    }
  },
  required: ["action"]
});
var DOOR = "/api/build-draft";
var MISSING_STEPS = Object.freeze({
  NO_DRAFT: {
    missing: "research",
    next: "Nothing is researched yet. Call tracy_build with action research and the owner's links or words."
  },
  NO_RESEARCH: {
    missing: "research",
    next: "Nothing is researched yet. Call tracy_build with action research and the owner's links or words."
  },
  NO_TEMPLATE: {
    missing: "template",
    next: "No template is chosen yet. Call tracy_build with action templates, let the owner pick one on the card, then call plan."
  },
  NO_KIT: {
    missing: "template",
    next: "The chosen template cannot be built here. Call tracy_build with action templates and let the owner pick another one."
  },
  NO_PLAN: {
    missing: "plan",
    next: "There is no plan yet. Call tracy_build with action plan after the owner chose a template."
  }
});
var LINKS_MAX = 10;
var TEXT_MAX = 2e3;
var text = (value) => typeof value === "string" ? value.trim().slice(0, TEXT_MAX) : "";
function ownerSay(said, fallback = BUILD_STOPPED_SAY) {
  return typeof said === "string" && said.trim() !== "" && said.length <= SAY_MAX && !/[–—]/.test(said) ? said.trim() : fallback;
}
var stopped = (said = void 0) => ({ stopped: true, say: ownerSay(said) });
function argsOf(value) {
  if (typeof value !== "string") return value && typeof value === "object" ? value : {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function resultTexts(parts, depth = 0) {
  if (!Array.isArray(parts) || depth > 3) return [];
  return parts.flatMap(
    /** @returns {string[]} */
    (part) => typeof part?.text === "string" ? [part.text] : resultTexts(part?.content, depth + 1)
  );
}
function answersOfResult(content) {
  for (const t of resultTexts(content)) {
    const head = t.split("\n")[0];
    try {
      const parsed = JSON.parse(head);
      if (Array.isArray(parsed?.answers)) return parsed.answers;
    } catch {
    }
  }
  return [];
}
function repliesOf(events) {
  const asked = /* @__PURE__ */ new Set();
  const out = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === "tool/call" && event.data?.name === "ask_user_question") asked.add(event.data.callId);
    else if (event?.type === "tool/result" && asked.has(event.data?.message?.source?.callId)) {
      for (const item of answersOfResult(event.data.message.content))
        if (typeof item?.id === "string") out.push({ selected: [], ...item });
    }
  }
  return out;
}
function createBuildTool({
  http,
  origin,
  actorFor,
  eventsOf,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  waitMs = BUILD_WAIT_MS,
  pollMs = BUILD_POLL_MS
}) {
  const issued = /* @__PURE__ */ new Map();
  const reviews = /* @__PURE__ */ new Map();
  const stored = /* @__PURE__ */ new Map();
  const questionsOf = (sessionId) => {
    let known = issued.get(sessionId);
    if (!known) issued.set(sessionId, known = /* @__PURE__ */ new Map());
    return known;
  };
  const setOf = (map, sessionId) => {
    let set = map.get(sessionId);
    if (!set) map.set(sessionId, set = /* @__PURE__ */ new Set());
    return set;
  };
  function learn(sessionId, result) {
    const known = questionsOf(sessionId);
    for (const q of Array.isArray(result?.questions) ? result.questions : [])
      if (typeof q?.id === "string") known.set(q.id, q);
  }
  async function door(sessionId, assertion, method, path, body) {
    const base = origin();
    if (base === null) return null;
    const headers = { "x-tracy-actor": assertion, "x-tracy-session": sessionId, accept: "application/json" };
    if (body !== void 0) headers["content-type"] = "application/json";
    try {
      const res = await http(`${base}${DOOR}${path}`, {
        method,
        headers,
        ...body !== void 0 ? { body: JSON.stringify(body) } : {},
        signal: AbortSignal.timeout(BUILD_DOOR_TIMEOUT_MS)
      });
      const parsed = await res.json().catch(() => null);
      return { status: res.status, body: parsed };
    } catch {
      return null;
    }
  }
  async function storeReplies(sessionId, assertion) {
    const replies = repliesOf(eventsOf(sessionId));
    if (replies.length === 0) return { again: null };
    const known = questionsOf(sessionId);
    if (known.size === 0) {
      const state = await door(sessionId, assertion, "GET", "/engine");
      if (state?.status === 200) learn(sessionId, state.body?.result);
    }
    const done = setOf(stored, sessionId);
    const latest = /* @__PURE__ */ new Map();
    for (const reply of replies) {
      const question = known.get(reply.id);
      if (!question) continue;
      const tooLong = textTooLongOf(question, reply);
      latest.set(reply.id, tooLong ? { question, limit: tooLong.limit } : null);
      if (tooLong) continue;
      let answer = answerOf(question, reply);
      if (answer === null && question.skippable === true)
        answer = { schema: "tracy-build-answer/v1", question: question.id, skipped: true };
      if (answer === null) continue;
      const key = `${reply.id}
${JSON.stringify(answer)}`;
      if (done.has(key)) continue;
      const res = await door(sessionId, assertion, "PUT", "/answers", { question, answer });
      if (res === null || res.status >= 500 || res.status === 403 || res.status === 404) return false;
      if (res.status >= 200 && res.status < 300) done.add(key);
    }
    return { again: [...latest.values()].find(Boolean) ?? null };
  }
  const askAgain = (ask, say) => ({
    ask,
    ...say ? { say } : {},
    next: `${say ? "Say the sentence in say, then pass" : "Pass"} ask to ask_user_question exactly as given. When the owner has answered, call tracy_build with action plan again.`
  });
  function refusal(res) {
    const missing = res.status === 409 ? MISSING_STEPS[res.body?.code] : void 0;
    if (missing) return { missing: missing.missing, next: missing.next };
    if (res.status === 409)
      return {
        stale: true,
        next: "The plan changed meanwhile. Call tracy_build with action status, then make the change again."
      };
    if (res.status === 422) {
      const problems = (Array.isArray(res.body?.problems) ? res.body.problems : []).filter((p) => typeof p === "string").slice(0, 5);
      return {
        refused: true,
        problems,
        next: "Tell the owner plainly, in their language, what could not be changed and why. Do not ask a question about it."
      };
    }
    return stopped(res.body?.say);
  }
  function finished(sessionId, state) {
    if (state?.state === "stopped") return stopped(state.say);
    const result = state?.result ?? {};
    if (state?.state === "asking") {
      learn(sessionId, result);
      if (!result.ask) return stopped();
      return askAgain(result.ask, typeof state.say === "string" ? ownerSay(state.say) : void 0);
    }
    if (state?.step === "research") {
      learn(sessionId, result);
      if (!result.profile) return stopped();
      return { profile: result.profile, ...result.ask ? { ask: result.ask } : {} };
    }
    if (state?.step === "brand")
      return {
        look: "ready",
        next: "The business look is ready. Call tracy_build with action plan again now, with the same request."
      };
    if (state?.step === "compose" || state?.step === "edit") {
      if (result.brand !== "own" || !result.plan) return stopped(state.say);
      const review = planReviewRequestOf(result.plan);
      const ids = setOf(reviews, sessionId);
      for (const q of review.questions) ids.add(q.id);
      const plan = { id: result.plan.id, revision: result.plan.revision };
      if (result.unchanged === true)
        return {
          unchanged: true,
          say: ownerSay(state.say, UNCHANGED_FALLBACK_SAY),
          plan,
          review,
          next: "The plan did not change. Say the sentence in say. Never say the plan changed or that the request was applied. Then pass review to ask_user_question exactly as given. Call plan with restart true only if the owner clearly asks to start the plan over."
        };
      return { plan, review };
    }
    return stopped();
  }
  async function settle(sessionId, first) {
    let state = first;
    const start = now();
    while (state?.state === "running") {
      if (now() - start >= waitMs)
        return {
          running: true,
          say: BUILD_RUNNING_SAY,
          next: "Say the sentence in say, then call tracy_build with action status to keep waiting."
        };
      await sleep(pollMs);
      const assertion = actorFor(sessionId);
      if (assertion === null) return stopped();
      const res = await door(sessionId, assertion, "GET", "/engine");
      if (res === null) return stopped();
      if (res.status !== 200) return refusal(res);
      state = res.body;
    }
    if (state?.step === null || state?.state === "idle")
      return { idle: true, next: "Nothing is running. Call tracy_build with action research first." };
    return finished(sessionId, state);
  }
  async function execute(rawArgs, exec) {
    const args = argsOf(rawArgs);
    const sessionId = exec?.agent?.session?.id;
    if (!isBuildChatSession(sessionId))
      return { refused: true, next: "tracy_build works only in the build chat. Do not call it here." };
    const action = args.action;
    if (!["research", "templates", "plan", "edit", "status"].includes(action))
      return {
        refused: true,
        next: "Call tracy_build with action research, templates, plan, edit or status."
      };
    let request;
    if (action === "research") {
      const links = (Array.isArray(args.links) ? args.links : []).map(text).filter((l) => l !== "").slice(0, LINKS_MAX);
      const description = text(args.description);
      if (links.length === 0 && description === "")
        return {
          refused: true,
          next: "Call tracy_build with action research and the owner's links or their own words about the business."
        };
      request = ["POST", "/research", { links, ...description !== "" ? { description } : {} }];
    } else if (action === "plan") {
      const asked = text(args.request);
      request = [
        "POST",
        "/compose",
        { ...asked !== "" ? { request: asked } : {}, ...args.restart === true ? { restart: true } : {} }
      ];
    } else if (action === "edit") {
      const changes = (Array.isArray(args.changes) ? args.changes : []).filter(
        (c) => c && typeof c === "object" && typeof c.field === "string" && "value" in c
      );
      if (changes.length === 0)
        return { refused: true, next: "Call tracy_build with action edit and changes:[{field, value}]." };
      request = [
        "POST",
        "/edit",
        { changes: changes.map((c) => ({ field: c.field, value: c.value })) }
      ];
    } else if (action === "templates") request = ["GET", "/templates"];
    else request = ["GET", "/engine"];
    if (origin() === null) return stopped();
    const assertion = actorFor(sessionId);
    if (assertion === null) return stopped();
    const replies = await storeReplies(sessionId, assertion);
    if (replies === false) return stopped();
    if (replies.again) {
      const { question, limit } = replies.again;
      return askAgain(askRequestOf([question], []), tooLongSay(question, limit));
    }
    const res = await door(sessionId, assertion, request[0], request[1], request[2]);
    if (res === null) return stopped();
    if (res.status < 200 || res.status >= 300) return refusal(res);
    if (action === "templates") {
      const { options, none } = templateChoiceOf(res.body?.templates);
      return { options, none };
    }
    return settle(sessionId, res.body);
  }
  function guard(execution) {
    if (execution?.name !== "ask_user_question") return void 0;
    const sessionId = execution.agent?.session?.id;
    if (!isBuildChatSession(sessionId)) return void 0;
    const questions = argsOf(execution.arguments).questions;
    const ids = Array.isArray(questions) ? questions.map((q) => q?.id) : [];
    const known = issued.get(sessionId);
    const review = reviews.get(sessionId);
    const allowed = (id) => typeof id === "string" && (known?.has(id) === true || review?.has(id) === true);
    if (ids.length > 0 && ids.every(allowed)) return void 0;
    return "In the build chat, ask only the questions a tracy_build result gives, exactly as given. Ask nothing else; if a result said stopped, say its sentence instead.";
  }
  return { execute, guard };
}

// src/host/prompter.mjs
function latestPrompter(events) {
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type !== "user/message") continue;
    const source = event.data?.source;
    if (source?.kind !== "user") continue;
    const who = source.prompter;
    if (!who || typeof who.user !== "string" || typeof who.email !== "string" || who.email === "") return null;
    return { user: who.user, email: who.email };
  }
  return null;
}

// src/host/index.ts
var name = "tracy-build-chat";
var inject = ["tools"];
function originOf(config) {
  const value = config.origin ?? (process.env.MCP_TRACY_API_ORIGIN?.trim() || process.env.MCP_TRACY_ORIGIN?.trim() || "");
  return value === "" ? null : value.replace(/\/+$/, "");
}
function apply(ctx, config = {}) {
  if (config.tool !== true) return;
  const eventsOf = (sessionId) => ctx.get?.("sessions")?.get?.(sessionId)?.snapshotEvents?.() ?? [];
  const build = createBuildTool({
    http: config.fetch ?? fetch,
    origin: () => originOf(config),
    eventsOf,
    actorFor: (sessionId) => {
      const who = latestPrompter(eventsOf(sessionId));
      const mint = ctx.get?.("tracyAssertion")?.mint;
      return who !== null && typeof mint === "function" ? mint(who.email) : null;
    }
  });
  const tool = {
    name: "tracy_build",
    description: BUILD_DESCRIPTION,
    parameters: BUILD_PARAMETERS,
    output: {
      schema: {},
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
    },
    execute: (args, exec) => build.execute(args, exec)
  };
  ctx.effect(() => ctx.tools.register(tool), "tracy-build-chat: tracy_build");
  ctx.effect(() => ctx.tools.guard(build.guard), "tracy-build-chat: build questions guard");
}
export {
  apply,
  inject,
  name
};
