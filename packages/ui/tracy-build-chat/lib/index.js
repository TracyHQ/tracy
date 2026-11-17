// ../../core/tracy-core/src/build-chat/conversation.mjs
var ANSWER_SCHEMA = "tracy-build-answer/v1";
var BUILD_CHAT_STRINGS = {
  "tool.research.one": "Read {count} source",
  "tool.research.other": "Read {count} sources",
  "review.question": "Approve this plan?",
  "review.summary": "{name}: {pages}, {services}",
  "review.summary.one": "{name}: {part}",
  "review.pages.one": "{count} page",
  "review.pages.other": "{count} pages",
  "plan.count.service.one": "{count} service",
  "plan.count.service.other": "{count} services",
  "review.approve": "Approve",
  "review.change": "Change the plan"
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
var ASK_STRINGS = {
  "ask.question.main_button": "What should the main button on your site ask visitors to do?",
  "ask.question.contact_method": "We found no phone, email or booking link. How should visitors contact you?",
  "ask.question.site_language": "Your public pages use more than one language. Which language should your site use?",
  "ask.question.fact_conflict_business.phone": "Your public pages give different values for your phone number. Which one is right?",
  "ask.question.fact_conflict_business.email": "Your public pages give different values for your email address. Which one is right?",
  "ask.question.fact_conflict_business.address": "Your public pages give different values for your address. Which one is right?",
  "ask.question.fact_conflict_business.hours": "Your public pages give different values for your opening hours. Which one is right?",
  "ask.question.fact_conflict_business.link": "Your public pages give different values for your booking or contact link. Which one is right?",
  "ask.question.fact_conflict_business.name": "Your public pages give different values for your business name. Which one is right?",
  "ask.question.fact_conflict_business.price": "Your public pages give different values for your price. Which one is right?",
  "ask.question.fact_conflict_item.phone": "Your public pages give different values for the phone number of {item}. Which one is right?",
  "ask.question.fact_conflict_item.email": "Your public pages give different values for the email address of {item}. Which one is right?",
  "ask.question.fact_conflict_item.address": "Your public pages give different values for the address of {item}. Which one is right?",
  "ask.question.fact_conflict_item.hours": "Your public pages give different values for the opening hours of {item}. Which one is right?",
  "ask.question.fact_conflict_item.link": "Your public pages give different values for the booking or contact link of {item}. Which one is right?",
  "ask.question.fact_conflict_item.name": "Your public pages give different values for the business name of {item}. Which one is right?",
  "ask.question.fact_conflict_item.price": "Your public pages give different values for the price of {item}. Which one is right?",
  "ask.question.place_choice": "We found more than one place on Google Maps under this name. Which one is yours?",
  "ask.choice.place_choice_none": "None of these",
  "ask.choice.main_button_book": "Book online",
  "ask.choice.main_button_call": "Call us",
  "ask.choice.main_button_email": "Email us",
  "ask.choice.main_button_message": "Message us",
  "ask.choice.main_button_visit": "Visit us",
  "ask.choice.main_button_contact": "Contact us",
  "ask.choice.main_button_book_short": "Book",
  "ask.choice.main_button_call_short": "Call",
  "ask.choice.main_button_email_short": "Email",
  "ask.choice.main_button_message_short": "Message",
  "ask.choice.main_button_visit_short": "Visit",
  "ask.choice.main_button_contact_short": "Contact",
  "ask.choice.main_button_text": "The button reads: {text}",
  "ask.choice.contact_method_phone": "A phone number",
  "ask.choice.contact_method_email": "An email address",
  "ask.choice.contact_method_link": "A booking or contact link",
  "ask.from": "From {sources}",
  "ask.and": "{first} and {last}",
  "ask.source.website": "Website",
  "ask.source.google_maps": "Google Maps listing",
  "ask.source.owner_answer": "Your answer",
  "ask.source.instagram": "Instagram profile",
  "ask.source.facebook": "Facebook page",
  "ask.source.tiktok": "TikTok profile",
  "ask.source.social": "Social profile",
  "ask.source.listing": "Directory listing"
};
var CONFLICT_NOUNS = {
  "contact.phone": "phone",
  "contact.email": "email",
  "contact.address": "address",
  "contact.hours": "hours",
  "contact.cta_url": "link",
  "business.name": "name",
  "offering.price": "price",
  "package.price": "price"
};
function promptByCode(question, words) {
  const { code, params = {} } = question ?? {};
  if (code === "main_button" || code === "contact_method" || code === "site_language" || code === "place_choice")
    return words(`ask.question.${code}`);
  const noun = CONFLICT_NOUNS[params?.fact];
  if (!noun) return null;
  if (code === "fact_conflict_business") return words(`ask.question.fact_conflict_business.${noun}`);
  if (code === "fact_conflict_item" && typeof params.item === "string" && params.item !== "")
    return words(`ask.question.fact_conflict_item.${noun}`, { item: params.item });
  return null;
}
function languageNameIn(tag, language) {
  try {
    const name2 = new Intl.DisplayNames([language], { type: "language" }).of(tag);
    return name2 ? name2.charAt(0).toLocaleUpperCase(language) + name2.slice(1) : null;
  } catch {
    return null;
  }
}
function choiceLabelByCode(choice, words, language) {
  const { code, params = {} } = choice ?? {};
  if (typeof code !== "string") return null;
  if (/^contact_method_[a-z]+$/.test(code) || code === "place_choice_none") return words(`ask.choice.${code}`);
  if (MAIN_BUTTON_CHOICE.test(code)) return words(`ask.choice.${code}`);
  if (code === "site_language_option" && typeof params?.language === "string")
    return languageNameIn(params.language, language);
  return null;
}
var MAIN_BUTTON_CHOICE = /^main_button_(book|call|email|message|visit|contact)(_short)?$/;
function choiceDetailByCode(choice, words) {
  if (choice?.code !== "fact_conflict_value" || typeof choice.params?.from !== "string") return null;
  const names = choice.params.from.split(",").map((from) => words(`ask.source.${from.trim()}`));
  if (names.length === 0 || names.some((n) => n === null)) return null;
  const sources = names.length === 1 ? names[0] : words("ask.and", { first: names.slice(0, -1).join(", "), last: names[names.length - 1] });
  return sources === null ? null : words("ask.from", { sources });
}
function localizedAskOf(ask, questions, words, language) {
  if (!ask || !Array.isArray(ask.questions)) return ask;
  const byId = new Map((questions ?? []).map((q) => [q?.id, q]));
  return {
    ...ask,
    questions: ask.questions.map((item) => {
      const source = byId.get(item?.id);
      if (!source) return item;
      const choices = choicesOf(source);
      const options = Array.isArray(item.options) ? item.options : [];
      const said = options.map((o, i) => {
        const choice = choices[i];
        if (!choice || choice.label !== o?.label) return o;
        const label = choiceLabelByCode(choice, words, language) ?? o.label;
        const buttonText = label !== o.label && MAIN_BUTTON_CHOICE.test(choice.code) ? words("ask.choice.main_button_text", { text: o.label }) : null;
        const description = buttonText ?? (o.description === void 0 ? void 0 : choiceDetailByCode(choice, words) ?? o.description);
        return description === void 0 ? { ...o, label } : { ...o, label, description };
      });
      const recommendedAt = options.findIndex((o) => o?.label === item.recommended);
      return {
        ...item,
        question: promptByCode(source, words) ?? item.question,
        options: said,
        ...recommendedAt >= 0 ? { recommended: said[recommendedAt].label } : {}
      };
    })
  };
}
function sentChoiceIdOf(question, sent, label) {
  const choices = choicesOf(question);
  if (!Array.isArray(sent) || sent.length !== choices.length || typeof label !== "string") return null;
  const at = sent.indexOf(label);
  if (at < 0 || sent.lastIndexOf(label) !== at) return null;
  return choices[at]?.id ?? null;
}
function answerOf(question, item) {
  const text2 = item?.custom?.trim() ?? "";
  if (text2 !== "") return { schema: ANSWER_SCHEMA, question: question.id, text: text2 };
  const choices = choicesOf(question);
  const picked = item?.selected?.[0];
  const choice = item?.choice !== void 0 ? choices.find((c) => c.id === item.choice) : choices.find((c) => c.label === picked) ?? choices.find((c) => c.id === picked);
  return choice ? { schema: ANSWER_SCHEMA, question: question.id, choice: choice.id } : null;
}
function textTooLongOf(question, item) {
  const limit = question?.freeText?.maxLength;
  if (!Number.isInteger(limit)) return null;
  const length = [...item?.custom?.trim() ?? ""].length;
  return length > limit ? { limit, length } : null;
}

// ../../core/tracy-core/src/build-chat/owner-sentences.mjs
var TEAM_SEES_SAY = "The Tracy team can see what happened and will look into it.";
var FAULT_SAY = `Something went wrong on our side, so I stopped here. ${TEAM_SEES_SAY}`;
var UNCHANGED_SAY = "Your plan is unchanged. You can change any value on the card, tell me what to change, or ask me to start the plan over.";
var BUILD_LOCKED_SAY = "Your site is being built from the plan you approved, so the plan cannot change until the build ends.";
var BUILD_DONE_SAY = "Your site is ready. You can see it in the Browser tab, and you can ask me here for any change.";
var nameTooLongSay = (limit) => `That name is too long for this design. Please use ${limit} characters or fewer.`;
var answerTooLongSay = (limit) => `That answer is too long. Please use ${limit} characters or fewer.`;
var requestTooLongSay = (limit) => `That request is too long. Please use ${limit} characters or fewer.`;
var RESEARCH_READ_SAY = "I have read what you gave me about your business.";
var SAY_STRINGS = { "say.researchRead": RESEARCH_READ_SAY };

// ../../core/tracy-core/src/build-chat/plain-text.mjs
var NAMED = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201D",
  ldquo: "\u201C",
  sbquo: "\u201A",
  bdquo: "\u201E",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  middot: "\xB7",
  bull: "\u2022",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  deg: "\xB0",
  // Written as code points: the repository's language scan reads accented letters in source as prose.
  eacute: String.fromCodePoint(233),
  egrave: String.fromCodePoint(232),
  aacute: String.fromCodePoint(225),
  agrave: String.fromCodePoint(224),
  ouml: String.fromCodePoint(246),
  uuml: String.fromCodePoint(252),
  auml: String.fromCodePoint(228),
  ccedil: String.fromCodePoint(231),
  ntilde: String.fromCodePoint(241)
});
var REFERENCE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,8}));/g;
var usable = (cp) => Number.isInteger(cp) && cp > 31 && cp <= 1114111 && !(cp >= 127 && cp <= 159) && !(cp >= 55296 && cp <= 57343);
function plainTextOf(text2) {
  if (typeof text2 !== "string" || !text2.includes("&")) return text2;
  return (
    /** @type {T} */
    text2.replace(REFERENCE, (whole, dec, hex, name2) => {
      if (name2 !== void 0) return Object.hasOwn(NAMED, name2) ? NAMED[name2] : whole;
      const cp = dec !== void 0 ? Number(dec) : Number.parseInt(hex, 16);
      return usable(cp) ? String.fromCodePoint(cp) : whole;
    })
  );
}

// ../../core/tracy-core/src/build-chat/plan.mjs
var PLAN_REVIEW_ID = "plan-review";
var REVIEW_ID = PLAN_REVIEW_ID;
var english = (key, vars = {}) => BUILD_CHAT_STRINGS[key].replace(/\{(\w+)\}/g, (_, name2) => String(vars[name2] ?? ""));
var firstSource = (sources) => plainTextOf(sources?.[0]?.name ?? "");
var firstSourceKind = (sources) => typeof sources?.[0]?.kind === "string" ? sources[0].kind : null;
var isWebsite = (alternative) => (alternative.sources ?? []).some((s) => s.kind === "website");
function choiceOf(fact, assumption) {
  const ordered = [...assumption.alternatives].sort((a, b) => Number(isWebsite(b)) - Number(isWebsite(a)));
  return {
    field: assumption.field,
    said: plainTextOf(assumption.said),
    // `value` is what a pick sends, exactly as the plan holds it; `text` is how it reads on the card.
    options: ordered.map((a) => ({
      value: a.value,
      text: plainTextOf(a.value),
      source: firstSource(a.sources),
      sourceKind: firstSourceKind(a.sources),
      selected: a.value === fact.value
    }))
  };
}
function holdsOf(block, plan, serviceIds) {
  const data = block.data ?? [];
  if (serviceIds.length > 0 && data.length === serviceIds.length && serviceIds.every((id) => data.includes(id)))
    return { services: serviceIds.map((id) => plainTextOf(plan.items.find((i) => i.id === id).label)) };
  const facts = [];
  const factKinds = [];
  const counts = [];
  for (const id of data) {
    const fact = plan.facts.find((f) => f.id === id);
    if (fact) {
      facts.push(plainTextOf(fact.label));
      factKinds.push(typeof fact.kind === "string" ? fact.kind : null);
      continue;
    }
    const item = plan.items.find((i) => i.id === id);
    if (!item) continue;
    const n = item.count ?? 1;
    const seen = counts.find((c) => c.kind === item.kind);
    if (seen) seen.count += n;
    else counts.push({ kind: item.kind, count: n });
  }
  return { facts, factKinds, counts };
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
    out.push(item ? { head: plainTextOf(item.label), rows } : { rows });
  }
  return out;
}
function rowLabelOf(row, plan) {
  if (row.page !== void 0) return plainTextOf(plan.pages.find((p) => p.id === row.page)?.name ?? null);
  const id = row.data;
  const found = (plan.rows ?? []).find((r) => r.id === id)?.label ?? plan.facts.find((f) => f.id === id)?.value ?? plan.items.find((i) => i.id === id)?.label;
  return plainTextOf(found ?? null);
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
    const what = plainWordsOf(plainTextOf(l.what));
    const reason = plainTextOf(l.reason);
    const code = typeof l.code === "string" && l.code !== "" ? l.code : null;
    const params = code && isPlainObject(l.params) ? l.params : null;
    const key = JSON.stringify([what, l.kind, reason, code, params]);
    const seen = byKey.get(key);
    if (seen) seen.count += 1;
    else {
      const line = {
        what,
        kind: l.kind,
        reason,
        ...code ? { code } : {},
        ...params ? { params } : {},
        count: 1
      };
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
var listOr = (value) => Array.isArray(value) ? value : [];
var isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var codeOf = (part) => typeof part?.code === "string" && part.code !== "" ? { code: part.code, params: isPlainObject(part.params) ? part.params : {} } : {};
function wholePlanOf(plan) {
  const look = plan?.look ?? {};
  const pictures = plan?.pictures ?? {};
  return {
    ...plan,
    facts: listOr(plan?.facts),
    items: listOr(plan?.items),
    pages: listOr(plan?.pages).map((p) => ({ ...p, blocks: listOr(p?.blocks) })),
    look: { ...look, template: look.template ?? {}, logo: look.logo ?? {} },
    pictures: {
      own: { frames: 0, ...pictures.own },
      generated: { frames: 0, ...pictures.generated }
    }
  };
}
function rowDataOf(lists, out = /* @__PURE__ */ new Set()) {
  for (const list of listOr(lists))
    for (const row of listOr(list?.rows)) {
      if (typeof row?.data === "string") out.add(row.data);
      rowDataOf(row?.lists, out);
    }
  return out;
}
function shownOnPagesOf(plan) {
  const shown = /* @__PURE__ */ new Set();
  for (const page of plan.pages)
    for (const block of page.blocks) {
      for (const id of listOr(block.data)) shown.add(id);
      rowDataOf(block.lists, shown);
    }
  return shown;
}
function planCardOf(contractPlan) {
  const plan = wholePlanOf(contractPlan);
  const disputed = new Map(
    (plan.assumptions ?? []).filter((a) => Array.isArray(a.alternatives) && /^facts\[[^\]]+\]\.value$/.test(a.field)).map((a) => [a.field, a])
  );
  const shown = shownOnPagesOf(plan);
  const services = plan.items.filter((i) => i.kind === "service" && shown.has(i.id));
  const serviceIds = services.map((s) => s.id);
  const name2 = plainTextOf(plan.facts.find((f) => f.kind === "business.name")?.value ?? "");
  const leftOutFacts = new Set(
    listOr(plan.leftOut).map((l) => l?.item).filter((id) => typeof id === "string" && !shown.has(id))
  );
  return {
    planId: plan.id,
    revision: plan.revision,
    name: name2,
    facts: plan.facts.filter((f) => !leftOutFacts.has(f.id)).map((f) => {
      const field = `facts[${f.id}].value`;
      const assumption = disputed.get(field);
      return {
        id: f.id,
        field,
        // The data kind (`business.name`) and the source's origin code: the card says both in its own words.
        kind: typeof f.kind === "string" ? f.kind : null,
        label: plainTextOf(f.label),
        value: plainTextOf(f.value),
        // The value as the owner reads it, written by code (opening hours), with its code: shown in place of
        // `value`, which stays what an edit changes.
        ...typeof f.display === "string" && f.display !== "" ? { display: plainTextOf(f.display) } : {},
        ...codeOf(f),
        source: firstSource(f.sources),
        sourceKind: firstSourceKind(f.sources),
        choice: assumption ? choiceOf(f, assumption) : null
      };
    }),
    language: plan.language,
    look: {
      template: typeof plan.look.template.name === "string" ? plan.look.template.name : "",
      accent: plan.look.accent,
      // The dark theme's accent when it differs from the light one (#616); shown, not offered for editing yet.
      accentDark: typeof plan.look.accentDark === "string" ? plan.look.accentDark : null,
      // The logo's source line code (`logo_source_own`, `logo_source_drawn`) and where it came from (`sourceKind`).
      logo: plan.look.logo.kind === "own" ? {
        kind: "own",
        source: plan.look.logo.source,
        ...typeof plan.look.logo.code === "string" ? { code: plan.look.logo.code } : {},
        ...typeof plan.look.logo.sourceKind === "string" ? { sourceKind: plan.look.logo.sourceKind } : {}
      } : { kind: plan.look.logo.kind ?? null }
    },
    services: services.map((s) => ({
      id: s.id,
      field: `items[${s.id}].label`,
      label: plainTextOf(s.label),
      source: firstSource(s.sources),
      sourceKind: firstSourceKind(s.sources)
    })),
    pages: plan.pages.map((p) => ({
      id: p.id,
      name: plainTextOf(p.name),
      blocks: p.blocks.map((b) => {
        const lists = listsOf(b.lists, plan);
        return {
          id: b.id,
          label: plainTextOf(b.label),
          // The section's stable key (`labelCode`): the card names the section by it, `label` is the fallback.
          ...typeof b.labelCode === "string" && b.labelCode !== "" ? { labelCode: b.labelCode } : {},
          reason: plainTextOf(b.reason),
          holds: holdsOf(b, plan, serviceIds),
          ...lists.length > 0 ? { lists } : {}
        };
      })
    })),
    pictures: {
      own: {
        frames: plan.pictures.own.frames,
        from: [...plan.pictures.own.from ?? []],
        // The source kind of each name in `from`, same order (`website`, `google`, `social`, `answer`).
        ...Array.isArray(plan.pictures.own.fromKinds) ? { fromKinds: [...plan.pictures.own.fromKinds] } : {}
      },
      generated: {
        frames: plan.pictures.generated.frames,
        ...plan.pictures.generated.reason ? { reason: plainTextOf(plan.pictures.generated.reason) } : {},
        ...codeOf(plan.pictures.generated)
      }
    },
    // A disputed fact is settled at the fact itself; every other assumption is listed, with its code when it has one.
    assumptions: (plan.assumptions ?? []).filter((a) => !disputed.has(a.field)).map((a) => ({ id: a.id, said: plainTextOf(a.said), ...codeOf(a) })),
    leftOut: leftOutOf(plan.leftOut),
    counts: { pages: plan.pages.length, services: services.length }
  };
}
var PLAN_REVIEW_APPROVE = "Approve";
var PLAN_REVIEW_CHANGE = "Change the plan";
var planReviewIdOf = (plan) => `${REVIEW_ID}:${plan.id}:${plan.revision}`;
function planOfReviewId(id) {
  if (typeof id !== "string" || !id.startsWith(`${REVIEW_ID}:`)) return null;
  const rest = id.slice(REVIEW_ID.length + 1);
  const cut = rest.lastIndexOf(":");
  if (cut <= 0) return null;
  const revision = rest.slice(cut + 1);
  if (!/^\d+$/.test(revision)) return null;
  return { id: rest.slice(0, cut), revision: Number(revision) };
}
function planReviewRequestOf(plan, t = english) {
  const { name: name2, counts } = planCardOf(plan);
  const pages = t(counts.pages === 1 ? "review.pages.one" : "review.pages.other", { count: counts.pages });
  const services = t(counts.services === 1 ? "plan.count.service.one" : "plan.count.service.other", {
    count: counts.services
  });
  const parts = [counts.pages > 0 ? pages : null, counts.services > 0 ? services : null].filter(
    (p) => p !== null
  );
  const summary = parts.length === 2 ? t("review.summary", { name: name2, pages, services }) : parts.length === 1 ? t("review.summary.one", { name: name2, part: parts[0] }) : name2;
  return {
    questions: [
      {
        id: planReviewIdOf(plan),
        question: t("review.question"),
        detail: `# ${summary}`,
        options: [{ label: PLAN_REVIEW_APPROVE }, { label: PLAN_REVIEW_CHANGE }],
        intent: { kind: "plan-review", approve: PLAN_REVIEW_APPROVE }
      }
    ]
  };
}
function approvalOf(reply) {
  const answer = (reply?.answers ?? []).find((a) => planOfReviewId(a?.id) !== null);
  if (!answer || answer.selected?.[0] !== PLAN_REVIEW_APPROVE) return null;
  return { plan: planOfReviewId(answer.id) };
}

// ../../core/tracy-core/src/build-chat/link-reads.mjs
var LINK_READ_STRINGS = Object.freeze({
  "links.reading": "{name}: reading",
  "links.choice": "{name}: needs your choice",
  "links.failed": "{name}: could not be read",
  "links.failedWhy": "{name}: could not be read ({reason})",
  "links.read": "{name}: read",
  "links.readNothing": "{name}: read, but nothing about the business was found",
  "links.readPicturesLost": "{name}: read, but its pictures could not be downloaded",
  "links.readPicturesNotKept": "{name}: read, but its pictures could not be kept",
  "links.facts.one": "{count} fact",
  "links.facts.other": "{count} facts",
  "links.pictures.one": "{count} picture",
  "links.pictures.other": "{count} pictures",
  "links.pictures.none": "No pictures",
  "links.pictures.someLost": "{count} more could not be downloaded"
});
var PLATFORMS = Object.freeze({
  "instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "fb.com": "Facebook",
  "tiktok.com": "TikTok",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube"
});

// ../../core/tracy-core/src/build-chat/progress.mjs
function templateChoiceOf(templates) {
  const options = (templates ?? []).filter((t) => t?.quickstart === "released" && t.fits === true);
  const chosen = (options.find((t) => t.recommended === true) ?? options[0])?.slug ?? null;
  return { options, chosen, none: options.length === 0 };
}

// ../../core/tracy-core/src/build-chat/handoff.mjs
var HANDOFF_FENCE = "tracy-build-handoff";
var ROLE_OF_SPEAKER = Object.freeze({ owner: "user", "build-agent": "assistant" });
var OPEN_FENCE = `\`\`\`${HANDOFF_FENCE}
`;

// ../../core/tracy-core/src/build-chat/tool-results.mjs
var isObject = (value) => value !== null && typeof value === "object";
var listOf = (value) => Array.isArray(value) ? value : [];
var codeAt = (codes, lines, i) => {
  const given = listOf(codes);
  const code = given.length === lines.length ? given[i] : null;
  return typeof code === "string" && code !== "" ? code : null;
};
var paramsAt = (params, lines, i) => {
  const given = listOf(params);
  const value = given.length === lines.length ? given[i] : null;
  return isObject(value) && !Array.isArray(value) ? value : null;
};
var NOT_DONE_REASONS = /* @__PURE__ */ new Set(["no_recipe", "no_data", "fact_missing", "kept_private", "outside_plan"]);
var reasonAt = (reasons, lines, i) => {
  const given = listOf(reasons);
  const value = given.length === lines.length ? given[i] : null;
  return typeof value === "string" && NOT_DONE_REASONS.has(value) ? value : null;
};
function revisedOf(value) {
  if (!isObject(value)) return null;
  const coded = isObject(value.codes);
  const given = coded ? value.codes : {};
  const allChanged = listOf(value.changed);
  const allNotDone = listOf(value.notDone);
  const beside = (list, lines) => Array.isArray(list) && list.length === lines.length;
  const withChangedParams = beside(given.changedParams, allChanged);
  const withNotDoneParams = beside(given.notDoneParams, allNotDone);
  const withReasons = beside(given.notDoneReasons, allNotDone);
  const codes = { changed: [], notDone: [] };
  if (withChangedParams) codes.changedParams = [];
  if (withNotDoneParams) codes.notDoneParams = [];
  if (withReasons) codes.notDoneReasons = [];
  const changed = [];
  allChanged.forEach((line, i) => {
    if (typeof line !== "string") return;
    changed.push(line);
    codes.changed.push(coded ? codeAt(given.changed, allChanged, i) : null);
    codes.changedParams?.push(paramsAt(given.changedParams, allChanged, i));
  });
  const notDone = [];
  allNotDone.forEach((e, i) => {
    if (typeof e?.what !== "string" || typeof e?.why !== "string") return;
    notDone.push({ what: e.what, why: e.why });
    codes.notDone.push(coded ? codeAt(given.notDone, allNotDone, i) : null);
    codes.notDoneParams?.push(paramsAt(given.notDoneParams, allNotDone, i));
    codes.notDoneReasons?.push(reasonAt(given.notDoneReasons, allNotDone, i));
  });
  return coded ? { changed, notDone, codes } : { changed, notDone };
}
var EMPTY = Object.freeze({
  calls: Object.freeze({}),
  templates: null,
  plan: null,
  working: null,
  stop: null,
  streak: null,
  build: null
});
var RETRY_MESSAGE = "Please try again.";

// ../../core/tracy-core/src/build-chat/index.mjs
var BUILD_SESSION = /^session-build-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isBuildChatSession(sessionId) {
  return typeof sessionId === "string" && BUILD_SESSION.test(sessionId);
}

// src/chat-words.mjs
function chatLanguageTagOf(tag) {
  if (typeof tag !== "string") return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(primary) ? primary : null;
}
function wordsOver(table, english2) {
  return (key, vars = {}) => {
    const text2 = Object.hasOwn(table, key) ? table[key] : Object.hasOwn(english2, key) ? english2[key] : null;
    return text2 === null ? null : text2.replace(/\{(\w+)\}/g, (_, name2) => String(
      /** @type {any} */
      vars[name2] ?? ""
    ));
  };
}

// ../../locale/tracy-locales/de/tracy-build-chat.json
var tracy_build_chat_default = {
  "cancelled.body": "Sie haben diesen Aufbau abgebrochen. Ihr Plan und Ihre Antworten bleiben erhalten.",
  "cancelled.title": "Der Aufbau wurde abgebrochen",
  "handoff.earlier": "Fr\xFChere Unterhaltung",
  "handoff.tooLong": "Ihre Site ist fertig, aber diese Unterhaltung ist zu lang, um sie in den Chat der Site zu \xFCbertragen. \xD6ffnen Sie Ihre Site aus Ihrer Liste der Sites.",
  "plan.allSources": "Alle Quellen",
  "plan.and": "{first} und {last}",
  "plan.assumptions": "Was ich angenommen habe",
  "plan.cancel": "Abbrechen",
  "plan.changed": "Ge\xE4ndert",
  "plan.count.gallery.one": "{count} Foto",
  "plan.count.gallery.other": "{count} Fotos",
  "plan.count.item.one": "{count} Eintrag",
  "plan.count.item.other": "{count} Eintr\xE4ge",
  "plan.count.person.one": "{count} Person",
  "plan.count.person.other": "{count} Personen",
  "plan.count.quote.one": "{count} Bewertung",
  "plan.count.quote.other": "{count} Bewertungen",
  "plan.count.service.one": "{count} Leistung",
  "plan.count.service.other": "{count} Leistungen",
  "plan.design": "Design: {name}",
  "plan.edit": "{label} bearbeiten: {value}",
  "plan.facts": "Fakten zum Unternehmen",
  "plan.fromServices": "Aus Leistungen",
  "plan.language": "Sprache der Site",
  "plan.leftOut": "Weggelassen",
  "plan.leftOut.showAll": "Alle anzeigen ({count})",
  "plan.leftOut.showFewer": "Weniger anzeigen",
  "plan.revised.changed": "Was sich ge\xE4ndert hat",
  "plan.revised.notDone": "Nicht erledigt",
  "plan.revised.dismiss": "Diese Notiz ausblenden",
  "plan.revised.edited": "{label} ist jetzt {value}.",
  "plan.revised.line.owner_value_saved": "Ihre Antwort ist gespeichert: {label}, {value}.",
  "plan.revised.line.item_renamed": "{from} hei\xDFt jetzt {to}.",
  "plan.revised.line.item_taken_off": "{label} erscheint wie gew\xFCnscht nicht auf Ihrer Site.",
  "plan.revised.line.page-removed": "Die Seite {name} wurde entfernt.",
  "plan.revised.line.page-added": "Die Seite {name} wurde hinzugef\xFCgt.",
  "plan.revised.line.page-renamed": "Die Seite {from} hei\xDFt jetzt {to}.",
  "plan.revised.line.page-order": "Die Seiten stehen jetzt in dieser Reihenfolge: {names}.",
  "plan.revised.line.block-removed": "Der Abschnitt {section} wurde von der Seite {page} entfernt.",
  "plan.revised.line.block-added": "Der Abschnitt {section} wurde der Seite {page} hinzugef\xFCgt.",
  "plan.revised.line.block-data.count": "Der Abschnitt {section} der Seite {page} zeigt jetzt {count} Eintr\xE4ge.",
  "plan.revised.line.block-data": "Der Abschnitt {section} der Seite {page} zeigt jetzt {names}.",
  "plan.revised.line.block-order": "Die Abschnitte der Seite {page} haben eine neue Reihenfolge.",
  "plan.revised.line.data-off": "Nicht mehr angezeigt: {names}.",
  "plan.revised.line.data-on": "Jetzt angezeigt: {names}.",
  "plan.revised.line.data-again": "Wieder angezeigt: {names}, was Sie zuvor entfernt hatten.",
  "plan.revised.line.pictures-own.one": "Der Plan verwendet jetzt {count} Foto von Ihnen.",
  "plan.revised.line.pictures-own.other": "Der Plan verwendet jetzt {count} Fotos von Ihnen.",
  "plan.revised.line.pictures-drawn.none": "Tracy erstellt jetzt keine Bilder.",
  "plan.revised.line.pictures-drawn.one": "Etwa {count} Bild wird erstellt, wo Sie kein passendes Foto haben.",
  "plan.revised.line.pictures-drawn.other": "Etwa {count} Bilder werden erstellt, wo Sie kein passendes Foto haben.",
  "plan.revised.notDone.nothing_to_change.what": "Ihre Anfrage",
  "plan.revised.notDone.nothing_to_change.why": "Nichts im Plan konnte ihr folgen, daher bleibt der Plan unver\xE4ndert.",
  "plan.revised.notDone.page_already_on_plan.why": "Der Plan hat diese Seite bereits.",
  "plan.revised.notDone.section_not_filled.what": "Ein neuer Abschnitt",
  "plan.revised.notDone.section_not_filled.why": "Es gibt nichts von Ihrem Unternehmen, um ihn zu f\xFCllen, daher wird er nicht hinzugef\xFCgt.",
  "plan.revised.notDone.item_rename_refused.what": "{name} umbenennen",
  "plan.undo.chatChange": "R\xFCckg\xE4ngig nimmt nur \xC4nderungen auf dieser Karte zur\xFCck. Um eine \xC4nderung zur\xFCckzunehmen, die Sie im Chat angefragt haben, fragen Sie im Chat danach.",
  "plan.fact.business.name": "Name des Unternehmens",
  "plan.fact.business.founded_year": "Gegr\xFCndet",
  "plan.fact.business.tagline": "Slogan",
  "plan.fact.business.summary": "\xDCber uns",
  "plan.fact.contact.phone": "Telefon",
  "plan.fact.contact.email": "Email",
  "plan.fact.contact.address": "Adresse",
  "plan.fact.contact.hours": "\xD6ffnungszeiten",
  "plan.fact.contact.cta_url": "Buchungs-Link",
  "plan.fact.contact.cta_label": "Hauptschaltfl\xE4che",
  "plan.fact.contact.social_url": "Social-Media-Link",
  "plan.source.website": "Website",
  "plan.source.google": "Eintrag in Google Maps",
  "plan.source.social": "Social-Media-Profil",
  "plan.source.answer": "Ihre Antwort",
  "plan.look": "Erscheinungsbild",
  "plan.look.accent": "Hauptfarbe",
  "plan.look.accentDark": "Hauptfarbe auf dunklen Seiten",
  "plan.look.accentLight": "Hauptfarbe auf hellen Seiten",
  "plan.look.logoDark": "Logo auf dunklen Seiten",
  "plan.look.logoDrawn": "Ein Logo, das Tracy gezeichnet hat, nach Ihrem Logo",
  "plan.look.logoLight": "Logo auf hellen Seiten",
  "plan.look.logoOwn": "Ihr Logo, von {source}",
  "plan.look.logoText": "Ihr Firmenname als Text",
  "plan.look.template": "Design",
  "plan.newValue": "Neuer Wert f\xFCr {label}",
  "plan.pages": "Seiten ({count})",
  "plan.pictures": "Bilder",
  "plan.pictures.drawn": "Bilder, die Tracy erstellt",
  "plan.pictures.drawnNone": "Keine",
  "plan.pictures.drawnValue.one": "Etwa {count} Bild",
  "plan.pictures.drawnValue.other": "Etwa {count} Bilder",
  "plan.pictures.own": "Ihre Fotos",
  "plan.pictures.ownValue.one": "{count} Foto von {from}",
  "plan.pictures.ownValue.other": "{count} Fotos von {from}",
  "plan.save": "Speichern",
  "plan.saveFailed": "Ihre \xC4nderung wurde nicht gespeichert. Versuchen Sie es erneut.",
  "plan.locked": "Ihre Site wird aus diesem Plan erstellt, daher kann sich der Plan erst \xE4ndern, wenn die Erstellung beendet ist.",
  "plan.stale": "Der Plan hat sich inzwischen ge\xE4ndert, daher wurde Ihre \xC4nderung nicht gespeichert. Die Karte zeigt jetzt den neuesten Plan.",
  "plan.busy": "Ich arbeite noch an Ihrem Plan, daher kann er gerade nicht ge\xE4ndert werden. Nehmen Sie Ihre \xC4nderung erneut vor, wenn ich fertig bin.",
  "plan.tooLarge": "Diese \xC4nderung ist zu lang zum Speichern. K\xFCrzen Sie sie und versuchen Sie es erneut.",
  "plan.sections.one": "{count} Abschnitt",
  "plan.sections.other": "{count} Abschnitte",
  "plan.service": "Leistung {n}",
  "plan.services": "Leistungen ({count})",
  "plan.title": "Site-Plan f\xFCr {name}",
  "plan.undo": "R\xFCckg\xE4ngig",
  "plan.undoLabel": "Letzte \xC4nderung r\xFCckg\xE4ngig machen",
  "progress.clock": "Verstrichene Zeit",
  "progress.done": "{count} abgeschlossen",
  "progress.failed": "{count} fehlgeschlagen",
  "progress.note.failed": "Fehlgeschlagen",
  "progress.note.failedTwice": "Zweimal fehlgeschlagen",
  "progress.note.notStarted": "Nicht gestartet",
  "progress.pending": "{count} ausstehend",
  "progress.running": "{count} in Arbeit",
  "progress.state.done": "Abgeschlossen",
  "progress.state.failed": "Fehlgeschlagen",
  "progress.state.pending": "Ausstehend",
  "progress.state.running": "In Arbeit",
  "progress.title.build": "Ihre Site wird erstellt",
  "progress.title.partial": "Ihre Site wird aktualisiert",
  "rebuild.changed": "Ihr Plan hat sich ge\xE4ndert, seit Ihre Site erstellt wurde. Nur was Sie ge\xE4ndert haben, wird neu erstellt.",
  "rebuild.failed": "Ihre Anfrage wurde nicht gesendet. Versuchen Sie es erneut.",
  "rebuild.heldFiles": "Files, die noch auf Ihrer Site liegen",
  "rebuild.heldFile.person-photo": "Foto {n}: eine Person, die Sie privat halten m\xF6chten",
  "rebuild.say.abandon_done": "Die unvollst\xE4ndige Aktualisierung ist r\xFCckg\xE4ngig gemacht. Ihre Site zeigt, was sie vorher gezeigt hat.",
  "rebuild.say.held_file_left_on_site": "Ein Foto einer Person, die Sie privat halten m\xF6chten, ist noch als File auf Ihrer Site gespeichert, obwohl keine Seite es zeigt. Ich kann noch keine Files l\xF6schen. Das Team kann es f\xFCr Sie entfernen.",
  "rebuild.say.nothing_to_update": "Ihre Site zeigt diesen Plan bereits, daher gibt es nichts zu aktualisieren.",
  "rebuild.say.previous_build_doors_missing": "Ich kann Ihre Site aus diesem Chat noch nicht aktualisieren, daher ist Ihre Site unver\xE4ndert. Das Team kann sehen, was passiert ist.",
  "rebuild.say.previous_build_not_current": "Ihre Site hat sich ge\xE4ndert, w\xE4hrend diese Aktualisierung vorbereitet wurde, daher habe ich angehalten, bevor etwas ge\xE4ndert wurde. Ihre Site ist unver\xE4ndert. Sie k\xF6nnen sie erneut aktualisieren, und ich beginne mit dem, was sie jetzt zeigt.",
  "rebuild.say.previous_build_unreadable": "Ich konnte nicht lesen, wie Ihre Site zuletzt erstellt wurde, daher habe ich angehalten, bevor etwas ge\xE4ndert wurde. Ihre Site ist unver\xE4ndert. Das Team kann sehen, was passiert ist.",
  "rebuild.say.previous_run_unfinished": "Eine fr\xFChere Aktualisierung Ihrer Site wurde nicht abgeschlossen, daher kann ich noch keine neue starten. Sie k\xF6nnen die unvollst\xE4ndige Aktualisierung r\xFCckg\xE4ngig machen, wodurch Ihre Site wieder so wird wie vorher, und dann erneut aktualisieren.",
  "rebuild.say.restore_done": "Ihre Site ist wieder auf der vorherigen Version.",
  "rebuild.say.restore_needs_removal": "Einen Teil der letzten Aktualisierung kann ich in diesem Chat nicht r\xFCckg\xE4ngig machen, daher bin ich nicht zur vorherigen Version zur\xFCckgekehrt. Ihre Site bleibt, wie sie jetzt ist. Das Team kann sehen, was passiert ist.",
  "rebuild.say.restore_shows_held_text": "Die vorherige Version zeigt etwas, das Sie privat halten m\xF6chten, daher bin ich nicht zu ihr zur\xFCckgekehrt. Ihre Site bleibt, wie sie jetzt ist.",
  "rebuild.say.restore_site_changed": "Ein Teil Ihrer Site wurde seit der letzten Aktualisierung au\xDFerhalb von Tracy bearbeitet, daher bin ich nicht zur vorherigen Version zur\xFCckgekehrt. Ihre Bearbeitung bleibt erhalten, und Ihre Site bleibt, wie sie jetzt ist.",
  "rebuild.say.revision_needs_removal": "Ihre \xC4nderung entfernt einen Teil Ihrer Site, den ich in diesem Chat nicht entfernen kann, daher habe ich angehalten, bevor etwas ge\xE4ndert wurde. Ihre Site ist unver\xE4ndert. Das Team kann sehen, worum Sie gebeten haben.",
  "rebuild.say.site_already_built": "Ihre Site ist bereits erstellt, daher habe ich sie nicht von vorn neu erstellt. \xC4ndern Sie den Plan und aktualisieren Sie Ihre Site, dann wird nur neu erstellt, was Sie ge\xE4ndert haben.",
  "rebuild.say.site_changed_outside": "Ein Teil Ihrer Site wurde seit ihrer Erstellung au\xDFerhalb von Tracy bearbeitet, daher habe ich angehalten, bevor diese Bearbeitung \xFCberschrieben wurde. Ihre Bearbeitung bleibt erhalten. Das Team kann sehen, welcher Teil es war.",
  "rebuild.say.update_done": "Ihre Site ist aktualisiert. Nur die Teile, die Ihre \xC4nderung betraf, wurden neu erstellt, der Rest ist wie vorher.",
  "rebuild.say.write_record_stale": "Diese Aktualisierung wurde mit einer fr\xFCheren vermischt, daher habe ich angehalten, bevor etwas ge\xE4ndert wurde. Ihre Site ist unver\xE4ndert. Das Team kann sehen, was passiert ist.",
  "rebuild.restore": "Restore der vorherigen Version",
  "rebuild.title": "Ihre Site",
  "rebuild.undo": "Unvollst\xE4ndige Aktualisierung r\xFCckg\xE4ngig machen",
  "rebuild.update": "Meine Site aktualisieren",
  "retry.button": "Erneut versuchen",
  "review.failed": "Ihre Antwort wurde nicht gesendet. Versuchen Sie es erneut.",
  "review.question": "Diesen Plan freigeben?",
  "review.approve": "Freigeben",
  "review.change": "Plan \xE4ndern",
  "review.say": "Oder beschreiben Sie die gew\xFCnschte \xC4nderung",
  "review.summary": "{name}: {pages}, {services}",
  "review.summary.one": "{name}: {part}",
  "review.pages.one": "{count} Seite",
  "review.pages.other": "{count} Seiten",
  "stopped.kept.none": "Gespeichert: Ihr Plan und Ihre Antworten.",
  "stopped.kept.one": "Gespeichert: Ihr Plan, Ihre Antworten und die geschriebene Seite.",
  "stopped.kept.other": "Gespeichert: Ihr Plan, Ihre Antworten und die {count} geschriebenen Seiten.",
  "stopped.notified": "Das Tracy-Team wurde informiert und k\xFCmmert sich darum. Sie m\xFCssen nichts tun.",
  "stopped.notStarted": "Ihre Site konnte nicht gestartet werden, aber Ihr Plan bleibt erhalten und Sie k\xF6nnen ihn sp\xE4ter erneut freigeben.",
  "stopped.notStarted.design": "Dieses Design kann noch nicht gebaut werden, daher wurde Ihre Site nicht gestartet, aber Ihr Plan bleibt erhalten und Sie k\xF6nnen ihn sp\xE4ter erneut freigeben.",
  "stopped.once": "Ich konnte \u201E{step}\u201C nicht abschlie\xDFen und habe angehalten, statt Ihnen eine unfertige Site zu zeigen.",
  "stopped.title": "Ihre Site ist noch nicht fertig",
  "stopped.twice": "Ich konnte \u201E{step}\u201C nach zwei Versuchen nicht abschlie\xDFen und habe angehalten, statt Ihnen eine unfertige Site zu zeigen.",
  "stopped.unchanged": "Ihre aktuelle Site bleibt unver\xE4ndert.",
  "template.chosen": "Ausgew\xE4hlt: {name}",
  "template.continue": "Weiter",
  "template.later": "Sie k\xF6nnen das Design sp\xE4ter \xE4ndern.",
  "template.list": "Designs f\xFCr Ihre Site",
  "template.none": "F\xFCr Ihr Unternehmen passt noch kein fertiges Design.",
  "template.noneNext": "Sie k\xF6nnen Ihre Site trotzdem \xFCber die Seite Site hinzuf\xFCgen erstellen.",
  "template.openAddSite": "Site hinzuf\xFCgen \xF6ffnen",
  "template.picked": "Ich habe {name} ausgew\xE4hlt.",
  "template.recommended": "Empfohlen",
  "template.saveFailed": "Ihre Auswahl wurde nicht gespeichert. Versuchen Sie es erneut.",
  "template.sendFailed": "Ihre Auswahl ist gespeichert, aber nicht im Chat angekommen. Klicken Sie auf Weiter, um sie erneut zu senden.",
  "template.use": "{name} verwenden",
  "tool.edit": "Ihr Site-Plan wurde aktualisiert",
  "tool.plan": "Ihr Site-Plan wurde erstellt",
  "tool.research.none": "\xDCber Ihr Unternehmen recherchiert",
  "tool.research.one": "{count} Quelle gelesen",
  "tool.research.other": "{count} Quellen gelesen",
  "tool.stopped": "Dieser Schritt konnte nicht abgeschlossen werden",
  "tool.templates": "Designs f\xFCr Ihre Site gefunden",
  "tool.working": "Ihr Site-Plan wird erstellt",
  "plan.revised.notDone.owner_value_not_shown.what": "{label} auf der Site zeigen",
  "plan.revised.notDone.owner_value_not_shown.why": "Ihre Antwort ist gespeichert, aber Ihr Design hat keinen Platz, an dem sie erscheint.",
  "plan.revised.names.counted": "{count} {plural}",
  "plan.revised.notDone.reason.no_recipe": "Ihr Design hat keine Seite dieser Art.",
  "plan.revised.notDone.reason.no_data": "Von Ihrem Unternehmen gibt es nichts, das diesen Abschnitt f\xFCllt.",
  "plan.revised.notDone.reason.fact_missing": "Diese Angabe gibt es f\xFCr Ihr Unternehmen nicht.",
  "plan.revised.notDone.reason.kept_private": "Sie halten dies von Ihrer Site fern.",
  "plan.revised.notDone.reason.outside_plan": "Eine \xC4nderungsanfrage kann dies nicht \xE4ndern. \xC4ndern Sie es auf der Plankarte.",
  "plan.leftOut.reason.no_email_for_form": "Ihr Unternehmen hat keine Email-Adresse, an die das Anmeldeformular Antworten senden kann.",
  "plan.leftOut.reason.no_booking_link": "Sie haben keinen Buchungs- oder Kontakt-Link, den die Schaltfl\xE4che \xF6ffnen kann.",
  "plan.leftOut.reason.no_items_to_show": "Sie haben noch nichts, was dieser Abschnitt zeigen kann.",
  "plan.leftOut.reason.shown_in_other_sections": "Was dieser Abschnitt zeigen w\xFCrde, zeigen bereits andere Abschnitte Ihres Plans.",
  "plan.leftOut.reason.owner_withheld": "Sie haben gebeten, dies von der Site fernzuhalten.",
  "plan.leftOut.reason.left_out_neutral.page": "Diese Seite ist nicht Teil Ihres Plans.",
  "plan.leftOut.reason.left_out_neutral.block": "Dieser Abschnitt ist nicht Teil Ihres Plans.",
  "plan.leftOut.reason.left_out_neutral.item": "Dies wird in Ihrem Plan nicht gezeigt.",
  "plan.leftOut.reason.no_gallery_room.one": "Keine Galerie hat Platz f\xFCr dieses Foto. Es bleibt bei Ihren Fotos und kann an anderer Stelle der Site verwendet werden.",
  "plan.leftOut.reason.no_gallery_room.other": "Keine Galerie hat Platz f\xFCr diese {count} Fotos. Sie bleiben bei Ihren Fotos und k\xF6nnen an anderer Stelle der Site verwendet werden.",
  "plan.pictures.estimate.one": "Etwa {count} Bild wird erstellt, wo Sie kein passendes Foto haben. Die endg\xFCltige Zahl h\xE4ngt von Ihren Fotos ab.",
  "plan.pictures.estimate.other": "Etwa {count} Bilder werden erstellt, wo Sie kein passendes Foto haben. Die endg\xFCltige Zahl h\xE4ngt von Ihren Fotos ab.",
  "plan.logoSource.website": "Website",
  "plan.logoSource.google": "Eintrag in Google Maps",
  "plan.logoSource.instagram": "Instagram-Profil",
  "plan.logoSource.facebook": "Facebook-Seite",
  "plan.logoSource.tiktok": "TikTok-Profil",
  "plan.assumption.logo_drawn.new-symbol-drawn": "Tracy hat ein Logo nach Ihrem Logo gezeichnet: ein neues Symbol Ihrer Branche neben Ihrem Firmennamen, gesetzt in der Template-Schrift. Es ist nicht Ihre Logo-File. Best\xE4tigen Sie es, oder senden Sie uns Ihr Logo, um es zu ersetzen.",
  "plan.assumption.logo_drawn.symbol-cut-from-logo": "Tracy hat ein Logo nach Ihrem Logo gezeichnet: das aus Ihrem Logo ausgeschnittene Symbol neben Ihrem Firmennamen, gesetzt in der Template-Schrift. Es ist nicht Ihre Logo-File. Best\xE4tigen Sie es, oder senden Sie uns Ihr Logo, um es zu ersetzen.",
  "plan.assumption.logo_drawn.name-set-in-template-font": "Tracy hat ein Logo nach Ihrem Logo gezeichnet: ein Zeichen neben Ihrem Firmennamen, gesetzt in der Template-Schrift. Es ist nicht Ihre Logo-File. Best\xE4tigen Sie es, oder senden Sie uns Ihr Logo, um es zu ersetzen.",
  "plan.assumption.logo_made.found.icon": "Ihr Logo lie\xDF sich so nicht verwenden, daher habe ich ein vorl\xE4ufiges gemacht: ein einfaches Symbol Ihrer Branche neben Ihrem Firmennamen. Senden Sie Ihre Logo-File hier im Chat, um es zu ersetzen.",
  "plan.assumption.logo_made.found.lettermark": "Ihr Logo lie\xDF sich so nicht verwenden, daher habe ich ein vorl\xE4ufiges gemacht: Ihre Initialen neben Ihrem Firmennamen. Senden Sie Ihre Logo-File hier im Chat, um es zu ersetzen.",
  "plan.assumption.logo_made.found.mark": "Ihr Logo lie\xDF sich so nicht verwenden, daher habe ich ein vorl\xE4ufiges gemacht: ein einfaches Zeichen neben Ihrem Firmennamen. Senden Sie Ihre Logo-File hier im Chat, um es zu ersetzen.",
  "plan.assumption.logo_made.none.icon": "Es wurde kein Logo gefunden, daher habe ich ein vorl\xE4ufiges gemacht: ein einfaches Symbol Ihrer Branche neben Ihrem Firmennamen, in der Hauptfarbe des Designs. Senden Sie Ihr Logo hier im Chat, um es zu ersetzen.",
  "plan.assumption.logo_made.none.lettermark": "Es wurde kein Logo gefunden, daher habe ich ein vorl\xE4ufiges gemacht: Ihre Initialen neben Ihrem Firmennamen, in der Hauptfarbe des Designs. Senden Sie Ihr Logo hier im Chat, um es zu ersetzen.",
  "plan.assumption.logo_made.none.mark": "Es wurde kein Logo gefunden, daher habe ich ein vorl\xE4ufiges gemacht: ein einfaches Zeichen neben Ihrem Firmennamen, in der Hauptfarbe des Designs. Senden Sie Ihr Logo hier im Chat, um es zu ersetzen.",
  "plan.hours.days": "{from} bis {to}",
  "plan.hours.time": "{from} bis {to}",
  "plan.hours.closed": "geschlossen",
  "plan.hours.ranges": "{first} und {next}",
  "plan.hours.group": "{days}, {hours}",
  "plan.hours.groups": "{first}; {next}",
  "plan.section.header": "Men\xFC",
  "plan.section.footer": "Fu\xDFzeile",
  "plan.section.hero": "Hero-Bereich",
  "plan.section.page_header": "Seitenkopf",
  "plan.section.about": "\xDCber uns",
  "plan.section.text": "Text",
  "plan.section.call_to_action": "Handlungsaufruf",
  "plan.section.contact": "Kontaktdaten",
  "plan.section.map": "Karte",
  "plan.section.video": "Video",
  "plan.section.newsletter": "Newsletter",
  "plan.section.services": "Leistungen",
  "plan.section.menu": "Speisekarte",
  "plan.section.pricing": "Preise",
  "plan.section.schedule": "Zeitplan",
  "plan.section.team": "Team",
  "plan.section.stats": "Zahlen",
  "plan.section.steps": "Schritte",
  "plan.section.reviews": "Bewertungen",
  "plan.section.claims": "Auszeichnungen",
  "plan.section.faq": "Fragen",
  "plan.section.events": "Veranstaltungen",
  "plan.section.posts": "Artikel",
  "plan.section.gallery": "Fotos",
  "rebuild.say.door_not_available": "Ihre Site l\xE4sst mich diese \xC4nderung in diesem Chat nicht vornehmen, daher habe ich die Aktualisierung angehalten. Das Team kann sehen, welcher Teil es war.",
  "rebuild.say.sheets_unreadable": "Ich konnte die Stylesheets Ihrer Site nicht lesen, daher habe ich angehalten, bevor ihre Farben ge\xE4ndert wurden. Das Team kann sehen, was passiert ist.",
  "ask.question.main_button": "Wozu soll die Hauptschaltfl\xE4che Ihrer Site die Besucher auffordern?",
  "ask.question.contact_method": "Wir haben keine Telefonnummer, keine Email-Adresse und keinen Buchungs-Link gefunden. Wie sollen Besucher Sie kontaktieren?",
  "ask.question.site_language": "Ihre \xF6ffentlichen Seiten verwenden mehr als eine Sprache. Welche Sprache soll Ihre Site verwenden?",
  "ask.question.fact_conflict_business.phone": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr Ihre Telefonnummer. Welcher ist richtig?",
  "ask.question.fact_conflict_business.email": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr Ihre Email-Adresse. Welcher ist richtig?",
  "ask.question.fact_conflict_business.address": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr Ihre Adresse. Welcher ist richtig?",
  "ask.question.fact_conflict_business.hours": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr Ihre \xD6ffnungszeiten. Welcher ist richtig?",
  "ask.question.fact_conflict_business.link": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr Ihren Buchungs- oder Kontakt-Link. Welcher ist richtig?",
  "ask.question.fact_conflict_business.name": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr Ihren Firmennamen. Welcher ist richtig?",
  "ask.question.fact_conflict_business.price": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr Ihren Preis. Welcher ist richtig?",
  "ask.question.fact_conflict_item.phone": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr die Telefonnummer von {item}. Welcher ist richtig?",
  "ask.question.fact_conflict_item.email": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr die Email-Adresse von {item}. Welcher ist richtig?",
  "ask.question.fact_conflict_item.address": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr die Adresse von {item}. Welcher ist richtig?",
  "ask.question.fact_conflict_item.hours": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr die \xD6ffnungszeiten von {item}. Welcher ist richtig?",
  "ask.question.fact_conflict_item.link": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr den Buchungs- oder Kontakt-Link von {item}. Welcher ist richtig?",
  "ask.question.fact_conflict_item.name": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr den Firmennamen von {item}. Welcher ist richtig?",
  "ask.question.fact_conflict_item.price": "Ihre \xF6ffentlichen Seiten nennen verschiedene Werte f\xFCr den Preis von {item}. Welcher ist richtig?",
  "ask.choice.contact_method_phone": "Eine Telefonnummer",
  "ask.choice.contact_method_email": "Eine Email-Adresse",
  "ask.choice.contact_method_link": "Ein Buchungs- oder Kontakt-Link",
  "ask.from": "Von {sources}",
  "ask.and": "{first} und {last}",
  "ask.source.website": "Website",
  "ask.source.google_maps": "Eintrag in Google Maps",
  "ask.source.owner_answer": "Ihre Antwort",
  "ask.source.instagram": "Instagram-Profil",
  "ask.source.facebook": "Facebook-Seite",
  "ask.source.tiktok": "TikTok-Profil",
  "ask.source.social": "Social-Media-Profil",
  "ask.question.place_choice": "Wir haben unter diesem Namen mehr als einen Ort in Google Maps gefunden. Welcher ist Ihrer?",
  "ask.choice.place_choice_none": "Keiner davon",
  "ask.choice.main_button_book": "Online buchen",
  "ask.choice.main_button_call": "Rufen Sie uns an",
  "ask.choice.main_button_email": "Schreiben Sie uns eine E-Mail",
  "ask.choice.main_button_message": "Schreiben Sie uns eine Nachricht",
  "ask.choice.main_button_visit": "Besuchen Sie uns",
  "ask.choice.main_button_contact": "Kontaktieren Sie uns",
  "ask.choice.main_button_book_short": "Buchen",
  "ask.choice.main_button_call_short": "Anrufen",
  "ask.choice.main_button_email_short": "E-Mail",
  "ask.choice.main_button_message_short": "Nachricht",
  "ask.choice.main_button_visit_short": "Besuchen",
  "ask.choice.main_button_contact_short": "Kontakt",
  "ask.choice.main_button_text": "Text auf der Schaltfl\xE4che: {text}",
  "ask.source.listing": "Eintrag in einem Branchenverzeichnis",
  "plan.source.listing": "Eintrag in einem Branchenverzeichnis",
  "links.reading": "{name}: wird gelesen",
  "links.choice": "{name}: Ihre Auswahl ist n\xF6tig",
  "links.failed": "{name}: konnte nicht gelesen werden",
  "links.failedWhy": "{name}: konnte nicht gelesen werden ({reason})",
  "links.read": "{name}: gelesen",
  "links.readNothing": "{name}: gelesen, aber keine Angaben zum Unternehmen gefunden",
  "links.readPicturesLost": "{name}: gelesen, aber die Bilder konnten nicht heruntergeladen werden",
  "links.readPicturesNotKept": "{name}: gelesen, aber die Bilder konnten nicht gespeichert werden",
  "links.facts.one": "{count} Angabe",
  "links.facts.other": "{count} Angaben",
  "links.pictures.one": "{count} Bild",
  "links.pictures.other": "{count} Bilder",
  "links.pictures.none": "Keine Bilder",
  "links.pictures.someLost": "{count} weitere konnten nicht heruntergeladen werden",
  "tool.working.research": "Ihre Links werden gelesen",
  "tool.working.about": "Angaben zu Ihrem Unternehmen werden gelesen",
  "tool.working.templates": "Designs f\xFCr Ihre Site werden gesucht",
  "tool.working.build": "Ihre Site wird erstellt",
  "tool.working.startOver": "Neustart l\xE4uft",
  "tool.waiting.place": "Wartet auf Ihre Wahl des Standorts",
  "links.pictures.foundSome": "{count} Bilder gefunden, {usable} verwendbar",
  "links.pictures.foundNotOwn.one": "{count} Bild gefunden, nicht vom Unternehmen ver\xF6ffentlicht",
  "links.pictures.foundNotOwn.other": "{count} Bilder gefunden, keines vom Unternehmen ver\xF6ffentlicht",
  "links.pictures.foundNone.one": "{count} Bild gefunden, nicht verwendbar",
  "links.pictures.foundNone.other": "{count} Bilder gefunden, keines verwendbar",
  "say.researchRead": "Ich habe gelesen, was Sie mir \xFCber Ihr Unternehmen gegeben haben."
};

// ../../locale/tracy-locales/es/tracy-build-chat.json
var tracy_build_chat_default2 = {
  "cancelled.body": "Usted cancel\xF3 esta creaci\xF3n. Su plan y sus respuestas se conservan.",
  "cancelled.title": "Se cancel\xF3 la creaci\xF3n",
  "handoff.earlier": "Conversaci\xF3n anterior",
  "handoff.tooLong": "Su site est\xE1 listo, pero esta conversaci\xF3n es demasiado larga para pasarla al chat del site. Abra su site desde su lista de sites.",
  "plan.allSources": "Todas las fuentes",
  "plan.and": "{first} y {last}",
  "plan.assumptions": "Lo que he supuesto",
  "plan.cancel": "Cancelar",
  "plan.changed": "Cambiado",
  "plan.count.gallery.one": "{count} foto",
  "plan.count.gallery.other": "{count} fotos",
  "plan.count.item.one": "{count} elemento",
  "plan.count.item.other": "{count} elementos",
  "plan.count.person.one": "{count} persona",
  "plan.count.person.other": "{count} personas",
  "plan.count.quote.one": "{count} rese\xF1a",
  "plan.count.quote.other": "{count} rese\xF1as",
  "plan.count.service.one": "{count} servicio",
  "plan.count.service.other": "{count} servicios",
  "plan.design": "Dise\xF1o: {name}",
  "plan.edit": "Editar {label}: {value}",
  "plan.facts": "Datos del negocio",
  "plan.fromServices": "De Servicios",
  "plan.language": "Idioma del site",
  "plan.leftOut": "Omitido",
  "plan.leftOut.showAll": "Mostrar todo ({count})",
  "plan.leftOut.showFewer": "Mostrar menos",
  "plan.revised.changed": "Qu\xE9 cambi\xF3",
  "plan.revised.notDone": "No se hizo",
  "plan.revised.dismiss": "Ocultar esta nota",
  "plan.revised.edited": "{label} ahora es {value}.",
  "plan.revised.line.owner_value_saved": "Su respuesta est\xE1 guardada: {label}, {value}.",
  "plan.revised.line.item_renamed": "{from} ahora se llama {to}.",
  "plan.revised.line.item_taken_off": "{label} no aparece en su site, como lo pidi\xF3.",
  "plan.revised.line.page-removed": "Se quit\xF3 la p\xE1gina {name}.",
  "plan.revised.line.page-added": "Se agreg\xF3 la p\xE1gina {name}.",
  "plan.revised.line.page-renamed": "La p\xE1gina {from} ahora se llama {to}.",
  "plan.revised.line.page-order": "Las p\xE1ginas est\xE1n ahora en este orden: {names}.",
  "plan.revised.line.block-removed": "Se quit\xF3 la secci\xF3n {section} de la p\xE1gina {page}.",
  "plan.revised.line.block-added": "Se agreg\xF3 la secci\xF3n {section} a la p\xE1gina {page}.",
  "plan.revised.line.block-data.count": "La secci\xF3n {section} de la p\xE1gina {page} ahora muestra {count} elementos.",
  "plan.revised.line.block-data": "La secci\xF3n {section} de la p\xE1gina {page} ahora muestra {names}.",
  "plan.revised.line.block-order": "Las secciones de la p\xE1gina {page} tienen un nuevo orden.",
  "plan.revised.line.data-off": "Ya no se muestra: {names}.",
  "plan.revised.line.data-on": "Ahora se muestra: {names}.",
  "plan.revised.line.data-again": "Se muestra de nuevo: {names}, que usted hab\xEDa quitado antes.",
  "plan.revised.line.pictures-own.one": "El plan ahora usa {count} foto suya.",
  "plan.revised.line.pictures-own.other": "El plan ahora usa {count} fotos suyas.",
  "plan.revised.line.pictures-drawn.none": "Tracy ya no crear\xE1 ninguna imagen.",
  "plan.revised.line.pictures-drawn.one": "Se crear\xE1 aproximadamente {count} imagen donde no tenga una foto adecuada.",
  "plan.revised.line.pictures-drawn.other": "Se crear\xE1n aproximadamente {count} im\xE1genes donde no tenga una foto adecuada.",
  "plan.revised.notDone.nothing_to_change.what": "Su solicitud",
  "plan.revised.notDone.nothing_to_change.why": "Nada del plan pudo seguirla, as\xED que el plan no cambia.",
  "plan.revised.notDone.page_already_on_plan.why": "El plan ya tiene esta p\xE1gina.",
  "plan.revised.notDone.section_not_filled.what": "Una nueva secci\xF3n",
  "plan.revised.notDone.section_not_filled.why": "No hay nada de su negocio para llenarla, as\xED que no se agrega.",
  "plan.revised.notDone.item_rename_refused.what": "Cambiar el nombre de {name}",
  "plan.undo.chatChange": "Deshacer solo revierte los cambios hechos en esta tarjeta. Para revertir un cambio que pidi\xF3 en el chat, p\xEDdalo en el chat.",
  "plan.fact.business.name": "Nombre del negocio",
  "plan.fact.business.founded_year": "Fundado en",
  "plan.fact.business.tagline": "Eslogan",
  "plan.fact.business.summary": "Acerca de",
  "plan.fact.contact.phone": "Tel\xE9fono",
  "plan.fact.contact.email": "Email",
  "plan.fact.contact.address": "Direcci\xF3n",
  "plan.fact.contact.hours": "Horario",
  "plan.fact.contact.cta_url": "Link de reserva",
  "plan.fact.contact.cta_label": "Bot\xF3n principal",
  "plan.fact.contact.social_url": "Link a redes sociales",
  "plan.source.website": "Sitio web",
  "plan.source.google": "Ficha de Google Maps",
  "plan.source.social": "Perfil en redes sociales",
  "plan.source.answer": "Su respuesta",
  "plan.look": "Apariencia",
  "plan.look.accent": "Color principal",
  "plan.look.accentDark": "Color principal en p\xE1ginas oscuras",
  "plan.look.accentLight": "Color principal en p\xE1ginas claras",
  "plan.look.logoDark": "Logo en p\xE1ginas oscuras",
  "plan.look.logoDrawn": "Un logo que Tracy dibuj\xF3 a partir de su logo",
  "plan.look.logoLight": "Logo en p\xE1ginas claras",
  "plan.look.logoOwn": "Su logo, de {source}",
  "plan.look.logoText": "El nombre de su negocio como texto",
  "plan.look.template": "Dise\xF1o",
  "plan.newValue": "Nuevo valor para {label}",
  "plan.pages": "P\xE1ginas ({count})",
  "plan.pictures": "Im\xE1genes",
  "plan.pictures.drawn": "Im\xE1genes que crea Tracy",
  "plan.pictures.drawnNone": "Ninguna",
  "plan.pictures.drawnValue.one": "Unas {count} imagen",
  "plan.pictures.drawnValue.other": "Unas {count} im\xE1genes",
  "plan.pictures.own": "Sus fotos",
  "plan.pictures.ownValue.one": "{count} foto de {from}",
  "plan.pictures.ownValue.other": "{count} fotos de {from}",
  "plan.save": "Guardar",
  "plan.saveFailed": "No se guard\xF3 su cambio. Int\xE9ntelo de nuevo.",
  "plan.locked": "Su site se est\xE1 creando a partir de este plan, as\xED que el plan no puede cambiar hasta que termine la creaci\xF3n.",
  "plan.stale": "El plan cambi\xF3 mientras tanto, as\xED que no se guard\xF3 su cambio. La tarjeta muestra ahora el plan m\xE1s reciente.",
  "plan.busy": "Todav\xEDa estoy trabajando en su plan, as\xED que no puede cambiar ahora mismo. Vuelva a hacer su cambio cuando termine.",
  "plan.tooLarge": "Este cambio es demasiado largo para guardarlo. Ac\xF3rtelo e int\xE9ntelo de nuevo.",
  "plan.sections.one": "{count} secci\xF3n",
  "plan.sections.other": "{count} secciones",
  "plan.service": "Servicio {n}",
  "plan.services": "Servicios ({count})",
  "plan.title": "Plan del site de {name}",
  "plan.undo": "Deshacer",
  "plan.undoLabel": "Deshacer el \xFAltimo cambio",
  "progress.clock": "Tiempo transcurrido",
  "progress.done": "{count} completados",
  "progress.failed": "{count} con error",
  "progress.note.failed": "Con error",
  "progress.note.failedTwice": "Fall\xF3 dos veces",
  "progress.note.notStarted": "No iniciado",
  "progress.pending": "{count} pendientes",
  "progress.running": "{count} en curso",
  "progress.state.done": "Completado",
  "progress.state.failed": "Con error",
  "progress.state.pending": "Pendiente",
  "progress.state.running": "En curso",
  "progress.title.build": "Creando su site",
  "progress.title.partial": "Actualizando su site",
  "rebuild.changed": "Su plan cambi\xF3 desde que se cre\xF3 su site. Solo se vuelve a crear lo que usted cambi\xF3.",
  "rebuild.failed": "No se envi\xF3 su solicitud. Int\xE9ntelo de nuevo.",
  "rebuild.heldFiles": "Files que siguen en su site",
  "rebuild.heldFile.person-photo": "Foto {n}: una persona que usted pidi\xF3 mantener en privado",
  "rebuild.say.abandon_done": "Se deshizo la actualizaci\xF3n sin terminar. Su site muestra lo que mostraba antes.",
  "rebuild.say.held_file_left_on_site": "Una foto de una persona que usted pidi\xF3 mantener en privado sigue guardada en su site como file, aunque ninguna p\xE1gina la muestra. Todav\xEDa no puedo eliminar files. El equipo puede quitarla por usted.",
  "rebuild.say.nothing_to_update": "Su site ya muestra este plan, as\xED que no hay nada que actualizar.",
  "rebuild.say.previous_build_doors_missing": "Todav\xEDa no puedo actualizar su site desde este chat, as\xED que su site no ha cambiado. El equipo puede ver lo que pas\xF3.",
  "rebuild.say.previous_build_not_current": "Su site cambi\xF3 mientras se preparaba esta actualizaci\xF3n, as\xED que me detuve antes de cambiar nada. Su site no ha cambiado. Puede actualizarlo de nuevo, y empezar\xE9 desde lo que muestra ahora.",
  "rebuild.say.previous_build_unreadable": "No pude leer c\xF3mo se cre\xF3 su site la \xFAltima vez, as\xED que me detuve antes de cambiar nada. Su site no ha cambiado. El equipo puede ver lo que pas\xF3.",
  "rebuild.say.previous_run_unfinished": "Una actualizaci\xF3n anterior de su site no termin\xF3, as\xED que todav\xEDa no puedo empezar una nueva. Puede deshacer la actualizaci\xF3n sin terminar, lo que devuelve su site a como estaba antes, y luego actualizar de nuevo.",
  "rebuild.say.restore_done": "Su site volvi\xF3 a la versi\xF3n anterior.",
  "rebuild.say.restore_needs_removal": "Una parte de la \xFAltima actualizaci\xF3n no se puede deshacer desde este chat, as\xED que no volv\xED a la versi\xF3n anterior. Su site se queda como est\xE1 ahora. El equipo puede ver lo que pas\xF3.",
  "rebuild.say.restore_shows_held_text": "La versi\xF3n anterior muestra algo que usted pidi\xF3 mantener en privado, as\xED que no volv\xED a ella. Su site se queda como est\xE1 ahora.",
  "rebuild.say.restore_site_changed": "Una parte de su site se edit\xF3 fuera de Tracy desde la \xFAltima actualizaci\xF3n, as\xED que no volv\xED a la versi\xF3n anterior. Su edici\xF3n se conserva y su site se queda como est\xE1 ahora.",
  "rebuild.say.revision_needs_removal": "Su cambio quita una parte de su site que no puedo quitar desde este chat, as\xED que me detuve antes de cambiar nada. Su site no ha cambiado. El equipo puede ver lo que pidi\xF3.",
  "rebuild.say.site_already_built": "Su site ya est\xE1 creado, as\xED que no lo volv\xED a crear desde el principio. Cambie el plan y actualice su site, y solo se vuelve a crear lo que usted cambi\xF3.",
  "rebuild.say.site_changed_outside": "Una parte de su site se edit\xF3 fuera de Tracy desde que se cre\xF3, as\xED que me detuve antes de sobrescribir esa edici\xF3n. Su edici\xF3n se conserva. El equipo puede ver qu\xE9 parte fue.",
  "rebuild.say.update_done": "Su site est\xE1 actualizado. Solo se volvieron a crear las partes que toc\xF3 su cambio, y el resto est\xE1 como estaba.",
  "rebuild.say.write_record_stale": "Esta actualizaci\xF3n se mezcl\xF3 con una anterior, as\xED que me detuve antes de cambiar nada. Su site no ha cambiado. El equipo puede ver lo que pas\xF3.",
  "rebuild.restore": "Restore de la versi\xF3n anterior",
  "rebuild.title": "Su site",
  "rebuild.undo": "Deshacer la actualizaci\xF3n sin terminar",
  "rebuild.update": "Actualizar mi site",
  "retry.button": "Reintentar",
  "review.failed": "No se envi\xF3 su respuesta. Int\xE9ntelo de nuevo.",
  "review.question": "\xBFAprobar este plan?",
  "review.approve": "Aprobar",
  "review.change": "Cambiar el plan",
  "review.say": "O describa el cambio que quiere",
  "review.summary": "{name}: {pages}, {services}",
  "review.summary.one": "{name}: {part}",
  "review.pages.one": "{count} p\xE1gina",
  "review.pages.other": "{count} p\xE1ginas",
  "stopped.kept.none": "Se conserva: su plan y sus respuestas.",
  "stopped.kept.one": "Se conserva: su plan, sus respuestas y la p\xE1gina escrita.",
  "stopped.kept.other": "Se conserva: su plan, sus respuestas y las {count} p\xE1ginas escritas.",
  "stopped.notified": "El equipo de Tracy ha sido avisado y se ocupar\xE1 del asunto. No tiene que hacer nada.",
  "stopped.notStarted": "No se pudo iniciar su site, pero su plan se conserva y puede volver a aprobarlo m\xE1s adelante.",
  "stopped.notStarted.design": "Este dise\xF1o todav\xEDa no se puede construir, as\xED que su site no se inici\xF3, pero su plan se conserva y puede volver a aprobarlo m\xE1s adelante.",
  "stopped.once": "No pude terminar \xAB{step}\xBB, as\xED que me detuve en lugar de mostrarle un site sin terminar.",
  "stopped.title": "Su site a\xFAn no est\xE1 terminado",
  "stopped.twice": "No pude terminar \xAB{step}\xBB tras dos intentos, as\xED que me detuve en lugar de mostrarle un site sin terminar.",
  "stopped.unchanged": "Su site actual no ha cambiado.",
  "template.chosen": "Elegido: {name}",
  "template.continue": "Continuar",
  "template.later": "Puede cambiar el dise\xF1o m\xE1s adelante.",
  "template.list": "Dise\xF1os para su site",
  "template.none": "Todav\xEDa no hay ning\xFAn dise\xF1o listo que encaje con su negocio.",
  "template.noneNext": "Aun as\xED puede crear su site desde la p\xE1gina A\xF1adir site.",
  "template.openAddSite": "Abrir A\xF1adir site",
  "template.picked": "He elegido {name}.",
  "template.recommended": "Recomendado",
  "template.saveFailed": "No se guard\xF3 su elecci\xF3n. Int\xE9ntelo de nuevo.",
  "template.sendFailed": "Su elecci\xF3n est\xE1 guardada, pero no lleg\xF3 al chat. Pulse Continuar para enviarla de nuevo.",
  "template.use": "Usar {name}",
  "tool.edit": "Se actualiz\xF3 el plan de su site",
  "tool.plan": "Se prepar\xF3 el plan de su site",
  "tool.research.none": "Se ha investigado sobre su negocio",
  "tool.research.one": "Le\xEDda {count} fuente",
  "tool.research.other": "Le\xEDdas {count} fuentes",
  "tool.stopped": "Este paso no pudo terminarse",
  "tool.templates": "Se encontraron dise\xF1os para su site",
  "tool.working": "Preparando el plan de su site",
  "plan.revised.notDone.owner_value_not_shown.what": "Mostrar {label} en el site",
  "plan.revised.notDone.owner_value_not_shown.why": "Su respuesta est\xE1 guardada, pero su dise\xF1o no tiene ning\xFAn lugar que la muestre.",
  "plan.revised.names.counted": "{count} {plural}",
  "plan.revised.notDone.reason.no_recipe": "Su dise\xF1o no tiene una p\xE1gina de este tipo.",
  "plan.revised.notDone.reason.no_data": "No hay nada de su negocio que llene esta secci\xF3n.",
  "plan.revised.notDone.reason.fact_missing": "Su negocio no tiene este dato.",
  "plan.revised.notDone.reason.kept_private": "Usted mantiene esto fuera de su site.",
  "plan.revised.notDone.reason.outside_plan": "Una solicitud de cambio no puede cambiar esto. C\xE1mbielo en la tarjeta del plan.",
  "plan.leftOut.reason.no_email_for_form": "Su negocio no tiene una direcci\xF3n de email a la que el formulario de registro pueda enviar las respuestas.",
  "plan.leftOut.reason.no_booking_link": "No tiene un link de reserva o de contacto que el bot\xF3n pueda abrir.",
  "plan.leftOut.reason.no_items_to_show": "Todav\xEDa no tiene nada que esta secci\xF3n pueda mostrar.",
  "plan.leftOut.reason.shown_in_other_sections": "Lo que mostrar\xEDa esta secci\xF3n ya se muestra en otras secciones de su plan.",
  "plan.leftOut.reason.owner_withheld": "Usted pidi\xF3 mantener esto fuera del site.",
  "plan.leftOut.reason.left_out_neutral.page": "Esta p\xE1gina no forma parte de su plan.",
  "plan.leftOut.reason.left_out_neutral.block": "Esta secci\xF3n no forma parte de su plan.",
  "plan.leftOut.reason.left_out_neutral.item": "Esto no se muestra en su plan.",
  "plan.leftOut.reason.no_gallery_room.one": "Ninguna galer\xEDa tiene espacio para esta foto. Se queda con sus fotos y puede usarse en otra parte del site.",
  "plan.leftOut.reason.no_gallery_room.other": "Ninguna galer\xEDa tiene espacio para estas {count} fotos. Se quedan con sus fotos y pueden usarse en otra parte del site.",
  "plan.pictures.estimate.one": "Se crear\xE1 alrededor de {count} imagen donde no tenga una foto adecuada. El n\xFAmero final depende de sus fotos.",
  "plan.pictures.estimate.other": "Se crear\xE1n alrededor de {count} im\xE1genes donde no tenga una foto adecuada. El n\xFAmero final depende de sus fotos.",
  "plan.logoSource.website": "Sitio web",
  "plan.logoSource.google": "Ficha de Google Maps",
  "plan.logoSource.instagram": "Perfil de Instagram",
  "plan.logoSource.facebook": "P\xE1gina de Facebook",
  "plan.logoSource.tiktok": "Perfil de TikTok",
  "plan.assumption.logo_drawn.new-symbol-drawn": "Tracy dibuj\xF3 un logo basado en su logo: un nuevo s\xEDmbolo de su oficio junto al nombre de su negocio, con la fuente del template. No es su file de logo. Apru\xE9belo, o env\xEDenos su logo para reemplazarlo.",
  "plan.assumption.logo_drawn.symbol-cut-from-logo": "Tracy dibuj\xF3 un logo basado en su logo: el s\xEDmbolo recortado de su logo junto al nombre de su negocio, con la fuente del template. No es su file de logo. Apru\xE9belo, o env\xEDenos su logo para reemplazarlo.",
  "plan.assumption.logo_drawn.name-set-in-template-font": "Tracy dibuj\xF3 un logo basado en su logo: una marca junto al nombre de su negocio, con la fuente del template. No es su file de logo. Apru\xE9belo, o env\xEDenos su logo para reemplazarlo.",
  "plan.assumption.logo_made.found.icon": "Su logo no se pudo usar tal como est\xE1, as\xED que hice uno provisional: un icono sencillo de su oficio junto al nombre de su negocio. Env\xEDe aqu\xED en el chat el file de su logo para reemplazarlo.",
  "plan.assumption.logo_made.found.lettermark": "Su logo no se pudo usar tal como est\xE1, as\xED que hice uno provisional: sus iniciales junto al nombre de su negocio. Env\xEDe aqu\xED en el chat el file de su logo para reemplazarlo.",
  "plan.assumption.logo_made.found.mark": "Su logo no se pudo usar tal como est\xE1, as\xED que hice uno provisional: una marca sencilla junto al nombre de su negocio. Env\xEDe aqu\xED en el chat el file de su logo para reemplazarlo.",
  "plan.assumption.logo_made.none.icon": "No se encontr\xF3 ning\xFAn logo, as\xED que hice uno provisional: un icono sencillo de su oficio junto al nombre de su negocio, en el color principal del dise\xF1o. Env\xEDe aqu\xED en el chat su logo para reemplazarlo.",
  "plan.assumption.logo_made.none.lettermark": "No se encontr\xF3 ning\xFAn logo, as\xED que hice uno provisional: sus iniciales junto al nombre de su negocio, en el color principal del dise\xF1o. Env\xEDe aqu\xED en el chat su logo para reemplazarlo.",
  "plan.assumption.logo_made.none.mark": "No se encontr\xF3 ning\xFAn logo, as\xED que hice uno provisional: una marca sencilla junto al nombre de su negocio, en el color principal del dise\xF1o. Env\xEDe aqu\xED en el chat su logo para reemplazarlo.",
  "plan.hours.days": "{from} a {to}",
  "plan.hours.time": "{from} a {to}",
  "plan.hours.closed": "cerrado",
  "plan.hours.ranges": "{first} y {next}",
  "plan.hours.group": "{days}, {hours}",
  "plan.hours.groups": "{first}; {next}",
  "plan.section.header": "Men\xFA",
  "plan.section.footer": "Pie de p\xE1gina",
  "plan.section.hero": "Portada",
  "plan.section.page_header": "Cabecera de p\xE1gina",
  "plan.section.about": "Sobre nosotros",
  "plan.section.text": "Texto",
  "plan.section.call_to_action": "Llamada a la acci\xF3n",
  "plan.section.contact": "Datos de contacto",
  "plan.section.map": "Mapa",
  "plan.section.video": "V\xEDdeo",
  "plan.section.newsletter": "Bolet\xEDn",
  "plan.section.services": "Servicios",
  "plan.section.menu": "Carta",
  "plan.section.pricing": "Precios",
  "plan.section.schedule": "Horario",
  "plan.section.team": "Equipo",
  "plan.section.stats": "Cifras",
  "plan.section.steps": "Pasos",
  "plan.section.reviews": "Rese\xF1as",
  "plan.section.claims": "Premios",
  "plan.section.faq": "Preguntas",
  "plan.section.events": "Eventos",
  "plan.section.posts": "Art\xEDculos",
  "plan.section.gallery": "Fotos",
  "rebuild.say.door_not_available": "Su site no me permite hacer este cambio desde este chat, as\xED que detuve la actualizaci\xF3n. El equipo puede ver qu\xE9 parte era.",
  "rebuild.say.sheets_unreadable": "No pude leer las hojas de estilo de su site, as\xED que me detuve antes de cambiar sus colores. El equipo puede ver lo que pas\xF3.",
  "ask.question.main_button": "\xBFQu\xE9 deber\xEDa pedir a los visitantes el bot\xF3n principal de su site?",
  "ask.question.contact_method": "No encontramos ning\xFAn tel\xE9fono, email ni link de reserva. \xBFC\xF3mo deber\xEDan contactarle los visitantes?",
  "ask.question.site_language": "Sus p\xE1ginas p\xFAblicas usan m\xE1s de un idioma. \xBFQu\xE9 idioma deber\xEDa usar su site?",
  "ask.question.fact_conflict_business.phone": "Sus p\xE1ginas p\xFAblicas dan valores distintos para su n\xFAmero de tel\xE9fono. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_business.email": "Sus p\xE1ginas p\xFAblicas dan valores distintos para su direcci\xF3n de email. \xBFCu\xE1l es la correcta?",
  "ask.question.fact_conflict_business.address": "Sus p\xE1ginas p\xFAblicas dan valores distintos para su direcci\xF3n. \xBFCu\xE1l es la correcta?",
  "ask.question.fact_conflict_business.hours": "Sus p\xE1ginas p\xFAblicas dan valores distintos para su horario. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_business.link": "Sus p\xE1ginas p\xFAblicas dan valores distintos para su link de reserva o de contacto. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_business.name": "Sus p\xE1ginas p\xFAblicas dan valores distintos para el nombre de su negocio. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_business.price": "Sus p\xE1ginas p\xFAblicas dan valores distintos para su precio. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_item.phone": "Sus p\xE1ginas p\xFAblicas dan valores distintos para el n\xFAmero de tel\xE9fono de {item}. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_item.email": "Sus p\xE1ginas p\xFAblicas dan valores distintos para la direcci\xF3n de email de {item}. \xBFCu\xE1l es la correcta?",
  "ask.question.fact_conflict_item.address": "Sus p\xE1ginas p\xFAblicas dan valores distintos para la direcci\xF3n de {item}. \xBFCu\xE1l es la correcta?",
  "ask.question.fact_conflict_item.hours": "Sus p\xE1ginas p\xFAblicas dan valores distintos para el horario de {item}. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_item.link": "Sus p\xE1ginas p\xFAblicas dan valores distintos para el link de reserva o de contacto de {item}. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_item.name": "Sus p\xE1ginas p\xFAblicas dan valores distintos para el nombre del negocio de {item}. \xBFCu\xE1l es el correcto?",
  "ask.question.fact_conflict_item.price": "Sus p\xE1ginas p\xFAblicas dan valores distintos para el precio de {item}. \xBFCu\xE1l es el correcto?",
  "ask.choice.contact_method_phone": "Un n\xFAmero de tel\xE9fono",
  "ask.choice.contact_method_email": "Una direcci\xF3n de email",
  "ask.choice.contact_method_link": "Un link de reserva o de contacto",
  "ask.from": "De {sources}",
  "ask.and": "{first} y {last}",
  "ask.source.website": "Sitio web",
  "ask.source.google_maps": "Ficha de Google Maps",
  "ask.source.owner_answer": "Su respuesta",
  "ask.source.instagram": "Perfil de Instagram",
  "ask.source.facebook": "P\xE1gina de Facebook",
  "ask.source.tiktok": "Perfil de TikTok",
  "ask.source.social": "Perfil en redes sociales",
  "ask.question.place_choice": "Hemos encontrado m\xE1s de un lugar en Google Maps con este nombre. \xBFCu\xE1l es el suyo?",
  "ask.choice.place_choice_none": "Ninguno de estos",
  "ask.choice.main_button_book": "Reservar en l\xEDnea",
  "ask.choice.main_button_call": "Ll\xE1menos",
  "ask.choice.main_button_email": "Env\xEDenos un correo electr\xF3nico",
  "ask.choice.main_button_message": "Env\xEDenos un mensaje",
  "ask.choice.main_button_visit": "Vis\xEDtenos",
  "ask.choice.main_button_contact": "Cont\xE1ctenos",
  "ask.choice.main_button_book_short": "Reservar",
  "ask.choice.main_button_call_short": "Llamar",
  "ask.choice.main_button_email_short": "Correo electr\xF3nico",
  "ask.choice.main_button_message_short": "Mensaje",
  "ask.choice.main_button_visit_short": "Visitar",
  "ask.choice.main_button_contact_short": "Contacto",
  "ask.choice.main_button_text": "Texto del bot\xF3n: {text}",
  "ask.source.listing": "Ficha de directorio",
  "plan.source.listing": "Ficha de directorio",
  "links.reading": "{name}: leyendo",
  "links.choice": "{name}: necesita su elecci\xF3n",
  "links.failed": "{name}: no se pudo leer",
  "links.failedWhy": "{name}: no se pudo leer ({reason})",
  "links.read": "{name}: le\xEDdo",
  "links.readNothing": "{name}: le\xEDdo, pero no se encontr\xF3 informaci\xF3n sobre el negocio",
  "links.readPicturesLost": "{name}: le\xEDdo, pero no se pudieron descargar sus im\xE1genes",
  "links.readPicturesNotKept": "{name}: le\xEDdo, pero no se pudieron guardar sus im\xE1genes",
  "links.facts.one": "{count} dato",
  "links.facts.other": "{count} datos",
  "links.pictures.one": "{count} imagen",
  "links.pictures.other": "{count} im\xE1genes",
  "links.pictures.none": "Sin im\xE1genes",
  "links.pictures.someLost": "{count} m\xE1s no se pudieron descargar",
  "tool.working.research": "Leyendo sus enlaces",
  "tool.working.about": "Leyendo sobre su negocio",
  "tool.working.templates": "Buscando dise\xF1os para su site",
  "tool.working.build": "Creando su site",
  "tool.working.startOver": "Empezando de nuevo",
  "tool.waiting.place": "Esperando a que elija su ubicaci\xF3n",
  "links.pictures.foundSome": "{count} im\xE1genes encontradas, {usable} utilizables",
  "links.pictures.foundNotOwn.one": "{count} imagen encontrada, no publicada por el negocio",
  "links.pictures.foundNotOwn.other": "{count} im\xE1genes encontradas, ninguna publicada por el negocio",
  "links.pictures.foundNone.one": "{count} imagen encontrada, no utilizable",
  "links.pictures.foundNone.other": "{count} im\xE1genes encontradas, ninguna utilizable",
  "say.researchRead": "He le\xEDdo lo que me ha dado sobre su negocio."
};

// ../../locale/tracy-locales/fr/tracy-build-chat.json
var tracy_build_chat_default3 = {
  "cancelled.body": "Vous avez annul\xE9 cette cr\xE9ation. Votre plan et vos r\xE9ponses sont conserv\xE9s.",
  "cancelled.title": "La cr\xE9ation a \xE9t\xE9 annul\xE9e",
  "handoff.earlier": "Conversation pr\xE9c\xE9dente",
  "handoff.tooLong": "Votre site est pr\xEAt, mais cette conversation est trop longue pour \xEAtre transf\xE9r\xE9e dans le chat du site. Ouvrez votre site depuis votre liste de sites.",
  "plan.allSources": "Toutes les sources",
  "plan.and": "{first} et {last}",
  "plan.assumptions": "Ce que j\u2019ai suppos\xE9",
  "plan.cancel": "Annuler",
  "plan.changed": "Modifi\xE9",
  "plan.count.gallery.one": "{count} photo",
  "plan.count.gallery.other": "{count} photos",
  "plan.count.item.one": "{count} \xE9l\xE9ment",
  "plan.count.item.other": "{count} \xE9l\xE9ments",
  "plan.count.person.one": "{count} personne",
  "plan.count.person.other": "{count} personnes",
  "plan.count.quote.one": "{count} avis",
  "plan.count.quote.other": "{count} avis",
  "plan.count.service.one": "{count} service",
  "plan.count.service.other": "{count} services",
  "plan.design": "Design : {name}",
  "plan.edit": "Modifier {label} : {value}",
  "plan.facts": "Informations sur l\u2019activit\xE9",
  "plan.fromServices": "Depuis Services",
  "plan.language": "Langue du site",
  "plan.leftOut": "Laiss\xE9 de c\xF4t\xE9",
  "plan.leftOut.showAll": "Tout afficher ({count})",
  "plan.leftOut.showFewer": "Afficher moins",
  "plan.revised.changed": "Ce qui a chang\xE9",
  "plan.revised.notDone": "Pas fait",
  "plan.revised.dismiss": "Masquer cette note",
  "plan.revised.edited": "{label} est maintenant {value}.",
  "plan.revised.line.owner_value_saved": "Votre r\xE9ponse est enregistr\xE9e : {label}, {value}.",
  "plan.revised.line.item_renamed": "{from} s\u2019appelle d\xE9sormais {to}.",
  "plan.revised.line.item_taken_off": "{label} n\u2019appara\xEEt pas sur votre site, comme vous l\u2019avez demand\xE9.",
  "plan.revised.line.page-removed": "La page {name} est supprim\xE9e.",
  "plan.revised.line.page-added": "La page {name} est ajout\xE9e.",
  "plan.revised.line.page-renamed": "La page {from} s\u2019appelle d\xE9sormais {to}.",
  "plan.revised.line.page-order": "Les pages sont d\xE9sormais dans cet ordre : {names}.",
  "plan.revised.line.block-removed": "La section {section} est retir\xE9e de la page {page}.",
  "plan.revised.line.block-added": "La section {section} est ajout\xE9e \xE0 la page {page}.",
  "plan.revised.line.block-data.count": "La section {section} de la page {page} affiche d\xE9sormais {count} \xE9l\xE9ments.",
  "plan.revised.line.block-data": "La section {section} de la page {page} affiche d\xE9sormais {names}.",
  "plan.revised.line.block-order": "Les sections de la page {page} sont dans un nouvel ordre.",
  "plan.revised.line.data-off": "N\u2019est plus affich\xE9 : {names}.",
  "plan.revised.line.data-on": "D\xE9sormais affich\xE9 : {names}.",
  "plan.revised.line.data-again": "De nouveau affich\xE9 : {names}, que vous aviez retir\xE9 auparavant.",
  "plan.revised.line.pictures-own.one": "Le plan utilise d\xE9sormais {count} de vos photos.",
  "plan.revised.line.pictures-own.other": "Le plan utilise d\xE9sormais {count} de vos photos.",
  "plan.revised.line.pictures-drawn.none": "Tracy ne cr\xE9era plus aucune image.",
  "plan.revised.line.pictures-drawn.one": "Environ {count} image sera cr\xE9\xE9e l\xE0 o\xF9 vous n\u2019avez pas de photo adapt\xE9e.",
  "plan.revised.line.pictures-drawn.other": "Environ {count} images seront cr\xE9\xE9es l\xE0 o\xF9 vous n\u2019avez pas de photo adapt\xE9e.",
  "plan.revised.notDone.nothing_to_change.what": "Votre demande",
  "plan.revised.notDone.nothing_to_change.why": "Rien dans le plan n\u2019a pu la suivre, le plan reste donc inchang\xE9.",
  "plan.revised.notDone.page_already_on_plan.why": "Le plan contient d\xE9j\xE0 cette page.",
  "plan.revised.notDone.section_not_filled.what": "Une nouvelle section",
  "plan.revised.notDone.section_not_filled.why": "Rien de votre entreprise ne permet de la remplir, elle n\u2019est donc pas ajout\xE9e.",
  "plan.revised.notDone.item_rename_refused.what": "Renommer {name}",
  "plan.undo.chatChange": "Annuler ne reprend que les modifications faites sur cette carte. Pour annuler une modification demand\xE9e dans le chat, demandez-le dans le chat.",
  "plan.fact.business.name": "Nom de l\u2019activit\xE9",
  "plan.fact.business.founded_year": "Fond\xE9 en",
  "plan.fact.business.tagline": "Slogan",
  "plan.fact.business.summary": "\xC0 propos",
  "plan.fact.contact.phone": "T\xE9l\xE9phone",
  "plan.fact.contact.email": "Email",
  "plan.fact.contact.address": "Adresse",
  "plan.fact.contact.hours": "Horaires d\u2019ouverture",
  "plan.fact.contact.cta_url": "Link de r\xE9servation",
  "plan.fact.contact.cta_label": "Bouton principal",
  "plan.fact.contact.social_url": "Link vers un r\xE9seau social",
  "plan.source.website": "Site web",
  "plan.source.google": "Fiche Google Maps",
  "plan.source.social": "Profil sur un r\xE9seau social",
  "plan.source.answer": "Votre r\xE9ponse",
  "plan.look": "Apparence",
  "plan.look.accent": "Couleur principale",
  "plan.look.accentDark": "Couleur principale sur les pages sombres",
  "plan.look.accentLight": "Couleur principale sur les pages claires",
  "plan.look.logoDark": "Logo sur les pages sombres",
  "plan.look.logoDrawn": "Un logo dessin\xE9 par Tracy, d\u2019apr\xE8s votre logo",
  "plan.look.logoLight": "Logo sur les pages claires",
  "plan.look.logoOwn": "Votre logo, depuis {source}",
  "plan.look.logoText": "Le nom de votre activit\xE9 en texte",
  "plan.look.template": "Design",
  "plan.newValue": "Nouvelle valeur pour {label}",
  "plan.pages": "Pages ({count})",
  "plan.pictures": "Images",
  "plan.pictures.drawn": "Images cr\xE9\xE9es par Tracy",
  "plan.pictures.drawnNone": "Aucune",
  "plan.pictures.drawnValue.one": "Environ {count} image",
  "plan.pictures.drawnValue.other": "Environ {count} images",
  "plan.pictures.own": "Vos photos",
  "plan.pictures.ownValue.one": "{count} photo depuis {from}",
  "plan.pictures.ownValue.other": "{count} photos depuis {from}",
  "plan.save": "Enregistrer",
  "plan.saveFailed": "Votre modification n\u2019a pas \xE9t\xE9 enregistr\xE9e. R\xE9essayez.",
  "plan.locked": "Votre site est en cours de cr\xE9ation \xE0 partir de ce plan, le plan ne peut donc pas changer avant la fin de la cr\xE9ation.",
  "plan.stale": "Le plan a chang\xE9 entre-temps, votre modification n\u2019a donc pas \xE9t\xE9 enregistr\xE9e. La carte affiche maintenant le plan le plus r\xE9cent.",
  "plan.busy": "Je travaille encore sur votre plan, il ne peut donc pas changer pour le moment. Refaites votre modification quand j\u2019aurai termin\xE9.",
  "plan.tooLarge": "Cette modification est trop longue pour \xEAtre enregistr\xE9e. Raccourcissez-la et r\xE9essayez.",
  "plan.sections.one": "{count} section",
  "plan.sections.other": "{count} sections",
  "plan.service": "Service {n}",
  "plan.services": "Services ({count})",
  "plan.title": "Plan du site {name}",
  "plan.undo": "Annuler",
  "plan.undoLabel": "Annuler la derni\xE8re modification",
  "progress.clock": "Temps \xE9coul\xE9",
  "progress.done": "{count} termin\xE9s",
  "progress.failed": "{count} \xE9chou\xE9s",
  "progress.note.failed": "\xC9chec",
  "progress.note.failedTwice": "\xC9chec \xE0 deux reprises",
  "progress.note.notStarted": "Pas commenc\xE9",
  "progress.pending": "{count} en attente",
  "progress.running": "{count} en cours",
  "progress.state.done": "Termin\xE9",
  "progress.state.failed": "\xC9chou\xE9",
  "progress.state.pending": "En attente",
  "progress.state.running": "En cours",
  "progress.title.build": "Cr\xE9ation de votre site en cours",
  "progress.title.partial": "Mise \xE0 jour de votre site en cours",
  "rebuild.changed": "Votre plan a chang\xE9 depuis la cr\xE9ation de votre site. Seul ce que vous avez modifi\xE9 est reconstruit.",
  "rebuild.failed": "Votre demande n\u2019a pas \xE9t\xE9 envoy\xE9e. R\xE9essayez.",
  "rebuild.heldFiles": "Files encore pr\xE9sents sur votre site",
  "rebuild.heldFile.person-photo": "Photo {n} : une personne que vous souhaitez garder priv\xE9e",
  "rebuild.say.abandon_done": "La mise \xE0 jour inachev\xE9e est annul\xE9e. Votre site affiche ce qu\u2019il affichait avant.",
  "rebuild.say.held_file_left_on_site": "Une photo d\u2019une personne que vous souhaitez garder priv\xE9e est encore stock\xE9e sur votre site sous forme de file, bien qu\u2019aucune page ne l\u2019affiche. Je ne peux pas encore supprimer de files. L\u2019\xE9quipe peut la retirer pour vous.",
  "rebuild.say.nothing_to_update": "Votre site affiche d\xE9j\xE0 ce plan, il n\u2019y a donc rien \xE0 mettre \xE0 jour.",
  "rebuild.say.previous_build_doors_missing": "Je ne peux pas encore mettre \xE0 jour votre site depuis ce chat, votre site est donc inchang\xE9. L\u2019\xE9quipe peut voir ce qui s\u2019est pass\xE9.",
  "rebuild.say.previous_build_not_current": "Votre site a chang\xE9 pendant la pr\xE9paration de cette mise \xE0 jour, je me suis donc arr\xEAt\xE9 avant de modifier quoi que ce soit. Votre site est inchang\xE9. Vous pouvez le mettre \xE0 jour \xE0 nouveau, et je partirai de ce qu\u2019il affiche maintenant.",
  "rebuild.say.previous_build_unreadable": "Je n\u2019ai pas pu lire comment votre site a \xE9t\xE9 construit la derni\xE8re fois, je me suis donc arr\xEAt\xE9 avant de modifier quoi que ce soit. Votre site est inchang\xE9. L\u2019\xE9quipe peut voir ce qui s\u2019est pass\xE9.",
  "rebuild.say.previous_run_unfinished": "Une mise \xE0 jour pr\xE9c\xE9dente de votre site n\u2019est pas termin\xE9e, je ne peux donc pas encore en lancer une nouvelle. Vous pouvez annuler la mise \xE0 jour inachev\xE9e, ce qui remet votre site comme il \xE9tait avant, puis mettre \xE0 jour \xE0 nouveau.",
  "rebuild.say.restore_done": "Votre site est revenu \xE0 la version pr\xE9c\xE9dente.",
  "rebuild.say.restore_needs_removal": "Une partie de la derni\xE8re mise \xE0 jour ne peut pas \xEAtre annul\xE9e depuis ce chat, je ne suis donc pas revenu \xE0 la version pr\xE9c\xE9dente. Votre site reste tel qu\u2019il est. L\u2019\xE9quipe peut voir ce qui s\u2019est pass\xE9.",
  "rebuild.say.restore_shows_held_text": "La version pr\xE9c\xE9dente affiche quelque chose que vous souhaitez garder priv\xE9, je n\u2019y suis donc pas revenu. Votre site reste tel qu\u2019il est.",
  "rebuild.say.restore_site_changed": "Une partie de votre site a \xE9t\xE9 modifi\xE9e en dehors de Tracy depuis la derni\xE8re mise \xE0 jour, je ne suis donc pas revenu \xE0 la version pr\xE9c\xE9dente. Votre modification est conserv\xE9e et votre site reste tel qu\u2019il est.",
  "rebuild.say.revision_needs_removal": "Votre changement retire une partie de votre site que je ne peux pas retirer depuis ce chat, je me suis donc arr\xEAt\xE9 avant de modifier quoi que ce soit. Votre site est inchang\xE9. L\u2019\xE9quipe peut voir ce que vous avez demand\xE9.",
  "rebuild.say.site_already_built": "Votre site est d\xE9j\xE0 construit, je ne l\u2019ai donc pas reconstruit depuis le d\xE9but. Modifiez le plan et mettez \xE0 jour votre site, et seul ce que vous avez modifi\xE9 est reconstruit.",
  "rebuild.say.site_changed_outside": "Une partie de votre site a \xE9t\xE9 modifi\xE9e en dehors de Tracy depuis sa construction, je me suis donc arr\xEAt\xE9 avant d\u2019\xE9craser cette modification. Votre modification est conserv\xE9e. L\u2019\xE9quipe peut voir de quelle partie il s\u2019agit.",
  "rebuild.say.update_done": "Votre site est mis \xE0 jour. Seules les parties touch\xE9es par votre changement ont \xE9t\xE9 reconstruites, le reste est comme avant.",
  "rebuild.say.write_record_stale": "Cette mise \xE0 jour s\u2019est m\xE9lang\xE9e avec une pr\xE9c\xE9dente, je me suis donc arr\xEAt\xE9 avant de modifier quoi que ce soit. Votre site est inchang\xE9. L\u2019\xE9quipe peut voir ce qui s\u2019est pass\xE9.",
  "rebuild.restore": "Restore de la version pr\xE9c\xE9dente",
  "rebuild.title": "Votre site",
  "rebuild.undo": "Annuler la mise \xE0 jour inachev\xE9e",
  "rebuild.update": "Mettre \xE0 jour mon site",
  "retry.button": "R\xE9essayer",
  "review.failed": "Votre r\xE9ponse n\u2019a pas \xE9t\xE9 envoy\xE9e. R\xE9essayez.",
  "review.question": "Approuver ce plan ?",
  "review.approve": "Approuver",
  "review.change": "Modifier le plan",
  "review.say": "Ou d\xE9crivez la modification souhait\xE9e",
  "review.summary": "{name} : {pages}, {services}",
  "review.summary.one": "{name} : {part}",
  "review.pages.one": "{count} page",
  "review.pages.other": "{count} pages",
  "stopped.kept.none": "Conserv\xE9 : votre plan et vos r\xE9ponses.",
  "stopped.kept.one": "Conserv\xE9 : votre plan, vos r\xE9ponses et la page r\xE9dig\xE9e.",
  "stopped.kept.other": "Conserv\xE9 : votre plan, vos r\xE9ponses et les {count} pages r\xE9dig\xE9es.",
  "stopped.notified": "L\u2019\xE9quipe Tracy a \xE9t\xE9 pr\xE9venue et s\u2019en occupe. Vous n\u2019avez rien \xE0 faire.",
  "stopped.notStarted": "Votre site n\u2019a pas pu \xEAtre lanc\xE9, mais votre plan est conserv\xE9 et vous pourrez l\u2019approuver \xE0 nouveau plus tard.",
  "stopped.notStarted.design": "Ce design ne peut pas encore \xEAtre construit, votre site n\u2019a donc pas \xE9t\xE9 lanc\xE9, mais votre plan est conserv\xE9 et vous pourrez l\u2019approuver \xE0 nouveau plus tard.",
  "stopped.once": "Je n\u2019ai pas pu terminer \xAB {step} \xBB, j\u2019ai pr\xE9f\xE9r\xE9 m\u2019arr\xEAter plut\xF4t que de vous montrer un site inachev\xE9.",
  "stopped.title": "Votre site n\u2019est pas encore termin\xE9",
  "stopped.twice": "Je n\u2019ai pas pu terminer \xAB {step} \xBB apr\xE8s deux essais, j\u2019ai pr\xE9f\xE9r\xE9 m\u2019arr\xEAter plut\xF4t que de vous montrer un site inachev\xE9.",
  "stopped.unchanged": "Votre site actuel reste inchang\xE9.",
  "template.chosen": "Choisi : {name}",
  "template.continue": "Continuer",
  "template.later": "Vous pourrez changer de design plus tard.",
  "template.list": "Designs pour votre site",
  "template.none": "Aucun design pr\xEAt \xE0 l\u2019emploi ne convient encore \xE0 votre activit\xE9.",
  "template.noneNext": "Vous pouvez tout de m\xEAme cr\xE9er votre site depuis la page Ajouter un site.",
  "template.openAddSite": "Ouvrir Ajouter un site",
  "template.picked": "J\u2019ai choisi {name}.",
  "template.recommended": "Recommand\xE9",
  "template.saveFailed": "Votre choix n\u2019a pas \xE9t\xE9 enregistr\xE9. R\xE9essayez.",
  "template.sendFailed": "Votre choix est enregistr\xE9, mais il n\u2019est pas arriv\xE9 dans le chat. Cliquez sur Continuer pour le renvoyer.",
  "template.use": "Utiliser {name}",
  "tool.edit": "Le plan de votre site a \xE9t\xE9 mis \xE0 jour",
  "tool.plan": "Le plan de votre site est pr\xEAt",
  "tool.research.none": "Recherche sur votre activit\xE9 effectu\xE9e",
  "tool.research.one": "{count} source lue",
  "tool.research.other": "{count} sources lues",
  "tool.stopped": "Cette \xE9tape n\u2019a pas pu \xEAtre termin\xE9e",
  "tool.templates": "Designs trouv\xE9s pour votre site",
  "tool.working": "Pr\xE9paration du plan de votre site",
  "plan.revised.notDone.owner_value_not_shown.what": "Afficher {label} sur le site",
  "plan.revised.notDone.owner_value_not_shown.why": "Votre r\xE9ponse est enregistr\xE9e, mais votre design n\u2019a aucun emplacement qui l\u2019affiche.",
  "plan.revised.names.counted": "{count} {plural}",
  "plan.revised.notDone.reason.no_recipe": "Votre design n\u2019a pas de page de ce type.",
  "plan.revised.notDone.reason.no_data": "Rien de votre entreprise ne remplit cette section.",
  "plan.revised.notDone.reason.fact_missing": "Votre entreprise n\u2019a pas cette information.",
  "plan.revised.notDone.reason.kept_private": "Vous gardez ceci hors de votre site.",
  "plan.revised.notDone.reason.outside_plan": "Une demande de changement ne peut pas modifier ceci. Modifiez-le sur la carte du plan.",
  "plan.leftOut.reason.no_email_for_form": "Votre entreprise n\u2019a pas d\u2019adresse email \xE0 laquelle le formulaire d\u2019inscription peut envoyer les r\xE9ponses.",
  "plan.leftOut.reason.no_booking_link": "Vous n\u2019avez pas de link de r\xE9servation ou de contact que son bouton peut ouvrir.",
  "plan.leftOut.reason.no_items_to_show": "Vous n\u2019avez encore rien que cette section puisse afficher.",
  "plan.leftOut.reason.shown_in_other_sections": "Ce que cette section afficherait est d\xE9j\xE0 affich\xE9 dans d\u2019autres sections de votre plan.",
  "plan.leftOut.reason.owner_withheld": "Vous avez demand\xE9 de garder ceci hors du site.",
  "plan.leftOut.reason.left_out_neutral.page": "Cette page ne fait pas partie de votre plan.",
  "plan.leftOut.reason.left_out_neutral.block": "Cette section ne fait pas partie de votre plan.",
  "plan.leftOut.reason.left_out_neutral.item": "Ceci n\u2019est pas affich\xE9 dans votre plan.",
  "plan.leftOut.reason.no_gallery_room.one": "Aucune galerie n\u2019a de place pour cette photo. Elle reste avec vos photos et peut \xEAtre utilis\xE9e ailleurs sur le site.",
  "plan.leftOut.reason.no_gallery_room.other": "Aucune galerie n\u2019a de place pour ces {count} photos. Elles restent avec vos photos et peuvent \xEAtre utilis\xE9es ailleurs sur le site.",
  "plan.pictures.estimate.one": "Environ {count} image sera cr\xE9\xE9e l\xE0 o\xF9 vous n\u2019avez pas de photo adapt\xE9e. Le nombre final d\xE9pend de vos photos.",
  "plan.pictures.estimate.other": "Environ {count} images seront cr\xE9\xE9es l\xE0 o\xF9 vous n\u2019avez pas de photo adapt\xE9e. Le nombre final d\xE9pend de vos photos.",
  "plan.logoSource.website": "Site web",
  "plan.logoSource.google": "Fiche Google Maps",
  "plan.logoSource.instagram": "Profil Instagram",
  "plan.logoSource.facebook": "Page Facebook",
  "plan.logoSource.tiktok": "Profil TikTok",
  "plan.assumption.logo_drawn.new-symbol-drawn": "Tracy a dessin\xE9 un logo d\u2019apr\xE8s votre logo : un nouveau symbole de votre m\xE9tier \xE0 c\xF4t\xE9 du nom de votre entreprise, dans la police du template. Ce n\u2019est pas votre file de logo. Approuvez-le, ou envoyez-nous votre logo pour le remplacer.",
  "plan.assumption.logo_drawn.symbol-cut-from-logo": "Tracy a dessin\xE9 un logo d\u2019apr\xE8s votre logo : le symbole d\xE9coup\xE9 de votre logo \xE0 c\xF4t\xE9 du nom de votre entreprise, dans la police du template. Ce n\u2019est pas votre file de logo. Approuvez-le, ou envoyez-nous votre logo pour le remplacer.",
  "plan.assumption.logo_drawn.name-set-in-template-font": "Tracy a dessin\xE9 un logo d\u2019apr\xE8s votre logo : une marque \xE0 c\xF4t\xE9 du nom de votre entreprise, dans la police du template. Ce n\u2019est pas votre file de logo. Approuvez-le, ou envoyez-nous votre logo pour le remplacer.",
  "plan.assumption.logo_made.found.icon": "Votre logo n\u2019a pas pu \xEAtre utilis\xE9 tel quel, j\u2019en ai donc fait un provisoire : une ic\xF4ne simple de votre m\xE9tier \xE0 c\xF4t\xE9 du nom de votre entreprise. Envoyez le file de votre logo ici dans le chat pour le remplacer.",
  "plan.assumption.logo_made.found.lettermark": "Votre logo n\u2019a pas pu \xEAtre utilis\xE9 tel quel, j\u2019en ai donc fait un provisoire : vos initiales \xE0 c\xF4t\xE9 du nom de votre entreprise. Envoyez le file de votre logo ici dans le chat pour le remplacer.",
  "plan.assumption.logo_made.found.mark": "Votre logo n\u2019a pas pu \xEAtre utilis\xE9 tel quel, j\u2019en ai donc fait un provisoire : une marque simple \xE0 c\xF4t\xE9 du nom de votre entreprise. Envoyez le file de votre logo ici dans le chat pour le remplacer.",
  "plan.assumption.logo_made.none.icon": "Aucun logo n\u2019a \xE9t\xE9 trouv\xE9, j\u2019en ai donc fait un provisoire : une ic\xF4ne simple de votre m\xE9tier \xE0 c\xF4t\xE9 du nom de votre entreprise, dans la couleur principale du design. Envoyez votre logo ici dans le chat pour le remplacer.",
  "plan.assumption.logo_made.none.lettermark": "Aucun logo n\u2019a \xE9t\xE9 trouv\xE9, j\u2019en ai donc fait un provisoire : vos initiales \xE0 c\xF4t\xE9 du nom de votre entreprise, dans la couleur principale du design. Envoyez votre logo ici dans le chat pour le remplacer.",
  "plan.assumption.logo_made.none.mark": "Aucun logo n\u2019a \xE9t\xE9 trouv\xE9, j\u2019en ai donc fait un provisoire : une marque simple \xE0 c\xF4t\xE9 du nom de votre entreprise, dans la couleur principale du design. Envoyez votre logo ici dans le chat pour le remplacer.",
  "plan.hours.days": "{from} au {to}",
  "plan.hours.time": "{from} \xE0 {to}",
  "plan.hours.closed": "ferm\xE9",
  "plan.hours.ranges": "{first} et {next}",
  "plan.hours.group": "{days}, {hours}",
  "plan.hours.groups": "{first} ; {next}",
  "plan.section.header": "Menu",
  "plan.section.footer": "Pied de page",
  "plan.section.hero": "Banni\xE8re",
  "plan.section.page_header": "En-t\xEAte de page",
  "plan.section.about": "\xC0 propos",
  "plan.section.text": "Texte",
  "plan.section.call_to_action": "Appel \xE0 l\u2019action",
  "plan.section.contact": "Coordonn\xE9es",
  "plan.section.map": "Carte",
  "plan.section.video": "Vid\xE9o",
  "plan.section.newsletter": "Newsletter",
  "plan.section.services": "Services",
  "plan.section.menu": "Carte du menu",
  "plan.section.pricing": "Tarifs",
  "plan.section.schedule": "Planning",
  "plan.section.team": "\xC9quipe",
  "plan.section.stats": "Chiffres",
  "plan.section.steps": "\xC9tapes",
  "plan.section.reviews": "Avis",
  "plan.section.claims": "Distinctions",
  "plan.section.faq": "Questions",
  "plan.section.events": "\xC9v\xE9nements",
  "plan.section.posts": "Articles",
  "plan.section.gallery": "Photos",
  "rebuild.say.door_not_available": "Votre site ne me permet pas de faire ce changement depuis ce chat, j\u2019ai donc arr\xEAt\xE9 la mise \xE0 jour. L\u2019\xE9quipe peut voir de quelle partie il s\u2019agit.",
  "rebuild.say.sheets_unreadable": "Je n\u2019ai pas pu lire les feuilles de style de votre site, je me suis donc arr\xEAt\xE9 avant de changer ses couleurs. L\u2019\xE9quipe peut voir ce qui s\u2019est pass\xE9.",
  "ask.question.main_button": "Que doit proposer aux visiteurs le bouton principal de votre site ?",
  "ask.question.contact_method": "Nous n\u2019avons trouv\xE9 aucun t\xE9l\xE9phone, email ni link de r\xE9servation. Comment les visiteurs doivent-ils vous contacter ?",
  "ask.question.site_language": "Vos pages publiques utilisent plus d\u2019une langue. Quelle langue votre site doit-il utiliser ?",
  "ask.question.fact_conflict_business.phone": "Vos pages publiques donnent des valeurs diff\xE9rentes pour votre num\xE9ro de t\xE9l\xE9phone. Laquelle est la bonne ?",
  "ask.question.fact_conflict_business.email": "Vos pages publiques donnent des valeurs diff\xE9rentes pour votre adresse email. Laquelle est la bonne ?",
  "ask.question.fact_conflict_business.address": "Vos pages publiques donnent des valeurs diff\xE9rentes pour votre adresse. Laquelle est la bonne ?",
  "ask.question.fact_conflict_business.hours": "Vos pages publiques donnent des valeurs diff\xE9rentes pour vos horaires d\u2019ouverture. Laquelle est la bonne ?",
  "ask.question.fact_conflict_business.link": "Vos pages publiques donnent des valeurs diff\xE9rentes pour votre link de r\xE9servation ou de contact. Laquelle est la bonne ?",
  "ask.question.fact_conflict_business.name": "Vos pages publiques donnent des valeurs diff\xE9rentes pour le nom de votre entreprise. Laquelle est la bonne ?",
  "ask.question.fact_conflict_business.price": "Vos pages publiques donnent des valeurs diff\xE9rentes pour votre prix. Laquelle est la bonne ?",
  "ask.question.fact_conflict_item.phone": "Vos pages publiques donnent des valeurs diff\xE9rentes pour le num\xE9ro de t\xE9l\xE9phone de {item}. Laquelle est la bonne ?",
  "ask.question.fact_conflict_item.email": "Vos pages publiques donnent des valeurs diff\xE9rentes pour l\u2019adresse email de {item}. Laquelle est la bonne ?",
  "ask.question.fact_conflict_item.address": "Vos pages publiques donnent des valeurs diff\xE9rentes pour l\u2019adresse de {item}. Laquelle est la bonne ?",
  "ask.question.fact_conflict_item.hours": "Vos pages publiques donnent des valeurs diff\xE9rentes pour les horaires d\u2019ouverture de {item}. Laquelle est la bonne ?",
  "ask.question.fact_conflict_item.link": "Vos pages publiques donnent des valeurs diff\xE9rentes pour le link de r\xE9servation ou de contact de {item}. Laquelle est la bonne ?",
  "ask.question.fact_conflict_item.name": "Vos pages publiques donnent des valeurs diff\xE9rentes pour le nom de l\u2019entreprise de {item}. Laquelle est la bonne ?",
  "ask.question.fact_conflict_item.price": "Vos pages publiques donnent des valeurs diff\xE9rentes pour le prix de {item}. Laquelle est la bonne ?",
  "ask.choice.contact_method_phone": "Un num\xE9ro de t\xE9l\xE9phone",
  "ask.choice.contact_method_email": "Une adresse email",
  "ask.choice.contact_method_link": "Un link de r\xE9servation ou de contact",
  "ask.from": "Depuis {sources}",
  "ask.and": "{first} et {last}",
  "ask.source.website": "Site web",
  "ask.source.google_maps": "Fiche Google Maps",
  "ask.source.owner_answer": "Votre r\xE9ponse",
  "ask.source.instagram": "Profil Instagram",
  "ask.source.facebook": "Page Facebook",
  "ask.source.tiktok": "Profil TikTok",
  "ask.source.social": "Profil sur un r\xE9seau social",
  "ask.question.place_choice": "Nous avons trouv\xE9 plusieurs lieux sur Google Maps sous ce nom. Lequel est le v\xF4tre ?",
  "ask.choice.place_choice_none": "Aucun de ces lieux",
  "ask.choice.main_button_book": "R\xE9server en ligne",
  "ask.choice.main_button_call": "Appelez-nous",
  "ask.choice.main_button_email": "\xC9crivez-nous un e-mail",
  "ask.choice.main_button_message": "Envoyez-nous un message",
  "ask.choice.main_button_visit": "Rendez-nous visite",
  "ask.choice.main_button_contact": "Contactez-nous",
  "ask.choice.main_button_book_short": "R\xE9server",
  "ask.choice.main_button_call_short": "Appeler",
  "ask.choice.main_button_email_short": "E-mail",
  "ask.choice.main_button_message_short": "Message",
  "ask.choice.main_button_visit_short": "Visiter",
  "ask.choice.main_button_contact_short": "Contact",
  "ask.choice.main_button_text": "Texte du bouton : {text}",
  "ask.source.listing": "Fiche d\u2019annuaire",
  "plan.source.listing": "Fiche d\u2019annuaire",
  "links.reading": "{name} : lecture en cours",
  "links.choice": "{name} : votre choix est n\xE9cessaire",
  "links.failed": "{name} : lecture impossible",
  "links.failedWhy": "{name} : lecture impossible ({reason})",
  "links.read": "{name} : lu",
  "links.readNothing": "{name} : lu, mais aucune information sur l\u2019entreprise n\u2019a \xE9t\xE9 trouv\xE9e",
  "links.readPicturesLost": "{name} : lu, mais ses images n\u2019ont pas pu \xEAtre t\xE9l\xE9charg\xE9es",
  "links.readPicturesNotKept": "{name} : lu, mais ses images n\u2019ont pas pu \xEAtre conserv\xE9es",
  "links.facts.one": "{count} information",
  "links.facts.other": "{count} informations",
  "links.pictures.one": "{count} image",
  "links.pictures.other": "{count} images",
  "links.pictures.none": "Aucune image",
  "links.pictures.someLost": "{count} autres n\u2019ont pas pu \xEAtre t\xE9l\xE9charg\xE9es",
  "tool.working.research": "Lecture de vos liens",
  "tool.working.about": "Lecture des informations sur votre entreprise",
  "tool.working.templates": "Recherche de designs pour votre site",
  "tool.working.build": "Cr\xE9ation de votre site",
  "tool.working.startOver": "Reprise depuis le d\xE9but",
  "tool.waiting.place": "En attente de votre choix de l\u2019\xE9tablissement",
  "links.pictures.foundSome": "{count} images trouv\xE9es, {usable} utilisables",
  "links.pictures.foundNotOwn.one": "{count} image trouv\xE9e, non publi\xE9e par l\u2019entreprise",
  "links.pictures.foundNotOwn.other": "{count} images trouv\xE9es, aucune publi\xE9e par l\u2019entreprise",
  "links.pictures.foundNone.one": "{count} image trouv\xE9e, non utilisable",
  "links.pictures.foundNone.other": "{count} images trouv\xE9es, aucune utilisable",
  "say.researchRead": "J\u2019ai lu ce que vous m\u2019avez transmis sur votre entreprise."
};

// ../../locale/tracy-locales/it/tracy-build-chat.json
var tracy_build_chat_default4 = {
  "cancelled.body": "Ha annullato questa creazione. Il suo piano e le sue risposte sono conservati.",
  "cancelled.title": "La creazione \xE8 stata annullata",
  "handoff.earlier": "Conversazione precedente",
  "handoff.tooLong": "Il suo site \xE8 pronto, ma questa conversazione \xE8 troppo lunga per essere spostata nella chat del site. Apra il suo site dal suo elenco di site.",
  "plan.allSources": "Tutte le fonti",
  "plan.and": "{first} e {last}",
  "plan.assumptions": "Cosa ho ipotizzato",
  "plan.cancel": "Annulla",
  "plan.changed": "Modificato",
  "plan.count.gallery.one": "{count} foto",
  "plan.count.gallery.other": "{count} foto",
  "plan.count.item.one": "{count} elemento",
  "plan.count.item.other": "{count} elementi",
  "plan.count.person.one": "{count} persona",
  "plan.count.person.other": "{count} persone",
  "plan.count.quote.one": "{count} recensione",
  "plan.count.quote.other": "{count} recensioni",
  "plan.count.service.one": "{count} servizio",
  "plan.count.service.other": "{count} servizi",
  "plan.design": "Design: {name}",
  "plan.edit": "Modifica {label}: {value}",
  "plan.facts": "Dati dell\u2019attivit\xE0",
  "plan.fromServices": "Da Servizi",
  "plan.language": "Lingua del site",
  "plan.leftOut": "Escluso",
  "plan.leftOut.showAll": "Mostra tutto ({count})",
  "plan.leftOut.showFewer": "Mostra meno",
  "plan.revised.changed": "Cosa \xE8 cambiato",
  "plan.revised.notDone": "Non fatto",
  "plan.revised.dismiss": "Nascondi questa nota",
  "plan.revised.edited": "{label} ora \xE8 {value}.",
  "plan.revised.line.owner_value_saved": "La sua risposta \xE8 salvata: {label}, {value}.",
  "plan.revised.line.item_renamed": "{from} ora si chiama {to}.",
  "plan.revised.line.item_taken_off": "{label} non compare sul suo site, come ha chiesto.",
  "plan.revised.line.page-removed": "La pagina {name} \xE8 stata rimossa.",
  "plan.revised.line.page-added": "La pagina {name} \xE8 stata aggiunta.",
  "plan.revised.line.page-renamed": "La pagina {from} ora si chiama {to}.",
  "plan.revised.line.page-order": "Le pagine ora sono in questo ordine: {names}.",
  "plan.revised.line.block-removed": "La sezione {section} \xE8 stata rimossa dalla pagina {page}.",
  "plan.revised.line.block-added": "La sezione {section} \xE8 stata aggiunta alla pagina {page}.",
  "plan.revised.line.block-data.count": "La sezione {section} della pagina {page} ora mostra {count} elementi.",
  "plan.revised.line.block-data": "La sezione {section} della pagina {page} ora mostra {names}.",
  "plan.revised.line.block-order": "Le sezioni della pagina {page} hanno un nuovo ordine.",
  "plan.revised.line.data-off": "Non pi\xF9 mostrato: {names}.",
  "plan.revised.line.data-on": "Ora mostrato: {names}.",
  "plan.revised.line.data-again": "Di nuovo mostrato: {names}, che aveva tolto in precedenza.",
  "plan.revised.line.pictures-own.one": "Il piano ora usa {count} sua foto.",
  "plan.revised.line.pictures-own.other": "Il piano ora usa {count} sue foto.",
  "plan.revised.line.pictures-drawn.none": "Tracy ora non creer\xE0 nessuna immagine.",
  "plan.revised.line.pictures-drawn.one": "Verr\xE0 creata circa {count} immagine dove non ha una foto adatta.",
  "plan.revised.line.pictures-drawn.other": "Verranno create circa {count} immagini dove non ha una foto adatta.",
  "plan.revised.notDone.nothing_to_change.what": "La sua richiesta",
  "plan.revised.notDone.nothing_to_change.why": "Niente nel piano poteva seguirla, quindi il piano resta invariato.",
  "plan.revised.notDone.page_already_on_plan.why": "Il piano ha gi\xE0 questa pagina.",
  "plan.revised.notDone.section_not_filled.what": "Una nuova sezione",
  "plan.revised.notDone.section_not_filled.why": "Non c\u2019\xE8 nulla della sua attivit\xE0 con cui riempirla, quindi non viene aggiunta.",
  "plan.revised.notDone.item_rename_refused.what": "Rinominare {name}",
  "plan.undo.chatChange": "Annulla riporta indietro solo le modifiche fatte su questa scheda. Per annullare una modifica chiesta nella chat, lo chieda nella chat.",
  "plan.fact.business.name": "Nome dell\u2019attivit\xE0",
  "plan.fact.business.founded_year": "Fondato nel",
  "plan.fact.business.tagline": "Slogan",
  "plan.fact.business.summary": "Chi siamo",
  "plan.fact.contact.phone": "Telefono",
  "plan.fact.contact.email": "Email",
  "plan.fact.contact.address": "Indirizzo",
  "plan.fact.contact.hours": "Orari di apertura",
  "plan.fact.contact.cta_url": "Link per prenotare",
  "plan.fact.contact.cta_label": "Pulsante principale",
  "plan.fact.contact.social_url": "Link ai social",
  "plan.source.website": "Sito web",
  "plan.source.google": "Scheda Google Maps",
  "plan.source.social": "Profilo social",
  "plan.source.answer": "La sua risposta",
  "plan.look": "Aspetto",
  "plan.look.accent": "Colore principale",
  "plan.look.accentDark": "Colore principale sulle pagine scure",
  "plan.look.accentLight": "Colore principale sulle pagine chiare",
  "plan.look.logoDark": "Logo sulle pagine scure",
  "plan.look.logoDrawn": "Un logo disegnato da Tracy, a partire dal suo logo",
  "plan.look.logoLight": "Logo sulle pagine chiare",
  "plan.look.logoOwn": "Il suo logo, da {source}",
  "plan.look.logoText": "Il nome della sua attivit\xE0 come testo",
  "plan.look.template": "Design",
  "plan.newValue": "Nuovo valore per {label}",
  "plan.pages": "Pagine ({count})",
  "plan.pictures": "Immagini",
  "plan.pictures.drawn": "Immagini create da Tracy",
  "plan.pictures.drawnNone": "Nessuna",
  "plan.pictures.drawnValue.one": "Circa {count} immagine",
  "plan.pictures.drawnValue.other": "Circa {count} immagini",
  "plan.pictures.own": "Le sue foto",
  "plan.pictures.ownValue.one": "{count} foto da {from}",
  "plan.pictures.ownValue.other": "{count} foto da {from}",
  "plan.save": "Salva",
  "plan.saveFailed": "La sua modifica non \xE8 stata salvata. Riprovi.",
  "plan.locked": "Il suo site viene creato da questo piano, quindi il piano non pu\xF2 cambiare finch\xE9 la creazione non termina.",
  "plan.stale": "Nel frattempo il piano \xE8 cambiato, quindi la sua modifica non \xE8 stata salvata. La scheda ora mostra il piano pi\xF9 recente.",
  "plan.busy": "Sto ancora lavorando al suo piano, quindi ora non pu\xF2 cambiare. Ripeta la sua modifica quando avr\xF2 finito.",
  "plan.tooLarge": "Questa modifica \xE8 troppo lunga per essere salvata. La accorci e riprovi.",
  "plan.sections.one": "{count} sezione",
  "plan.sections.other": "{count} sezioni",
  "plan.service": "Servizio {n}",
  "plan.services": "Servizi ({count})",
  "plan.title": "Piano del site {name}",
  "plan.undo": "Annulla",
  "plan.undoLabel": "Annulla l\u2019ultima modifica",
  "progress.clock": "Tempo trascorso",
  "progress.done": "{count} completati",
  "progress.failed": "{count} non riusciti",
  "progress.note.failed": "Non riuscito",
  "progress.note.failedTwice": "Non riuscito due volte",
  "progress.note.notStarted": "Non avviato",
  "progress.pending": "{count} in attesa",
  "progress.running": "{count} in corso",
  "progress.state.done": "Completato",
  "progress.state.failed": "Non riuscito",
  "progress.state.pending": "In attesa",
  "progress.state.running": "In corso",
  "progress.title.build": "Creazione del suo site in corso",
  "progress.title.partial": "Aggiornamento del suo site in corso",
  "rebuild.changed": "Il suo piano \xE8 cambiato da quando il site \xE8 stato creato. Viene ricreato solo ci\xF2 che ha cambiato.",
  "rebuild.failed": "La sua richiesta non \xE8 stata inviata. Riprovi.",
  "rebuild.heldFiles": "File ancora presenti sul suo site",
  "rebuild.heldFile.person-photo": "Foto {n}: una persona che ha chiesto di mantenere privata",
  "rebuild.say.abandon_done": "L\u2019aggiornamento non completato \xE8 stato annullato. Il suo site mostra ci\xF2 che mostrava prima.",
  "rebuild.say.held_file_left_on_site": "Una foto di una persona che ha chiesto di mantenere privata \xE8 ancora salvata sul suo site come file, anche se nessuna pagina la mostra. Non posso ancora eliminare i file. Il team pu\xF2 rimuoverla per lei.",
  "rebuild.say.nothing_to_update": "Il suo site mostra gi\xE0 questo piano, quindi non c\u2019\xE8 nulla da aggiornare.",
  "rebuild.say.previous_build_doors_missing": "Non posso ancora aggiornare il suo site da questa chat, quindi il suo site non \xE8 cambiato. Il team pu\xF2 vedere cosa \xE8 successo.",
  "rebuild.say.previous_build_not_current": "Il suo site \xE8 cambiato mentre questo aggiornamento veniva preparato, quindi mi sono fermato prima di cambiare qualsiasi cosa. Il suo site non \xE8 cambiato. Pu\xF2 aggiornarlo di nuovo, e partir\xF2 da ci\xF2 che mostra ora.",
  "rebuild.say.previous_build_unreadable": "Non sono riuscito a leggere come \xE8 stato creato l\u2019ultima volta il suo site, quindi mi sono fermato prima di cambiare qualsiasi cosa. Il suo site non \xE8 cambiato. Il team pu\xF2 vedere cosa \xE8 successo.",
  "rebuild.say.previous_run_unfinished": "Un aggiornamento precedente del suo site non \xE8 stato completato, quindi non posso ancora avviarne uno nuovo. Pu\xF2 annullare l\u2019aggiornamento non completato, che riporta il suo site com\u2019era prima, e poi aggiornare di nuovo.",
  "rebuild.say.restore_done": "Il suo site \xE8 tornato alla versione precedente.",
  "rebuild.say.restore_needs_removal": "Una parte dell\u2019ultimo aggiornamento non si pu\xF2 annullare da questa chat, quindi non sono tornato alla versione precedente. Il suo site resta com\u2019\xE8 ora. Il team pu\xF2 vedere cosa \xE8 successo.",
  "rebuild.say.restore_shows_held_text": "La versione precedente mostra qualcosa che ha chiesto di mantenere privato, quindi non sono tornato a quella versione. Il suo site resta com\u2019\xE8 ora.",
  "rebuild.say.restore_site_changed": "Una parte del suo site \xE8 stata modificata fuori da Tracy dall\u2019ultimo aggiornamento, quindi non sono tornato alla versione precedente. La sua modifica \xE8 mantenuta e il suo site resta com\u2019\xE8 ora.",
  "rebuild.say.revision_needs_removal": "La sua modifica toglie una parte del suo site che non posso togliere da questa chat, quindi mi sono fermato prima di cambiare qualsiasi cosa. Il suo site non \xE8 cambiato. Il team pu\xF2 vedere cosa ha chiesto.",
  "rebuild.say.site_already_built": "Il suo site \xE8 gi\xE0 creato, quindi non l\u2019ho ricreato da capo. Cambi il piano e aggiorni il suo site, e viene ricreato solo ci\xF2 che ha cambiato.",
  "rebuild.say.site_changed_outside": "Una parte del suo site \xE8 stata modificata fuori da Tracy da quando \xE8 stato creato, quindi mi sono fermato prima di sovrascrivere quella modifica. La sua modifica \xE8 mantenuta. Il team pu\xF2 vedere quale parte era.",
  "rebuild.say.update_done": "Il suo site \xE8 aggiornato. Sono state ricreate solo le parti toccate dalla sua modifica, il resto \xE8 com\u2019era.",
  "rebuild.say.write_record_stale": "Questo aggiornamento si \xE8 mescolato con uno precedente, quindi mi sono fermato prima di cambiare qualsiasi cosa. Il suo site non \xE8 cambiato. Il team pu\xF2 vedere cosa \xE8 successo.",
  "rebuild.restore": "Restore della versione precedente",
  "rebuild.title": "Il suo site",
  "rebuild.undo": "Annulla l\u2019aggiornamento non completato",
  "rebuild.update": "Aggiorna il mio site",
  "retry.button": "Riprova",
  "review.failed": "La sua risposta non \xE8 stata inviata. Riprovi.",
  "review.question": "Approvare questo piano?",
  "review.approve": "Approva",
  "review.change": "Modifica il piano",
  "review.say": "Oppure descriva la modifica che desidera",
  "review.summary": "{name}: {pages}, {services}",
  "review.summary.one": "{name}: {part}",
  "review.pages.one": "{count} pagina",
  "review.pages.other": "{count} pagine",
  "stopped.kept.none": "Conservati: il suo piano e le sue risposte.",
  "stopped.kept.one": "Conservati: il suo piano, le sue risposte e la pagina scritta.",
  "stopped.kept.other": "Conservati: il suo piano, le sue risposte e le {count} pagine scritte.",
  "stopped.notified": "Il team di Tracy \xE8 stato avvisato e se ne occuper\xE0. Non deve fare nulla.",
  "stopped.notStarted": "Non \xE8 stato possibile avviare il suo site, ma il suo piano \xE8 conservato e potr\xE0 approvarlo di nuovo pi\xF9 tardi.",
  "stopped.notStarted.design": "Questo design non si pu\xF2 ancora costruire, quindi il suo site non \xE8 stato avviato, ma il suo piano \xE8 conservato e potr\xE0 approvarlo di nuovo pi\xF9 tardi.",
  "stopped.once": "Non \xE8 stato possibile completare \xAB{step}\xBB, quindi ho preferito fermarmi invece di mostrarle un site incompleto.",
  "stopped.title": "Il suo site non \xE8 ancora completo",
  "stopped.twice": "Non \xE8 stato possibile completare \xAB{step}\xBB dopo due tentativi, quindi ho preferito fermarmi invece di mostrarle un site incompleto.",
  "stopped.unchanged": "Il suo site attuale non \xE8 cambiato.",
  "template.chosen": "Scelto: {name}",
  "template.continue": "Continua",
  "template.later": "Potr\xE0 cambiare il design in seguito.",
  "template.list": "Design per il suo site",
  "template.none": "Nessun design pronto si adatta ancora alla sua attivit\xE0.",
  "template.noneNext": "Pu\xF2 comunque creare il suo site dalla pagina Aggiungi site.",
  "template.openAddSite": "Apri Aggiungi site",
  "template.picked": "Ho scelto {name}.",
  "template.recommended": "Consigliato",
  "template.saveFailed": "La sua scelta non \xE8 stata salvata. Riprovi.",
  "template.sendFailed": "La sua scelta \xE8 stata salvata, ma non \xE8 arrivata nella chat. Prema Continua per inviarla di nuovo.",
  "template.use": "Usa {name}",
  "tool.edit": "Il piano del suo site \xE8 stato aggiornato",
  "tool.plan": "Il piano del suo site \xE8 pronto",
  "tool.research.none": "Ricerca sulla sua attivit\xE0 completata",
  "tool.research.one": "Letta {count} fonte",
  "tool.research.other": "Lette {count} fonti",
  "tool.stopped": "Questo passaggio non \xE8 stato completato",
  "tool.templates": "Trovati design per il suo site",
  "tool.working": "Preparazione del piano del suo site",
  "plan.revised.notDone.owner_value_not_shown.what": "Mostrare {label} sul site",
  "plan.revised.notDone.owner_value_not_shown.why": "La sua risposta \xE8 salvata, ma il suo design non ha nessun punto che la mostri.",
  "plan.revised.names.counted": "{count} {plural}",
  "plan.revised.notDone.reason.no_recipe": "Il suo design non ha una pagina di questo tipo.",
  "plan.revised.notDone.reason.no_data": "Niente della sua attivit\xE0 riempie questa sezione.",
  "plan.revised.notDone.reason.fact_missing": "La sua attivit\xE0 non ha questa informazione.",
  "plan.revised.notDone.reason.kept_private": "Lei tiene questo fuori dal suo site.",
  "plan.revised.notDone.reason.outside_plan": "Una richiesta di modifica non pu\xF2 cambiare questo. Lo cambi sulla scheda del piano.",
  "plan.leftOut.reason.no_email_for_form": "La sua attivit\xE0 non ha un indirizzo email a cui il modulo di iscrizione possa inviare le risposte.",
  "plan.leftOut.reason.no_booking_link": "Non ha un link per prenotare o per il contatto che il pulsante possa aprire.",
  "plan.leftOut.reason.no_items_to_show": "Non ha ancora niente che questa sezione possa mostrare.",
  "plan.leftOut.reason.shown_in_other_sections": "Ci\xF2 che questa sezione mostrerebbe \xE8 gi\xE0 mostrato in altre sezioni del suo piano.",
  "plan.leftOut.reason.owner_withheld": "Ha chiesto di tenere questo fuori dal site.",
  "plan.leftOut.reason.left_out_neutral.page": "Questa pagina non fa parte del suo piano.",
  "plan.leftOut.reason.left_out_neutral.block": "Questa sezione non fa parte del suo piano.",
  "plan.leftOut.reason.left_out_neutral.item": "Questo non \xE8 mostrato nel suo piano.",
  "plan.leftOut.reason.no_gallery_room.one": "Nessuna galleria ha spazio per questa foto. Resta tra le sue foto e pu\xF2 essere usata altrove sul site.",
  "plan.leftOut.reason.no_gallery_room.other": "Nessuna galleria ha spazio per queste {count} foto. Restano tra le sue foto e possono essere usate altrove sul site.",
  "plan.pictures.estimate.one": "Verr\xE0 creata circa {count} immagine dove non ha una foto adatta. Il numero finale dipende dalle sue foto.",
  "plan.pictures.estimate.other": "Verranno create circa {count} immagini dove non ha una foto adatta. Il numero finale dipende dalle sue foto.",
  "plan.logoSource.website": "Sito web",
  "plan.logoSource.google": "Scheda Google Maps",
  "plan.logoSource.instagram": "Profilo Instagram",
  "plan.logoSource.facebook": "Pagina Facebook",
  "plan.logoSource.tiktok": "Profilo TikTok",
  "plan.assumption.logo_drawn.new-symbol-drawn": "Tracy ha disegnato un logo basato sul suo logo: un nuovo simbolo del suo mestiere accanto al nome della sua attivit\xE0, con il font del template. Non \xE8 il file del suo logo. Lo approvi, oppure ci invii il suo logo per sostituirlo.",
  "plan.assumption.logo_drawn.symbol-cut-from-logo": "Tracy ha disegnato un logo basato sul suo logo: il simbolo ritagliato dal suo logo accanto al nome della sua attivit\xE0, con il font del template. Non \xE8 il file del suo logo. Lo approvi, oppure ci invii il suo logo per sostituirlo.",
  "plan.assumption.logo_drawn.name-set-in-template-font": "Tracy ha disegnato un logo basato sul suo logo: un marchio accanto al nome della sua attivit\xE0, con il font del template. Non \xE8 il file del suo logo. Lo approvi, oppure ci invii il suo logo per sostituirlo.",
  "plan.assumption.logo_made.found.icon": "Il suo logo non poteva essere usato cos\xEC com\u2019\xE8, quindi ne ho fatto uno provvisorio: una semplice icona del suo mestiere accanto al nome della sua attivit\xE0. Invii qui nella chat il file del suo logo per sostituirlo.",
  "plan.assumption.logo_made.found.lettermark": "Il suo logo non poteva essere usato cos\xEC com\u2019\xE8, quindi ne ho fatto uno provvisorio: le sue iniziali accanto al nome della sua attivit\xE0. Invii qui nella chat il file del suo logo per sostituirlo.",
  "plan.assumption.logo_made.found.mark": "Il suo logo non poteva essere usato cos\xEC com\u2019\xE8, quindi ne ho fatto uno provvisorio: un semplice marchio accanto al nome della sua attivit\xE0. Invii qui nella chat il file del suo logo per sostituirlo.",
  "plan.assumption.logo_made.none.icon": "Non \xE8 stato trovato nessun logo, quindi ne ho fatto uno provvisorio: una semplice icona del suo mestiere accanto al nome della sua attivit\xE0, nel colore principale del design. Invii qui nella chat il suo logo per sostituirlo.",
  "plan.assumption.logo_made.none.lettermark": "Non \xE8 stato trovato nessun logo, quindi ne ho fatto uno provvisorio: le sue iniziali accanto al nome della sua attivit\xE0, nel colore principale del design. Invii qui nella chat il suo logo per sostituirlo.",
  "plan.assumption.logo_made.none.mark": "Non \xE8 stato trovato nessun logo, quindi ne ho fatto uno provvisorio: un semplice marchio accanto al nome della sua attivit\xE0, nel colore principale del design. Invii qui nella chat il suo logo per sostituirlo.",
  "plan.hours.days": "da {from} a {to}",
  "plan.hours.time": "dalle {from} alle {to}",
  "plan.hours.closed": "chiuso",
  "plan.hours.ranges": "{first} e {next}",
  "plan.hours.group": "{days}, {hours}",
  "plan.hours.groups": "{first}; {next}",
  "plan.section.header": "Menu",
  "plan.section.footer": "Pi\xE8 di pagina",
  "plan.section.hero": "Apertura",
  "plan.section.page_header": "Intestazione della pagina",
  "plan.section.about": "Chi siamo",
  "plan.section.text": "Testo",
  "plan.section.call_to_action": "Invito all\u2019azione",
  "plan.section.contact": "Contatti",
  "plan.section.map": "Mappa",
  "plan.section.video": "Video",
  "plan.section.newsletter": "Newsletter",
  "plan.section.services": "Servizi",
  "plan.section.menu": "Menu del locale",
  "plan.section.pricing": "Prezzi",
  "plan.section.schedule": "Orario",
  "plan.section.team": "Team",
  "plan.section.stats": "Numeri",
  "plan.section.steps": "Passaggi",
  "plan.section.reviews": "Recensioni",
  "plan.section.claims": "Riconoscimenti",
  "plan.section.faq": "Domande",
  "plan.section.events": "Eventi",
  "plan.section.posts": "Articoli",
  "plan.section.gallery": "Foto",
  "rebuild.say.door_not_available": "Il suo site non mi permette di fare questa modifica da questa chat, quindi ho fermato l\u2019aggiornamento. Il team pu\xF2 vedere di quale parte si tratta.",
  "rebuild.say.sheets_unreadable": "Non sono riuscito a leggere i fogli di stile del suo site, quindi mi sono fermato prima di cambiarne i colori. Il team pu\xF2 vedere cosa \xE8 successo.",
  "ask.question.main_button": "Che cosa dovrebbe chiedere ai visitatori il pulsante principale del suo site?",
  "ask.question.contact_method": "Non abbiamo trovato nessun telefono, email o link per prenotare. Come dovrebbero contattarla i visitatori?",
  "ask.question.site_language": "Le sue pagine pubbliche usano pi\xF9 di una lingua. Quale lingua dovrebbe usare il suo site?",
  "ask.question.fact_conflict_business.phone": "Le sue pagine pubbliche riportano valori diversi per il suo numero di telefono. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_business.email": "Le sue pagine pubbliche riportano valori diversi per il suo indirizzo email. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_business.address": "Le sue pagine pubbliche riportano valori diversi per il suo indirizzo. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_business.hours": "Le sue pagine pubbliche riportano valori diversi per i suoi orari di apertura. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_business.link": "Le sue pagine pubbliche riportano valori diversi per il suo link per prenotare o per il contatto. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_business.name": "Le sue pagine pubbliche riportano valori diversi per il nome della sua attivit\xE0. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_business.price": "Le sue pagine pubbliche riportano valori diversi per il suo prezzo. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_item.phone": "Le sue pagine pubbliche riportano valori diversi per il numero di telefono di {item}. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_item.email": "Le sue pagine pubbliche riportano valori diversi per l\u2019indirizzo email di {item}. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_item.address": "Le sue pagine pubbliche riportano valori diversi per l\u2019indirizzo di {item}. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_item.hours": "Le sue pagine pubbliche riportano valori diversi per gli orari di apertura di {item}. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_item.link": "Le sue pagine pubbliche riportano valori diversi per il link per prenotare o per il contatto di {item}. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_item.name": "Le sue pagine pubbliche riportano valori diversi per il nome dell\u2019attivit\xE0 di {item}. Qual \xE8 quello giusto?",
  "ask.question.fact_conflict_item.price": "Le sue pagine pubbliche riportano valori diversi per il prezzo di {item}. Qual \xE8 quello giusto?",
  "ask.choice.contact_method_phone": "Un numero di telefono",
  "ask.choice.contact_method_email": "Un indirizzo email",
  "ask.choice.contact_method_link": "Un link per prenotare o per il contatto",
  "ask.from": "Da {sources}",
  "ask.and": "{first} e {last}",
  "ask.source.website": "Sito web",
  "ask.source.google_maps": "Scheda Google Maps",
  "ask.source.owner_answer": "La sua risposta",
  "ask.source.instagram": "Profilo Instagram",
  "ask.source.facebook": "Pagina Facebook",
  "ask.source.tiktok": "Profilo TikTok",
  "ask.source.social": "Profilo social",
  "ask.question.place_choice": "Abbiamo trovato pi\xF9 di un luogo su Google Maps con questo nome. Qual \xE8 il suo?",
  "ask.choice.place_choice_none": "Nessuno di questi",
  "ask.choice.main_button_book": "Prenota online",
  "ask.choice.main_button_call": "Ci chiami",
  "ask.choice.main_button_email": "Ci scriva un\u2019email",
  "ask.choice.main_button_message": "Ci invii un messaggio",
  "ask.choice.main_button_visit": "Venga a trovarci",
  "ask.choice.main_button_contact": "Ci contatti",
  "ask.choice.main_button_book_short": "Prenota",
  "ask.choice.main_button_call_short": "Chiama",
  "ask.choice.main_button_email_short": "Email",
  "ask.choice.main_button_message_short": "Messaggio",
  "ask.choice.main_button_visit_short": "Visita",
  "ask.choice.main_button_contact_short": "Contatto",
  "ask.choice.main_button_text": "Testo del pulsante: {text}",
  "ask.source.listing": "Scheda di una directory",
  "plan.source.listing": "Scheda di una directory",
  "links.reading": "{name}: lettura in corso",
  "links.choice": "{name}: serve la sua scelta",
  "links.failed": "{name}: non \xE8 stato possibile leggerlo",
  "links.failedWhy": "{name}: non \xE8 stato possibile leggerlo ({reason})",
  "links.read": "{name}: letto",
  "links.readNothing": "{name}: letto, ma non sono state trovate informazioni sull\u2019attivit\xE0",
  "links.readPicturesLost": "{name}: letto, ma non \xE8 stato possibile scaricare le immagini",
  "links.readPicturesNotKept": "{name}: letto, ma non \xE8 stato possibile conservare le immagini",
  "links.facts.one": "{count} informazione",
  "links.facts.other": "{count} informazioni",
  "links.pictures.one": "{count} immagine",
  "links.pictures.other": "{count} immagini",
  "links.pictures.none": "Nessuna immagine",
  "links.pictures.someLost": "Non \xE8 stato possibile scaricarne altre {count}",
  "tool.working.research": "Lettura dei suoi link",
  "tool.working.about": "Lettura delle informazioni sulla sua attivit\xE0",
  "tool.working.templates": "Ricerca di design per il suo site",
  "tool.working.build": "Creazione del suo site",
  "tool.working.startOver": "Si ricomincia da capo",
  "tool.waiting.place": "In attesa che scelga la sua sede",
  "links.pictures.foundSome": "{count} immagini trovate, {usable} utilizzabili",
  "links.pictures.foundNotOwn.one": "{count} immagine trovata, non pubblicata dall\u2019attivit\xE0",
  "links.pictures.foundNotOwn.other": "{count} immagini trovate, nessuna pubblicata dall\u2019attivit\xE0",
  "links.pictures.foundNone.one": "{count} immagine trovata, non utilizzabile",
  "links.pictures.foundNone.other": "{count} immagini trovate, nessuna utilizzabile",
  "say.researchRead": "Ho letto ci\xF2 che mi ha fornito sulla sua attivit\xE0."
};

// ../../locale/tracy-locales/nl/tracy-build-chat.json
var tracy_build_chat_default5 = {
  "cancelled.body": "U hebt dit bouwen geannuleerd. Uw plan en uw antwoorden blijven bewaard.",
  "cancelled.title": "Het bouwen is geannuleerd",
  "handoff.earlier": "Eerder gesprek",
  "handoff.tooLong": "Uw site is klaar, maar dit gesprek is te lang om naar de chat van de site te verplaatsen. Open uw site vanuit uw lijst met sites.",
  "plan.allSources": "Alle bronnen",
  "plan.and": "{first} en {last}",
  "plan.assumptions": "Wat ik heb aangenomen",
  "plan.cancel": "Annuleren",
  "plan.changed": "Gewijzigd",
  "plan.count.gallery.one": "{count} foto",
  "plan.count.gallery.other": "{count} foto\u2019s",
  "plan.count.item.one": "{count} item",
  "plan.count.item.other": "{count} items",
  "plan.count.person.one": "{count} persoon",
  "plan.count.person.other": "{count} personen",
  "plan.count.quote.one": "{count} beoordeling",
  "plan.count.quote.other": "{count} beoordelingen",
  "plan.count.service.one": "{count} dienst",
  "plan.count.service.other": "{count} diensten",
  "plan.design": "Ontwerp: {name}",
  "plan.edit": "{label} bewerken: {value}",
  "plan.facts": "Bedrijfsgegevens",
  "plan.fromServices": "Uit Diensten",
  "plan.language": "Taal van de site",
  "plan.leftOut": "Weggelaten",
  "plan.leftOut.showAll": "Alles tonen ({count})",
  "plan.leftOut.showFewer": "Minder tonen",
  "plan.revised.changed": "Wat er is veranderd",
  "plan.revised.notDone": "Niet gedaan",
  "plan.revised.dismiss": "Deze notitie verbergen",
  "plan.revised.edited": "{label} is nu {value}.",
  "plan.revised.line.owner_value_saved": "Uw antwoord is opgeslagen: {label}, {value}.",
  "plan.revised.line.item_renamed": "{from} heet nu {to}.",
  "plan.revised.line.item_taken_off": "{label} staat niet op uw site, zoals u vroeg.",
  "plan.revised.line.page-removed": "De pagina {name} is verwijderd.",
  "plan.revised.line.page-added": "De pagina {name} is toegevoegd.",
  "plan.revised.line.page-renamed": "De pagina {from} heet nu {to}.",
  "plan.revised.line.page-order": "De pagina\u2019s staan nu in deze volgorde: {names}.",
  "plan.revised.line.block-removed": "De sectie {section} is verwijderd van de pagina {page}.",
  "plan.revised.line.block-added": "De sectie {section} is toegevoegd aan de pagina {page}.",
  "plan.revised.line.block-data.count": "De sectie {section} van de pagina {page} toont nu {count} onderdelen.",
  "plan.revised.line.block-data": "De sectie {section} van de pagina {page} toont nu {names}.",
  "plan.revised.line.block-order": "De secties van de pagina {page} staan in een nieuwe volgorde.",
  "plan.revised.line.data-off": "Niet meer getoond: {names}.",
  "plan.revised.line.data-on": "Nu getoond: {names}.",
  "plan.revised.line.data-again": "Weer getoond: {names}, die u eerder had weggehaald.",
  "plan.revised.line.pictures-own.one": "Het plan gebruikt nu {count} foto van u.",
  "plan.revised.line.pictures-own.other": "Het plan gebruikt nu {count} foto\u2019s van u.",
  "plan.revised.line.pictures-drawn.none": "Tracy maakt nu geen afbeeldingen.",
  "plan.revised.line.pictures-drawn.one": "Er wordt ongeveer {count} afbeelding gemaakt waar u geen geschikte foto hebt.",
  "plan.revised.line.pictures-drawn.other": "Er worden ongeveer {count} afbeeldingen gemaakt waar u geen geschikte foto hebt.",
  "plan.revised.notDone.nothing_to_change.what": "Uw verzoek",
  "plan.revised.notDone.nothing_to_change.why": "Niets in het plan kon het volgen, dus het plan blijft ongewijzigd.",
  "plan.revised.notDone.page_already_on_plan.why": "Het plan heeft deze pagina al.",
  "plan.revised.notDone.section_not_filled.what": "Een nieuwe sectie",
  "plan.revised.notDone.section_not_filled.why": "Er is niets van uw bedrijf om haar te vullen, dus ze wordt niet toegevoegd.",
  "plan.revised.notDone.item_rename_refused.what": "{name} hernoemen",
  "plan.undo.chatChange": "Ongedaan maken draait alleen wijzigingen op deze kaart terug. Wilt u een wijziging terugdraaien die u in de chat vroeg, vraag het dan in de chat.",
  "plan.fact.business.name": "Bedrijfsnaam",
  "plan.fact.business.founded_year": "Opgericht",
  "plan.fact.business.tagline": "Slogan",
  "plan.fact.business.summary": "Over ons",
  "plan.fact.contact.phone": "Telefoon",
  "plan.fact.contact.email": "Email",
  "plan.fact.contact.address": "Adres",
  "plan.fact.contact.hours": "Openingstijden",
  "plan.fact.contact.cta_url": "Link om te boeken",
  "plan.fact.contact.cta_label": "Hoofdknop",
  "plan.fact.contact.social_url": "Link naar sociale media",
  "plan.source.website": "Website",
  "plan.source.google": "Vermelding op Google Maps",
  "plan.source.social": "Profiel op sociale media",
  "plan.source.answer": "Uw antwoord",
  "plan.look": "Uiterlijk",
  "plan.look.accent": "Hoofdkleur",
  "plan.look.accentDark": "Hoofdkleur op donkere pagina\u2019s",
  "plan.look.accentLight": "Hoofdkleur op lichte pagina\u2019s",
  "plan.look.logoDark": "Logo op donkere pagina\u2019s",
  "plan.look.logoDrawn": "Een logo dat Tracy tekende, gebaseerd op uw logo",
  "plan.look.logoLight": "Logo op lichte pagina\u2019s",
  "plan.look.logoOwn": "Uw logo, van {source}",
  "plan.look.logoText": "Uw bedrijfsnaam als tekst",
  "plan.look.template": "Ontwerp",
  "plan.newValue": "Nieuwe waarde voor {label}",
  "plan.pages": "Pagina\u2019s ({count})",
  "plan.pictures": "Afbeeldingen",
  "plan.pictures.drawn": "Afbeeldingen die Tracy maakt",
  "plan.pictures.drawnNone": "Geen",
  "plan.pictures.drawnValue.one": "Ongeveer {count} afbeelding",
  "plan.pictures.drawnValue.other": "Ongeveer {count} afbeeldingen",
  "plan.pictures.own": "Uw foto\u2019s",
  "plan.pictures.ownValue.one": "{count} foto van {from}",
  "plan.pictures.ownValue.other": "{count} foto\u2019s van {from}",
  "plan.save": "Opslaan",
  "plan.saveFailed": "Uw wijziging is niet opgeslagen. Probeer het opnieuw.",
  "plan.locked": "Uw site wordt volgens dit plan gebouwd, dus het plan kan pas veranderen als het bouwen klaar is.",
  "plan.stale": "Het plan is intussen veranderd, dus uw wijziging is niet opgeslagen. De kaart toont nu het nieuwste plan.",
  "plan.busy": "Ik werk nog aan uw plan, dus het kan nu niet veranderen. Breng uw wijziging opnieuw aan als ik klaar ben.",
  "plan.tooLarge": "Deze wijziging is te lang om op te slaan. Maak haar korter en probeer het opnieuw.",
  "plan.sections.one": "{count} sectie",
  "plan.sections.other": "{count} secties",
  "plan.service": "Dienst {n}",
  "plan.services": "Diensten ({count})",
  "plan.title": "Site-plan voor {name}",
  "plan.undo": "Ongedaan maken",
  "plan.undoLabel": "Laatste wijziging ongedaan maken",
  "progress.clock": "Verstreken tijd",
  "progress.done": "{count} voltooid",
  "progress.failed": "{count} mislukt",
  "progress.note.failed": "Mislukt",
  "progress.note.failedTwice": "Twee keer mislukt",
  "progress.note.notStarted": "Niet gestart",
  "progress.pending": "{count} in afwachting",
  "progress.running": "{count} bezig",
  "progress.state.done": "Voltooid",
  "progress.state.failed": "Mislukt",
  "progress.state.pending": "In afwachting",
  "progress.state.running": "Bezig",
  "progress.title.build": "Uw site wordt gebouwd",
  "progress.title.partial": "Uw site wordt bijgewerkt",
  "rebuild.changed": "Uw plan is gewijzigd sinds uw site is gebouwd. Alleen wat u hebt gewijzigd wordt opnieuw gebouwd.",
  "rebuild.failed": "Uw verzoek is niet verzonden. Probeer het opnieuw.",
  "rebuild.heldFiles": "Files die nog op uw site staan",
  "rebuild.heldFile.person-photo": "Foto {n}: een persoon die u priv\xE9 wilt houden",
  "rebuild.say.abandon_done": "De onvoltooide update is ongedaan gemaakt. Uw site toont wat hij eerder toonde.",
  "rebuild.say.held_file_left_on_site": "Een foto van een persoon die u priv\xE9 wilt houden staat nog als file op uw site, hoewel geen pagina hem toont. Ik kan nog geen files verwijderen. Het team kan hem voor u verwijderen.",
  "rebuild.say.nothing_to_update": "Uw site toont dit plan al, dus er is niets bij te werken.",
  "rebuild.say.previous_build_doors_missing": "Ik kan uw site nog niet vanuit deze chat bijwerken, dus uw site is ongewijzigd. Het team kan zien wat er is gebeurd.",
  "rebuild.say.previous_build_not_current": "Uw site is gewijzigd terwijl deze update werd voorbereid, dus ik ben gestopt voordat er iets werd gewijzigd. Uw site is ongewijzigd. U kunt hem opnieuw bijwerken, en ik begin bij wat hij nu toont.",
  "rebuild.say.previous_build_unreadable": "Ik kon niet lezen hoe uw site de laatste keer is gebouwd, dus ik ben gestopt voordat er iets werd gewijzigd. Uw site is ongewijzigd. Het team kan zien wat er is gebeurd.",
  "rebuild.say.previous_run_unfinished": "Een eerdere update van uw site is niet voltooid, dus ik kan nog geen nieuwe starten. U kunt de onvoltooide update ongedaan maken, waardoor uw site weer wordt zoals hij daarvoor was, en daarna opnieuw bijwerken.",
  "rebuild.say.restore_done": "Uw site is terug naar de vorige versie.",
  "rebuild.say.restore_needs_removal": "Een deel van de laatste update kan ik vanuit deze chat niet terugdraaien, dus ik ben niet teruggegaan naar de vorige versie. Uw site blijft zoals hij nu is. Het team kan zien wat er is gebeurd.",
  "rebuild.say.restore_shows_held_text": "De vorige versie toont iets dat u priv\xE9 wilt houden, dus ik ben er niet naar teruggegaan. Uw site blijft zoals hij nu is.",
  "rebuild.say.restore_site_changed": "Een deel van uw site is sinds de laatste update buiten Tracy bewerkt, dus ik ben niet teruggegaan naar de vorige versie. Uw bewerking blijft behouden en uw site blijft zoals hij nu is.",
  "rebuild.say.revision_needs_removal": "Uw wijziging haalt een deel van uw site weg dat ik vanuit deze chat niet kan weghalen, dus ik ben gestopt voordat er iets veranderde. Uw site is ongewijzigd. Het team kan zien wat u hebt gevraagd.",
  "rebuild.say.site_already_built": "Uw site is al gebouwd, dus ik heb hem niet opnieuw vanaf het begin gebouwd. Wijzig het plan en werk uw site bij, dan wordt alleen wat u hebt gewijzigd opnieuw gebouwd.",
  "rebuild.say.site_changed_outside": "Een deel van uw site is sinds de bouw buiten Tracy bewerkt, dus ik ben gestopt voordat ik die bewerking zou overschrijven. Uw bewerking blijft behouden. Het team kan zien welk deel het was.",
  "rebuild.say.update_done": "Uw site is bijgewerkt. Alleen de delen die uw wijziging raakte zijn opnieuw gebouwd, de rest is zoals het was.",
  "rebuild.say.write_record_stale": "Deze update is verward geraakt met een eerdere, dus ik ben gestopt voordat er iets werd gewijzigd. Uw site is ongewijzigd. Het team kan zien wat er is gebeurd.",
  "rebuild.restore": "Restore van de vorige versie",
  "rebuild.title": "Uw site",
  "rebuild.undo": "Onvoltooide update ongedaan maken",
  "rebuild.update": "Mijn site bijwerken",
  "retry.button": "Opnieuw proberen",
  "review.failed": "Uw antwoord is niet verzonden. Probeer het opnieuw.",
  "review.question": "Dit plan goedkeuren?",
  "review.approve": "Goedkeuren",
  "review.change": "Plan wijzigen",
  "review.say": "Of beschrijf de wijziging die u wilt",
  "review.summary": "{name}: {pages}, {services}",
  "review.summary.one": "{name}: {part}",
  "review.pages.one": "{count} pagina",
  "review.pages.other": "{count} pagina's",
  "stopped.kept.none": "Bewaard: uw plan en uw antwoorden.",
  "stopped.kept.one": "Bewaard: uw plan, uw antwoorden en de geschreven pagina.",
  "stopped.kept.other": "Bewaard: uw plan, uw antwoorden en de {count} geschreven pagina\u2019s.",
  "stopped.notified": "Het Tracy-team is op de hoogte gebracht en gaat ermee aan de slag. U hoeft niets te doen.",
  "stopped.notStarted": "Uw site kon niet worden gestart, maar uw plan blijft bewaard en u kunt het later opnieuw goedkeuren.",
  "stopped.notStarted.design": "Dit ontwerp kan nog niet worden gebouwd, dus uw site is niet gestart, maar uw plan blijft bewaard en u kunt het later opnieuw goedkeuren.",
  "stopped.once": "Ik kon \u201E{step}\u201D niet afronden, dus ik ben gestopt in plaats van u een onaf site te tonen.",
  "stopped.title": "Uw site is nog niet klaar",
  "stopped.twice": "Ik kon \u201E{step}\u201D na twee pogingen niet afronden, dus ik ben gestopt in plaats van u een onaf site te tonen.",
  "stopped.unchanged": "Uw huidige site is niet gewijzigd.",
  "template.chosen": "Gekozen: {name}",
  "template.continue": "Doorgaan",
  "template.later": "U kunt het ontwerp later wijzigen.",
  "template.list": "Ontwerpen voor uw site",
  "template.none": "Er is nog geen kant-en-klaar ontwerp dat bij uw bedrijf past.",
  "template.noneNext": "U kunt uw site nog steeds maken via de pagina Site toevoegen.",
  "template.openAddSite": "Site toevoegen openen",
  "template.picked": "Ik heb {name} gekozen.",
  "template.recommended": "Aanbevolen",
  "template.saveFailed": "Uw keuze is niet opgeslagen. Probeer het opnieuw.",
  "template.sendFailed": "Uw keuze is opgeslagen, maar is niet in de chat aangekomen. Klik op Doorgaan om hem opnieuw te sturen.",
  "template.use": "{name} gebruiken",
  "tool.edit": "Uw site-plan is bijgewerkt",
  "tool.plan": "Uw site-plan is opgesteld",
  "tool.research.none": "Onderzoek naar uw bedrijf gedaan",
  "tool.research.one": "{count} bron gelezen",
  "tool.research.other": "{count} bronnen gelezen",
  "tool.stopped": "Deze stap kon niet worden voltooid",
  "tool.templates": "Ontwerpen voor uw site gevonden",
  "tool.working": "Uw site-plan wordt opgesteld",
  "plan.revised.notDone.owner_value_not_shown.what": "{label} op de site tonen",
  "plan.revised.notDone.owner_value_not_shown.why": "Uw antwoord is opgeslagen, maar uw ontwerp heeft geen plek die het toont.",
  "plan.revised.names.counted": "{count} {plural}",
  "plan.revised.notDone.reason.no_recipe": "Uw ontwerp heeft geen pagina van deze soort.",
  "plan.revised.notDone.reason.no_data": "Niets van uw bedrijf vult deze sectie.",
  "plan.revised.notDone.reason.fact_missing": "Uw bedrijf heeft dit gegeven niet.",
  "plan.revised.notDone.reason.kept_private": "U houdt dit van uw site af.",
  "plan.revised.notDone.reason.outside_plan": "Een wijzigingsverzoek kan dit niet veranderen. Wijzig het op de plankaart.",
  "plan.leftOut.reason.no_email_for_form": "Uw bedrijf heeft geen email-adres waar het aanmeldformulier antwoorden naartoe kan sturen.",
  "plan.leftOut.reason.no_booking_link": "U hebt geen link om te boeken of contact op te nemen die de knop kan openen.",
  "plan.leftOut.reason.no_items_to_show": "U hebt nog niets wat deze sectie kan tonen.",
  "plan.leftOut.reason.shown_in_other_sections": "Wat deze sectie zou tonen, staat al in andere secties van uw plan.",
  "plan.leftOut.reason.owner_withheld": "U hebt gevraagd dit van de site af te houden.",
  "plan.leftOut.reason.left_out_neutral.page": "Deze pagina hoort niet bij uw plan.",
  "plan.leftOut.reason.left_out_neutral.block": "Deze sectie hoort niet bij uw plan.",
  "plan.leftOut.reason.left_out_neutral.item": "Dit wordt niet getoond in uw plan.",
  "plan.leftOut.reason.no_gallery_room.one": "Geen enkele galerij heeft ruimte voor deze foto. Hij blijft bij uw foto\u2019s en kan elders op de site worden gebruikt.",
  "plan.leftOut.reason.no_gallery_room.other": "Geen enkele galerij heeft ruimte voor deze {count} foto\u2019s. Ze blijven bij uw foto\u2019s en kunnen elders op de site worden gebruikt.",
  "plan.pictures.estimate.one": "Er wordt ongeveer {count} afbeelding gemaakt waar u geen geschikte foto hebt. Het uiteindelijke aantal hangt af van uw foto\u2019s.",
  "plan.pictures.estimate.other": "Er worden ongeveer {count} afbeeldingen gemaakt waar u geen geschikte foto hebt. Het uiteindelijke aantal hangt af van uw foto\u2019s.",
  "plan.logoSource.website": "Website",
  "plan.logoSource.google": "Vermelding op Google Maps",
  "plan.logoSource.instagram": "Instagram-profiel",
  "plan.logoSource.facebook": "Facebook-pagina",
  "plan.logoSource.tiktok": "TikTok-profiel",
  "plan.assumption.logo_drawn.new-symbol-drawn": "Tracy heeft een logo getekend op basis van uw logo: een nieuw symbool van uw vak naast uw bedrijfsnaam, gezet in het lettertype van de template. Het is niet uw logo-file. Keur het goed, of stuur ons uw logo om het te vervangen.",
  "plan.assumption.logo_drawn.symbol-cut-from-logo": "Tracy heeft een logo getekend op basis van uw logo: het symbool uit uw logo geknipt, naast uw bedrijfsnaam, gezet in het lettertype van de template. Het is niet uw logo-file. Keur het goed, of stuur ons uw logo om het te vervangen.",
  "plan.assumption.logo_drawn.name-set-in-template-font": "Tracy heeft een logo getekend op basis van uw logo: een teken naast uw bedrijfsnaam, gezet in het lettertype van de template. Het is niet uw logo-file. Keur het goed, of stuur ons uw logo om het te vervangen.",
  "plan.assumption.logo_made.found.icon": "Uw logo kon niet worden gebruikt zoals het is, dus heb ik een tijdelijk logo gemaakt: een eenvoudig pictogram van uw vak naast uw bedrijfsnaam. Stuur uw logo-file hier in de chat om het te vervangen.",
  "plan.assumption.logo_made.found.lettermark": "Uw logo kon niet worden gebruikt zoals het is, dus heb ik een tijdelijk logo gemaakt: uw initialen naast uw bedrijfsnaam. Stuur uw logo-file hier in de chat om het te vervangen.",
  "plan.assumption.logo_made.found.mark": "Uw logo kon niet worden gebruikt zoals het is, dus heb ik een tijdelijk logo gemaakt: een eenvoudig teken naast uw bedrijfsnaam. Stuur uw logo-file hier in de chat om het te vervangen.",
  "plan.assumption.logo_made.none.icon": "Er is geen logo gevonden, dus heb ik een tijdelijk logo gemaakt: een eenvoudig pictogram van uw vak naast uw bedrijfsnaam, in de hoofdkleur van het ontwerp. Stuur uw logo hier in de chat om het te vervangen.",
  "plan.assumption.logo_made.none.lettermark": "Er is geen logo gevonden, dus heb ik een tijdelijk logo gemaakt: uw initialen naast uw bedrijfsnaam, in de hoofdkleur van het ontwerp. Stuur uw logo hier in de chat om het te vervangen.",
  "plan.assumption.logo_made.none.mark": "Er is geen logo gevonden, dus heb ik een tijdelijk logo gemaakt: een eenvoudig teken naast uw bedrijfsnaam, in de hoofdkleur van het ontwerp. Stuur uw logo hier in de chat om het te vervangen.",
  "plan.hours.days": "{from} tot en met {to}",
  "plan.hours.time": "{from} tot {to}",
  "plan.hours.closed": "gesloten",
  "plan.hours.ranges": "{first} en {next}",
  "plan.hours.group": "{days}, {hours}",
  "plan.hours.groups": "{first}; {next}",
  "plan.section.header": "Menu",
  "plan.section.footer": "Voettekst",
  "plan.section.hero": "Openingsbeeld",
  "plan.section.page_header": "Paginakop",
  "plan.section.about": "Over ons",
  "plan.section.text": "Tekst",
  "plan.section.call_to_action": "Oproep tot actie",
  "plan.section.contact": "Contactgegevens",
  "plan.section.map": "Kaart",
  "plan.section.video": "Video",
  "plan.section.newsletter": "Nieuwsbrief",
  "plan.section.services": "Diensten",
  "plan.section.menu": "Menukaart",
  "plan.section.pricing": "Prijzen",
  "plan.section.schedule": "Rooster",
  "plan.section.team": "Team",
  "plan.section.stats": "Cijfers",
  "plan.section.steps": "Stappen",
  "plan.section.reviews": "Beoordelingen",
  "plan.section.claims": "Onderscheidingen",
  "plan.section.faq": "Vragen",
  "plan.section.events": "Evenementen",
  "plan.section.posts": "Artikelen",
  "plan.section.gallery": "Foto\u2019s",
  "rebuild.say.door_not_available": "Uw site laat mij deze wijziging niet vanuit deze chat doen, dus ik heb de update gestopt. Het team kan zien welk deel het was.",
  "rebuild.say.sheets_unreadable": "Ik kon de stylesheets van uw site niet lezen, dus ik ben gestopt voordat de kleuren veranderden. Het team kan zien wat er is gebeurd.",
  "ask.question.main_button": "Waartoe moet de hoofdknop op uw site bezoekers uitnodigen?",
  "ask.question.contact_method": "We vonden geen telefoonnummer, email of link om te boeken. Hoe moeten bezoekers contact met u opnemen?",
  "ask.question.site_language": "Uw openbare pagina\u2019s gebruiken meer dan \xE9\xE9n taal. Welke taal moet uw site gebruiken?",
  "ask.question.fact_conflict_business.phone": "Uw openbare pagina\u2019s geven verschillende waarden voor uw telefoonnummer. Welke is juist?",
  "ask.question.fact_conflict_business.email": "Uw openbare pagina\u2019s geven verschillende waarden voor uw email-adres. Welke is juist?",
  "ask.question.fact_conflict_business.address": "Uw openbare pagina\u2019s geven verschillende waarden voor uw adres. Welke is juist?",
  "ask.question.fact_conflict_business.hours": "Uw openbare pagina\u2019s geven verschillende waarden voor uw openingstijden. Welke is juist?",
  "ask.question.fact_conflict_business.link": "Uw openbare pagina\u2019s geven verschillende waarden voor uw link om te boeken of contact op te nemen. Welke is juist?",
  "ask.question.fact_conflict_business.name": "Uw openbare pagina\u2019s geven verschillende waarden voor uw bedrijfsnaam. Welke is juist?",
  "ask.question.fact_conflict_business.price": "Uw openbare pagina\u2019s geven verschillende waarden voor uw prijs. Welke is juist?",
  "ask.question.fact_conflict_item.phone": "Uw openbare pagina\u2019s geven verschillende waarden voor het telefoonnummer van {item}. Welke is juist?",
  "ask.question.fact_conflict_item.email": "Uw openbare pagina\u2019s geven verschillende waarden voor het email-adres van {item}. Welke is juist?",
  "ask.question.fact_conflict_item.address": "Uw openbare pagina\u2019s geven verschillende waarden voor het adres van {item}. Welke is juist?",
  "ask.question.fact_conflict_item.hours": "Uw openbare pagina\u2019s geven verschillende waarden voor de openingstijden van {item}. Welke is juist?",
  "ask.question.fact_conflict_item.link": "Uw openbare pagina\u2019s geven verschillende waarden voor de link om te boeken of contact op te nemen van {item}. Welke is juist?",
  "ask.question.fact_conflict_item.name": "Uw openbare pagina\u2019s geven verschillende waarden voor de bedrijfsnaam van {item}. Welke is juist?",
  "ask.question.fact_conflict_item.price": "Uw openbare pagina\u2019s geven verschillende waarden voor de prijs van {item}. Welke is juist?",
  "ask.choice.contact_method_phone": "Een telefoonnummer",
  "ask.choice.contact_method_email": "Een email-adres",
  "ask.choice.contact_method_link": "Een link om te boeken of contact op te nemen",
  "ask.from": "Van {sources}",
  "ask.and": "{first} en {last}",
  "ask.source.website": "Website",
  "ask.source.google_maps": "Vermelding op Google Maps",
  "ask.source.owner_answer": "Uw antwoord",
  "ask.source.instagram": "Instagram-profiel",
  "ask.source.facebook": "Facebook-pagina",
  "ask.source.tiktok": "TikTok-profiel",
  "ask.source.social": "Profiel op sociale media",
  "ask.question.place_choice": "We hebben op Google Maps meer dan \xE9\xE9n plaats met deze naam gevonden. Welke is van u?",
  "ask.choice.place_choice_none": "Geen van deze",
  "ask.choice.main_button_book": "Online boeken",
  "ask.choice.main_button_call": "Bel ons",
  "ask.choice.main_button_email": "Mail ons",
  "ask.choice.main_button_message": "Stuur ons een bericht",
  "ask.choice.main_button_visit": "Bezoek ons",
  "ask.choice.main_button_contact": "Neem contact op",
  "ask.choice.main_button_book_short": "Boeken",
  "ask.choice.main_button_call_short": "Bellen",
  "ask.choice.main_button_email_short": "E-mail",
  "ask.choice.main_button_message_short": "Bericht",
  "ask.choice.main_button_visit_short": "Bezoeken",
  "ask.choice.main_button_contact_short": "Contact",
  "ask.choice.main_button_text": "Tekst op de knop: {text}",
  "ask.source.listing": "Vermelding in een bedrijvengids",
  "plan.source.listing": "Vermelding in een bedrijvengids",
  "links.reading": "{name}: wordt gelezen",
  "links.choice": "{name}: uw keuze is nodig",
  "links.failed": "{name}: kon niet worden gelezen",
  "links.failedWhy": "{name}: kon niet worden gelezen ({reason})",
  "links.read": "{name}: gelezen",
  "links.readNothing": "{name}: gelezen, maar er is niets over het bedrijf gevonden",
  "links.readPicturesLost": "{name}: gelezen, maar de afbeeldingen konden niet worden gedownload",
  "links.readPicturesNotKept": "{name}: gelezen, maar de afbeeldingen konden niet worden bewaard",
  "links.facts.one": "{count} gegeven",
  "links.facts.other": "{count} gegevens",
  "links.pictures.one": "{count} afbeelding",
  "links.pictures.other": "{count} afbeeldingen",
  "links.pictures.none": "Geen afbeeldingen",
  "links.pictures.someLost": "{count} andere konden niet worden gedownload",
  "tool.working.research": "Uw links worden gelezen",
  "tool.working.about": "Informatie over uw bedrijf wordt gelezen",
  "tool.working.templates": "Ontwerpen voor uw site worden gezocht",
  "tool.working.build": "Uw site wordt gebouwd",
  "tool.working.startOver": "Opnieuw beginnen",
  "tool.waiting.place": "Wacht tot u uw locatie kiest",
  "links.pictures.foundSome": "{count} afbeeldingen gevonden, {usable} bruikbaar",
  "links.pictures.foundNotOwn.one": "{count} afbeelding gevonden, niet door het bedrijf geplaatst",
  "links.pictures.foundNotOwn.other": "{count} afbeeldingen gevonden, geen enkele door het bedrijf geplaatst",
  "links.pictures.foundNone.one": "{count} afbeelding gevonden, niet bruikbaar",
  "links.pictures.foundNone.other": "{count} afbeeldingen gevonden, geen enkele bruikbaar",
  "say.researchRead": "Ik heb gelezen wat u mij over uw bedrijf hebt gegeven."
};

// ../../locale/tracy-locales/zh/tracy-build-chat.json
var tracy_build_chat_default6 = {
  "cancelled.body": "\u4F60\u5DF2\u53D6\u6D88\u672C\u6B21\u521B\u5EFA\u3002\u4F60\u7684\u8BA1\u5212\u548C\u4F60\u7684\u56DE\u7B54\u4F1A\u4FDD\u7559\u3002",
  "cancelled.title": "\u521B\u5EFA\u5DF2\u53D6\u6D88",
  "handoff.earlier": "\u4E4B\u524D\u7684\u5BF9\u8BDD",
  "handoff.tooLong": "\u4F60\u7684 site \u5DF2\u7ECF\u5C31\u7EEA\uFF0C\u4F46\u8FD9\u6BB5\u5BF9\u8BDD\u592A\u957F\uFF0C\u65E0\u6CD5\u8F6C\u5230 site \u7684 chat\u3002\u8BF7\u4ECE\u4F60\u7684 site \u5217\u8868\u4E2D\u6253\u5F00\u4F60\u7684 site\u3002",
  "plan.allSources": "\u6240\u6709\u6765\u6E90",
  "plan.and": "{first}\u548C{last}",
  "plan.assumptions": "\u6211\u6240\u505A\u7684\u5047\u8BBE",
  "plan.cancel": "\u53D6\u6D88",
  "plan.changed": "\u5DF2\u66F4\u6539",
  "plan.count.gallery.one": "{count} \u5F20\u7167\u7247",
  "plan.count.gallery.other": "{count} \u5F20\u7167\u7247",
  "plan.count.item.one": "{count} \u9879",
  "plan.count.item.other": "{count} \u9879",
  "plan.count.person.one": "{count} \u4F4D\u6210\u5458",
  "plan.count.person.other": "{count} \u4F4D\u6210\u5458",
  "plan.count.quote.one": "{count} \u6761\u8BC4\u4EF7",
  "plan.count.quote.other": "{count} \u6761\u8BC4\u4EF7",
  "plan.count.service.one": "{count} \u9879\u670D\u52A1",
  "plan.count.service.other": "{count} \u9879\u670D\u52A1",
  "plan.design": "\u8BBE\u8BA1\uFF1A{name}",
  "plan.edit": "\u7F16\u8F91{label}\uFF1A{value}",
  "plan.facts": "\u4E1A\u52A1\u4FE1\u606F",
  "plan.fromServices": "\u6765\u81EA\u670D\u52A1",
  "plan.language": "site \u8BED\u8A00",
  "plan.leftOut": "\u672A\u5305\u542B",
  "plan.leftOut.showAll": "\u663E\u793A\u5168\u90E8 ({count})",
  "plan.leftOut.showFewer": "\u6536\u8D77",
  "plan.revised.changed": "\u5DF2\u66F4\u6539\u7684\u5185\u5BB9",
  "plan.revised.notDone": "\u672A\u5B8C\u6210",
  "plan.revised.dismiss": "\u9690\u85CF\u6B64\u8BF4\u660E",
  "plan.revised.edited": "{label}\u73B0\u5728\u662F {value}\u3002",
  "plan.revised.line.owner_value_saved": "\u5DF2\u4FDD\u5B58\u4F60\u7684\u56DE\u7B54\uFF1A{label}\uFF0C{value}\u3002",
  "plan.revised.line.item_renamed": "{from} \u73B0\u5728\u53EB {to}\u3002",
  "plan.revised.line.item_taken_off": "\u6309\u7167\u4F60\u7684\u8981\u6C42\uFF0C{label} \u4E0D\u4F1A\u51FA\u73B0\u5728\u4F60\u7684 site \u4E0A\u3002",
  "plan.revised.line.page-removed": "\u5DF2\u5220\u9664 {name} \u9875\u9762\u3002",
  "plan.revised.line.page-added": "\u5DF2\u6DFB\u52A0 {name} \u9875\u9762\u3002",
  "plan.revised.line.page-renamed": "{from} \u9875\u9762\u73B0\u5728\u53EB {to}\u3002",
  "plan.revised.line.page-order": "\u9875\u9762\u73B0\u5728\u7684\u987A\u5E8F\u662F\uFF1A{names}\u3002",
  "plan.revised.line.block-removed": "\u5DF2\u4ECE {page} \u9875\u9762\u5220\u9664 {section} \u677F\u5757\u3002",
  "plan.revised.line.block-added": "\u5DF2\u5728 {page} \u9875\u9762\u6DFB\u52A0 {section} \u677F\u5757\u3002",
  "plan.revised.line.block-data.count": "{page} \u9875\u9762\u7684 {section} \u677F\u5757\u73B0\u5728\u663E\u793A {count} \u9879\u5185\u5BB9\u3002",
  "plan.revised.line.block-data": "{page} \u9875\u9762\u7684 {section} \u677F\u5757\u73B0\u5728\u663E\u793A {names}\u3002",
  "plan.revised.line.block-order": "{page} \u9875\u9762\u7684\u677F\u5757\u5DF2\u91CD\u65B0\u6392\u5E8F\u3002",
  "plan.revised.line.data-off": "\u4E0D\u518D\u663E\u793A\uFF1A{names}\u3002",
  "plan.revised.line.data-on": "\u73B0\u5728\u663E\u793A\uFF1A{names}\u3002",
  "plan.revised.line.data-again": "\u91CD\u65B0\u663E\u793A\uFF1A{names}\uFF0C\u8FD9\u4E9B\u662F\u4F60\u4E4B\u524D\u79FB\u9664\u7684\u5185\u5BB9\u3002",
  "plan.revised.line.pictures-own.one": "\u8BA1\u5212\u73B0\u5728\u4F7F\u7528\u4F60\u7684 {count} \u5F20\u7167\u7247\u3002",
  "plan.revised.line.pictures-own.other": "\u8BA1\u5212\u73B0\u5728\u4F7F\u7528\u4F60\u7684 {count} \u5F20\u7167\u7247\u3002",
  "plan.revised.line.pictures-drawn.none": "Tracy \u73B0\u5728\u4E0D\u4F1A\u521B\u5EFA\u4EFB\u4F55\u56FE\u7247\u3002",
  "plan.revised.line.pictures-drawn.one": "\u5728\u4F60\u6CA1\u6709\u5408\u9002\u7167\u7247\u7684\u5730\u65B9\uFF0C\u5C06\u521B\u5EFA\u5927\u7EA6 {count} \u5F20\u56FE\u7247\u3002",
  "plan.revised.line.pictures-drawn.other": "\u5728\u4F60\u6CA1\u6709\u5408\u9002\u7167\u7247\u7684\u5730\u65B9\uFF0C\u5C06\u521B\u5EFA\u5927\u7EA6 {count} \u5F20\u56FE\u7247\u3002",
  "plan.revised.notDone.nothing_to_change.what": "\u4F60\u7684\u8BF7\u6C42",
  "plan.revised.notDone.nothing_to_change.why": "\u8BA1\u5212\u4E2D\u6CA1\u6709\u5185\u5BB9\u53EF\u4EE5\u6309\u6B64\u4FEE\u6539\uFF0C\u6240\u4EE5\u8BA1\u5212\u4FDD\u6301\u4E0D\u53D8\u3002",
  "plan.revised.notDone.page_already_on_plan.why": "\u8BA1\u5212\u4E2D\u5DF2\u7ECF\u6709\u8FD9\u4E2A\u9875\u9762\u3002",
  "plan.revised.notDone.section_not_filled.what": "\u4E00\u4E2A\u65B0\u677F\u5757",
  "plan.revised.notDone.section_not_filled.why": "\u6CA1\u6709\u4F60\u4E1A\u52A1\u7684\u5185\u5BB9\u53EF\u4EE5\u586B\u5145\u5B83\uFF0C\u6240\u4EE5\u6CA1\u6709\u6DFB\u52A0\u3002",
  "plan.revised.notDone.item_rename_refused.what": "\u91CD\u547D\u540D {name}",
  "plan.undo.chatChange": "\u64A4\u9500\u53EA\u80FD\u64A4\u56DE\u5728\u6B64\u5361\u7247\u4E0A\u505A\u7684\u4FEE\u6539\u3002\u8981\u64A4\u56DE\u4F60\u5728 chat \u4E2D\u8981\u6C42\u7684\u4FEE\u6539\uFF0C\u8BF7\u5728 chat \u4E2D\u63D0\u51FA\u3002",
  "plan.fact.business.name": "\u5546\u5BB6\u540D\u79F0",
  "plan.fact.business.founded_year": "\u6210\u7ACB\u5E74\u4EFD",
  "plan.fact.business.tagline": "\u6807\u8BED",
  "plan.fact.business.summary": "\u7B80\u4ECB",
  "plan.fact.contact.phone": "\u7535\u8BDD",
  "plan.fact.contact.email": "email",
  "plan.fact.contact.address": "\u5730\u5740",
  "plan.fact.contact.hours": "\u8425\u4E1A\u65F6\u95F4",
  "plan.fact.contact.cta_url": "\u9884\u8BA2 link",
  "plan.fact.contact.cta_label": "\u4E3B\u6309\u94AE",
  "plan.fact.contact.social_url": "\u793E\u4EA4\u5A92\u4F53 link",
  "plan.source.website": "\u7F51\u7AD9",
  "plan.source.google": "Google \u5730\u56FE\u5546\u5BB6\u9875\u9762",
  "plan.source.social": "\u793E\u4EA4\u5A92\u4F53\u4E3B\u9875",
  "plan.source.answer": "\u4F60\u7684\u56DE\u7B54",
  "plan.look": "\u5916\u89C2",
  "plan.look.accent": "\u4E3B\u8272",
  "plan.look.accentDark": "\u6DF1\u8272\u9875\u9762\u4E0A\u7684\u4E3B\u8272",
  "plan.look.accentLight": "\u6D45\u8272\u9875\u9762\u4E0A\u7684\u4E3B\u8272",
  "plan.look.logoDark": "\u6DF1\u8272\u9875\u9762\u4E0A\u7684 logo",
  "plan.look.logoDrawn": "Tracy \u6839\u636E\u4F60\u7684 logo \u7ED8\u5236\u7684 logo",
  "plan.look.logoLight": "\u6D45\u8272\u9875\u9762\u4E0A\u7684 logo",
  "plan.look.logoOwn": "\u4F60\u7684 logo\uFF0C\u6765\u81EA {source}",
  "plan.look.logoText": "\u4EE5\u6587\u5B57\u663E\u793A\u4F60\u7684\u4E1A\u52A1\u540D\u79F0",
  "plan.look.template": "\u8BBE\u8BA1",
  "plan.newValue": "{label}\u7684\u65B0\u503C",
  "plan.pages": "\u9875\u9762\uFF08{count}\uFF09",
  "plan.pictures": "\u56FE\u7247",
  "plan.pictures.drawn": "Tracy \u751F\u6210\u7684\u56FE\u7247",
  "plan.pictures.drawnNone": "\u65E0",
  "plan.pictures.drawnValue.one": "\u7EA6 {count} \u5F20\u56FE\u7247",
  "plan.pictures.drawnValue.other": "\u7EA6 {count} \u5F20\u56FE\u7247",
  "plan.pictures.own": "\u4F60\u7684\u7167\u7247",
  "plan.pictures.ownValue.one": "{count} \u5F20\u7167\u7247\uFF0C\u6765\u81EA {from}",
  "plan.pictures.ownValue.other": "{count} \u5F20\u7167\u7247\uFF0C\u6765\u81EA {from}",
  "plan.save": "\u4FDD\u5B58",
  "plan.saveFailed": "\u4F60\u7684\u66F4\u6539\u6CA1\u6709\u4FDD\u5B58\u3002\u8BF7\u91CD\u8BD5\u3002",
  "plan.locked": "\u4F60\u7684 site \u6B63\u5728\u6309\u8FD9\u4E2A\u8BA1\u5212\u521B\u5EFA\uFF0C\u521B\u5EFA\u7ED3\u675F\u524D\u8BA1\u5212\u4E0D\u80FD\u66F4\u6539\u3002",
  "plan.stale": "\u8BA1\u5212\u521A\u521A\u6709\u53D8\u5316\uFF0C\u6240\u4EE5\u4F60\u7684\u66F4\u6539\u6CA1\u6709\u4FDD\u5B58\u3002\u5361\u7247\u73B0\u5728\u663E\u793A\u6700\u65B0\u7684\u8BA1\u5212\u3002",
  "plan.busy": "\u6211\u8FD8\u5728\u5904\u7406\u4F60\u7684\u8BA1\u5212\uFF0C\u6240\u4EE5\u73B0\u5728\u4E0D\u80FD\u66F4\u6539\u3002\u7B49\u6211\u5B8C\u6210\u540E\u8BF7\u518D\u505A\u4E00\u6B21\u66F4\u6539\u3002",
  "plan.tooLarge": "\u8FD9\u9879\u66F4\u6539\u592A\u957F\uFF0C\u65E0\u6CD5\u4FDD\u5B58\u3002\u8BF7\u7F29\u77ED\u540E\u91CD\u8BD5\u3002",
  "plan.sections.one": "{count} \u4E2A\u677F\u5757",
  "plan.sections.other": "{count} \u4E2A\u677F\u5757",
  "plan.service": "\u670D\u52A1 {n}",
  "plan.services": "\u670D\u52A1\uFF08{count}\uFF09",
  "plan.title": "{name} \u7684 site \u8BA1\u5212",
  "plan.undo": "\u64A4\u9500",
  "plan.undoLabel": "\u64A4\u9500\u4E0A\u4E00\u6B21\u66F4\u6539",
  "progress.clock": "\u5DF2\u7528\u65F6\u95F4",
  "progress.done": "\u5DF2\u5B8C\u6210 {count} \u9879",
  "progress.failed": "\u5931\u8D25 {count} \u9879",
  "progress.note.failed": "\u5931\u8D25",
  "progress.note.failedTwice": "\u5931\u8D25\u4E24\u6B21",
  "progress.note.notStarted": "\u5C1A\u672A\u5F00\u59CB",
  "progress.pending": "\u7B49\u5F85\u4E2D {count} \u9879",
  "progress.running": "\u8FDB\u884C\u4E2D {count} \u9879",
  "progress.state.done": "\u5DF2\u5B8C\u6210",
  "progress.state.failed": "\u5931\u8D25",
  "progress.state.pending": "\u7B49\u5F85\u4E2D",
  "progress.state.running": "\u8FDB\u884C\u4E2D",
  "progress.title.build": "\u6B63\u5728\u521B\u5EFA\u4F60\u7684 site",
  "progress.title.partial": "\u6B63\u5728\u66F4\u65B0\u4F60\u7684 site",
  "rebuild.changed": "\u4F60\u7684 site \u5EFA\u597D\u540E\uFF0C\u8BA1\u5212\u6709\u4E86\u53D8\u5316\u3002\u53EA\u4F1A\u91CD\u5EFA\u4F60\u6539\u52A8\u7684\u90E8\u5206\u3002",
  "rebuild.failed": "\u4F60\u7684\u8BF7\u6C42\u6CA1\u6709\u53D1\u9001\u3002\u8BF7\u91CD\u8BD5\u3002",
  "rebuild.heldFiles": "\u4ECD\u5728\u4F60\u7684 site \u4E0A\u7684 file",
  "rebuild.heldFile.person-photo": "\u7167\u7247 {n}\uFF1A\u4F60\u8981\u6C42\u4FDD\u5BC6\u7684\u4E00\u4E2A\u4EBA",
  "rebuild.say.abandon_done": "\u672A\u5B8C\u6210\u7684\u66F4\u65B0\u5DF2\u64A4\u9500\u3002\u4F60\u7684 site \u663E\u793A\u7684\u662F\u66F4\u65B0\u4E4B\u524D\u7684\u5185\u5BB9\u3002",
  "rebuild.say.held_file_left_on_site": "\u4F60\u8981\u6C42\u4FDD\u5BC6\u7684\u4E00\u4E2A\u4EBA\u7684\u7167\u7247\u4ECD\u4EE5 file \u5F62\u5F0F\u5B58\u50A8\u5728\u4F60\u7684 site \u4E0A\uFF0C\u867D\u7136\u6CA1\u6709\u9875\u9762\u663E\u793A\u5B83\u3002\u6211\u6682\u65F6\u8FD8\u4E0D\u80FD\u5220\u9664 file\u3002\u56E2\u961F\u53EF\u4EE5\u5E2E\u4F60\u5220\u9664\u5B83\u3002",
  "rebuild.say.nothing_to_update": "\u4F60\u7684 site \u5DF2\u7ECF\u663E\u793A\u8FD9\u4E2A\u8BA1\u5212\uFF0C\u6240\u4EE5\u6CA1\u6709\u9700\u8981\u66F4\u65B0\u7684\u5185\u5BB9\u3002",
  "rebuild.say.previous_build_doors_missing": "\u6211\u6682\u65F6\u8FD8\u4E0D\u80FD\u4ECE\u8FD9\u4E2A chat \u66F4\u65B0\u4F60\u7684 site\uFF0C\u6240\u4EE5\u4F60\u7684 site \u6CA1\u6709\u53D8\u5316\u3002\u56E2\u961F\u53EF\u4EE5\u770B\u5230\u53D1\u751F\u4E86\u4EC0\u4E48\u3002",
  "rebuild.say.previous_build_not_current": "\u5728\u51C6\u5907\u8FD9\u6B21\u66F4\u65B0\u65F6\u4F60\u7684 site \u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u6240\u4EE5\u6211\u5728\u505A\u4EFB\u4F55\u6539\u52A8\u4E4B\u524D\u505C\u4E86\u4E0B\u6765\u3002\u4F60\u7684 site \u6CA1\u6709\u53D8\u5316\u3002\u4F60\u53EF\u4EE5\u518D\u6B21\u66F4\u65B0\uFF0C\u6211\u4F1A\u4ECE\u5B83\u73B0\u5728\u663E\u793A\u7684\u5185\u5BB9\u5F00\u59CB\u3002",
  "rebuild.say.previous_build_unreadable": "\u6211\u65E0\u6CD5\u8BFB\u53D6\u4F60\u7684 site \u4E0A\u6B21\u662F\u5982\u4F55\u5EFA\u6210\u7684\uFF0C\u6240\u4EE5\u6211\u5728\u505A\u4EFB\u4F55\u6539\u52A8\u4E4B\u524D\u505C\u4E86\u4E0B\u6765\u3002\u4F60\u7684 site \u6CA1\u6709\u53D8\u5316\u3002\u56E2\u961F\u53EF\u4EE5\u770B\u5230\u53D1\u751F\u4E86\u4EC0\u4E48\u3002",
  "rebuild.say.previous_run_unfinished": "\u4F60\u7684 site \u4E4B\u524D\u7684\u4E00\u6B21\u66F4\u65B0\u6CA1\u6709\u5B8C\u6210\uFF0C\u6240\u4EE5\u6211\u6682\u65F6\u8FD8\u4E0D\u80FD\u5F00\u59CB\u65B0\u7684\u66F4\u65B0\u3002\u4F60\u53EF\u4EE5\u64A4\u9500\u8FD9\u6B21\u672A\u5B8C\u6210\u7684\u66F4\u65B0\uFF0C\u8BA9\u4F60\u7684 site \u56DE\u5230\u5B83\u4E4B\u524D\u7684\u6837\u5B50\uFF0C\u7136\u540E\u518D\u66F4\u65B0\u3002",
  "rebuild.say.restore_done": "\u4F60\u7684 site \u5DF2\u6062\u590D\u5230\u4E0A\u4E00\u4E2A\u7248\u672C\u3002",
  "rebuild.say.restore_needs_removal": "\u4E0A\u4E00\u6B21\u66F4\u65B0\u4E2D\u6709\u4E00\u90E8\u5206\u65E0\u6CD5\u5728\u8FD9\u4E2A chat \u91CC\u64A4\u56DE\uFF0C\u6240\u4EE5\u6211\u6CA1\u6709\u56DE\u5230\u4E0A\u4E00\u4E2A\u7248\u672C\u3002\u4F60\u7684 site \u4FDD\u6301\u73B0\u5728\u7684\u6837\u5B50\u3002\u56E2\u961F\u53EF\u4EE5\u770B\u5230\u53D1\u751F\u4E86\u4EC0\u4E48\u3002",
  "rebuild.say.restore_shows_held_text": "\u4E0A\u4E00\u4E2A\u7248\u672C\u663E\u793A\u4E86\u4F60\u8981\u6C42\u4FDD\u5BC6\u7684\u5185\u5BB9\uFF0C\u6240\u4EE5\u6211\u6CA1\u6709\u56DE\u5230\u90A3\u4E2A\u7248\u672C\u3002\u4F60\u7684 site \u4FDD\u6301\u73B0\u5728\u7684\u6837\u5B50\u3002",
  "rebuild.say.restore_site_changed": "\u81EA\u4E0A\u6B21\u66F4\u65B0\u4EE5\u6765\uFF0C\u4F60\u7684 site \u6709\u4E00\u90E8\u5206\u5728 Tracy \u4E4B\u5916\u88AB\u7F16\u8F91\u8FC7\uFF0C\u6240\u4EE5\u6211\u6CA1\u6709\u56DE\u5230\u4E0A\u4E00\u4E2A\u7248\u672C\u3002\u4F60\u7684\u7F16\u8F91\u5DF2\u4FDD\u7559\uFF0C\u4F60\u7684 site \u4FDD\u6301\u73B0\u5728\u7684\u6837\u5B50\u3002",
  "rebuild.say.revision_needs_removal": "\u4F60\u7684\u4FEE\u6539\u8981\u79FB\u9664 site \u4E0A\u7684\u4E00\u90E8\u5206\uFF0C\u800C\u8FD9\u90E8\u5206\u6211\u65E0\u6CD5\u5728\u8FD9\u4E2A chat \u91CC\u79FB\u9664\uFF0C\u6240\u4EE5\u6211\u5728\u505A\u4EFB\u4F55\u6539\u52A8\u4E4B\u524D\u5C31\u505C\u4E0B\u4E86\u3002\u4F60\u7684 site \u6CA1\u6709\u53D8\u5316\u3002\u56E2\u961F\u53EF\u4EE5\u770B\u5230\u4F60\u63D0\u51FA\u7684\u8981\u6C42\u3002",
  "rebuild.say.site_already_built": "\u4F60\u7684 site \u5DF2\u7ECF\u5EFA\u597D\uFF0C\u6240\u4EE5\u6211\u6CA1\u6709\u4ECE\u5934\u91CD\u65B0\u5EFA\u3002\u4FEE\u6539\u8BA1\u5212\u5E76\u66F4\u65B0\u4F60\u7684 site\uFF0C\u53EA\u4F1A\u91CD\u5EFA\u4F60\u6539\u52A8\u7684\u90E8\u5206\u3002",
  "rebuild.say.site_changed_outside": "\u81EA\u5EFA\u6210\u4EE5\u6765\uFF0C\u4F60\u7684 site \u6709\u4E00\u90E8\u5206\u5728 Tracy \u4E4B\u5916\u88AB\u7F16\u8F91\u8FC7\uFF0C\u6240\u4EE5\u6211\u5728\u8986\u76D6\u90A3\u5904\u7F16\u8F91\u4E4B\u524D\u505C\u4E86\u4E0B\u6765\u3002\u4F60\u7684\u7F16\u8F91\u5DF2\u4FDD\u7559\u3002\u56E2\u961F\u53EF\u4EE5\u770B\u5230\u662F\u54EA\u4E00\u90E8\u5206\u3002",
  "rebuild.say.update_done": "\u4F60\u7684 site \u5DF2\u66F4\u65B0\u3002\u53EA\u91CD\u5EFA\u4E86\u4F60\u7684\u4FEE\u6539\u6D89\u53CA\u7684\u90E8\u5206\uFF0C\u5176\u4F59\u4FDD\u6301\u539F\u6837\u3002",
  "rebuild.say.write_record_stale": "\u8FD9\u6B21\u66F4\u65B0\u4E0E\u4E4B\u524D\u7684\u4E00\u6B21\u6DF7\u5728\u4E86\u4E00\u8D77\uFF0C\u6240\u4EE5\u6211\u5728\u505A\u4EFB\u4F55\u6539\u52A8\u4E4B\u524D\u505C\u4E86\u4E0B\u6765\u3002\u4F60\u7684 site \u6CA1\u6709\u53D8\u5316\u3002\u56E2\u961F\u53EF\u4EE5\u770B\u5230\u53D1\u751F\u4E86\u4EC0\u4E48\u3002",
  "rebuild.restore": "Restore \u5230\u4E0A\u4E00\u4E2A\u7248\u672C",
  "rebuild.title": "\u4F60\u7684 site",
  "rebuild.undo": "\u64A4\u9500\u672A\u5B8C\u6210\u7684\u66F4\u65B0",
  "rebuild.update": "\u66F4\u65B0\u6211\u7684 site",
  "retry.button": "\u91CD\u8BD5",
  "review.failed": "\u4F60\u7684\u56DE\u7B54\u6CA1\u6709\u53D1\u9001\u3002\u8BF7\u91CD\u8BD5\u3002",
  "review.question": "\u6279\u51C6\u8FD9\u4E2A\u8BA1\u5212\uFF1F",
  "review.approve": "\u6279\u51C6",
  "review.change": "\u4FEE\u6539\u8BA1\u5212",
  "review.say": "\u6216\u8005\u63CF\u8FF0\u4F60\u60F3\u8981\u7684\u4FEE\u6539",
  "review.summary": "{name}\uFF1A{pages}\uFF0C{services}",
  "review.summary.one": "{name}\uFF1A{part}",
  "review.pages.one": "{count} \u4E2A\u9875\u9762",
  "review.pages.other": "{count} \u4E2A\u9875\u9762",
  "stopped.kept.none": "\u5DF2\u4FDD\u7559\uFF1A\u4F60\u7684\u8BA1\u5212\u548C\u4F60\u7684\u56DE\u7B54\u3002",
  "stopped.kept.one": "\u5DF2\u4FDD\u7559\uFF1A\u4F60\u7684\u8BA1\u5212\u3001\u4F60\u7684\u56DE\u7B54\u548C\u5DF2\u5199\u597D\u7684\u9875\u9762\u3002",
  "stopped.kept.other": "\u5DF2\u4FDD\u7559\uFF1A\u4F60\u7684\u8BA1\u5212\u3001\u4F60\u7684\u56DE\u7B54\u548C\u5DF2\u5199\u597D\u7684 {count} \u4E2A\u9875\u9762\u3002",
  "stopped.notified": "Tracy \u56E2\u961F\u5DF2\u6536\u5230\u901A\u77E5\u5E76\u4F1A\u8DDF\u8FDB\u3002\u4F60\u65E0\u9700\u505A\u4EFB\u4F55\u4E8B\u3002",
  "stopped.notStarted": "\u4F60\u7684 site \u672A\u80FD\u5F00\u59CB\u521B\u5EFA\uFF0C\u4F46\u4F60\u7684\u8BA1\u5212\u5DF2\u4FDD\u7559\uFF0C\u4F60\u4E4B\u540E\u53EF\u4EE5\u518D\u6B21\u6279\u51C6\u3002",
  "stopped.notStarted.design": "\u8FD9\u4E2A\u8BBE\u8BA1\u6682\u65F6\u8FD8\u65E0\u6CD5\u6784\u5EFA\uFF0C\u6240\u4EE5\u4F60\u7684 site \u6CA1\u6709\u5F00\u59CB\u521B\u5EFA\uFF0C\u4F46\u4F60\u7684\u8BA1\u5212\u5DF2\u4FDD\u7559\uFF0C\u4F60\u4E4B\u540E\u53EF\u4EE5\u518D\u6B21\u6279\u51C6\u3002",
  "stopped.once": "\u6211\u65E0\u6CD5\u5B8C\u6210\u201C{step}\u201D\uFF0C\u6240\u4EE5\u6211\u505C\u4E86\u4E0B\u6765\uFF0C\u800C\u4E0D\u662F\u7ED9\u4F60\u770B\u4E00\u4E2A\u672A\u5B8C\u6210\u7684 site\u3002",
  "stopped.title": "\u4F60\u7684 site \u8FD8\u6CA1\u6709\u5B8C\u6210",
  "stopped.twice": "\u6211\u5C1D\u8BD5\u4E24\u6B21\u540E\u4ECD\u65E0\u6CD5\u5B8C\u6210\u201C{step}\u201D\uFF0C\u6240\u4EE5\u6211\u505C\u4E86\u4E0B\u6765\uFF0C\u800C\u4E0D\u662F\u7ED9\u4F60\u770B\u4E00\u4E2A\u672A\u5B8C\u6210\u7684 site\u3002",
  "stopped.unchanged": "\u4F60\u5F53\u524D\u7684 site \u6CA1\u6709\u53D8\u5316\u3002",
  "template.chosen": "\u5DF2\u9009\u62E9\uFF1A{name}",
  "template.continue": "\u7EE7\u7EED",
  "template.later": "\u4F60\u4E4B\u540E\u53EF\u4EE5\u66F4\u6362\u8BBE\u8BA1\u3002",
  "template.list": "\u9002\u5408\u4F60\u7684 site \u7684\u8BBE\u8BA1",
  "template.none": "\u76EE\u524D\u8FD8\u6CA1\u6709\u9002\u5408\u4F60\u4E1A\u52A1\u7684\u73B0\u6210\u8BBE\u8BA1\u3002",
  "template.noneNext": "\u4F60\u4ECD\u7136\u53EF\u4EE5\u5728\u201C\u6DFB\u52A0 site\u201D\u9875\u9762\u521B\u5EFA site\u3002",
  "template.openAddSite": "\u6253\u5F00\u201C\u6DFB\u52A0 site\u201D",
  "template.picked": "\u6211\u9009\u62E9\u4E86 {name}\u3002",
  "template.recommended": "\u63A8\u8350",
  "template.saveFailed": "\u4F60\u7684\u9009\u62E9\u6CA1\u6709\u4FDD\u5B58\u3002\u8BF7\u91CD\u8BD5\u3002",
  "template.sendFailed": "\u4F60\u7684\u9009\u62E9\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u6CA1\u6709\u53D1\u9001\u5230 chat\u3002\u70B9\u51FB\u201C\u7EE7\u7EED\u201D\u53EF\u91CD\u65B0\u53D1\u9001\u3002",
  "template.use": "\u4F7F\u7528 {name}",
  "tool.edit": "\u5DF2\u66F4\u65B0\u4F60\u7684 site \u8BA1\u5212",
  "tool.plan": "\u5DF2\u5236\u5B9A\u4F60\u7684 site \u8BA1\u5212",
  "tool.research.none": "\u5DF2\u4E86\u89E3\u4F60\u7684\u4E1A\u52A1",
  "tool.research.one": "\u5DF2\u9605\u8BFB {count} \u4E2A\u6765\u6E90",
  "tool.research.other": "\u5DF2\u9605\u8BFB {count} \u4E2A\u6765\u6E90",
  "tool.stopped": "\u6B64\u6B65\u9AA4\u65E0\u6CD5\u5B8C\u6210",
  "tool.templates": "\u5DF2\u627E\u5230\u9002\u5408\u4F60\u7684 site \u7684\u8BBE\u8BA1",
  "tool.working": "\u6B63\u5728\u5236\u5B9A\u4F60\u7684 site \u8BA1\u5212",
  "plan.revised.notDone.owner_value_not_shown.what": "\u5728 site \u4E0A\u663E\u793A\u4F60\u7684{label}",
  "plan.revised.notDone.owner_value_not_shown.why": "\u4F60\u7684\u56DE\u7B54\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u4F60\u7684\u8BBE\u8BA1\u91CC\u6CA1\u6709\u663E\u793A\u5B83\u7684\u4F4D\u7F6E\u3002",
  "plan.revised.names.counted": "{count} \u4E2A{plural}",
  "plan.revised.notDone.reason.no_recipe": "\u4F60\u7684\u8BBE\u8BA1\u6CA1\u6709\u8FD9\u7C7B\u9875\u9762\u3002",
  "plan.revised.notDone.reason.no_data": "\u4F60\u7684\u4E1A\u52A1\u6CA1\u6709\u53EF\u4EE5\u586B\u8FDB\u8FD9\u4E2A\u533A\u5757\u7684\u5185\u5BB9\u3002",
  "plan.revised.notDone.reason.fact_missing": "\u4F60\u7684\u4E1A\u52A1\u6CA1\u6709\u8FD9\u9879\u4FE1\u606F\u3002",
  "plan.revised.notDone.reason.kept_private": "\u4F60\u9009\u62E9\u4E0D\u5728 site \u4E0A\u663E\u793A\u8FD9\u9879\u5185\u5BB9\u3002",
  "plan.revised.notDone.reason.outside_plan": "\u4FEE\u6539\u8BF7\u6C42\u65E0\u6CD5\u66F4\u6539\u8FD9\u4E00\u9879\u3002\u8BF7\u5728\u8BA1\u5212\u5361\u7247\u4E0A\u4FEE\u6539\u3002",
  "plan.leftOut.reason.no_email_for_form": "\u4F60\u7684\u4E1A\u52A1\u6CA1\u6709 email \u5730\u5740\uFF0C\u6CE8\u518C\u8868\u5355\u65E0\u6CD5\u628A\u56DE\u7B54\u53D1\u9001\u51FA\u53BB\u3002",
  "plan.leftOut.reason.no_booking_link": "\u4F60\u6CA1\u6709\u53EF\u4F9B\u6309\u94AE\u6253\u5F00\u7684\u9884\u8BA2\u6216\u8054\u7CFB link\u3002",
  "plan.leftOut.reason.no_items_to_show": "\u4F60\u6682\u65F6\u6CA1\u6709\u53EF\u4EE5\u5728\u8FD9\u4E2A\u533A\u5757\u91CC\u663E\u793A\u7684\u5185\u5BB9\u3002",
  "plan.leftOut.reason.shown_in_other_sections": "\u8FD9\u4E2A\u533A\u5757\u8981\u663E\u793A\u7684\u5185\u5BB9\u5DF2\u7ECF\u5728\u4F60\u8BA1\u5212\u7684\u5176\u4ED6\u533A\u5757\u4E2D\u663E\u793A\u3002",
  "plan.leftOut.reason.owner_withheld": "\u4F60\u8981\u6C42\u4E0D\u5728 site \u4E0A\u663E\u793A\u8FD9\u9879\u5185\u5BB9\u3002",
  "plan.leftOut.reason.left_out_neutral.page": "\u8FD9\u4E2A\u9875\u9762\u4E0D\u5728\u4F60\u7684\u8BA1\u5212\u4E2D\u3002",
  "plan.leftOut.reason.left_out_neutral.block": "\u8FD9\u4E2A\u533A\u5757\u4E0D\u5728\u4F60\u7684\u8BA1\u5212\u4E2D\u3002",
  "plan.leftOut.reason.left_out_neutral.item": "\u8FD9\u9879\u5185\u5BB9\u4E0D\u4F1A\u663E\u793A\u5728\u4F60\u7684\u8BA1\u5212\u4E2D\u3002",
  "plan.leftOut.reason.no_gallery_room.one": "\u6CA1\u6709\u76F8\u518C\u8FD8\u6709\u4F4D\u7F6E\u653E\u8FD9\u5F20\u7167\u7247\u3002\u5B83\u4F1A\u7559\u5728\u4F60\u7684\u7167\u7247\u4E2D\uFF0C\u53EF\u80FD\u4F1A\u7528\u5728 site \u7684\u5176\u4ED6\u5730\u65B9\u3002",
  "plan.leftOut.reason.no_gallery_room.other": "\u6CA1\u6709\u76F8\u518C\u8FD8\u6709\u4F4D\u7F6E\u653E\u8FD9 {count} \u5F20\u7167\u7247\u3002\u5B83\u4EEC\u4F1A\u7559\u5728\u4F60\u7684\u7167\u7247\u4E2D\uFF0C\u53EF\u80FD\u4F1A\u7528\u5728 site \u7684\u5176\u4ED6\u5730\u65B9\u3002",
  "plan.pictures.estimate.one": "\u5728\u4F60\u6CA1\u6709\u5408\u9002\u7167\u7247\u7684\u5730\u65B9\uFF0C\u5C06\u521B\u5EFA\u7EA6 {count} \u5F20\u56FE\u7247\u3002\u6700\u7EC8\u6570\u91CF\u53D6\u51B3\u4E8E\u4F60\u7684\u7167\u7247\u3002",
  "plan.pictures.estimate.other": "\u5728\u4F60\u6CA1\u6709\u5408\u9002\u7167\u7247\u7684\u5730\u65B9\uFF0C\u5C06\u521B\u5EFA\u7EA6 {count} \u5F20\u56FE\u7247\u3002\u6700\u7EC8\u6570\u91CF\u53D6\u51B3\u4E8E\u4F60\u7684\u7167\u7247\u3002",
  "plan.logoSource.website": "\u7F51\u7AD9",
  "plan.logoSource.google": "Google \u5730\u56FE\u5546\u5BB6\u9875\u9762",
  "plan.logoSource.instagram": "Instagram \u4E3B\u9875",
  "plan.logoSource.facebook": "Facebook \u4E3B\u9875",
  "plan.logoSource.tiktok": "TikTok \u4E3B\u9875",
  "plan.assumption.logo_drawn.new-symbol-drawn": "Tracy \u6839\u636E\u4F60\u7684 logo \u753B\u4E86\u4E00\u4E2A logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4E00\u4E2A\u4EE3\u8868\u4F60\u884C\u4E1A\u7684\u65B0\u7B26\u53F7\uFF0C\u540D\u79F0\u4F7F\u7528 template \u7684\u5B57\u4F53\u3002\u5B83\u4E0D\u662F\u4F60\u7684 logo file\u3002\u8BF7\u786E\u8BA4\u5B83\uFF0C\u6216\u628A\u4F60\u7684 logo \u53D1\u7ED9\u6211\u4EEC\u6765\u66FF\u6362\u3002",
  "plan.assumption.logo_drawn.symbol-cut-from-logo": "Tracy \u6839\u636E\u4F60\u7684 logo \u753B\u4E86\u4E00\u4E2A logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4ECE\u4F60\u7684 logo \u4E2D\u622A\u53D6\u7684\u7B26\u53F7\uFF0C\u540D\u79F0\u4F7F\u7528 template \u7684\u5B57\u4F53\u3002\u5B83\u4E0D\u662F\u4F60\u7684 logo file\u3002\u8BF7\u786E\u8BA4\u5B83\uFF0C\u6216\u628A\u4F60\u7684 logo \u53D1\u7ED9\u6211\u4EEC\u6765\u66FF\u6362\u3002",
  "plan.assumption.logo_drawn.name-set-in-template-font": "Tracy \u6839\u636E\u4F60\u7684 logo \u753B\u4E86\u4E00\u4E2A logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4E00\u4E2A\u6807\u8BB0\uFF0C\u540D\u79F0\u4F7F\u7528 template \u7684\u5B57\u4F53\u3002\u5B83\u4E0D\u662F\u4F60\u7684 logo file\u3002\u8BF7\u786E\u8BA4\u5B83\uFF0C\u6216\u628A\u4F60\u7684 logo \u53D1\u7ED9\u6211\u4EEC\u6765\u66FF\u6362\u3002",
  "plan.assumption.logo_made.found.icon": "\u4F60\u7684 logo \u65E0\u6CD5\u76F4\u63A5\u4F7F\u7528\uFF0C\u6240\u4EE5\u6211\u505A\u4E86\u4E00\u4E2A\u4E34\u65F6 logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4E00\u4E2A\u4EE3\u8868\u4F60\u884C\u4E1A\u7684\u7B80\u5355\u56FE\u6807\u3002\u8BF7\u5728\u8FD9\u4E2A chat \u91CC\u53D1\u9001\u4F60\u7684 logo file \u6765\u66FF\u6362\u5B83\u3002",
  "plan.assumption.logo_made.found.lettermark": "\u4F60\u7684 logo \u65E0\u6CD5\u76F4\u63A5\u4F7F\u7528\uFF0C\u6240\u4EE5\u6211\u505A\u4E86\u4E00\u4E2A\u4E34\u65F6 logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4F60\u7684\u9996\u5B57\u6BCD\u3002\u8BF7\u5728\u8FD9\u4E2A chat \u91CC\u53D1\u9001\u4F60\u7684 logo file \u6765\u66FF\u6362\u5B83\u3002",
  "plan.assumption.logo_made.found.mark": "\u4F60\u7684 logo \u65E0\u6CD5\u76F4\u63A5\u4F7F\u7528\uFF0C\u6240\u4EE5\u6211\u505A\u4E86\u4E00\u4E2A\u4E34\u65F6 logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4E00\u4E2A\u7B80\u5355\u6807\u8BB0\u3002\u8BF7\u5728\u8FD9\u4E2A chat \u91CC\u53D1\u9001\u4F60\u7684 logo file \u6765\u66FF\u6362\u5B83\u3002",
  "plan.assumption.logo_made.none.icon": "\u6CA1\u6709\u627E\u5230 logo\uFF0C\u6240\u4EE5\u6211\u505A\u4E86\u4E00\u4E2A\u4E34\u65F6 logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4E00\u4E2A\u4EE3\u8868\u4F60\u884C\u4E1A\u7684\u7B80\u5355\u56FE\u6807\uFF0C\u4F7F\u7528\u8BBE\u8BA1\u7684\u4E3B\u8272\u3002\u8BF7\u5728\u8FD9\u4E2A chat \u91CC\u53D1\u9001\u4F60\u7684 logo \u6765\u66FF\u6362\u5B83\u3002",
  "plan.assumption.logo_made.none.lettermark": "\u6CA1\u6709\u627E\u5230 logo\uFF0C\u6240\u4EE5\u6211\u505A\u4E86\u4E00\u4E2A\u4E34\u65F6 logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4F60\u7684\u9996\u5B57\u6BCD\uFF0C\u4F7F\u7528\u8BBE\u8BA1\u7684\u4E3B\u8272\u3002\u8BF7\u5728\u8FD9\u4E2A chat \u91CC\u53D1\u9001\u4F60\u7684 logo \u6765\u66FF\u6362\u5B83\u3002",
  "plan.assumption.logo_made.none.mark": "\u6CA1\u6709\u627E\u5230 logo\uFF0C\u6240\u4EE5\u6211\u505A\u4E86\u4E00\u4E2A\u4E34\u65F6 logo\uFF1A\u5728\u4F60\u7684\u4E1A\u52A1\u540D\u79F0\u65C1\u653E\u4E00\u4E2A\u7B80\u5355\u6807\u8BB0\uFF0C\u4F7F\u7528\u8BBE\u8BA1\u7684\u4E3B\u8272\u3002\u8BF7\u5728\u8FD9\u4E2A chat \u91CC\u53D1\u9001\u4F60\u7684 logo \u6765\u66FF\u6362\u5B83\u3002",
  "plan.hours.days": "{from}\u81F3{to}",
  "plan.hours.time": "{from}\u81F3{to}",
  "plan.hours.closed": "\u4F11\u606F",
  "plan.hours.ranges": "{first}\u548C{next}",
  "plan.hours.group": "{days}\uFF0C{hours}",
  "plan.hours.groups": "{first}\uFF1B{next}",
  "plan.section.header": "\u83DC\u5355",
  "plan.section.footer": "\u9875\u811A",
  "plan.section.hero": "\u9996\u5C4F",
  "plan.section.page_header": "\u9875\u9762\u6807\u9898\u533A",
  "plan.section.about": "\u5173\u4E8E",
  "plan.section.text": "\u6587\u5B57",
  "plan.section.call_to_action": "\u884C\u52A8\u53F7\u53EC",
  "plan.section.contact": "\u8054\u7CFB\u65B9\u5F0F",
  "plan.section.map": "\u5730\u56FE",
  "plan.section.video": "\u89C6\u9891",
  "plan.section.newsletter": "\u8BA2\u9605\u901A\u8BAF",
  "plan.section.services": "\u670D\u52A1",
  "plan.section.menu": "\u9910\u5355",
  "plan.section.pricing": "\u4EF7\u683C",
  "plan.section.schedule": "\u65F6\u95F4\u8868",
  "plan.section.team": "\u56E2\u961F",
  "plan.section.stats": "\u6570\u636E",
  "plan.section.steps": "\u6B65\u9AA4",
  "plan.section.reviews": "\u8BC4\u4EF7",
  "plan.section.claims": "\u8363\u8A89",
  "plan.section.faq": "\u95EE\u9898",
  "plan.section.events": "\u6D3B\u52A8",
  "plan.section.posts": "\u6587\u7AE0",
  "plan.section.gallery": "\u7167\u7247",
  "rebuild.say.door_not_available": "\u4F60\u7684 site \u4E0D\u5141\u8BB8\u6211\u5728\u8FD9\u4E2A chat \u91CC\u8FDB\u884C\u8FD9\u9879\u66F4\u6539\uFF0C\u6240\u4EE5\u6211\u505C\u6B62\u4E86\u8FD9\u6B21\u66F4\u65B0\u3002\u56E2\u961F\u53EF\u4EE5\u770B\u5230\u662F\u54EA\u4E00\u90E8\u5206\u3002",
  "rebuild.say.sheets_unreadable": "\u6211\u65E0\u6CD5\u8BFB\u53D6\u4F60\u7684 site \u7684\u6837\u5F0F\u8868\uFF0C\u6240\u4EE5\u5728\u66F4\u6539\u989C\u8272\u4E4B\u524D\u5C31\u505C\u4E0B\u4E86\u3002\u56E2\u961F\u53EF\u4EE5\u770B\u5230\u53D1\u751F\u4E86\u4EC0\u4E48\u3002",
  "ask.question.main_button": "\u4F60\u7684 site \u4E0A\u7684\u4E3B\u6309\u94AE\u5E94\u8BE5\u8BF7\u8BBF\u5BA2\u505A\u4EC0\u4E48\uFF1F",
  "ask.question.contact_method": "\u6211\u4EEC\u6CA1\u6709\u627E\u5230\u7535\u8BDD\u3001email \u6216\u9884\u8BA2 link\u3002\u8BBF\u5BA2\u5E94\u8BE5\u600E\u6837\u8054\u7CFB\u4F60\uFF1F",
  "ask.question.site_language": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u4F7F\u7528\u4E86\u4E0D\u6B62\u4E00\u79CD\u8BED\u8A00\u3002\u4F60\u7684 site \u5E94\u8BE5\u4F7F\u7528\u54EA\u79CD\u8BED\u8A00\uFF1F",
  "ask.question.fact_conflict_business.phone": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86\u4E0D\u540C\u7684\u7535\u8BDD\u53F7\u7801\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_business.email": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86\u4E0D\u540C\u7684 email \u5730\u5740\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_business.address": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86\u4E0D\u540C\u7684\u5730\u5740\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_business.hours": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86\u4E0D\u540C\u7684\u8425\u4E1A\u65F6\u95F4\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_business.link": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86\u4E0D\u540C\u7684\u9884\u8BA2\u6216\u8054\u7CFB link\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_business.name": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86\u4E0D\u540C\u7684\u4E1A\u52A1\u540D\u79F0\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_business.price": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86\u4E0D\u540C\u7684\u4EF7\u683C\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_item.phone": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86 {item} \u7684\u4E0D\u540C\u7535\u8BDD\u53F7\u7801\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_item.email": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86 {item} \u7684\u4E0D\u540C email \u5730\u5740\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_item.address": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86 {item} \u7684\u4E0D\u540C\u5730\u5740\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_item.hours": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86 {item} \u7684\u4E0D\u540C\u8425\u4E1A\u65F6\u95F4\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_item.link": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86 {item} \u7684\u4E0D\u540C\u9884\u8BA2\u6216\u8054\u7CFB link\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_item.name": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86 {item} \u7684\u4E0D\u540C\u4E1A\u52A1\u540D\u79F0\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.question.fact_conflict_item.price": "\u4F60\u7684\u516C\u5F00\u9875\u9762\u7ED9\u51FA\u4E86 {item} \u7684\u4E0D\u540C\u4EF7\u683C\u3002\u54EA\u4E00\u4E2A\u662F\u5BF9\u7684\uFF1F",
  "ask.choice.contact_method_phone": "\u4E00\u4E2A\u7535\u8BDD\u53F7\u7801",
  "ask.choice.contact_method_email": "\u4E00\u4E2A email \u5730\u5740",
  "ask.choice.contact_method_link": "\u4E00\u4E2A\u9884\u8BA2\u6216\u8054\u7CFB link",
  "ask.from": "\u6765\u81EA{sources}",
  "ask.and": "{first}\u548C{last}",
  "ask.source.website": "\u7F51\u7AD9",
  "ask.source.google_maps": "Google \u5730\u56FE\u5546\u5BB6\u9875\u9762",
  "ask.source.owner_answer": "\u4F60\u7684\u56DE\u7B54",
  "ask.source.instagram": "Instagram \u4E3B\u9875",
  "ask.source.facebook": "Facebook \u4E3B\u9875",
  "ask.source.tiktok": "TikTok \u4E3B\u9875",
  "ask.source.social": "\u793E\u4EA4\u5A92\u4F53\u4E3B\u9875",
  "ask.question.place_choice": "\u6211\u4EEC\u5728 Google \u5730\u56FE\u4E0A\u627E\u5230\u4E86\u591A\u4E2A\u540C\u540D\u5730\u70B9\u3002\u54EA\u4E00\u4E2A\u662F\u4F60\u7684\uFF1F",
  "ask.choice.place_choice_none": "\u4EE5\u4E0A\u90FD\u4E0D\u662F",
  "ask.choice.main_button_book": "\u5728\u7EBF\u9884\u8BA2",
  "ask.choice.main_button_call": "\u7ED9\u6211\u4EEC\u6253\u7535\u8BDD",
  "ask.choice.main_button_email": "\u7ED9\u6211\u4EEC\u53D1\u90AE\u4EF6",
  "ask.choice.main_button_message": "\u7ED9\u6211\u4EEC\u53D1\u6D88\u606F",
  "ask.choice.main_button_visit": "\u6B22\u8FCE\u5230\u5E97",
  "ask.choice.main_button_contact": "\u8054\u7CFB\u6211\u4EEC",
  "ask.choice.main_button_book_short": "\u9884\u8BA2",
  "ask.choice.main_button_call_short": "\u81F4\u7535",
  "ask.choice.main_button_email_short": "\u90AE\u4EF6",
  "ask.choice.main_button_message_short": "\u6D88\u606F",
  "ask.choice.main_button_visit_short": "\u5230\u5E97",
  "ask.choice.main_button_contact_short": "\u8054\u7CFB",
  "ask.choice.main_button_text": "\u6309\u94AE\u4E0A\u7684\u6587\u5B57\uFF1A{text}",
  "ask.source.listing": "\u5546\u5BB6\u76EE\u5F55\u9875\u9762",
  "plan.source.listing": "\u5546\u5BB6\u76EE\u5F55\u9875\u9762",
  "links.reading": "{name}\uFF1A\u6B63\u5728\u8BFB\u53D6",
  "links.choice": "{name}\uFF1A\u9700\u8981\u60A8\u9009\u62E9",
  "links.failed": "{name}\uFF1A\u65E0\u6CD5\u8BFB\u53D6",
  "links.failedWhy": "{name}\uFF1A\u65E0\u6CD5\u8BFB\u53D6\uFF08{reason}\uFF09",
  "links.read": "{name}\uFF1A\u5DF2\u8BFB\u53D6",
  "links.readNothing": "{name}\uFF1A\u5DF2\u8BFB\u53D6\uFF0C\u4F46\u672A\u627E\u5230\u5173\u4E8E\u8BE5\u5546\u5BB6\u7684\u4FE1\u606F",
  "links.readPicturesLost": "{name}\uFF1A\u5DF2\u8BFB\u53D6\uFF0C\u4F46\u5176\u56FE\u7247\u65E0\u6CD5\u4E0B\u8F7D",
  "links.readPicturesNotKept": "{name}\uFF1A\u5DF2\u8BFB\u53D6\uFF0C\u4F46\u5176\u56FE\u7247\u65E0\u6CD5\u4FDD\u5B58",
  "links.facts.one": "{count} \u6761\u4FE1\u606F",
  "links.facts.other": "{count} \u6761\u4FE1\u606F",
  "links.pictures.one": "{count} \u5F20\u56FE\u7247",
  "links.pictures.other": "{count} \u5F20\u56FE\u7247",
  "links.pictures.none": "\u6CA1\u6709\u56FE\u7247",
  "links.pictures.someLost": "\u53E6\u6709 {count} \u5F20\u65E0\u6CD5\u4E0B\u8F7D",
  "tool.working.research": "\u6B63\u5728\u8BFB\u53D6\u4F60\u7684\u94FE\u63A5",
  "tool.working.about": "\u6B63\u5728\u4E86\u89E3\u4F60\u7684\u4E1A\u52A1",
  "tool.working.templates": "\u6B63\u5728\u4E3A\u4F60\u7684 site \u67E5\u627E\u8BBE\u8BA1",
  "tool.working.build": "\u6B63\u5728\u521B\u5EFA\u4F60\u7684 site",
  "tool.working.startOver": "\u6B63\u5728\u91CD\u65B0\u5F00\u59CB",
  "tool.waiting.place": "\u7B49\u5F85\u4F60\u9009\u62E9\u4F60\u7684\u5730\u70B9",
  "links.pictures.foundSome": "\u627E\u5230 {count} \u5F20\u56FE\u7247\uFF0C{usable} \u5F20\u53EF\u7528",
  "links.pictures.foundNotOwn.one": "\u627E\u5230 {count} \u5F20\u56FE\u7247\uFF0C\u5E76\u975E\u5546\u5BB6\u53D1\u5E03",
  "links.pictures.foundNotOwn.other": "\u627E\u5230 {count} \u5F20\u56FE\u7247\uFF0C\u5747\u975E\u5546\u5BB6\u53D1\u5E03",
  "links.pictures.foundNone.one": "\u627E\u5230 {count} \u5F20\u56FE\u7247\uFF0C\u4E0D\u53EF\u7528",
  "links.pictures.foundNone.other": "\u627E\u5230 {count} \u5F20\u56FE\u7247\uFF0C\u5747\u4E0D\u53EF\u7528",
  "say.researchRead": "\u6211\u5DF2\u9605\u8BFB\u4F60\u63D0\u4F9B\u7684\u4E1A\u52A1\u4FE1\u606F\u3002"
};

// ../../locale/tracy-locale-vi/vi/tracy-build-chat.json
var tracy_build_chat_default7 = {
  "cancelled.body": "B\u1EA1n \u0111\xE3 hu\u1EF7 l\u1EA7n d\u1EF1ng n\xE0y. K\u1EBF ho\u1EA1ch v\xE0 c\xE1c c\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a b\u1EA1n v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "cancelled.title": "Qu\xE1 tr\xECnh d\u1EF1ng \u0111\xE3 b\u1ECB hu\u1EF7",
  "handoff.earlier": "Cu\u1ED9c tr\xF2 chuy\u1EC7n tr\u01B0\u1EDBc \u0111\xF3",
  "handoff.tooLong": "Site c\u1EE7a b\u1EA1n \u0111\xE3 s\u1EB5n s\xE0ng, nh\u01B0ng cu\u1ED9c tr\xF2 chuy\u1EC7n n\xE0y qu\xE1 d\xE0i \u0111\u1EC3 chuy\u1EC3n sang chat c\u1EE7a site. B\u1EA1n h\xE3y m\u1EDF site t\u1EEB danh s\xE1ch site c\u1EE7a b\u1EA1n.",
  "plan.allSources": "T\u1EA5t c\u1EA3 ngu\u1ED3n",
  "plan.and": "{first} v\xE0 {last}",
  "plan.assumptions": "Nh\u1EEFng \u0111i\u1EC1u m\xECnh \u0111\xE3 gi\u1EA3 \u0111\u1ECBnh",
  "plan.cancel": "Hu\u1EF7",
  "plan.changed": "\u0110\xE3 \u0111\u1ED5i",
  "plan.count.gallery.one": "{count} \u1EA3nh",
  "plan.count.gallery.other": "{count} \u1EA3nh",
  "plan.count.item.one": "{count} m\u1EE5c",
  "plan.count.item.other": "{count} m\u1EE5c",
  "plan.count.person.one": "{count} ng\u01B0\u1EDDi",
  "plan.count.person.other": "{count} ng\u01B0\u1EDDi",
  "plan.count.quote.one": "{count} \u0111\xE1nh gi\xE1",
  "plan.count.quote.other": "{count} \u0111\xE1nh gi\xE1",
  "plan.count.service.one": "{count} d\u1ECBch v\u1EE5",
  "plan.count.service.other": "{count} d\u1ECBch v\u1EE5",
  "plan.design": "M\u1EABu thi\u1EBFt k\u1EBF: {name}",
  "plan.edit": "S\u1EEDa {label}: {value}",
  "plan.facts": "Th\xF4ng tin doanh nghi\u1EC7p",
  "plan.fromServices": "T\u1EEB D\u1ECBch v\u1EE5",
  "plan.language": "Ng\xF4n ng\u1EEF c\u1EE7a site",
  "plan.leftOut": "\u0110\xE3 b\u1ECF qua",
  "plan.leftOut.showAll": "Hi\u1EC7n t\u1EA5t c\u1EA3 ({count})",
  "plan.leftOut.showFewer": "Thu g\u1ECDn",
  "plan.revised.changed": "\u0110\xE3 thay \u0111\u1ED5i",
  "plan.revised.notDone": "Ch\u01B0a l\xE0m",
  "plan.revised.dismiss": "\u1EA8n ghi ch\xFA n\xE0y",
  "plan.revised.edited": "{label} gi\u1EDD l\xE0 {value}.",
  "plan.revised.line.owner_value_saved": "\u0110\xE3 l\u01B0u c\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a b\u1EA1n: {label}, {value}.",
  "plan.revised.line.item_renamed": "{from} gi\u1EDD c\xF3 t\xEAn l\xE0 {to}.",
  "plan.revised.line.item_taken_off": "{label} kh\xF4ng xu\u1EA5t hi\u1EC7n tr\xEAn site c\u1EE7a b\u1EA1n, \u0111\xFAng nh\u01B0 b\u1EA1n y\xEAu c\u1EA7u.",
  "plan.revised.line.page-removed": "Trang {name} \u0111\xE3 \u0111\u01B0\u1EE3c b\u1ECF.",
  "plan.revised.line.page-added": "\u0110\xE3 th\xEAm trang {name}.",
  "plan.revised.line.page-renamed": "Trang {from} gi\u1EDD c\xF3 t\xEAn l\xE0 {to}.",
  "plan.revised.line.page-order": "C\xE1c trang gi\u1EDD theo th\u1EE9 t\u1EF1 n\xE0y: {names}.",
  "plan.revised.line.block-removed": "Ph\u1EA7n {section} \u0111\xE3 \u0111\u01B0\u1EE3c b\u1ECF kh\u1ECFi trang {page}.",
  "plan.revised.line.block-added": "\u0110\xE3 th\xEAm ph\u1EA7n {section} v\xE0o trang {page}.",
  "plan.revised.line.block-data.count": "Ph\u1EA7n {section} c\u1EE7a trang {page} gi\u1EDD hi\u1EC3n th\u1ECB {count} m\u1EE5c.",
  "plan.revised.line.block-data": "Ph\u1EA7n {section} c\u1EE7a trang {page} gi\u1EDD hi\u1EC3n th\u1ECB {names}.",
  "plan.revised.line.block-order": "C\xE1c ph\u1EA7n c\u1EE7a trang {page} \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EAFp x\u1EBFp l\u1EA1i.",
  "plan.revised.line.data-off": "Kh\xF4ng c\xF2n hi\u1EC3n th\u1ECB: {names}.",
  "plan.revised.line.data-on": "Gi\u1EDD \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB: {names}.",
  "plan.revised.line.data-again": "Hi\u1EC3n th\u1ECB l\u1EA1i: {names}, nh\u1EEFng th\u1EE9 b\u1EA1n \u0111\xE3 b\u1ECF tr\u01B0\u1EDBc \u0111\xF3.",
  "plan.revised.line.pictures-own.one": "K\u1EBF ho\u1EA1ch gi\u1EDD d\xF9ng {count} \u1EA3nh c\u1EE7a b\u1EA1n.",
  "plan.revised.line.pictures-own.other": "K\u1EBF ho\u1EA1ch gi\u1EDD d\xF9ng {count} \u1EA3nh c\u1EE7a b\u1EA1n.",
  "plan.revised.line.pictures-drawn.none": "Gi\u1EDD Tracy s\u1EBD kh\xF4ng t\u1EA1o \u1EA3nh n\xE0o.",
  "plan.revised.line.pictures-drawn.one": "Kho\u1EA3ng {count} \u1EA3nh s\u1EBD \u0111\u01B0\u1EE3c t\u1EA1o \u1EDF nh\u1EEFng ch\u1ED7 b\u1EA1n ch\u01B0a c\xF3 \u1EA3nh ph\xF9 h\u1EE3p.",
  "plan.revised.line.pictures-drawn.other": "Kho\u1EA3ng {count} \u1EA3nh s\u1EBD \u0111\u01B0\u1EE3c t\u1EA1o \u1EDF nh\u1EEFng ch\u1ED7 b\u1EA1n ch\u01B0a c\xF3 \u1EA3nh ph\xF9 h\u1EE3p.",
  "plan.revised.notDone.nothing_to_change.what": "Y\xEAu c\u1EA7u c\u1EE7a b\u1EA1n",
  "plan.revised.notDone.nothing_to_change.why": "Kh\xF4ng c\xF3 g\xEC trong k\u1EBF ho\u1EA1ch l\xE0m theo \u0111\u01B0\u1EE3c y\xEAu c\u1EA7u n\xE0y, n\xEAn k\u1EBF ho\u1EA1ch gi\u1EEF nguy\xEAn.",
  "plan.revised.notDone.page_already_on_plan.why": "K\u1EBF ho\u1EA1ch \u0111\xE3 c\xF3 trang n\xE0y.",
  "plan.revised.notDone.section_not_filled.what": "M\u1ED9t ph\u1EA7n m\u1EDBi",
  "plan.revised.notDone.section_not_filled.why": "Ch\u01B0a c\xF3 th\xF4ng tin n\xE0o v\u1EC1 doanh nghi\u1EC7p c\u1EE7a b\u1EA1n \u0111\u1EC3 \u0111i\u1EC1n v\xE0o, n\xEAn ph\u1EA7n n\xE0y kh\xF4ng \u0111\u01B0\u1EE3c th\xEAm.",
  "plan.revised.notDone.item_rename_refused.what": "\u0110\u1ED5i t\xEAn {name}",
  "plan.undo.chatChange": "Ho\xE0n t\xE1c ch\u1EC9 l\u1EA5y l\u1EA1i c\xE1c thay \u0111\u1ED5i b\u1EA1n l\xE0m tr\xEAn th\u1EBB n\xE0y. Mu\u1ED1n l\u1EA5y l\u1EA1i m\u1ED9t thay \u0111\u1ED5i b\u1EA1n \u0111\xE3 nh\u1EDD trong chat, b\u1EA1n h\xE3y nh\u1EAFn trong chat.",
  "plan.fact.business.name": "T\xEAn doanh nghi\u1EC7p",
  "plan.fact.business.founded_year": "N\u0103m th\xE0nh l\u1EADp",
  "plan.fact.business.tagline": "Kh\u1EA9u hi\u1EC7u",
  "plan.fact.business.summary": "Gi\u1EDBi thi\u1EC7u",
  "plan.fact.contact.phone": "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i",
  "plan.fact.contact.email": "Email",
  "plan.fact.contact.address": "\u0110\u1ECBa ch\u1EC9",
  "plan.fact.contact.hours": "Gi\u1EDD m\u1EDF c\u1EEDa",
  "plan.fact.contact.cta_url": "Link \u0111\u1EB7t l\u1ECBch",
  "plan.fact.contact.cta_label": "N\xFAt ch\xEDnh",
  "plan.fact.contact.social_url": "Link m\u1EA1ng x\xE3 h\u1ED9i",
  "plan.source.website": "Trang web",
  "plan.source.google": "Trang Google Maps",
  "plan.source.social": "Trang m\u1EA1ng x\xE3 h\u1ED9i",
  "plan.source.answer": "C\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a b\u1EA1n",
  "plan.look": "Giao di\u1EC7n",
  "plan.look.accent": "M\xE0u ch\xEDnh",
  "plan.look.accentDark": "M\xE0u ch\xEDnh tr\xEAn trang n\u1EC1n t\u1ED1i",
  "plan.look.accentLight": "M\xE0u ch\xEDnh tr\xEAn trang n\u1EC1n s\xE1ng",
  "plan.look.logoDark": "Logo tr\xEAn trang n\u1EC1n t\u1ED1i",
  "plan.look.logoDrawn": "M\u1ED9t logo Tracy \u0111\xE3 v\u1EBD, d\u1EF1a tr\xEAn logo c\u1EE7a b\u1EA1n",
  "plan.look.logoLight": "Logo tr\xEAn trang n\u1EC1n s\xE1ng",
  "plan.look.logoOwn": "Logo c\u1EE7a b\u1EA1n, t\u1EEB {source}",
  "plan.look.logoText": "T\xEAn doanh nghi\u1EC7p c\u1EE7a b\u1EA1n d\u1EA1ng ch\u1EEF",
  "plan.look.template": "M\u1EABu thi\u1EBFt k\u1EBF",
  "plan.newValue": "Gi\xE1 tr\u1ECB m\u1EDBi cho {label}",
  "plan.pages": "Trang ({count})",
  "plan.pictures": "\u1EA2nh",
  "plan.pictures.drawn": "\u1EA2nh do Tracy t\u1EA1o",
  "plan.pictures.drawnNone": "Kh\xF4ng c\xF3",
  "plan.pictures.drawnValue.one": "Kho\u1EA3ng {count} \u1EA3nh",
  "plan.pictures.drawnValue.other": "Kho\u1EA3ng {count} \u1EA3nh",
  "plan.pictures.own": "\u1EA2nh c\u1EE7a b\u1EA1n",
  "plan.pictures.ownValue.one": "{count} \u1EA3nh t\u1EEB {from}",
  "plan.pictures.ownValue.other": "{count} \u1EA3nh t\u1EEB {from}",
  "plan.save": "L\u01B0u",
  "plan.saveFailed": "Thay \u0111\u1ED5i c\u1EE7a b\u1EA1n ch\u01B0a \u0111\u01B0\u1EE3c l\u01B0u. H\xE3y th\u1EED l\u1EA1i.",
  "plan.locked": "Site c\u1EE7a b\u1EA1n \u0111ang \u0111\u01B0\u1EE3c d\u1EF1ng t\u1EEB k\u1EBF ho\u1EA1ch n\xE0y, n\xEAn k\u1EBF ho\u1EA1ch ch\u01B0a \u0111\u1ED5i \u0111\u01B0\u1EE3c cho t\u1EDBi khi d\u1EF1ng xong.",
  "plan.stale": "K\u1EBF ho\u1EA1ch v\u1EEBa thay \u0111\u1ED5i n\xEAn thay \u0111\u1ED5i c\u1EE7a b\u1EA1n ch\u01B0a \u0111\u01B0\u1EE3c l\u01B0u. Th\u1EBB \u0111ang hi\u1EC7n k\u1EBF ho\u1EA1ch m\u1EDBi nh\u1EA5t.",
  "plan.busy": "M\xECnh v\u1EABn \u0111ang l\xE0m k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n n\xEAn k\u1EBF ho\u1EA1ch ch\u01B0a \u0111\u1ED5i \u0111\u01B0\u1EE3c l\xFAc n\xE0y. B\u1EA1n h\xE3y s\u1EEDa l\u1EA1i khi m\xECnh l\xE0m xong.",
  "plan.tooLarge": "Thay \u0111\u1ED5i n\xE0y qu\xE1 d\xE0i n\xEAn ch\u01B0a l\u01B0u \u0111\u01B0\u1EE3c. B\u1EA1n h\xE3y r\xFAt ng\u1EAFn r\u1ED3i th\u1EED l\u1EA1i.",
  "plan.sections.one": "{count} ph\u1EA7n",
  "plan.sections.other": "{count} ph\u1EA7n",
  "plan.service": "D\u1ECBch v\u1EE5 {n}",
  "plan.services": "D\u1ECBch v\u1EE5 ({count})",
  "plan.title": "K\u1EBF ho\u1EA1ch site {name}",
  "plan.undo": "Ho\xE0n t\xE1c",
  "plan.undoLabel": "Ho\xE0n t\xE1c thay \u0111\u1ED5i g\u1EA7n nh\u1EA5t",
  "progress.clock": "Th\u1EDDi gian \u0111\xE3 tr\xF4i qua",
  "progress.done": "{count} \u0111\xE3 xong",
  "progress.failed": "{count} kh\xF4ng th\xE0nh c\xF4ng",
  "progress.note.failed": "Kh\xF4ng th\xE0nh c\xF4ng",
  "progress.note.failedTwice": "Kh\xF4ng th\xE0nh c\xF4ng hai l\u1EA7n",
  "progress.note.notStarted": "Ch\u01B0a b\u1EAFt \u0111\u1EA7u",
  "progress.pending": "{count} \u0111ang ch\u1EDD",
  "progress.running": "{count} \u0111ang ch\u1EA1y",
  "progress.state.done": "\u0110\xE3 xong",
  "progress.state.failed": "Kh\xF4ng th\xE0nh c\xF4ng",
  "progress.state.pending": "\u0110ang ch\u1EDD",
  "progress.state.running": "\u0110ang ch\u1EA1y",
  "progress.title.build": "\u0110ang d\u1EF1ng site c\u1EE7a b\u1EA1n",
  "progress.title.partial": "\u0110ang c\u1EADp nh\u1EADt site c\u1EE7a b\u1EA1n",
  "rebuild.changed": "K\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n \u0111\xE3 thay \u0111\u1ED5i t\u1EEB khi site \u0111\u01B0\u1EE3c d\u1EF1ng. Ch\u1EC9 ph\u1EA7n b\u1EA1n thay \u0111\u1ED5i \u0111\u01B0\u1EE3c d\u1EF1ng l\u1EA1i.",
  "rebuild.failed": "Y\xEAu c\u1EA7u c\u1EE7a b\u1EA1n ch\u01B0a \u0111\u01B0\u1EE3c g\u1EEDi. H\xE3y th\u1EED l\u1EA1i.",
  "rebuild.heldFiles": "C\xE1c file v\u1EABn c\xF2n tr\xEAn site c\u1EE7a b\u1EA1n",
  "rebuild.heldFile.person-photo": "\u1EA2nh {n}: m\u1ED9t ng\u01B0\u1EDDi b\u1EA1n mu\u1ED1n gi\u1EEF k\xEDn",
  "rebuild.say.abandon_done": "L\u01B0\u1EE3t c\u1EADp nh\u1EADt ch\u01B0a xong \u0111\xE3 \u0111\u01B0\u1EE3c hu\u1EF7. Site c\u1EE7a b\u1EA1n hi\u1EC3n th\u1ECB nh\u01B0 tr\u01B0\u1EDBc l\u01B0\u1EE3t \u0111\xF3.",
  "rebuild.say.held_file_left_on_site": "M\u1ED9t \u1EA3nh c\u1EE7a ng\u01B0\u1EDDi b\u1EA1n mu\u1ED1n gi\u1EEF k\xEDn v\u1EABn c\xF2n \u0111\u01B0\u1EE3c l\u01B0u tr\xEAn site c\u1EE7a b\u1EA1n d\u01B0\u1EDBi d\u1EA1ng file, d\xF9 kh\xF4ng trang n\xE0o hi\u1EC3n th\u1ECB n\xF3. M\xECnh ch\u01B0a xo\xE1 \u0111\u01B0\u1EE3c file. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xo\xE1 n\xF3 gi\xFAp b\u1EA1n.",
  "rebuild.say.nothing_to_update": "Site c\u1EE7a b\u1EA1n \u0111\xE3 hi\u1EC3n th\u1ECB \u0111\xFAng k\u1EBF ho\u1EA1ch n\xE0y, n\xEAn kh\xF4ng c\xF3 g\xEC \u0111\u1EC3 c\u1EADp nh\u1EADt.",
  "rebuild.say.previous_build_doors_missing": "M\xECnh ch\u01B0a c\u1EADp nh\u1EADt \u0111\u01B0\u1EE3c site c\u1EE7a b\u1EA1n t\u1EEB chat n\xE0y, n\xEAn site c\u1EE7a b\u1EA1n kh\xF4ng thay \u0111\u1ED5i. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xem chuy\u1EC7n g\xEC \u0111\xE3 x\u1EA3y ra.",
  "rebuild.say.previous_build_not_current": "Site c\u1EE7a b\u1EA1n \u0111\xE3 thay \u0111\u1ED5i trong l\xFAc l\u01B0\u1EE3t c\u1EADp nh\u1EADt n\xE0y \u0111ang chu\u1EA9n b\u1ECB, n\xEAn m\xECnh d\u1EEBng l\u1EA1i tr\u01B0\u1EDBc khi thay \u0111\u1ED5i b\u1EA5t c\u1EE9 th\u1EE9 g\xEC. Site c\u1EE7a b\u1EA1n kh\xF4ng thay \u0111\u1ED5i. B\u1EA1n c\xF3 th\u1EC3 c\u1EADp nh\u1EADt l\u1EA1i, v\xE0 m\xECnh s\u1EBD b\u1EAFt \u0111\u1EA7u t\u1EEB nh\u1EEFng g\xEC site \u0111ang hi\u1EC3n th\u1ECB.",
  "rebuild.say.previous_build_unreadable": "M\xECnh kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c site c\u1EE7a b\u1EA1n \u0111\u01B0\u1EE3c d\u1EF1ng l\u1EA7n g\u1EA7n nh\u1EA5t nh\u01B0 th\u1EBF n\xE0o, n\xEAn m\xECnh d\u1EEBng l\u1EA1i tr\u01B0\u1EDBc khi thay \u0111\u1ED5i b\u1EA5t c\u1EE9 th\u1EE9 g\xEC. Site c\u1EE7a b\u1EA1n kh\xF4ng thay \u0111\u1ED5i. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xem chuy\u1EC7n g\xEC \u0111\xE3 x\u1EA3y ra.",
  "rebuild.say.previous_run_unfinished": "M\u1ED9t l\u01B0\u1EE3t c\u1EADp nh\u1EADt tr\u01B0\u1EDBc \u0111\xF3 c\u1EE7a site ch\u01B0a xong, n\xEAn m\xECnh ch\u01B0a b\u1EAFt \u0111\u1EA7u l\u01B0\u1EE3t m\u1EDBi \u0111\u01B0\u1EE3c. B\u1EA1n c\xF3 th\u1EC3 hu\u1EF7 l\u01B0\u1EE3t c\u1EADp nh\u1EADt ch\u01B0a xong, vi\u1EC7c n\xE0y \u0111\u01B0a site c\u1EE7a b\u1EA1n v\u1EC1 nh\u01B0 tr\u01B0\u1EDBc l\u01B0\u1EE3t \u0111\xF3, r\u1ED3i c\u1EADp nh\u1EADt l\u1EA1i.",
  "rebuild.say.restore_done": "Site c\u1EE7a b\u1EA1n \u0111\xE3 tr\u1EDF v\u1EC1 phi\xEAn b\u1EA3n tr\u01B0\u1EDBc.",
  "rebuild.say.restore_needs_removal": "C\xF3 m\u1ED9t ph\u1EA7n c\u1EE7a l\u01B0\u1EE3t c\u1EADp nh\u1EADt g\u1EA7n nh\u1EA5t m\xECnh kh\xF4ng l\u1EA5y l\u1EA1i \u0111\u01B0\u1EE3c t\u1EEB chat n\xE0y, n\xEAn m\xECnh kh\xF4ng quay v\u1EC1 phi\xEAn b\u1EA3n tr\u01B0\u1EDBc. Site c\u1EE7a b\u1EA1n gi\u1EEF nguy\xEAn nh\u01B0 hi\u1EC7n t\u1EA1i. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xem chuy\u1EC7n g\xEC \u0111\xE3 x\u1EA3y ra.",
  "rebuild.say.restore_shows_held_text": "Phi\xEAn b\u1EA3n tr\u01B0\u1EDBc hi\u1EC3n th\u1ECB m\u1ED9t th\u1EE9 b\u1EA1n mu\u1ED1n gi\u1EEF k\xEDn, n\xEAn m\xECnh kh\xF4ng quay v\u1EC1 phi\xEAn b\u1EA3n \u0111\xF3. Site c\u1EE7a b\u1EA1n gi\u1EEF nguy\xEAn nh\u01B0 hi\u1EC7n t\u1EA1i.",
  "rebuild.say.restore_site_changed": "M\u1ED9t ph\u1EA7n site c\u1EE7a b\u1EA1n \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EEDa b\xEAn ngo\xE0i Tracy t\u1EEB l\u01B0\u1EE3t c\u1EADp nh\u1EADt g\u1EA7n nh\u1EA5t, n\xEAn m\xECnh kh\xF4ng quay v\u1EC1 phi\xEAn b\u1EA3n tr\u01B0\u1EDBc. Ch\u1ED7 b\u1EA1n s\u1EEDa \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i v\xE0 site c\u1EE7a b\u1EA1n gi\u1EEF nguy\xEAn nh\u01B0 hi\u1EC7n t\u1EA1i.",
  "rebuild.say.revision_needs_removal": "Thay \u0111\u1ED5i c\u1EE7a b\u1EA1n g\u1EE1 m\u1ED9t ph\u1EA7n c\u1EE7a site m\xE0 m\xECnh kh\xF4ng g\u1EE1 \u0111\u01B0\u1EE3c t\u1EEB chat n\xE0y, n\xEAn m\xECnh d\u1EEBng l\u1EA1i tr\u01B0\u1EDBc khi \u0111\u1ED5i b\u1EA5t c\u1EE9 th\u1EE9 g\xEC. Site c\u1EE7a b\u1EA1n kh\xF4ng thay \u0111\u1ED5i. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xem b\u1EA1n \u0111\xE3 y\xEAu c\u1EA7u g\xEC.",
  "rebuild.say.site_already_built": "Site c\u1EE7a b\u1EA1n \u0111\xE3 \u0111\u01B0\u1EE3c d\u1EF1ng, n\xEAn m\xECnh kh\xF4ng d\u1EF1ng l\u1EA1i t\u1EEB \u0111\u1EA7u. B\u1EA1n h\xE3y \u0111\u1ED5i k\u1EBF ho\u1EA1ch v\xE0 c\u1EADp nh\u1EADt site, ch\u1EC9 ph\u1EA7n b\u1EA1n thay \u0111\u1ED5i \u0111\u01B0\u1EE3c d\u1EF1ng l\u1EA1i.",
  "rebuild.say.site_changed_outside": "M\u1ED9t ph\u1EA7n site c\u1EE7a b\u1EA1n \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EEDa b\xEAn ngo\xE0i Tracy t\u1EEB khi site \u0111\u01B0\u1EE3c d\u1EF1ng, n\xEAn m\xECnh d\u1EEBng l\u1EA1i tr\u01B0\u1EDBc khi ghi \u0111\xE8 l\xEAn ch\u1ED7 s\u1EEDa \u0111\xF3. Ch\u1ED7 b\u1EA1n s\u1EEDa \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xem \u0111\xF3 l\xE0 ph\u1EA7n n\xE0o.",
  "rebuild.say.update_done": "Site c\u1EE7a b\u1EA1n \u0111\xE3 \u0111\u01B0\u1EE3c c\u1EADp nh\u1EADt. Ch\u1EC9 c\xE1c ph\u1EA7n thay \u0111\u1ED5i c\u1EE7a b\u1EA1n ch\u1EA1m t\u1EDBi \u0111\u01B0\u1EE3c d\u1EF1ng l\u1EA1i, ph\u1EA7n c\xF2n l\u1EA1i gi\u1EEF nguy\xEAn.",
  "rebuild.say.write_record_stale": "L\u01B0\u1EE3t c\u1EADp nh\u1EADt n\xE0y b\u1ECB l\u1EABn v\u1EDBi m\u1ED9t l\u01B0\u1EE3t tr\u01B0\u1EDBc \u0111\xF3, n\xEAn m\xECnh d\u1EEBng l\u1EA1i tr\u01B0\u1EDBc khi thay \u0111\u1ED5i b\u1EA5t c\u1EE9 th\u1EE9 g\xEC. Site c\u1EE7a b\u1EA1n kh\xF4ng thay \u0111\u1ED5i. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xem chuy\u1EC7n g\xEC \u0111\xE3 x\u1EA3y ra.",
  "rebuild.restore": "Restore v\u1EC1 phi\xEAn b\u1EA3n tr\u01B0\u1EDBc",
  "rebuild.title": "Site c\u1EE7a b\u1EA1n",
  "rebuild.undo": "Hu\u1EF7 l\u01B0\u1EE3t c\u1EADp nh\u1EADt ch\u01B0a xong",
  "rebuild.update": "C\u1EADp nh\u1EADt site",
  "retry.button": "Th\u1EED l\u1EA1i",
  "review.failed": "C\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a b\u1EA1n ch\u01B0a \u0111\u01B0\u1EE3c g\u1EEDi. H\xE3y th\u1EED l\u1EA1i.",
  "review.question": "Duy\u1EC7t k\u1EBF ho\u1EA1ch n\xE0y?",
  "review.approve": "Duy\u1EC7t",
  "review.change": "\u0110\u1ED5i k\u1EBF ho\u1EA1ch",
  "review.say": "Ho\u1EB7c m\xF4 t\u1EA3 thay \u0111\u1ED5i b\u1EA1n mu\u1ED1n",
  "review.summary": "{name} g\u1ED3m {pages} v\xE0 {services}",
  "review.summary.one": "{name} g\u1ED3m {part}",
  "review.pages.one": "{count} trang",
  "review.pages.other": "{count} trang",
  "stopped.kept.none": "\u0110\xE3 gi\u1EEF l\u1EA1i: k\u1EBF ho\u1EA1ch v\xE0 c\xE1c c\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a b\u1EA1n.",
  "stopped.kept.one": "\u0110\xE3 gi\u1EEF l\u1EA1i: k\u1EBF ho\u1EA1ch, c\xE1c c\xE2u tr\u1EA3 l\u1EDDi v\xE0 trang \u0111\xE3 vi\u1EBFt c\u1EE7a b\u1EA1n.",
  "stopped.kept.other": "\u0110\xE3 gi\u1EEF l\u1EA1i: k\u1EBF ho\u1EA1ch, c\xE1c c\xE2u tr\u1EA3 l\u1EDDi v\xE0 {count} trang \u0111\xE3 vi\u1EBFt c\u1EE7a b\u1EA1n.",
  "stopped.notified": "\u0110\u1ED9i ng\u0169 Tracy \u0111\xE3 \u0111\u01B0\u1EE3c b\xE1o v\xE0 s\u1EBD theo d\xF5i. B\u1EA1n kh\xF4ng c\u1EA7n l\xE0m g\xEC c\u1EA3.",
  "stopped.notStarted": "Ch\u01B0a b\u1EAFt \u0111\u1EA7u t\u1EA1o \u0111\u01B0\u1EE3c site c\u1EE7a b\u1EA1n, nh\u01B0ng k\u1EBF ho\u1EA1ch v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i v\xE0 b\u1EA1n c\xF3 th\u1EC3 duy\u1EC7t l\u1EA1i sau.",
  "stopped.notStarted.design": "M\u1EABu thi\u1EBFt k\u1EBF n\xE0y ch\u01B0a th\u1EC3 d\u1EF1ng \u0111\u01B0\u1EE3c, n\xEAn site c\u1EE7a b\u1EA1n ch\u01B0a \u0111\u01B0\u1EE3c b\u1EAFt \u0111\u1EA7u, nh\u01B0ng k\u1EBF ho\u1EA1ch v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i v\xE0 b\u1EA1n c\xF3 th\u1EC3 duy\u1EC7t l\u1EA1i sau.",
  "stopped.once": 'M\xECnh kh\xF4ng ho\xE0n th\xE0nh \u0111\u01B0\u1EE3c "{step}", n\xEAn m\xECnh d\u1EEBng l\u1EA1i thay v\xEC \u0111\u01B0a b\u1EA1n m\u1ED9t site ch\u01B0a ho\xE0n ch\u1EC9nh.',
  "stopped.title": "Site c\u1EE7a b\u1EA1n ch\u01B0a ho\xE0n t\u1EA5t",
  "stopped.twice": 'M\xECnh kh\xF4ng ho\xE0n th\xE0nh \u0111\u01B0\u1EE3c "{step}" sau hai l\u1EA7n th\u1EED, n\xEAn m\xECnh d\u1EEBng l\u1EA1i thay v\xEC \u0111\u01B0a b\u1EA1n m\u1ED9t site ch\u01B0a ho\xE0n ch\u1EC9nh.',
  "stopped.unchanged": "Site hi\u1EC7n t\u1EA1i c\u1EE7a b\u1EA1n kh\xF4ng thay \u0111\u1ED5i.",
  "template.chosen": "\u0110\xE3 ch\u1ECDn: {name}",
  "template.continue": "Ti\u1EBFp t\u1EE5c",
  "template.later": "B\u1EA1n c\xF3 th\u1EC3 \u0111\u1ED5i m\u1EABu thi\u1EBFt k\u1EBF sau.",
  "template.list": "C\xE1c m\u1EABu thi\u1EBFt k\u1EBF cho site c\u1EE7a b\u1EA1n",
  "template.none": "Ch\u01B0a c\xF3 m\u1EABu thi\u1EBFt k\u1EBF s\u1EB5n s\xE0ng n\xE0o ph\xF9 h\u1EE3p v\u1EDBi doanh nghi\u1EC7p c\u1EE7a b\u1EA1n.",
  "template.noneNext": "B\u1EA1n v\u1EABn c\xF3 th\u1EC3 t\u1EA1o site t\u1EEB trang Th\xEAm site.",
  "template.openAddSite": "M\u1EDF Th\xEAm site",
  "template.picked": "M\xECnh \u0111\xE3 ch\u1ECDn {name}.",
  "template.recommended": "\u0110\u1EC1 xu\u1EA5t",
  "template.saveFailed": "L\u1EF1a ch\u1ECDn c\u1EE7a b\u1EA1n ch\u01B0a \u0111\u01B0\u1EE3c l\u01B0u. H\xE3y th\u1EED l\u1EA1i.",
  "template.sendFailed": "L\u1EF1a ch\u1ECDn c\u1EE7a b\u1EA1n \u0111\xE3 \u0111\u01B0\u1EE3c l\u01B0u, nh\u01B0ng ch\u01B0a t\u1EDBi chat. Nh\u1EA5n Ti\u1EBFp t\u1EE5c \u0111\u1EC3 g\u1EEDi l\u1EA1i.",
  "template.use": "D\xF9ng {name}",
  "tool.edit": "\u0110\xE3 c\u1EADp nh\u1EADt k\u1EBF ho\u1EA1ch site c\u1EE7a b\u1EA1n",
  "tool.plan": "\u0110\xE3 l\u1EADp k\u1EBF ho\u1EA1ch site c\u1EE7a b\u1EA1n",
  "tool.research.none": "\u0110\xE3 t\xECm hi\u1EC3u v\u1EC1 doanh nghi\u1EC7p c\u1EE7a b\u1EA1n",
  "tool.research.one": "\u0110\xE3 \u0111\u1ECDc {count} ngu\u1ED3n",
  "tool.research.other": "\u0110\xE3 \u0111\u1ECDc {count} ngu\u1ED3n",
  "links.reading": "{name}: \u0111ang \u0111\u1ECDc",
  "links.choice": "{name}: c\u1EA7n b\u1EA1n ch\u1ECDn",
  "links.failed": "{name}: kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c",
  "links.failedWhy": "{name}: kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c ({reason})",
  "links.read": "{name}: \u0111\xE3 \u0111\u1ECDc",
  "links.readNothing": "{name}: \u0111\xE3 \u0111\u1ECDc, nh\u01B0ng kh\xF4ng t\xECm th\u1EA5y th\xF4ng tin n\xE0o v\u1EC1 doanh nghi\u1EC7p",
  "links.readPicturesLost": "{name}: \u0111\xE3 \u0111\u1ECDc, nh\u01B0ng kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c \u1EA3nh",
  "links.readPicturesNotKept": "{name}: \u0111\xE3 \u0111\u1ECDc, nh\u01B0ng kh\xF4ng l\u01B0u \u0111\u01B0\u1EE3c \u1EA3nh",
  "links.facts.one": "{count} th\xF4ng tin",
  "links.facts.other": "{count} th\xF4ng tin",
  "links.pictures.one": "{count} \u1EA3nh",
  "links.pictures.other": "{count} \u1EA3nh",
  "links.pictures.none": "Kh\xF4ng c\xF3 \u1EA3nh",
  "links.pictures.someLost": "{count} \u1EA3nh kh\xE1c kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c",
  "tool.stopped": "B\u01B0\u1EDBc n\xE0y kh\xF4ng ho\xE0n th\xE0nh \u0111\u01B0\u1EE3c",
  "tool.templates": "\u0110\xE3 t\xECm th\u1EA5y c\xE1c m\u1EABu thi\u1EBFt k\u1EBF cho site c\u1EE7a b\u1EA1n",
  "tool.working": "\u0110ang l\u1EADp k\u1EBF ho\u1EA1ch site c\u1EE7a b\u1EA1n",
  "plan.revised.notDone.owner_value_not_shown.what": "Hi\u1EC7n {label} c\u1EE7a b\u1EA1n tr\xEAn site",
  "plan.revised.notDone.owner_value_not_shown.why": "C\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a b\u1EA1n \u0111\xE3 \u0111\u01B0\u1EE3c l\u01B0u, nh\u01B0ng m\u1EABu thi\u1EBFt k\u1EBF c\u1EE7a b\u1EA1n kh\xF4ng c\xF3 ch\u1ED7 n\xE0o hi\u1EC7n n\xF3.",
  "plan.revised.names.counted": "{count} {plural}",
  "plan.revised.notDone.reason.no_recipe": "M\u1EABu thi\u1EBFt k\u1EBF c\u1EE7a b\u1EA1n kh\xF4ng c\xF3 trang lo\u1EA1i n\xE0y.",
  "plan.revised.notDone.reason.no_data": "Doanh nghi\u1EC7p c\u1EE7a b\u1EA1n ch\u01B0a c\xF3 g\xEC \u0111\u1EC3 \u0111i\u1EC1n v\xE0o ph\u1EA7n n\xE0y.",
  "plan.revised.notDone.reason.fact_missing": "Doanh nghi\u1EC7p c\u1EE7a b\u1EA1n ch\u01B0a c\xF3 th\xF4ng tin n\xE0y.",
  "plan.revised.notDone.reason.kept_private": "B\u1EA1n gi\u1EEF th\xF4ng tin n\xE0y ngo\xE0i site.",
  "plan.revised.notDone.reason.outside_plan": "Y\xEAu c\u1EA7u thay \u0111\u1ED5i kh\xF4ng \u0111\u1ED5i \u0111\u01B0\u1EE3c m\u1EE5c n\xE0y. B\u1EA1n h\xE3y \u0111\u1ED5i n\xF3 tr\xEAn th\u1EBB k\u1EBF ho\u1EA1ch.",
  "plan.leftOut.reason.no_email_for_form": "Doanh nghi\u1EC7p c\u1EE7a b\u1EA1n kh\xF4ng c\xF3 \u0111\u1ECBa ch\u1EC9 email \u0111\u1EC3 bi\u1EC3u m\u1EABu \u0111\u0103ng k\xFD g\u1EEDi c\xE2u tr\u1EA3 l\u1EDDi t\u1EDBi.",
  "plan.leftOut.reason.no_booking_link": "B\u1EA1n ch\u01B0a c\xF3 link \u0111\u1EB7t l\u1ECBch ho\u1EB7c li\xEAn h\u1EC7 \u0111\u1EC3 n\xFAt c\u1EE7a ph\u1EA7n n\xE0y m\u1EDF ra.",
  "plan.leftOut.reason.no_items_to_show": "B\u1EA1n ch\u01B0a c\xF3 g\xEC \u0111\u1EC3 ph\u1EA7n n\xE0y hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.shown_in_other_sections": "Nh\u1EEFng g\xEC ph\u1EA7n n\xE0y \u0111\u1ECBnh hi\u1EC3n th\u1ECB \u0111\xE3 c\xF3 \u1EDF c\xE1c ph\u1EA7n kh\xE1c trong k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n.",
  "plan.leftOut.reason.owner_withheld": "B\u1EA1n \u0111\xE3 y\xEAu c\u1EA7u gi\u1EEF m\u1EE5c n\xE0y ngo\xE0i site.",
  "plan.leftOut.reason.left_out_neutral.page": "Trang n\xE0y kh\xF4ng n\u1EB1m trong k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n.",
  "plan.leftOut.reason.left_out_neutral.block": "Ph\u1EA7n n\xE0y kh\xF4ng n\u1EB1m trong k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n.",
  "plan.leftOut.reason.left_out_neutral.item": "M\u1EE5c n\xE0y kh\xF4ng hi\u1EC3n th\u1ECB trong k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n.",
  "plan.leftOut.reason.no_gallery_room.one": "Kh\xF4ng b\u1ED9 s\u01B0u t\u1EADp \u1EA3nh n\xE0o c\xF2n ch\u1ED7 cho \u1EA3nh n\xE0y. \u1EA2nh n\xE0y v\u1EABn n\u1EB1m trong kho \u1EA3nh c\u1EE7a b\u1EA1n v\xE0 c\xF3 th\u1EC3 \u0111\u01B0\u1EE3c d\xF9ng \u1EDF ch\u1ED7 kh\xE1c tr\xEAn site.",
  "plan.leftOut.reason.no_gallery_room.other": "Kh\xF4ng b\u1ED9 s\u01B0u t\u1EADp \u1EA3nh n\xE0o c\xF2n ch\u1ED7 cho {count} \u1EA3nh n\xE0y. C\xE1c \u1EA3nh n\xE0y v\u1EABn n\u1EB1m trong kho \u1EA3nh c\u1EE7a b\u1EA1n v\xE0 c\xF3 th\u1EC3 \u0111\u01B0\u1EE3c d\xF9ng \u1EDF ch\u1ED7 kh\xE1c tr\xEAn site.",
  "plan.pictures.estimate.one": "Kho\u1EA3ng {count} h\xECnh s\u1EBD \u0111\u01B0\u1EE3c t\u1EA1o \u1EDF ch\u1ED7 b\u1EA1n ch\u01B0a c\xF3 \u1EA3nh ph\xF9 h\u1EE3p. Con s\u1ED1 cu\u1ED1i c\xF9ng tu\u1EF3 v\xE0o \u1EA3nh c\u1EE7a b\u1EA1n.",
  "plan.pictures.estimate.other": "Kho\u1EA3ng {count} h\xECnh s\u1EBD \u0111\u01B0\u1EE3c t\u1EA1o \u1EDF ch\u1ED7 b\u1EA1n ch\u01B0a c\xF3 \u1EA3nh ph\xF9 h\u1EE3p. Con s\u1ED1 cu\u1ED1i c\xF9ng tu\u1EF3 v\xE0o \u1EA3nh c\u1EE7a b\u1EA1n.",
  "plan.logoSource.website": "Trang web",
  "plan.logoSource.google": "Trang Google Maps",
  "plan.logoSource.instagram": "Trang Instagram",
  "plan.logoSource.facebook": "Trang Facebook",
  "plan.logoSource.tiktok": "Trang TikTok",
  "plan.assumption.logo_drawn.new-symbol-drawn": "Tracy \u0111\xE3 v\u1EBD m\u1ED9t logo d\u1EF1a tr\xEAn logo c\u1EE7a b\u1EA1n: m\u1ED9t bi\u1EC3u t\u01B0\u1EE3ng m\u1EDBi cho ng\xE0nh ngh\u1EC1 c\u1EE7a b\u1EA1n, \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p, vi\u1EBFt b\u1EB1ng ph\xF4ng ch\u1EEF c\u1EE7a template. \u0110\xE2y kh\xF4ng ph\u1EA3i file logo c\u1EE7a b\u1EA1n. B\u1EA1n h\xE3y duy\u1EC7t n\xF3, ho\u1EB7c g\u1EEDi logo c\u1EE7a b\u1EA1n \u0111\u1EC3 thay.",
  "plan.assumption.logo_drawn.symbol-cut-from-logo": "Tracy \u0111\xE3 v\u1EBD m\u1ED9t logo d\u1EF1a tr\xEAn logo c\u1EE7a b\u1EA1n: bi\u1EC3u t\u01B0\u1EE3ng c\u1EAFt ra t\u1EEB logo c\u1EE7a b\u1EA1n, \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p, vi\u1EBFt b\u1EB1ng ph\xF4ng ch\u1EEF c\u1EE7a template. \u0110\xE2y kh\xF4ng ph\u1EA3i file logo c\u1EE7a b\u1EA1n. B\u1EA1n h\xE3y duy\u1EC7t n\xF3, ho\u1EB7c g\u1EEDi logo c\u1EE7a b\u1EA1n \u0111\u1EC3 thay.",
  "plan.assumption.logo_drawn.name-set-in-template-font": "Tracy \u0111\xE3 v\u1EBD m\u1ED9t logo d\u1EF1a tr\xEAn logo c\u1EE7a b\u1EA1n: m\u1ED9t d\u1EA5u hi\u1EC7u \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p, vi\u1EBFt b\u1EB1ng ph\xF4ng ch\u1EEF c\u1EE7a template. \u0110\xE2y kh\xF4ng ph\u1EA3i file logo c\u1EE7a b\u1EA1n. B\u1EA1n h\xE3y duy\u1EC7t n\xF3, ho\u1EB7c g\u1EEDi logo c\u1EE7a b\u1EA1n \u0111\u1EC3 thay.",
  "plan.assumption.logo_made.found.icon": "Logo c\u1EE7a b\u1EA1n kh\xF4ng d\xF9ng \u0111\u01B0\u1EE3c nh\u01B0 hi\u1EC7n c\xF3, n\xEAn m\xECnh \u0111\xE3 l\xE0m m\u1ED9t logo t\u1EA1m: m\u1ED9t bi\u1EC3u t\u01B0\u1EE3ng \u0111\u01A1n gi\u1EA3n cho ng\xE0nh ngh\u1EC1 c\u1EE7a b\u1EA1n, \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p. B\u1EA1n h\xE3y g\u1EEDi file logo v\xE0o chat n\xE0y \u0111\u1EC3 thay.",
  "plan.assumption.logo_made.found.lettermark": "Logo c\u1EE7a b\u1EA1n kh\xF4ng d\xF9ng \u0111\u01B0\u1EE3c nh\u01B0 hi\u1EC7n c\xF3, n\xEAn m\xECnh \u0111\xE3 l\xE0m m\u1ED9t logo t\u1EA1m: ch\u1EEF c\xE1i \u0111\u1EA7u t\xEAn c\u1EE7a b\u1EA1n, \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p. B\u1EA1n h\xE3y g\u1EEDi file logo v\xE0o chat n\xE0y \u0111\u1EC3 thay.",
  "plan.assumption.logo_made.found.mark": "Logo c\u1EE7a b\u1EA1n kh\xF4ng d\xF9ng \u0111\u01B0\u1EE3c nh\u01B0 hi\u1EC7n c\xF3, n\xEAn m\xECnh \u0111\xE3 l\xE0m m\u1ED9t logo t\u1EA1m: m\u1ED9t d\u1EA5u hi\u1EC7u \u0111\u01A1n gi\u1EA3n, \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p. B\u1EA1n h\xE3y g\u1EEDi file logo v\xE0o chat n\xE0y \u0111\u1EC3 thay.",
  "plan.assumption.logo_made.none.icon": "M\xECnh kh\xF4ng t\xECm th\u1EA5y logo n\xE0o, n\xEAn \u0111\xE3 l\xE0m m\u1ED9t logo t\u1EA1m: m\u1ED9t bi\u1EC3u t\u01B0\u1EE3ng \u0111\u01A1n gi\u1EA3n cho ng\xE0nh ngh\u1EC1 c\u1EE7a b\u1EA1n, \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p, theo m\xE0u ch\xEDnh c\u1EE7a m\u1EABu thi\u1EBFt k\u1EBF. B\u1EA1n h\xE3y g\u1EEDi logo v\xE0o chat n\xE0y \u0111\u1EC3 thay.",
  "plan.assumption.logo_made.none.lettermark": "M\xECnh kh\xF4ng t\xECm th\u1EA5y logo n\xE0o, n\xEAn \u0111\xE3 l\xE0m m\u1ED9t logo t\u1EA1m: ch\u1EEF c\xE1i \u0111\u1EA7u t\xEAn c\u1EE7a b\u1EA1n, \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p, theo m\xE0u ch\xEDnh c\u1EE7a m\u1EABu thi\u1EBFt k\u1EBF. B\u1EA1n h\xE3y g\u1EEDi logo v\xE0o chat n\xE0y \u0111\u1EC3 thay.",
  "plan.assumption.logo_made.none.mark": "M\xECnh kh\xF4ng t\xECm th\u1EA5y logo n\xE0o, n\xEAn \u0111\xE3 l\xE0m m\u1ED9t logo t\u1EA1m: m\u1ED9t d\u1EA5u hi\u1EC7u \u0111\u01A1n gi\u1EA3n, \u0111\u1EB7t c\u1EA1nh t\xEAn doanh nghi\u1EC7p, theo m\xE0u ch\xEDnh c\u1EE7a m\u1EABu thi\u1EBFt k\u1EBF. B\u1EA1n h\xE3y g\u1EEDi logo v\xE0o chat n\xE0y \u0111\u1EC3 thay.",
  "plan.hours.days": "{from} \u0111\u1EBFn {to}",
  "plan.hours.time": "{from} \u0111\u1EBFn {to}",
  "plan.hours.closed": "ngh\u1EC9",
  "plan.hours.ranges": "{first} v\xE0 {next}",
  "plan.hours.group": "{days}, {hours}",
  "plan.hours.groups": "{first}; {next}",
  "plan.section.header": "Menu",
  "plan.section.footer": "Ch\xE2n trang",
  "plan.section.hero": "Ph\u1EA7n m\u1EDF \u0111\u1EA7u",
  "plan.section.page_header": "\u0110\u1EA7u trang",
  "plan.section.about": "Gi\u1EDBi thi\u1EC7u",
  "plan.section.text": "V\u0103n b\u1EA3n",
  "plan.section.call_to_action": "K\xEAu g\u1ECDi h\xE0nh \u0111\u1ED9ng",
  "plan.section.contact": "Th\xF4ng tin li\xEAn h\u1EC7",
  "plan.section.map": "B\u1EA3n \u0111\u1ED3",
  "plan.section.video": "Video",
  "plan.section.newsletter": "B\u1EA3n tin",
  "plan.section.services": "D\u1ECBch v\u1EE5",
  "plan.section.menu": "Th\u1EF1c \u0111\u01A1n",
  "plan.section.pricing": "B\u1EA3ng gi\xE1",
  "plan.section.schedule": "L\u1ECBch",
  "plan.section.team": "\u0110\u1ED9i ng\u0169",
  "plan.section.stats": "S\u1ED1 li\u1EC7u",
  "plan.section.steps": "C\xE1c b\u01B0\u1EDBc",
  "plan.section.reviews": "\u0110\xE1nh gi\xE1",
  "plan.section.claims": "Gi\u1EA3i th\u01B0\u1EDFng",
  "plan.section.faq": "C\xE2u h\u1ECFi",
  "plan.section.events": "S\u1EF1 ki\u1EC7n",
  "plan.section.posts": "B\xE0i vi\u1EBFt",
  "plan.section.gallery": "\u1EA2nh",
  "rebuild.say.door_not_available": "Site c\u1EE7a b\u1EA1n kh\xF4ng cho m\xECnh th\u1EF1c hi\u1EC7n thay \u0111\u1ED5i n\xE0y t\u1EEB chat n\xE0y, n\xEAn m\xECnh \u0111\xE3 d\u1EEBng l\u01B0\u1EE3t c\u1EADp nh\u1EADt. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xem \u0111\xF3 l\xE0 ph\u1EA7n n\xE0o.",
  "rebuild.say.sheets_unreadable": "M\xECnh kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c c\xE1c b\u1EA3ng ki\u1EC3u (style sheet) c\u1EE7a site, n\xEAn m\xECnh d\u1EEBng l\u1EA1i tr\u01B0\u1EDBc khi \u0111\u1ED5i m\xE0u. \u0110\u1ED9i ng\u0169 c\xF3 th\u1EC3 xem chuy\u1EC7n g\xEC \u0111\xE3 x\u1EA3y ra.",
  "ask.question.contact_method": "M\xECnh kh\xF4ng t\xECm th\u1EA5y s\u1ED1 \u0111i\u1EC7n tho\u1EA1i, email hay link \u0111\u1EB7t l\u1ECBch n\xE0o. Kh\xE1ch n\xEAn li\xEAn h\u1EC7 v\u1EDBi b\u1EA1n b\u1EB1ng c\xE1ch n\xE0o?",
  "ask.question.site_language": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n d\xF9ng nhi\u1EC1u h\u01A1n m\u1ED9t ng\xF4n ng\u1EEF. Site c\u1EE7a b\u1EA1n n\xEAn d\xF9ng ng\xF4n ng\u1EEF n\xE0o?",
  "ask.question.main_button": "N\xFAt ch\xEDnh tr\xEAn site c\u1EE7a b\u1EA1n n\xEAn m\u1EDDi kh\xE1ch l\xE0m g\xEC?",
  "ask.question.fact_conflict_business.phone": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi s\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xE1c nhau. S\u1ED1 n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_business.email": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi \u0111\u1ECBa ch\u1EC9 email kh\xE1c nhau. \u0110\u1ECBa ch\u1EC9 n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_business.address": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi \u0111\u1ECBa ch\u1EC9 kh\xE1c nhau. \u0110\u1ECBa ch\u1EC9 n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_business.hours": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi gi\u1EDD m\u1EDF c\u1EEDa kh\xE1c nhau. Gi\u1EDD n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_business.link": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi link \u0111\u1EB7t l\u1ECBch ho\u1EB7c li\xEAn h\u1EC7 kh\xE1c nhau. Link n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_business.name": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi t\xEAn doanh nghi\u1EC7p kh\xE1c nhau. T\xEAn n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_business.price": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi gi\xE1 kh\xE1c nhau. Gi\xE1 n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_item.phone": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi s\u1ED1 \u0111i\u1EC7n tho\u1EA1i c\u1EE7a {item} kh\xE1c nhau. S\u1ED1 n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_item.email": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi \u0111\u1ECBa ch\u1EC9 email c\u1EE7a {item} kh\xE1c nhau. \u0110\u1ECBa ch\u1EC9 n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_item.address": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi \u0111\u1ECBa ch\u1EC9 c\u1EE7a {item} kh\xE1c nhau. \u0110\u1ECBa ch\u1EC9 n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_item.hours": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi gi\u1EDD m\u1EDF c\u1EEDa c\u1EE7a {item} kh\xE1c nhau. Gi\u1EDD n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_item.link": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi link \u0111\u1EB7t l\u1ECBch ho\u1EB7c li\xEAn h\u1EC7 c\u1EE7a {item} kh\xE1c nhau. Link n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_item.name": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi t\xEAn doanh nghi\u1EC7p c\u1EE7a {item} kh\xE1c nhau. T\xEAn n\xE0o \u0111\xFAng?",
  "ask.question.fact_conflict_item.price": "C\xE1c trang c\xF4ng khai c\u1EE7a b\u1EA1n ghi gi\xE1 c\u1EE7a {item} kh\xE1c nhau. Gi\xE1 n\xE0o \u0111\xFAng?",
  "ask.choice.contact_method_phone": "M\u1ED9t s\u1ED1 \u0111i\u1EC7n tho\u1EA1i",
  "ask.choice.contact_method_email": "M\u1ED9t \u0111\u1ECBa ch\u1EC9 email",
  "ask.choice.contact_method_link": "M\u1ED9t link \u0111\u1EB7t l\u1ECBch ho\u1EB7c li\xEAn h\u1EC7",
  "ask.from": "T\u1EEB {sources}",
  "ask.and": "{first} v\xE0 {last}",
  "ask.source.website": "Trang web",
  "ask.source.google_maps": "Trang Google Maps",
  "ask.source.owner_answer": "C\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a b\u1EA1n",
  "ask.source.instagram": "Trang Instagram",
  "ask.source.facebook": "Trang Facebook",
  "ask.source.tiktok": "Trang TikTok",
  "ask.source.social": "Trang m\u1EA1ng x\xE3 h\u1ED9i",
  "ask.question.place_choice": "Ch\xFAng t\xF4i t\xECm th\u1EA5y nhi\u1EC1u \u0111\u1ECBa \u0111i\u1EC3m tr\xEAn Google Maps c\xF3 c\xF9ng t\xEAn n\xE0y. \u0110\xE2u l\xE0 \u0111\u1ECBa \u0111i\u1EC3m c\u1EE7a b\u1EA1n?",
  "ask.choice.place_choice_none": "Kh\xF4ng ph\u1EA3i \u0111\u1ECBa \u0111i\u1EC3m n\xE0o \u1EDF tr\xEAn",
  "ask.choice.main_button_book": "\u0110\u1EB7t l\u1ECBch tr\u1EF1c tuy\u1EBFn",
  "ask.choice.main_button_call": "G\u1ECDi cho ch\xFAng t\xF4i",
  "ask.choice.main_button_email": "G\u1EEDi email cho ch\xFAng t\xF4i",
  "ask.choice.main_button_message": "Nh\u1EAFn tin cho ch\xFAng t\xF4i",
  "ask.choice.main_button_visit": "Gh\xE9 th\u0103m ch\xFAng t\xF4i",
  "ask.choice.main_button_contact": "Li\xEAn h\u1EC7 v\u1EDBi ch\xFAng t\xF4i",
  "ask.choice.main_button_book_short": "\u0110\u1EB7t l\u1ECBch",
  "ask.choice.main_button_call_short": "G\u1ECDi",
  "ask.choice.main_button_email_short": "Email",
  "ask.choice.main_button_message_short": "Nh\u1EAFn tin",
  "ask.choice.main_button_visit_short": "Gh\xE9 th\u0103m",
  "ask.choice.main_button_contact_short": "Li\xEAn h\u1EC7",
  "ask.choice.main_button_text": "Ch\u1EEF tr\xEAn n\xFAt: {text}",
  "ask.source.listing": "Trang danh b\u1EA1",
  "plan.source.listing": "Trang danh b\u1EA1",
  "tool.working.research": "\u0110ang \u0111\u1ECDc c\xE1c link c\u1EE7a b\u1EA1n",
  "tool.working.about": "\u0110ang t\xECm hi\u1EC3u v\u1EC1 doanh nghi\u1EC7p c\u1EE7a b\u1EA1n",
  "tool.working.templates": "\u0110ang t\xECm m\u1EABu thi\u1EBFt k\u1EBF cho site c\u1EE7a b\u1EA1n",
  "tool.working.build": "\u0110ang d\u1EF1ng site c\u1EE7a b\u1EA1n",
  "tool.working.startOver": "\u0110ang b\u1EAFt \u0111\u1EA7u l\u1EA1i",
  "tool.waiting.place": "\u0110ang ch\u1EDD b\u1EA1n ch\u1ECDn \u0111\u1ECBa \u0111i\u1EC3m c\u1EE7a m\xECnh",
  "links.pictures.foundSome": "T\xECm th\u1EA5y {count} \u1EA3nh, d\xF9ng \u0111\u01B0\u1EE3c {usable} \u1EA3nh",
  "links.pictures.foundNotOwn.one": "T\xECm th\u1EA5y {count} \u1EA3nh, kh\xF4ng do doanh nghi\u1EC7p \u0111\u0103ng",
  "links.pictures.foundNotOwn.other": "T\xECm th\u1EA5y {count} \u1EA3nh, kh\xF4ng \u1EA3nh n\xE0o do doanh nghi\u1EC7p \u0111\u0103ng",
  "links.pictures.foundNone.one": "T\xECm th\u1EA5y {count} \u1EA3nh, kh\xF4ng d\xF9ng \u0111\u01B0\u1EE3c",
  "links.pictures.foundNone.other": "T\xECm th\u1EA5y {count} \u1EA3nh, kh\xF4ng \u1EA3nh n\xE0o d\xF9ng \u0111\u01B0\u1EE3c",
  "say.researchRead": "M\xECnh \u0111\xE3 \u0111\u1ECDc nh\u1EEFng g\xEC b\u1EA1n g\u1EEDi v\u1EC1 doanh nghi\u1EC7p c\u1EE7a b\u1EA1n."
};

// src/host/chat-tables.mjs
var TABLES = { de: tracy_build_chat_default, es: tracy_build_chat_default2, fr: tracy_build_chat_default3, it: tracy_build_chat_default4, nl: tracy_build_chat_default5, zh: tracy_build_chat_default6, vi: tracy_build_chat_default7 };
var CHAT_LANGUAGES = Object.freeze(["en", ...Object.keys(TABLES)]);
function chatLanguageOf(spoken, interfaceLanguage) {
  const said = chatLanguageTagOf(spoken);
  if (said !== null && CHAT_LANGUAGES.includes(said)) return said;
  return chatLanguageTagOf(interfaceLanguage);
}
function chatWordsIn(language, english2) {
  if (typeof language !== "string" || !CHAT_LANGUAGES.includes(language)) return null;
  return wordsOver(TABLES[language] ?? {}, english2);
}

// src/host/ask-words.mjs
function askWordsFor(language) {
  return chatWordsIn(language, ASK_STRINGS);
}

// src/host/start-over.mjs
var START_OVER_CONFIRM_SAY = "This discards what Tracy has gathered so far. A site already built is not affected.";
var START_OVER_DONE_FALLBACK_SAY = "What I gathered so far is discarded. Open the build chat again to start a new conversation.";
var START_OVER_REFUSED_FALLBACK_SAY = "I cannot start over right now. You can continue in this conversation.";
function startOverQuestion() {
  return {
    confirm: true,
    say: START_OVER_CONFIRM_SAY,
    next: "Say the sentence in say and ask the owner whether to start over. Only when the owner clearly says yes, call tracy_build with action start-over and confirm true. Otherwise continue as before."
  };
}
function startOverAnswerOf(res, ownerSay2) {
  if (res.status >= 200 && res.status < 300)
    return {
      startedOver: true,
      open: typeof res.body?.open === "string" ? res.body.open : "/new/build",
      say: ownerSay2(res.body?.say, START_OVER_DONE_FALLBACK_SAY),
      next: "Say the sentence in say, then stop. This conversation is closed: do not call tracy_build again here."
    };
  return {
    refused: true,
    say: ownerSay2(res.body?.say, START_OVER_REFUSED_FALLBACK_SAY),
    next: "Say the sentence in say. Nothing was discarded; continue as before."
  };
}

// src/host/build-tool.mjs
var INTERFACE_LANGUAGE_HEADER = "x-tracy-interface-language";
var BUILD_WAIT_MS = 9e4;
var BUILD_POLL_MS = 2e3;
var BUILD_DOOR_TIMEOUT_MS = 3e4;
var BUILD_POLL_BACKOFF_MAX_MS = 16e3;
var BUILD_STOPPED_SAY = FAULT_SAY;
var BUILD_RUNNING_SAY = "Still working on it. This can take a minute or two.";
var UNCHANGED_FALLBACK_SAY = UNCHANGED_SAY;
var BUILD_BUILDING_SAY = "Your site is being built from the plan you approved. This takes a few minutes.";
var BUILD_DONE_SAY2 = BUILD_DONE_SAY;
var BUILD_FAILED_SAY = `Your site could not be built this time. ${TEAM_SEES_SAY}`;
var DESIGN_NOT_BUILDABLE = "design-not-buildable";
var SITE_NOT_STARTED_SAY = "Your site could not be started, but your plan is kept and you can approve it again later.";
var DESIGN_NOT_BUILDABLE_SAY = "This design cannot be built yet, so your site was not started, but your plan is kept and you can approve it again later.";
var BUILD_LOCKED_SAY2 = BUILD_LOCKED_SAY;
var BUILD_UNCHECKED_SAY = "I asked for your site to be built, but I could not check on it just now. Ask me again in a minute to see how it is going.";
var BUILD_CHAT_OFF_SAY = "Building a site in the chat is not available right now. You can still create your site from the Add site page.";
var BUILD_BUSY_SAY = "I am still working on your plan, so it cannot change right now. Make your change again when I am done.";
var PLAN_CARD_CONTROLS_GUIDANCE = "When an entry asks to change a business fact, a service name or the main colour, tell the owner they can change that value on the plan card. Never say that the language, the design, the logo, the pictures or anything else can be changed on the plan card.";
var IN_OWNER_LANGUAGE = "in the language the owner writes in, keeping every name and value word for word";
var NOT_DONE_GUIDANCE = "Promise nothing beyond what the plan card and the plan offer: never offer to add it later, and never ask the owner to send you anything for it.";
var TRY_LATER_FALLBACK_SAY = "I have done this many times in a short while, so I paused here. Please try again later.";
var BODY_TOO_LARGE_SAY = "That was too long for me to send. Please say it in fewer words.";
var ANSWERS_FULL_SAY = "I could not keep your last answer, because this plan already holds as many answers as it can. Please continue with the plan as it is.";
var REQUEST_MAX_LENGTH = 1e3;
var REQUEST_TOO_LONG_SAY = requestTooLongSay(REQUEST_MAX_LENGTH);
var tooLongSay = (question, limit) => question?.topic === "site-name" ? nameTooLongSay(limit) : answerTooLongSay(limit);
var SAY_MAX = 300;
var ACTIONS = ["research", "templates", "plan", "edit", "build", "status", "start-over"];
var BUILD_DESCRIPTION = 'tracy_build: the build chat engine. action research {links?, description?, name?} first; templates; plan after the owner chose a template; plan {request} once a plan exists, with what the owner wants changed in their own words; plan {restart: true} ONLY when the owner clearly asks to start the plan over; edit {changes:[{field,value}]} for one simple change; build ONLY after the owner pressed Approve on the plan review, to create the site and build it from that plan (call it again only when the owner asks how a build that said building is going); status to keep waiting when a result says running. Pass ask and review to ask_user_question exactly as given. Each next in a result is private guidance: never repeat it to the owner. A colour change is edit with changes:[{field:"look.accent", value:"#RRGGBB"}], the field name exact and the value a hex colour you choose. stopped: say its sentence and stop; when it says rerun, ask no question about it, and call the tool once more with exactly the arguments in its again, never with action status, only after the owner sends "Please try again.". unchanged: say its sentence; the plan did not change. Every call names in language the language the owner writes in, as a two letter code; say every sentence a result gives in that language. Never say the site is built until a build result says built. start-over ONLY when the owner clearly asks to start the whole build over with a new conversation (not only the plan): first without confirm, then with confirm true once the owner agreed.';
var BUILD_PARAMETERS = Object.freeze({
  type: "object",
  properties: {
    action: { type: "string", enum: ACTIONS },
    language: {
      type: "string",
      description: "The language the owner writes in, as a two letter code such as en, vi or fr. The cards and questions of the build chat use it."
    },
    links: {
      type: "array",
      items: { type: "string" },
      description: "The business's own links: website, social profiles, map listing."
    },
    description: { type: "string", description: "The owner's own words about the business." },
    name: {
      type: "string",
      description: "For research with no link: the business name exactly as the owner gave it."
    },
    request: {
      type: "string",
      description: "For plan, once a plan exists: the owner's request to change it, in their own words, at most 1000 characters. Only what it names changes."
    },
    restart: {
      type: "boolean",
      description: "For plan: true ONLY when the owner clearly asks to start the plan over. It throws away the current plan and every change made to it. Never set it for a change request."
    },
    confirm: {
      type: "boolean",
      description: "For start-over: true ONLY after the owner clearly agreed to discard everything gathered so far."
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
  required: ["action", "language"]
});
var DOOR = "/api/build-draft";
var BUILDING = /* @__PURE__ */ new Set(["creating", "building"]);
var PRIVATE_GUIDANCE_MARK = "Private guidance for you only. Never quote it or put any part of it in your reply to the owner.";
var privately = (next) => `${PRIVATE_GUIDANCE_MARK} ${next}`;
var TEMPLATE_CHOSEN_NEXT = "When the owner has chosen on the card, call tracy_build with action plan.";
function templatesNext(options) {
  if (options.length === 0)
    return "No ready design fits. Tell the owner plainly that no ready design fits their business yet, and that they can add a site with Add site.";
  if (options.length === 1)
    return `One design fits. In one short line, ask the owner to confirm it with the button on the card. Never quote the words on the button. Do not ask which one, there is only one. ${TEMPLATE_CHOSEN_NEXT}`;
  return `Several designs fit. In one short line, ask the owner which one they like, using the buttons on the card. ${TEMPLATE_CHOSEN_NEXT}`;
}
var COLOUR_EDIT_GUIDANCE = 'For a colour change call tracy_build with action edit and changes:[{field:"look.accent", value:"#RRGGBB"}], where the value is a six digit hex colour you choose for the colour the owner named (for example blue is #1F4E9C). The field name look.accent is exact.';
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
var switchedOff = () => ({ stopped: true, say: BUILD_CHAT_OFF_SAY });
var tooLargeOf = (say = BODY_TOO_LARGE_SAY) => ({
  refused: true,
  say,
  next: "Say the sentence in say, then wait for the owner."
});
var isSwitchedOff = (res) => res?.status === 403 && res.body?.code === "BUILD_CHAT_OFF";
var isPollFault = (res) => res === null || res.status >= 500;
var RERUN_GUIDANCE = `Say the sentence in say and stop. Do not ask a question about it. If the owner then sends "${RETRY_MESSAGE}", call tracy_build once more with exactly the arguments in again, never with action status; a result of that call says stopped again only if it failed again.`;
var LINK_GAP_NEXT = "links says what was read from each link the owner gave. In one short sentence, in the language the owner writes in, tell the owner which link could not be read or gave nothing, by its name. Never say a code.";
var linkGapOf = (links) => Array.isArray(links) && links.some(
  (l) => l?.state === "failed" || l?.state === "read" && (!l.facts && !l.pictures || !l.pictures && l.picturesLost > 0)
);
var ANSWERS_ARRIVE_GUIDANCE = "The owner's answers reach tracy_build by themselves. Never call research again to pass an answer, and never put an answer into description.";
var PAUSED_NEXT = "Say the sentence in say once and stop here. It says when the owner can continue. Ask no question, and do not call tracy_build again before retryAt.";
var PAUSED_AGAIN_NEXT = "Nothing was started: the pause is not over yet. Do not repeat the earlier sentence about the pause. Answer what the owner just wrote in one short sentence, and say once that you can continue after minutesLeft minutes. Do not call tracy_build again before retryAt.";
var RESEARCH_QUESTIONS_NEXT = `Pass ask to ask_user_question exactly as given. ${ANSWERS_ARRIVE_GUIDANCE} When the owner has answered, call tracy_build with action templates.`;
var RESEARCH_DONE_NEXT = "Research is done. Call tracy_build with action templates now.";
var joined = (items) => items.length < 2 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
var foundLineOf = (line) => {
  if (line?.state === "failed")
    return `${line.name}: could not be read${line.reason ? ` (${line.reason})` : ""}`;
  const facts = Number(line?.facts) || 0;
  const pictures = Number(line?.pictures) || 0;
  return `${line?.name}: ${facts} ${facts === 1 ? "fact" : "facts"}, ${pictures} ${pictures === 1 ? "picture" : "pictures"}`;
};
function foundNextOf(result) {
  const links = (Array.isArray(result?.links) ? result.links : []).map(foundLineOf);
  const missing = Array.isArray(result?.missing) ? result.missing : [];
  const held = missing.filter((m) => m?.held).map((m) => m.what);
  const absent = missing.filter((m) => !m?.held).map((m) => m.what);
  const parts = [
    links.length ? `what each link gave: ${links.join("; ")}` : null,
    held.length ? `found but kept off the site until the owner confirms it: ${joined(held)}` : null,
    absent.length ? `not found: ${joined(absent)}` : null
  ].filter(Boolean);
  if (!parts.length) return null;
  return `In two or three short sentences, tell the owner what research found, in plain words with the counts, the link names as they are and no code: ${parts.join(". ")}. Only then go on.`;
}
var researchNextOf = (result) => {
  const found = foundNextOf(result);
  return [
    found,
    linkGapOf(result.links) ? LINK_GAP_NEXT : null,
    result.ask ? RESEARCH_QUESTIONS_NEXT : RESEARCH_DONE_NEXT
  ].filter(Boolean).join(" ");
};
var ACTION_OF_STEP = Object.freeze({ research: "research", brand: "plan", compose: "plan", revise: "plan" });
function startArgsOf(args) {
  if (args?.action === "research") {
    const links = (Array.isArray(args.links) ? args.links : []).map(text).filter((l) => l !== "");
    const description = text(args.description);
    const name2 = text(args.name);
    return {
      action: "research",
      ...links.length ? { links: links.slice(0, LINKS_MAX) } : {},
      ...description !== "" ? { description } : {},
      ...name2 !== "" ? { name: name2 } : {}
    };
  }
  if (args?.action === "plan") {
    const request = text(args.request);
    return { action: "plan", ...request !== "" ? { request } : {} };
  }
  return null;
}
function rerunArgsOf(events, step) {
  const action = typeof step === "string" ? ACTION_OF_STEP[step] : void 0;
  if (!action) return null;
  let found = null;
  for (const event of Array.isArray(events) ? events : [])
    if (event?.type === "tool/call" && event.data?.name === "tracy_build") {
      const started = startArgsOf(argsOf(event.data.arguments));
      if (started?.action === action) found = started;
    }
  return found ?? { action };
}
function pendingRetryOf(events) {
  const calls = /* @__PURE__ */ new Set();
  let lastResult = null;
  let lastResultSeq = -1;
  let retrySeq = -1;
  for (const [i, event] of (Array.isArray(events) ? events : []).entries()) {
    const seq = Number.isFinite(Number(event?.seq)) ? Number(event.seq) : i;
    if (event?.type === "tool/call" && event.data?.name === "tracy_build") calls.add(event.data.callId);
    else if (event?.type === "tool/result" && calls.has(event.data?.message?.source?.callId)) {
      lastResult = resultTexts(event.data.message.content)[0] ?? null;
      lastResultSeq = seq;
    } else if (event?.type === "user/message" && event.data?.source?.kind === "user") {
      const said = resultTexts(event.data.content).join("").trim();
      if (said === RETRY_MESSAGE) retrySeq = seq;
    }
  }
  if (lastResult === null || retrySeq < lastResultSeq) return null;
  try {
    const answer = JSON.parse(lastResult);
    return answer?.stopped === true && answer.rerun === true && startArgsOf(answer.again) ? answer.again : null;
  } catch {
    return null;
  }
}
var stoppedStateOf = (state, events = []) => {
  if (state?.rerun !== true) return stopped(state?.say);
  const again = rerunArgsOf(events, state.step);
  const retryAt = typeof state.retryAt === "string" ? state.retryAt : null;
  return {
    ...stopped(state.say),
    ...typeof state.step === "string" ? { step: state.step } : {},
    rerun: true,
    ...again ? { again } : {},
    ...retryAt ? { retryAt } : {},
    next: RERUN_GUIDANCE
  };
};
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
function openReviewsOf(events) {
  const asked = /* @__PURE__ */ new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === "tool/call" && event.data?.name === "ask_user_question") {
      const questions = argsOf(event.data.arguments).questions;
      const ids = (Array.isArray(questions) ? questions : []).map((q) => q?.id).filter((id) => typeof id === "string" && planOfReviewId(id) !== null);
      if (ids.length) asked.set(event.data.callId, ids);
    } else if (event?.type === "tool/result") asked.delete(event.data?.message?.source?.callId);
  }
  return new Set([...asked.values()].flat());
}
var reviewNextOf = (lead, open) => open ? `${lead} The owner already has the review of this plan open with its Approve button: do not ask it again.` : `${lead} Then call ask_user_question with review, unchanged. Call build only after the owner pressed Approve.`;
function createBuildTool({
  http,
  origin,
  actorFor,
  eventsOf,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  waitMs = BUILD_WAIT_MS,
  pollMs = BUILD_POLL_MS,
  wordsFor = askWordsFor
}) {
  const issued = /* @__PURE__ */ new Map();
  const languages = /* @__PURE__ */ new Map();
  const spoken = /* @__PURE__ */ new Map();
  const chatLanguageFor = (sessionId) => chatLanguageOf(
    spoken.get(
      /** @type {string} */
      sessionId
    ),
    languages.get(
      /** @type {string} */
      sessionId
    )
  );
  const sentLabels = /* @__PURE__ */ new Map();
  function localAsk(sessionId, ask, questions) {
    const language = chatLanguageFor(sessionId);
    const words = wordsFor(language);
    const said = words && language ? localizedAskOf(ask, questions, words, language) : ask;
    let sent = sentLabels.get(sessionId);
    if (!sent) sentLabels.set(sessionId, sent = /* @__PURE__ */ new Map());
    for (const q of Array.isArray(said?.questions) ? said.questions : [])
      if (typeof q?.id === "string")
        sent.set(
          q.id,
          (Array.isArray(q.options) ? q.options : []).map((o) => o?.label)
        );
    return said;
  }
  function withChoiceId(sessionId, question, reply) {
    if ((reply?.custom?.trim() ?? "") !== "" || reply?.choice !== void 0) return reply;
    let sent = sentLabels.get(sessionId)?.get(question.id);
    if (!sent) {
      const again = localAsk(sessionId, askRequestOf([question], []), [question]);
      sent = again?.questions?.[0]?.options?.map((o) => o.label) ?? [];
    }
    const choice = sentChoiceIdOf(
      question,
      /** @type {string[]} */
      sent,
      reply?.selected?.[0]
    );
    return choice === null ? reply : { ...reply, choice };
  }
  const reviews = /* @__PURE__ */ new Map();
  const stored = /* @__PURE__ */ new Map();
  const pausedUntil = /* @__PURE__ */ new Map();
  const opened = /* @__PURE__ */ new Set();
  function openingSay(sessionId) {
    if (opened.has(sessionId)) return null;
    opened.add(sessionId);
    return chatWordsIn(chatLanguageFor(sessionId), SAY_STRINGS)?.("say.researchRead") ?? RESEARCH_READ_SAY;
  }
  const questionsOf = (sessionId) => {
    let known = issued.get(sessionId);
    if (!known) issued.set(sessionId, known = /* @__PURE__ */ new Map());
    return known;
  };
  function handOutReview(sessionId, plan) {
    const review = planReviewRequestOf(plan);
    let handed = reviews.get(sessionId);
    if (!handed) reviews.set(sessionId, handed = /* @__PURE__ */ new Map());
    for (const q of review.questions)
      handed.set(
        q.id,
        q.options.map((o) => o.label)
      );
    return review;
  }
  const setOf = (map, sessionId) => {
    let set = map.get(sessionId);
    if (!set) map.set(sessionId, set = /* @__PURE__ */ new Set());
    return set;
  };
  function learn(sessionId, result) {
    const known = questionsOf(sessionId);
    for (const q of Array.isArray(result?.questions) ? result.questions : [])
      if (typeof q?.id === "string") known.set(q.id, q);
    const asked = new Set(
      (Array.isArray(result?.ask?.questions) ? result.ask.questions : []).map((q) => q?.id)
    );
    if (asked.size === 0) return;
    const done = setOf(stored, sessionId);
    for (const key of done) if (asked.has(key.slice(0, key.indexOf("\n")))) done.delete(key);
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
      const language = res.headers?.get?.(INTERFACE_LANGUAGE_HEADER);
      if (typeof language === "string" && /^[a-z]{2}$/.test(language)) languages.set(sessionId, language);
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
      let answer = answerOf(question, withChoiceId(sessionId, question, reply));
      if (answer === null && question.skippable === true)
        answer = { schema: "tracy-build-answer/v1", question: question.id, skipped: true };
      if (answer === null) continue;
      const key = `${reply.id}
${JSON.stringify(answer)}`;
      if (done.has(key)) continue;
      const res = await door(sessionId, assertion, "PUT", "/answers", { question, answer });
      if (isSwitchedOff(res)) return "off";
      if (res === null || res.status >= 500 || res.status === 403 || res.status === 404) return false;
      if (res.status === 413) return { refusal: tooLargeOf() };
      if (res.status === 422 && res.body?.code === "TOO_MANY_QUESTIONS")
        return { refusal: tooLargeOf(ANSWERS_FULL_SAY) };
      if (res.status >= 200 && res.status < 300) done.add(key);
    }
    return { again: [...latest.values()].find(Boolean) ?? null };
  }
  const linksOf = (links) => Array.isArray(links) && links.length ? { links } : {};
  const askAgain = (ask, say) => ({
    ask,
    ...say ? { say } : {},
    next: `${say ? "Say the sentence in say, then pass" : "Pass"} ask to ask_user_question exactly as given. ${ANSWERS_ARRIVE_GUIDANCE} When the owner has answered, call tracy_build with action plan again: it reads the answer and goes on from there.`
  });
  function refusal(res) {
    if (isSwitchedOff(res)) return switchedOff();
    const missing = res.status === 409 ? MISSING_STEPS[res.body?.code] : void 0;
    if (missing) return { missing: missing.missing, next: missing.next };
    if (res.status === 409 && res.body?.code === "BUILD_RUNNING")
      return {
        building: true,
        say: BUILD_LOCKED_SAY2,
        next: "Say the sentence in say. Call tracy_build with action build to read how the build is going."
      };
    if (res.status === 409 && res.body?.code === "ENGINE_BUSY")
      return {
        busy: true,
        say: ownerSay(res.body?.say, BUILD_BUSY_SAY),
        next: "Say the sentence in say. Do not call tracy_build again now; make the change again when the owner asks for it."
      };
    if (res.status === 429)
      return {
        paused: true,
        say: ownerSay(res.body?.say, TRY_LATER_FALLBACK_SAY),
        ...typeof res.body?.retryAt === "string" ? { retryAt: res.body.retryAt } : {},
        next: PAUSED_NEXT
      };
    if (res.status === 413) return tooLargeOf();
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
        next: `If the change was a colour and you did not use the exact field, try once more. ${COLOUR_EDIT_GUIDANCE} Otherwise tell the owner plainly, in their language, what could not be changed and why. ${PLAN_CARD_CONTROLS_GUIDANCE} Do not ask a question about it.`
      };
    }
    return stopped(res.body?.say);
  }
  function finished(sessionId, state) {
    if (state?.state === "stopped") return stoppedStateOf(state, eventsOf(sessionId));
    const isOpen = (review) => openReviewsOf(eventsOf(sessionId)).has(review.questions[0]?.id);
    const result = state?.result ?? {};
    if (state?.state === "asking") {
      learn(sessionId, result);
      if (!result.ask) return stopped();
      return {
        ...askAgain(
          localAsk(sessionId, result.ask, result.questions),
          typeof state.say === "string" ? ownerSay(state.say) : void 0
        ),
        ...linksOf(result.links)
      };
    }
    if (state?.step === "research") {
      learn(sessionId, result);
      if (!result.profile) return stopped();
      const say = openingSay(sessionId);
      return {
        profile: result.profile,
        ...say ? { say } : {},
        ...result.ask ? { ask: localAsk(sessionId, result.ask, result.questions) } : {},
        ...linksOf(result.links),
        next: `${say ? "Begin with the sentence in say, as it is. " : ""}${researchNextOf(result)}`
      };
    }
    if (state?.step === "revise") {
      if (result.brand !== "own" || !result.plan) return stopped(state.say);
      const review = handOutReview(sessionId, result.plan);
      const revision = revisedOf(result.revision) ?? { changed: [], notDone: [] };
      const unchanged = result.unchanged === true;
      return {
        plan: { id: result.plan.id, revision: result.plan.revision },
        unchanged,
        revision,
        review,
        next: reviewNextOf(
          `${unchanged ? "Nothing on the plan changed: say so plainly." : `Say what changed using the sentences in revision.changed, ${IN_OWNER_LANGUAGE}.`} Then say each entry of revision.notDone with its why. ${NOT_DONE_GUIDANCE} Do not say anything else changed. ${revision.codes ? "revision.codes is for the plan card only: never say a code. " : ""}${PLAN_CARD_CONTROLS_GUIDANCE}`,
          isOpen(review)
        )
      };
    }
    if (state?.step === "brand")
      return {
        look: "ready",
        next: "The business look is ready. Call tracy_build with action plan again now, with the same request."
      };
    if (state?.step === "compose" || state?.step === "edit") {
      if (result.brand !== "own" || !result.plan) return stopped(state.say);
      const review = handOutReview(sessionId, result.plan);
      const plan = { id: result.plan.id, revision: result.plan.revision };
      if (result.unchanged === true)
        return {
          unchanged: true,
          say: ownerSay(state.say, UNCHANGED_FALLBACK_SAY),
          plan,
          review,
          next: `${reviewNextOf("The plan did not change. Say the sentence in say. Never say the plan changed or that the request was applied.", isOpen(review))} Call plan with restart true only if the owner clearly asks to start the plan over.`
        };
      return {
        plan,
        review,
        next: reviewNextOf(
          state.step === "edit" ? "The plan card shows the change. In one short line, say what you changed." : "The plan card shows the plan. In one short line, tell the owner their plan is ready for them to review.",
          isOpen(review)
        )
      };
    }
    return stopped();
  }
  async function settle(sessionId, first) {
    let state = first;
    const start = now();
    let pause = pollMs;
    while (state?.state === "running") {
      if (now() - start >= waitMs)
        return {
          running: true,
          ...linksOf(state.links),
          say: BUILD_RUNNING_SAY,
          next: "Say the sentence in say, then call tracy_build with action status to keep waiting."
        };
      await sleep(pause);
      const assertion = actorFor(sessionId);
      const res = assertion === null ? null : await door(sessionId, assertion, "GET", "/engine");
      if (res === null || isPollFault(res)) {
        pause = Math.min(pause * 2, BUILD_POLL_BACKOFF_MAX_MS);
        continue;
      }
      if (res.status !== 200) return refusal(res);
      state = res.body;
      pause = pollMs;
    }
    if (state?.step === null || state?.state === "idle")
      return { idle: true, next: "Nothing is running. Call tracy_build with action research first." };
    return finished(sessionId, state);
  }
  function approvedPlan(sessionId) {
    const latest = repliesOf(eventsOf(sessionId)).filter((r) => r.id === PLAN_REVIEW_ID || planOfReviewId(r.id) !== null).at(-1);
    const approved = latest ? approvalOf({ answers: [latest] }) : null;
    if (approved) return approved;
    return {
      refused: true,
      next: "The owner has not approved the plan. Call ask_user_question with the review of the last plan result, and call build only after the owner pressed Approve."
    };
  }
  async function reviewAgain(sessionId, assertion) {
    const current = await currentPlanReview(sessionId, assertion);
    if (!current)
      return {
        stale: true,
        next: "The plan changed since the owner approved it. Call tracy_build with action status, then call ask_user_question with the new review."
      };
    return {
      stale: true,
      plan: current.plan,
      review: current.review,
      next: reviewNextOf(
        "The plan changed since the owner approved it, so nothing was built. Say in one short line that the plan changed and needs their approval again.",
        current.open
      )
    };
  }
  async function currentPlanReview(sessionId, assertion) {
    const res = await door(sessionId, assertion, "GET", "");
    const current = res?.status === 200 ? res.body?.draft?.plan : null;
    if (typeof current?.id !== "string" || !Number.isInteger(current?.revision)) return null;
    const review = handOutReview(sessionId, current);
    return {
      plan: { id: current.id, revision: current.revision },
      review,
      open: openReviewsOf(eventsOf(sessionId)).has(review.questions[0]?.id)
    };
  }
  async function buildResult(sessionId, assertion, body) {
    const build2 = body?.build;
    if (!build2) return stopped(BUILD_FAILED_SAY);
    if (typeof build2.notStarted === "string") {
      const say = build2.notStarted === DESIGN_NOT_BUILDABLE ? DESIGN_NOT_BUILDABLE_SAY : SITE_NOT_STARTED_SAY;
      const current = await currentPlanReview(sessionId, actorFor(sessionId) ?? assertion);
      if (!current) return { stopped: true, say };
      return {
        stopped: true,
        say,
        plan: current.plan,
        review: current.review,
        next: reviewNextOf("Say the sentence in say. Never say a step of the build failed.", current.open)
      };
    }
    if (BUILDING.has(build2.state))
      return {
        building: true,
        say: BUILD_BUILDING_SAY,
        next: "Say the sentence in say. The task list card shows each step and keeps up by itself. Call tracy_build with action build again only when the owner asks how it is going. Never say the site is built yet."
      };
    if (build2.state === "done")
      return {
        built: true,
        say: BUILD_DONE_SAY2,
        ...typeof build2.workspacePath === "string" ? { workspacePath: build2.workspacePath } : {},
        next: "Say the sentence in say. Do not add anything about how it was built."
      };
    return stopped(BUILD_FAILED_SAY);
  }
  async function build(sessionId, assertion) {
    const approved = approvedPlan(sessionId);
    if ("refused" in approved) return approved;
    const res = await door(sessionId, assertion, "POST", "/build", { plan: approved.plan });
    if (res !== null && res.status === 409 && res.body?.code === "STALE_PLAN")
      return reviewAgain(sessionId, assertion);
    if (res !== null && res.status === 409 && res.body?.code === "ENGINE_BUSY")
      return {
        running: true,
        say: BUILD_RUNNING_SAY,
        next: "Say the sentence in say. Call tracy_build with action status, then action build again once it ended."
      };
    if (res !== null && res.status === 409 && res.body?.code === "BUILT_FROM_OTHER_PLAN")
      return {
        building: true,
        say: BUILD_LOCKED_SAY2,
        next: "Say the sentence in say. Call tracy_build with action build only to read the build of the plan already approved."
      };
    const posted = res === null || isPollFault(res) ? null : res;
    if (posted !== null && (posted.status < 200 || posted.status >= 300)) return refusal(posted);
    let body = posted?.body;
    let known = posted !== null;
    let lastFailed = !known;
    let pause = pollMs;
    const start = now();
    while ((!known || BUILDING.has(body?.build?.state)) && now() - start < waitMs) {
      await sleep(pause);
      const polled = actorFor(sessionId);
      const read = polled === null ? null : await door(sessionId, polled, "GET", "/build");
      if (read === null || isPollFault(read)) {
        lastFailed = true;
        pause = Math.min(pause * 2, BUILD_POLL_BACKOFF_MAX_MS);
        continue;
      }
      if (read.status !== 200) return refusal(read);
      body = read.body;
      known = true;
      lastFailed = false;
      pause = pollMs;
    }
    if (!known || lastFailed && BUILDING.has(body?.build?.state))
      return {
        building: true,
        say: BUILD_UNCHECKED_SAY,
        next: "Say the sentence in say. Never say the build failed or that the site is built. Call tracy_build with action build again only when the owner asks how it is going."
      };
    return buildResult(sessionId, assertion, body);
  }
  async function execute(rawArgs, exec) {
    let result;
    try {
      result = await run(rawArgs, exec);
    } catch {
      result = stopped();
    }
    const marked = typeof result?.next === "string" ? { ...result, next: privately(result.next) } : result;
    const language = chatLanguageFor(
      /** @type {any} */
      exec?.agent?.session?.id
    );
    return language && marked && typeof marked === "object" ? { ...marked, chatLanguage: language } : marked;
  }
  async function run(rawArgs, exec) {
    let args = argsOf(rawArgs);
    const sessionId = exec?.agent?.session?.id;
    if (!isBuildChatSession(sessionId))
      return { refused: true, next: "tracy_build works only in the build chat. Do not call it here." };
    const said = chatLanguageTagOf(args.language);
    if (said !== null) spoken.set(sessionId, said);
    if (args.action === "status") args = pendingRetryOf(eventsOf(sessionId)) ?? args;
    const action = args.action;
    if (!ACTIONS.includes(action))
      return {
        refused: true,
        next: "Call tracy_build with action research, templates, plan, edit, build, status or start-over."
      };
    if (action === "start-over" && args.confirm !== true) return startOverQuestion();
    let request;
    if (action === "research") {
      const links = (Array.isArray(args.links) ? args.links : []).map(text).filter((l) => l !== "").slice(0, LINKS_MAX);
      const description = text(args.description);
      if (links.length === 0 && description === "")
        return {
          refused: true,
          next: "Call tracy_build with action research and the owner's links or their own words about the business."
        };
      const name2 = text(args.name);
      request = [
        "POST",
        "/research",
        { links, ...description !== "" ? { description } : {}, ...name2 !== "" ? { name: name2 } : {} }
      ];
    } else if (action === "plan") {
      if (typeof args.request === "string" && [...args.request.trim()].length > REQUEST_MAX_LENGTH)
        return {
          refused: true,
          say: REQUEST_TOO_LONG_SAY,
          next: "Say the sentence in say, then wait for the owner to write a shorter request."
        };
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
    else if (action === "build") request = ["POST", "/build"];
    else if (action === "start-over") request = ["POST", "/start-over", { confirm: true }];
    else request = ["GET", "/engine"];
    if (origin() === null) return stopped();
    const assertion = actorFor(sessionId);
    if (assertion === null) return stopped();
    const replies = await storeReplies(sessionId, assertion);
    if (replies === "off") return switchedOff();
    if (replies === false) return stopped();
    if ("refusal" in replies) return replies.refusal;
    if (replies.again) {
      const { question, limit } = replies.again;
      return askAgain(
        localAsk(sessionId, askRequestOf([question], []), [question]),
        tooLongSay(question, limit)
      );
    }
    if (action === "build") return build(sessionId, assertion);
    const until = pausedUntil.get(sessionId) ?? 0;
    if ((action === "research" || action === "plan") && until > now())
      return {
        paused: true,
        retryAt: new Date(until).toISOString(),
        minutesLeft: Math.max(1, Math.ceil((until - now()) / 6e4)),
        next: PAUSED_AGAIN_NEXT
      };
    const res = await door(sessionId, assertion, request[0], request[1], request[2]);
    if (res === null) return stopped();
    if (res.status === 429) {
      const at = Date.parse(res.body?.retryAt ?? "");
      if (Number.isFinite(at)) pausedUntil.set(sessionId, at);
    }
    if (action === "start-over") return startOverAnswerOf(res, ownerSay);
    if (res.status < 200 || res.status >= 300) return refusal(res);
    if (action === "templates") {
      const { options, none } = templateChoiceOf(res.body?.templates);
      return { options, none, next: templatesNext(options) };
    }
    const settled = await settle(sessionId, res.body);
    if (action === "status" && settled && "review" in settled && settled.review && await buildRunning(sessionId))
      return {
        building: true,
        say: BUILD_LOCKED_SAY2,
        next: "Say the sentence in say. Call tracy_build with action build only when the owner asks how it is going."
      };
    return settled;
  }
  async function buildRunning(sessionId) {
    const assertion = actorFor(sessionId);
    const res = assertion === null ? null : await door(sessionId, assertion, "GET", "/build");
    return res?.status === 200 && BUILDING.has(res.body?.build?.state);
  }
  function guard(execution) {
    if (execution?.name !== "ask_user_question") return void 0;
    const sessionId = execution.agent?.session?.id;
    if (!isBuildChatSession(sessionId)) return void 0;
    const questions = argsOf(execution.arguments).questions;
    const asked = Array.isArray(questions) ? questions : [];
    const known = issued.get(sessionId);
    const review = reviews.get(sessionId);
    const allowed = (q) => {
      const id = q?.id;
      if (typeof id !== "string") return false;
      if (known?.has(id) === true) return true;
      const labels = review?.get(id);
      if (!labels) return false;
      const given = Array.isArray(q.options) ? q.options.map((o) => o?.label) : [];
      return given.length === labels.length && given.every((label, i) => label === labels[i]);
    };
    if (asked.length > 0 && asked.every(allowed)) return void 0;
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
