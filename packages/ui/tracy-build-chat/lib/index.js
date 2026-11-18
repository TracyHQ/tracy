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
  "ask.question.place_choice_found": "We looked for your business on Google Maps by its name and city. Is it one of these?",
  "ask.question.brief_gap_offerings": "What does your business offer? Name your main services or products.",
  "ask.question.brief_gap_menu": "What is on your menu? Name a few dishes or drinks.",
  "ask.question.brief_gap_offering_descriptions": "How would you describe what you offer, in a sentence or two each?",
  "ask.question.brief_gap_prices": "What do your main services or products cost?",
  "ask.question.brief_gap_hours": "What are your opening hours?",
  "ask.question.brief_gap_phone": "Which phone number should customers call?",
  "ask.question.brief_gap_address": "What is your street address, or the area you serve?",
  "ask.question.brief_gap_booking": "How should customers book with you?",
  "ask.question.brief_gap_story": "How would you describe your business in a few sentences?",
  "ask.choice.brief_gap_skip": "Leave it out for now",
  "ask.question.business_trade": "What kind of business is it?",
  "ask.question.held_hours_unconfirmed": "Only one source gives your opening hours, as open 24 hours every day. Are these your opening hours?",
  "ask.question.held_hours_disagree": "Your sources give different opening hours. Which hours should your site show?",
  "ask.question.held_hours_typed": "Type your opening hours, one line per group of days, for example Mon to Fri 9:00 to 18:00.",
  "ask.choice.held_hours_keep": "Keep these hours",
  "ask.choice.held_hours_edit": "They are wrong, I will type them",
  "ask.choice.held_hours_leave": "Leave hours off the site",
  "ask.choice.business_trade_food": "Food and drink",
  "ask.choice.business_trade_beauty": "Beauty",
  "ask.choice.business_trade_health": "Health",
  "ask.choice.business_trade_fitness": "Sports and fitness",
  "ask.choice.business_trade_hospitality": "Hotel or stay",
  "ask.choice.business_trade_travel": "Travel",
  "ask.choice.business_trade_professional": "Professional services",
  "ask.choice.business_trade_creative": "Creative work",
  "ask.choice.business_trade_education": "Education",
  "ask.choice.business_trade_retail": "Shop",
  "ask.choice.business_trade_auto": "Cars and vehicles",
  "ask.choice.business_trade_home": "Home services",
  "ask.choice.business_trade_events": "Events",
  "ask.choice.business_trade_nonprofit": "Non profit",
  "ask.choice.business_trade_other": "Something else",
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
  if (code === "main_button" || code === "contact_method" || code === "site_language" || code === "place_choice" || code === "place_choice_found" || code === "business_trade" || /^brief_gap_[a-z_]+$/.test(code) || /^held_hours_(unconfirmed|disagree|typed)$/.test(code))
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
  if (/^(contact_method|business_trade)_[a-z]+$/.test(code) || code === "place_choice_none" || code === "brief_gap_skip" || /^held_hours_(keep|edit|leave)$/.test(code))
    return words(`ask.choice.${code}`);
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

// ../../core/tracy-core/src/build-chat/plan-left-out.mjs
var TEMPLATE_SPOT_CODES = /* @__PURE__ */ new Set([
  "no_generated_people",
  "no_own_logo",
  "gallery_own_photos_only",
  "documentary_not_drawn"
]);
var COUNTED_KINDS = /* @__PURE__ */ new Set(["service", "person", "quote", "gallery"]);
var COUNT_WORDS = Object.freeze({
  service: ["service", "services"],
  person: ["person", "people"],
  quote: ["review", "reviews"],
  gallery: ["photo", "photos"],
  item: ["item", "items"]
});
var isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var listOr = (value) => Array.isArray(value) ? value : [];
function plainWordsOf(what) {
  const said = String(what ?? "").replace(new RegExp("(\\p{L})-(?=\\p{L})", "gu"), "$1 ");
  return said.charAt(0).toUpperCase() + said.slice(1);
}
function pluralOf(word) {
  const lower = new RegExp("^\\p{Lu}\\p{Lu}", "u").test(word) ? word : word.charAt(0).toLowerCase() + word.slice(1);
  if (/(x|z|ch|sh)$/i.test(lower)) return `${lower}es`;
  if (/[^aeiou]y$/i.test(lower)) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}
function countedWhatOf(line, count) {
  if (line.dataKind !== void 0) {
    const [one, many] = COUNT_WORDS[COUNTED_KINDS.has(line.dataKind) ? line.dataKind : "item"];
    return `${count} ${count === 1 ? one : many}`;
  }
  if (count === 1) return line.what;
  return /\s/.test(line.what) || /s$/i.test(line.what) ? `${line.what} (${count})` : `${count} ${pluralOf(line.what)}`;
}
var PAGES_NAMED = 3;
function pagesWhatOf(pages) {
  const named = pages.slice(0, PAGES_NAMED);
  const more = pages.length - named.length;
  if (pages.length === 1) return `${pages[0]} page`;
  if (more > 0) return `${named.join(", ")} and ${more} more pages`;
  return `${named.slice(0, -1).join(", ")} and ${named.at(-1)} pages`;
}
var isSourceRead = (l) => l?.code === "not_collected" && (String(l.params?.field ?? "").startsWith("source:") || /^Source:\S/.test(String(l.what ?? "")));
function leftOutOf(leftOut, plan) {
  const facts = new Map(listOr(plan?.facts).map((f) => [f.id, f]));
  const items = new Map(listOr(plan?.items).map((i) => [i.id, i]));
  const lines = [];
  const byKey = /* @__PURE__ */ new Map();
  for (const l of listOr(leftOut)) {
    if (l?.kind === "block") continue;
    if (l?.code === "owner_removed") continue;
    const code = typeof l?.code === "string" && l.code !== "" ? l.code : null;
    if (code !== null && TEMPLATE_SPOT_CODES.has(code)) continue;
    if (isSourceRead(l)) continue;
    const params = code && isPlainObject(l.params) ? l.params : null;
    const fact = typeof l.item === "string" ? facts.get(l.item) : void 0;
    const item = typeof l.item === "string" && !fact ? items.get(l.item) : void 0;
    const dataKind = item ? typeof item.kind === "string" ? item.kind : "item" : void 0;
    const factKind = fact && typeof fact.kind === "string" ? fact.kind : void 0;
    const what = fact ? plainTextOf(fact.label ?? fact.kind) : plainWordsOf(plainTextOf(l.what));
    const reason = plainTextOf(l.reason);
    const page = l.kind === "page" && typeof params?.page === "string" ? plainTextOf(params.page) : null;
    const n = item && Number.isSafeInteger(item.count) && item.count > 0 ? item.count : 1;
    const key = page !== null ? JSON.stringify(["page", reason, code]) : dataKind !== void 0 ? JSON.stringify(["items", dataKind]) : JSON.stringify([what, l.kind, reason, code, params]);
    const seen = byKey.get(key);
    if (seen) {
      seen.count += n;
      if (page !== null && !seen.pages.includes(page)) seen.pages.push(page);
      const said = [seen, ...seen.also ?? []];
      if (dataKind !== void 0 && !said.some((r) => r.reason === reason && (r.code ?? null) === code))
        (seen.also ??= []).push({ reason, ...code ? { code } : {}, ...params ? { params } : {} });
      continue;
    }
    const { page: _page, ...restParams } = params ?? {};
    const kept = page !== null ? Object.keys(restParams).length ? restParams : null : params;
    const line = {
      what,
      kind: l.kind,
      reason,
      ...code ? { code } : {},
      ...kept ? { params: kept } : {},
      ...dataKind !== void 0 ? { dataKind } : {},
      ...factKind !== void 0 ? { factKind } : {},
      ...page !== null ? { pages: [page] } : {},
      count: n
    };
    byKey.set(key, line);
    lines.push(line);
  }
  return lines.map(({ count, ...line }) => {
    if (line.pages) return { ...line, what: pagesWhatOf(line.pages) };
    if (count === 1 && line.dataKind === void 0) return line;
    return { ...line, what: countedWhatOf(line, count), count };
  });
}

// ../../core/tracy-core/src/build-chat/plan-card-review.mjs
var listOr2 = (value) => Array.isArray(value) ? value : [];
var isPlainObject2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var CHANNEL_KINDS = /* @__PURE__ */ new Set([
  "contact.phone",
  "contact.email",
  "contact.address",
  "contact.cta_url",
  "contact.social_url"
]);
var CHROME_TYPES = /* @__PURE__ */ new Set(["header", "footer"]);
var NAMED_KINDS = /* @__PURE__ */ new Set(["service", "person", "quote", "gallery"]);
var GROUP_OF = Object.freeze({
  no_place_in_design: "no_place",
  no_place_for_whatsapp: "no_place",
  no_place_for_other_phones: "no_place",
  no_place_for_google_rating: "no_place",
  no_gallery_room: "no_place",
  no_fitting_video: "no_place",
  no_email_for_form: "no_info",
  no_booking_link: "no_info",
  no_items_to_show: "no_info",
  not_collected: "no_info",
  sources_disagree: "held",
  kept_off_site: "held",
  hours_unconfirmed: "held",
  hours_sources_disagree: "held",
  owner_withheld: "held",
  page_nothing_to_show: "pages",
  page_not_planned: "pages",
  no_generated_people: "people_spots"
});
var NOT_ON_SITE_GROUPS = Object.freeze([
  "removed",
  "no_place",
  "no_info",
  "held",
  "reviews",
  "pages",
  "people_spots",
  "other"
]);
var factById = (plan) => new Map(listOr2(plan.facts).map((f) => [f.id, f]));
var itemById = (plan) => new Map(listOr2(plan.items).map((i) => [i.id, i]));
var factOf = (fact) => ({
  id: fact.id,
  kind: typeof fact.kind === "string" ? fact.kind : null,
  label: plainTextOf(fact.label),
  value: plainTextOf(fact.value)
});
function shownOf(plan) {
  const where = /* @__PURE__ */ new Map();
  const add = (id, page, block) => {
    if (typeof id !== "string") return;
    if (!where.has(id)) where.set(id, []);
    where.get(id).push({ page, block });
  };
  const rows = (lists, page, block) => {
    for (const l of listOr2(lists))
      for (const r of listOr2(l?.rows)) {
        add(r?.data, page, block);
        rows(r?.lists, page, block);
      }
  };
  for (const page of plan.pages)
    for (const block of page.blocks) {
      for (const id of listOr2(block.data)) add(id, page, block);
      rows(block.lists, page, block);
    }
  return where;
}
var sectionOf = (block) => ({
  id: block.id,
  label: plainTextOf(block.label),
  ...typeof block.labelCode === "string" && block.labelCode !== "" ? { labelCode: block.labelCode } : {}
});
function locksOf(review) {
  const locks = review?.locks;
  if (!isPlainObject2(locks)) return null;
  return {
    pages: isPlainObject2(locks.pages) ? locks.pages : {},
    blocks: isPlainObject2(locks.blocks) ? locks.blocks : {},
    facts: isPlainObject2(locks.facts) ? locks.facts : {},
    minItems: isPlainObject2(locks.minItems) ? locks.minItems : {}
  };
}
function itemRemovable(block, items, locks) {
  if (!locks) return false;
  const data = listOr2(block.data);
  const count = data.filter((id) => items.has(id)).length;
  const min = Number.isSafeInteger(locks.minItems[block.id]) ? locks.minItems[block.id] : 0;
  return data.length > 1 && count - 1 >= min;
}
function keyMessagesOf(plan) {
  return listOr2(plan.keyMessages).map((m) => {
    const carriedBy = [];
    for (const page of plan.pages) {
      const blocks = page.blocks.filter((b) => listOr2(b.carries).includes(m.id)).map(sectionOf);
      if (blocks.length) carriedBy.push({ page: page.id, pageName: plainTextOf(page.name), blocks });
    }
    return { id: m.id, label: plainTextOf(m.label), field: `keyMessages[${m.id}].label`, carriedBy };
  });
}
var placesOf = (where, id) => listOr2(where.get(id)).map(({ page, block }) => ({
  page: page.id,
  pageName: plainTextOf(page.name),
  section: sectionOf(block),
  footer: block.type === "footer"
}));
function reachOf(plan, where, locks) {
  const facts = factById(plan);
  const primary = listOr2(plan.primaryAction?.factIds).map((id) => facts.get(id)).filter(Boolean);
  const ends = plan.pages.filter((p) => p.endAction && p.blocks.some((b) => b.id === p.endAction.block)).map((p) => ({
    page: p.id,
    pageName: plainTextOf(p.name),
    section: sectionOf(p.blocks.find((b) => b.id === p.endAction.block)),
    facts: listOr2(p.endAction.factIds).map((id) => facts.get(id)).filter(Boolean).map(factOf)
  }));
  const channels = listOr2(plan.facts).filter((f) => CHANNEL_KINDS.has(f.kind) && where.has(f.id)).map((f) => {
    const places = placesOf(where, f.id);
    const footers = places.filter((p) => p.footer);
    const footerBlocks = plan.pages.flatMap(
      (p) => p.blocks.filter((b) => b.type === "footer" && listOr2(b.data).includes(f.id))
    );
    const removable = Boolean(locks) && footers.length > 0 && !locks.facts[f.id] && footerBlocks.every((b) => listOr2(b.data).length > 1);
    return { ...factOf(f), places, footerPages: footers.length, removable };
  });
  return {
    primary: primary.map((f) => ({ ...factOf(f), places: placesOf(where, f.id) })),
    ends,
    channels
  };
}
function siteOf(plan) {
  const facts = factById(plan);
  const pages = new Map(plan.pages.map((p) => [p.id, plainTextOf(p.name)]));
  const chrome = (type) => {
    const ids = [];
    for (const page of plan.pages)
      for (const b of page.blocks)
        if (b.type === type) {
          for (const id of listOr2(b.data)) if (facts.has(id) && !ids.includes(id)) ids.push(id);
        }
    return ids.map((id) => factOf(facts.get(id)));
  };
  const menu = [];
  for (const page of plan.pages)
    for (const b of page.blocks) {
      if (b.type !== "header") continue;
      for (const l of listOr2(b.lists))
        for (const r of listOr2(l?.rows))
          if (typeof r?.page === "string" && pages.has(r.page) && !menu.includes(pages.get(r.page)))
            menu.push(pages.get(r.page));
    }
  return {
    menu,
    header: chrome("header"),
    footer: chrome("footer"),
    privacyLink: listOr2(plan.legalPages).length > 0
  };
}
function pageOf(plan, page, index, { items, locks, facts }) {
  const messages = new Map(listOr2(plan.keyMessages).map((m) => [m.id, plainTextOf(m.label)]));
  const end = page.endAction?.block ?? null;
  const seo = isPlainObject2(page.seo) ? {
    searchTerms: listOr2(page.seo.searchTerms).map(plainTextOf),
    ...typeof page.seo.titleIntent === "string" ? { titleIntent: plainTextOf(page.seo.titleIntent) } : {},
    ...typeof page.seo.descriptionIntent === "string" ? { descriptionIntent: plainTextOf(page.seo.descriptionIntent) } : {},
    ownerAdded: listOr2(page.seo.ownerAdded).map(plainTextOf)
  } : null;
  return {
    id: page.id,
    name: plainTextOf(page.name),
    removable: Boolean(locks) && index > 0 && !locks.pages[page.id],
    lock: locks?.pages[page.id] ?? null,
    ...typeof page.keyMessage === "string" ? { keyMessage: plainTextOf(page.keyMessage) } : {},
    ...typeof page.visitorQuestion === "string" ? { visitorQuestion: plainTextOf(page.visitorQuestion) } : {},
    seo,
    sections: page.blocks.filter((b) => !CHROME_TYPES.has(b.type)).map((b) => {
      const named = listOr2(b.data).filter((id) => NAMED_KINDS.has(items.get(id)?.kind));
      const canTakeItem = itemRemovable(b, items, locks);
      return {
        ...sectionOf(b),
        type: b.type,
        ...b.source === "library" ? { library: true } : {},
        ...typeof b.message === "string" ? { message: plainTextOf(b.message) } : {},
        carries: listOr2(b.carries).filter((id) => messages.has(id)).map((id) => ({ id, label: messages.get(id) })),
        end: b.id === end,
        removable: Boolean(locks) && !locks.blocks[b.id],
        items: named.map((id) => {
          const item = items.get(id);
          return { id, kind: item.kind, label: plainTextOf(item.label), removable: canTakeItem };
        }),
        facts: listOr2(b.data).filter((id) => facts.has(id)).map((id) => factOf(facts.get(id)))
      };
    })
  };
}
function standardOf(plan) {
  const facts = factById(plan);
  const names = new Map(plan.pages.map((p) => [p.id, plainTextOf(p.name)]));
  const privacy = listOr2(plan.legalPages).find((l) => l?.kind === "privacy");
  return {
    privacy: privacy ? {
      page: privacy.use === "create" ? null : names.get(privacy.use) ?? null,
      facts: listOr2(privacy.factIds).map((id) => facts.get(id)).filter(Boolean).map(factOf)
    } : null,
    notFound: isPlainObject2(plan.notFound) ? {
      leadsTo: listOr2(plan.notFound.leadsTo).map((id) => names.get(id)).filter(Boolean)
    } : null
  };
}
function removedOf(plan, removals) {
  const records = listOr2(removals).filter((r) => typeof r?.id === "string");
  const restorable = new Set(records.map((r) => r.id));
  const byRemoval = /* @__PURE__ */ new Map();
  for (const e of listOr2(plan.leftOut)) {
    if (e?.code !== "owner_removed" || typeof e.params?.removal !== "string") continue;
    const id = e.params.removal;
    if (!byRemoval.has(id)) byRemoval.set(id, { part: null, details: [] });
    const line = byRemoval.get(id);
    if (typeof e.item === "string") line.details.push(e);
    else line.part = e;
  }
  const items = itemById(plan);
  const facts = factById(plan);
  const codes = (part, record) => {
    const out = {};
    if (typeof part?.params?.section === "string") out.section = part.params.section;
    if (typeof part?.params?.later === "string") out.later = part.params.later;
    else if (record?.op === "remove-later" && typeof record.target?.later === "string")
      out.later = record.target.later;
    return out;
  };
  const datumLine = (id, fallback) => {
    const item = items.get(id);
    const fact = item ? null : facts.get(id);
    return {
      what: plainTextOf(item?.label ?? fact?.label ?? fallback ?? ""),
      kind: "item",
      ...item ? { dataKind: item.kind ?? null } : { dataKind: null },
      ...fact?.kind ? { factKind: fact.kind } : {}
    };
  };
  const lineOf = (id) => {
    const found = byRemoval.get(id);
    const record = records.find((r) => r.id === id);
    const target = record?.target ?? {};
    let line;
    if (found?.part)
      line = { what: plainTextOf(found.part.what), kind: found.part.kind, ...codes(found.part, record) };
    else if (record?.op === "remove-item" && typeof target.item === "string")
      line = datumLine(target.item, found?.details[0]?.what);
    else if (record?.op === "remove-channel" && typeof target.fact === "string")
      line = datumLine(target.fact, found?.details[0]?.what);
    else if (found?.details.length) line = datumLine(found.details[0].item, found.details[0].what);
    else return null;
    const details = found ? found.details.length - (found.part ? 0 : 1) : 0;
    return { removal: id, ...line, details: Math.max(details, 0), restorable: restorable.has(id) };
  };
  const ids = [...records.map((r) => r.id), ...[...byRemoval.keys()].filter((id) => !restorable.has(id))];
  return ids.map(lineOf).filter(Boolean);
}
function groupsOf(cardLeftOut, plan, removals) {
  const groups = new Map(NOT_ON_SITE_GROUPS.map((g) => [g, []]));
  cardLeftOut.forEach((line, i) => {
    if (line.code === "owner_removed") return;
    const group = line.dataKind === "quote" ? "reviews" : GROUP_OF[line.code] ?? "other";
    groups.get(group).push(i);
  });
  const peopleSpots = listOr2(plan.leftOut).filter((e) => e?.code === "no_generated_people").reduce((n, e) => n + (Number.isSafeInteger(e.params?.count) ? e.params.count : 1), 0);
  return {
    removed: removedOf(plan, removals),
    groups: NOT_ON_SITE_GROUPS.filter((g) => g !== "removed" && g !== "people_spots").map((g) => ({ group: g, lines: groups.get(g) })).filter((g) => g.lines.length > 0),
    peopleSpots
  };
}
var SOURCE_KINDS = ["website", "google", "listing", "social", "answer"];
var COUNTED = ["service", "person", "gallery", "quote"];
function sourcesOf(plan, where) {
  const rows = [];
  for (const kind of SOURCE_KINDS) {
    const from = (x) => listOr2(x.sources).some((s) => s?.kind === kind);
    const facts = listOr2(plan.facts).filter(from);
    const items = COUNTED.map((k) => {
      const of = listOr2(plan.items).filter((i) => i.kind === k && from(i));
      const n = (list) => list.reduce((c, i) => c + (Number.isSafeInteger(i.count) && i.count > 0 ? i.count : 1), 0);
      return { kind: k, got: n(of), shown: n(of.filter((i) => where.has(i.id))) };
    }).filter((c) => c.got > 0);
    if (facts.length === 0 && items.length === 0) continue;
    rows.push({
      kind,
      facts: facts.map(factOf),
      shownFacts: facts.filter((f) => where.has(f.id)).map(factOf),
      items
    });
  }
  return rows;
}
function planReviewPartsOf(plan, cardLeftOut, review) {
  const where = shownOf(plan);
  const locks = locksOf(review);
  const items = itemById(plan);
  const facts = factById(plan);
  return {
    keyMessages: keyMessagesOf(plan),
    reach: reachOf(plan, where, locks),
    site: siteOf(plan),
    sitePages: plan.pages.map((p, i) => pageOf(plan, p, i, { items, locks, facts })),
    standard: standardOf(plan),
    notOnSite: groupsOf(cardLeftOut, plan, review?.removals),
    sources: sourcesOf(plan, where),
    later: listOr2(plan.later).map((e) => ({
      code: e.code,
      what: plainTextOf(e.what),
      reason: plainTextOf(e.reason),
      params: isPlainObject2(e.params) ? e.params : {}
    })),
    locked: locks === null
  };
}

// ../../core/tracy-core/src/build-chat/plan-look-brand.mjs
var PLAIN_ID = /^[A-Za-z0-9-]{1,64}$/;
var isPlainObject3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function pictureOf(value) {
  if (!isPlainObject3(value) || typeof value.picture !== "string" || !PLAIN_ID.test(value.picture)) return null;
  return { picture: value.picture, ...typeof value.mime === "string" ? { mime: value.mime } : {} };
}
function lookBrandOf(plan, lookSources) {
  const pictures = isPlainObject3(lookSources?.pictures) ? lookSources.pictures : {};
  const accent = isPlainObject3(lookSources?.accent) ? lookSources.accent : {};
  const logo = isPlainObject3(lookSources?.logo) ? lookSources.logo : {};
  const said = (Array.isArray(plan?.assumptions) ? plan.assumptions : []).find(
    (a) => a?.field === "look.accent"
  );
  return {
    logo: {
      light: pictureOf(pictures.logoLight),
      dark: pictureOf(pictures.logoDark),
      from: typeof logo.from === "string" ? logo.from : null,
      name: typeof logo.name === "string" ? plainTextOf(logo.name) : null
    },
    favicon: pictureOf(pictures.favicon),
    accent: {
      from: typeof accent.from === "string" ? accent.from : null,
      name: typeof accent.name === "string" ? plainTextOf(accent.name) : null,
      said: typeof said?.said === "string" ? plainTextOf(said.said) : null,
      ...typeof said?.code === "string" && said.code !== "" ? { code: said.code, params: isPlainObject3(said.params) ? said.params : {} } : {}
    }
  };
}

// ../../core/tracy-core/src/build-chat/plan.mjs
var PLAN_REVIEW_ID = "plan-review";
var REVIEW_ID = PLAN_REVIEW_ID;
var english = (key, vars = {}) => BUILD_CHAT_STRINGS[key].replace(/\{(\w+)\}/g, (_, name2) => String(vars[name2] ?? ""));
var firstSource = (sources) => plainTextOf(sources?.[0]?.name ?? "");
var firstSourceKind = (sources) => typeof sources?.[0]?.kind === "string" ? sources[0].kind : null;
var isWebsite = (alternative) => (alternative.sources ?? []).some((s) => s.kind === "website");
var sourcesOfFact = (fact) => {
  const sources = Array.isArray(fact.sources) ? fact.sources : [];
  if (fact.kind !== "contact.social_url") return sources;
  return [...sources].sort((a, b) => Number(b?.kind === "social") - Number(a?.kind === "social"));
};
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
function ownPhotosOf(plan) {
  const photos = plan.items.filter((i) => i.kind === "gallery").reduce((n, i) => n + (Number.isSafeInteger(i.count) && i.count > 0 ? i.count : 1), 0);
  return photos;
}
var listOr3 = (value) => Array.isArray(value) ? value : [];
var countsOf = (entries) => listOr3(entries).filter((e) => typeof e?.code === "string" && Number.isSafeInteger(e.count) && e.count > 0).map((e) => ({ code: e.code, count: e.count }));
function ownCountsOf(own, galleryPhotos) {
  const tallied = Number.isSafeInteger(own.placed) && Number.isSafeInteger(own.photos);
  if (!tallied) return { frames: own.frames, photos: galleryPhotos };
  return { frames: own.placed, photos: own.photos, spots: own.frames, unused: countsOf(own.unused) };
}
var isPlainObject4 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var codeOf = (part) => typeof part?.code === "string" && part.code !== "" ? { code: part.code, params: isPlainObject4(part.params) ? part.params : {} } : {};
function wholePlanOf(plan) {
  const look = plan?.look ?? {};
  const pictures = plan?.pictures ?? {};
  return {
    ...plan,
    facts: listOr3(plan?.facts),
    items: listOr3(plan?.items),
    pages: listOr3(plan?.pages).map((p) => ({ ...p, blocks: listOr3(p?.blocks) })),
    look: { ...look, template: look.template ?? {}, logo: look.logo ?? {} },
    pictures: {
      own: { frames: 0, ...pictures.own },
      generated: { frames: 0, ...pictures.generated },
      ...Array.isArray(pictures.empty) ? { empty: pictures.empty } : {}
    }
  };
}
function rowDataOf(lists, out = /* @__PURE__ */ new Set()) {
  for (const list of listOr3(lists))
    for (const row of listOr3(list?.rows)) {
      if (typeof row?.data === "string") out.add(row.data);
      rowDataOf(row?.lists, out);
    }
  return out;
}
function shownOnPagesOf(plan) {
  const shown = /* @__PURE__ */ new Set();
  for (const page of plan.pages)
    for (const block of page.blocks) {
      for (const id of listOr3(block.data)) shown.add(id);
      rowDataOf(block.lists, shown);
    }
  return shown;
}
var KEPT_FACT_KINDS = /* @__PURE__ */ new Set([
  "business.name",
  "contact.phone",
  "contact.address",
  "contact.cta_label",
  "contact.hours"
]);
var keptOnCard = (fact) => KEPT_FACT_KINDS.has(fact.kind) || listOr3(fact.sources).some((s) => s?.kind === "answer");
function planCardOf(contractPlan, { lookSources = null, review = null } = {}) {
  const plan = wholePlanOf(contractPlan);
  const disputed = new Map(
    (plan.assumptions ?? []).filter((a) => Array.isArray(a.alternatives) && /^facts\[[^\]]+\]\.value$/.test(a.field)).map((a) => [a.field, a])
  );
  const shown = shownOnPagesOf(plan);
  const services = plan.items.filter((i) => i.kind === "service" && shown.has(i.id));
  const serviceIds = services.map((s) => s.id);
  const name2 = plainTextOf(plan.facts.find((f) => f.kind === "business.name")?.value ?? "");
  const leftOutFacts = new Set(
    listOr3(plan.leftOut).map((l) => l?.item).filter((id) => typeof id === "string" && !shown.has(id))
  );
  const leftOut = leftOutOf(plan.leftOut, plan);
  return {
    planId: plan.id,
    revision: plan.revision,
    name: name2,
    facts: plan.facts.filter((f) => !leftOutFacts.has(f.id) || keptOnCard(f)).map((f) => {
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
        source: firstSource(sourcesOfFact(f)),
        sourceKind: firstSourceKind(sourcesOfFact(f)),
        choice: assumption ? choiceOf(f, assumption) : null,
        // Kept on the card although no page shows it: the card marks it as not on the site (#575 C3).
        ...leftOutFacts.has(f.id) ? { offSite: true } : {}
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
      } : { kind: plan.look.logo.kind ?? null },
      // With the draft's look sources: the logo on each ground, the site icon and the accent's origin (#575).
      ...lookSources ? { brand: lookBrandOf(plan, lookSources) } : {}
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
          // Kept from general knowledge of the owner's trade (Contract B `basis: "trade"`, #575): the card says so,
          // and that the owner can remove it with Change the plan (the step chain's owner task to confirm it).
          ...b.basis === "trade" ? { trade: true } : {},
          ...lists.length > 0 ? { lists } : {}
        };
      })
    })),
    pictures: {
      own: {
        // With the plan's picture tally (`picture-tally.mjs`) the card counts photos, not spots: `frames` is the photos
        // placed, `photos` the owner's photos, `spots` the spots they fill, `unused` the others with their codes.
        ...ownCountsOf(plan.pictures.own, ownPhotosOf(plan)),
        from: [...plan.pictures.own.from ?? []],
        // The source kind of each name in `from`, same order (`website`, `google`, `social`, `answer`).
        ...Array.isArray(plan.pictures.own.fromKinds) ? { fromKinds: [...plan.pictures.own.fromKinds] } : {}
      },
      generated: {
        frames: plan.pictures.generated.frames,
        ...plan.pictures.generated.reason ? { reason: plainTextOf(plan.pictures.generated.reason) } : {},
        ...codeOf(plan.pictures.generated)
      },
      ...Array.isArray(plan.pictures.empty) ? { empty: countsOf(plan.pictures.empty) } : {}
    },
    // A disputed fact is settled at the fact itself; every other assumption is listed, with its code when it has one.
    assumptions: (plan.assumptions ?? []).filter((a) => !disputed.has(a.field)).map((a) => ({ id: a.id, said: plainTextOf(a.said), ...codeOf(a) })),
    leftOut,
    counts: { pages: plan.pages.length, services: services.length },
    ...planReviewPartsOf(plan, leftOut, review)
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
var MAX_STEP_RETRIES = 2;
var canRetryStop = (stop) => stop?.rerun === true && stop.retries < MAX_STEP_RETRIES;

// ../../core/tracy-core/src/build-chat/stop-card.mjs
var OWNER_CONTINUES = /* @__PURE__ */ new Set(["cancelled", "revise-failed", "stale", "details-asked"]);
function stopCardOf({ stop = null, engine = null, now = Date.now() }) {
  if (engine?.state === "running") return null;
  const fromEngine = engine?.state === "stopped" ? {
    step: typeof engine.step === "string" ? engine.step : "status",
    rerun: engine.rerun === true,
    retries: 0,
    ...typeof engine.reason === "string" ? { reason: engine.reason } : {},
    ...typeof engine.retryAt === "string" ? { retryAt: engine.retryAt } : {}
  } : null;
  const seen = stop ?? fromEngine;
  if (!seen || seen.reason && OWNER_CONTINUES.has(seen.reason)) return null;
  const at = typeof seen.retryAt === "string" ? Date.parse(seen.retryAt) : Number.NaN;
  const retryAt = Number.isFinite(at) ? (
    /** @type {string} */
    seen.retryAt
  ) : null;
  const retry = !canRetryStop(
    /** @type {any} */
    seen
  ) ? "none" : retryAt && at > now ? "waiting" : "offered";
  return { step: seen.step, limit: retryAt !== null, retryAt, retry };
}

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
  "plan.trade": "Aus allgemeinem Wissen \xFCber Ihre Branche geschrieben. Entfernen Sie den Abschnitt mit Plan \xE4ndern, wenn er nicht passt.",
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
  "stop.fault": "Dieser Schritt konnte nicht abgeschlossen werden, daher habe ich hier angehalten. Was ich bisher gesammelt habe, bleibt erhalten.",
  "stop.limit": "Ich habe pausiert, weil dieser Schritt in kurzer Zeit sehr oft ausgef\xFChrt wurde. Sie k\xF6nnen es ab {time} erneut versuchen.",
  "stop.limit.now": "Ich habe pausiert, weil dieser Schritt in kurzer Zeit sehr oft ausgef\xFChrt wurde. Sie k\xF6nnen es jetzt erneut versuchen.",
  "stop.startOver": "Neu beginnen",
  "stop.startOver.confirm": "Beim Neubeginn wird verworfen, was Tracy bisher gesammelt hat, und eine neue Unterhaltung ge\xF6ffnet. Eine bereits erstellte Site ist nicht betroffen.",
  "stop.startOver.yes": "Verwerfen und neu beginnen",
  "stop.cancel": "Abbrechen",
  "stop.startOver.failed": "Ich kann gerade nicht neu beginnen. Sie k\xF6nnen in dieser Unterhaltung weitermachen.",
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
  "ask.question.place_choice_found": "Wir haben Ihr Unternehmen auf Google Maps nach Name und Stadt gesucht. Ist es einer dieser Orte?",
  "ask.question.brief_gap_offerings": "Was bietet Ihr Unternehmen an? Nennen Sie Ihre wichtigsten Leistungen oder Produkte.",
  "ask.question.brief_gap_menu": "Was steht auf Ihrer Karte? Nennen Sie ein paar Gerichte oder Getr\xE4nke.",
  "ask.question.brief_gap_offering_descriptions": "Wie w\xFCrden Sie Ihr Angebot beschreiben, mit ein oder zwei S\xE4tzen pro Punkt?",
  "ask.question.brief_gap_prices": "Was kosten Ihre wichtigsten Leistungen oder Produkte?",
  "ask.question.brief_gap_hours": "Wie sind Ihre \xD6ffnungszeiten?",
  "ask.question.brief_gap_phone": "Unter welcher Telefonnummer sollen Kunden anrufen?",
  "ask.question.brief_gap_address": "Wie lautet Ihre Adresse, oder in welchem Gebiet sind Sie t\xE4tig?",
  "ask.question.brief_gap_booking": "Wie sollen Kunden bei Ihnen buchen?",
  "ask.question.brief_gap_story": "Wie w\xFCrden Sie Ihr Unternehmen in ein paar S\xE4tzen beschreiben?",
  "ask.choice.brief_gap_skip": "Vorerst weglassen",
  "ask.question.business_trade": "Was f\xFCr ein Unternehmen ist es?",
  "ask.question.held_hours_unconfirmed": "Nur eine Quelle nennt Ihre \xD6ffnungszeiten, als rund um die Uhr an jedem Tag ge\xF6ffnet. Sind das Ihre \xD6ffnungszeiten?",
  "ask.question.held_hours_disagree": "Ihre Quellen nennen unterschiedliche \xD6ffnungszeiten. Welche Zeiten soll Ihre Site zeigen?",
  "ask.question.held_hours_typed": "Geben Sie Ihre \xD6ffnungszeiten ein, eine Zeile pro Gruppe von Tagen, zum Beispiel Mo bis Fr 9:00 bis 18:00.",
  "ask.choice.held_hours_keep": "Diese Zeiten behalten",
  "ask.choice.held_hours_edit": "Sie sind falsch, ich gebe sie ein",
  "ask.choice.held_hours_leave": "Keine \xD6ffnungszeiten auf der Site",
  "ask.choice.business_trade_food": "Essen und Trinken",
  "ask.choice.business_trade_beauty": "Beauty",
  "ask.choice.business_trade_health": "Gesundheit",
  "ask.choice.business_trade_fitness": "Sport und Fitness",
  "ask.choice.business_trade_hospitality": "Hotel oder Unterkunft",
  "ask.choice.business_trade_travel": "Reisen",
  "ask.choice.business_trade_professional": "Professionelle Dienstleistungen",
  "ask.choice.business_trade_creative": "Kreative Arbeit",
  "ask.choice.business_trade_education": "Bildung",
  "ask.choice.business_trade_retail": "Gesch\xE4ft",
  "ask.choice.business_trade_auto": "Autos und Fahrzeuge",
  "ask.choice.business_trade_home": "Dienstleistungen rund ums Haus",
  "ask.choice.business_trade_events": "Veranstaltungen",
  "ask.choice.business_trade_nonprofit": "Gemeinn\xFCtzig",
  "ask.choice.business_trade_other": "Etwas anderes",
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
  "say.researchRead": "Ich habe gelesen, was Sie mir \xFCber Ihr Unternehmen gegeben haben.",
  "plan.leftOut.reason.no_place_in_design": "Ihr Design hat keinen Platz, der dies zeigt.",
  "plan.leftOut.reason.no_place_for_whatsapp": "Dieses Design hat keinen Platz f\xFCr einen WhatsApp Link, daher zeigt Ihre Site ihn nicht.",
  "plan.leftOut.reason.no_place_for_other_phones": "Dieses Design zeigt eine Telefonnummer, daher zeigt Ihre Site Ihre Hauptnummer.",
  "plan.leftOut.reason.no_place_for_google_rating": "Dieses Design hat keinen Platz f\xFCr Ihre Google Bewertung, daher zeigt Ihre Site sie nicht.",
  "plan.leftOut.reason.hours_unconfirmed": "Nur eine Quelle nennt Ihre \xD6ffnungszeiten, als rund um die Uhr an jedem Tag ge\xF6ffnet, daher bleiben sie von Ihrer Site fern, bis Sie sie best\xE4tigen.",
  "plan.leftOut.reason.hours_sources_disagree": "Ihre Quellen nennen unterschiedliche \xD6ffnungszeiten, daher bleiben sie von Ihrer Site fern, bis Sie sie best\xE4tigen.",
  "plan.leftOut.reason.not_collected": "Keine der gelesenen Quellen nennt dies, daher zeigt Ihre Site es noch nicht.",
  "plan.leftOut.reason.sources_disagree": "Ihre Quellen widersprechen sich hierzu, daher bleibt es von Ihrer Site fern, bis Sie es best\xE4tigen.",
  "plan.leftOut.reason.kept_off_site": "Dies bleibt von Ihrer Site fern, bis Sie es best\xE4tigen.",
  "plan.leftOut.reason.no_fitting_video": "Keines Ihrer Videos passt in diesen Platz (breite Bilder ohne Text dar\xFCber), daher zeigt er kein Video.",
  "plan.leftOut.reason.page_nothing_to_show": "Sie haben noch nichts, was diese Seiten zeigen k\xF6nnten.",
  "plan.leftOut.reason.page_not_planned": "Ihr Plan braucht diese Seiten nicht.",
  "plan.leftOut.reason.library_section_refused": "Im Tracy-Bereich nicht gezeigt: {why}.",
  "plan.leftOut.why.not_google_review": "es ist keine Google-Bewertung",
  "plan.leftOut.why.no_text": "sie hat keinen Text",
  "plan.leftOut.why.no_star_rating": "sie hat keine Sternebewertung",
  "plan.leftOut.why.stars_below_four": "nur Bewertungen mit vier oder f\xFCnf Sternen werden gezeigt",
  "plan.leftOut.why.stars_not_whole": "ihre Sternebewertung ist keine ganze Zahl",
  "plan.leftOut.why.reviewer_anonymous": "die Person ist auf Google anonym",
  "plan.leftOut.why.no_reviewer_name": "sie hat keinen Namen der bewertenden Person",
  "plan.leftOut.why.reviewer_name_too_long": "der Name der bewertenden Person ist l\xE4nger, als der Bereich fasst, und ein Name wird nie gek\xFCrzt",
  "plan.leftOut.why.review_too_long": "sie ist l\xE4nger, als der Bereich fasst, und eine Bewertung wird nie gek\xFCrzt",
  "plan.leftOut.what.no_place_for_whatsapp": "WhatsApp",
  "plan.leftOut.what.no_place_for_other_phones": "Weitere Telefonnummern",
  "plan.leftOut.what.no_place_for_google_rating": "Google Bewertung",
  "plan.leftOut.what.hours_unconfirmed": "\xD6ffnungszeiten",
  "plan.leftOut.what.hours_sources_disagree": "\xD6ffnungszeiten",
  "plan.leftOut.what.no_fitting_video.one": "{count} Videoplatz",
  "plan.leftOut.what.no_fitting_video.other": "{count} Videopl\xE4tze",
  "plan.leftOut.what.pages.one": "Seite {page}",
  "plan.leftOut.what.pages.two": "Seiten {first} und {last}",
  "plan.leftOut.what.pages.three": "Seiten {first}, {second} und {last}",
  "plan.leftOut.what.pages.more": "Seiten {first}, {second}, {third} und {count} weitere",
  "plan.pictures.ownOfValue.one": "{count} von Ihren {total} Fotos, von {from}",
  "plan.pictures.ownOfValue.other": "{count} von Ihren {total} Fotos, von {from}",
  "plan.assumption.accent_logo_moved.lighter": "Die Farbe Ihres Logos wurde heller gemacht, damit Schaltfl\xE4chen und Links im Design hervortreten.",
  "plan.assumption.accent_logo_moved.darker": "Die Farbe Ihres Logos wurde dunkler gemacht, damit Schaltfl\xE4chen und Links im Design hervortreten.",
  "plan.assumption.accent_logo_kept": "Schaltfl\xE4chen und Links verwenden die Farbe Ihres Logos.",
  "plan.assumption.accent_no_hue.black": "Ihr Logo hat keine Farbe, daher sind Schaltfl\xE4chen und Links schwarz.",
  "plan.assumption.accent_no_hue.white": "Ihr Logo hat keine Farbe, daher sind Schaltfl\xE4chen und Links wei\xDF.",
  "plan.assumption.accent_no_hue.both": "Ihr Logo hat keine Farbe, daher sind Schaltfl\xE4chen und Links auf hellen Seiten schwarz und auf dunklen Seiten wei\xDF.",
  "plan.assumption.accent_unreadable.black": "Die Farbe Ihres Logos ist auf Schaltfl\xE4chen schwer lesbar, daher sind Schaltfl\xE4chen und Links schwarz.",
  "plan.assumption.accent_unreadable.white": "Die Farbe Ihres Logos ist auf Schaltfl\xE4chen schwer lesbar, daher sind Schaltfl\xE4chen und Links wei\xDF.",
  "plan.assumption.accent_unreadable.both": "Die Farbe Ihres Logos ist auf Schaltfl\xE4chen schwer lesbar, daher sind Schaltfl\xE4chen und Links auf hellen Seiten schwarz und auf dunklen Seiten wei\xDF.",
  "plan.assumption.accent_kept_unmeasured": "Die Farben Ihres Logos konnten nicht gelesen werden, daher behalten Schaltfl\xE4chen und Links die Hauptfarbe des Designs.",
  "plan.assumption.accent_kept_template": "Die Farben Ihres Logos w\xE4ren in diesem Design nicht lesbar, daher behalten Schaltfl\xE4chen und Links die Hauptfarbe des Designs.",
  "plan.edits.count.one": "{count} \xC4nderung",
  "plan.edits.count.other": "{count} \xC4nderungen",
  "plan.edits.revert": "Zur\xFCck zum Original",
  "plan.edits.revertAsk.one": "Ihre \xC4nderung verwerfen?",
  "plan.edits.revertAsk.other": "Alle {count} \xC4nderungen verwerfen?",
  "plan.edits.keep": "Behalten",
  "plan.edits.discard": "Alle verwerfen",
  "plan.remove": "{what} entfernen",
  "plan.get": "Das erhalten Sie",
  "plan.get.lead": "Eine Site auf {language} mit {pages}: {names}.",
  "plan.get.pages.one": "{count} Seite",
  "plan.get.pages.other": "{count} Seiten",
  "plan.keyMessages": "Was Ihre Site zuerst sagt",
  "plan.keyMessages.where": "Seite {page}: {sections}",
  "plan.keyMessages.nowhere": "Noch kein Abschnitt enth\xE4lt dies.",
  "plan.keyMessage.n": "Kernbotschaft {n}",
  "plan.tile.pages": "Seiten",
  "plan.tile.privacy": "und eine Datenschutzseite",
  "plan.tile.services": "Leistungen",
  "plan.tile.people": "Personen",
  "plan.tile.reviews": "Bewertungen",
  "plan.tile.reviewsOf": "von {count} Bewertungen",
  "plan.tile.photos": "Ihrer Fotos verwendet",
  "plan.tile.drawn.one": "etwa {count} weiteres Bild, das Tracy erstellt",
  "plan.tile.drawn.other": "etwa {count} weitere Bilder, die Tracy erstellt",
  "plan.look.logoOnLight": "Ihr Logo auf hellem Hintergrund",
  "plan.look.logoOnDark": "Ihr Logo auf dunklem Hintergrund",
  "plan.reach": "Wie Kunden Sie erreichen",
  "plan.reach.main": "Hauptschaltfl\xE4che",
  "plan.reach.where": "Angezeigt in {places}.",
  "plan.reach.place": "{section} auf {pages}",
  "plan.reach.nowhere": "Noch kein Abschnitt zeigt es.",
  "plan.reach.end": "Seitenende",
  "plan.reach.endLine": "Seite {page}: {section}",
  "plan.reach.footerAll": "In der Fu\xDFzeile jeder Seite.",
  "plan.reach.footerSome": "In der Fu\xDFzeile von {pages}.",
  "plan.reach.on": "Auf {pages}.",
  "plan.pages.every": "Jede Seite",
  "plan.pages.menu": "Men\xFC",
  "plan.pages.header": "Der Seitenkopf zeigt {facts}.",
  "plan.pages.footer": "Die Fu\xDFzeile zeigt {facts}.",
  "plan.pages.privacyLink": "einen Link zur Datenschutzseite",
  "plan.page.keyMessage": "Kernaussage der Seite",
  "plan.page.notes": "Hinweise f\xFCr den Texter",
  "plan.page.visitorQuestion": "Ein Besucher kommt, um zu erfahren",
  "plan.tag.end": "Seitenende",
  "plan.tag.library": "Von Tracy hinzugef\xFCgt",
  "plan.standard": "Standardseiten",
  "plan.standard.sum": "Datenschutzerkl\xE4rung, Seite nicht gefunden",
  "plan.standard.privacy": "Datenschutzerkl\xE4rung",
  "plan.standard.privacyFrom": "Verfasst aus {facts}. In der Fu\xDFzeile verlinkt, nicht im Men\xFC.",
  "plan.standard.notFound": "Seite nicht gefunden",
  "plan.standard.notFoundLine": "Sagt, dass die Seite nicht existiert, und f\xFChrt den Besucher zu {pages}.",
  "plan.writtenAfter": "Die \xDCberschriften und Texte jedes Abschnitts werden nach Ihrer Freigabe geschrieben, nur aus dem, was dieser Plan enth\xE4lt.",
  "plan.fact.offSite": "Nicht auf der Site",
  "plan.notOnSite": "Nicht auf der Site",
  "plan.notOnSite.group.removed": "Von Ihnen entfernt",
  "plan.notOnSite.group.no_place": "Ihr Design hat keinen Platz daf\xFCr",
  "plan.notOnSite.group.no_info": "Noch keine Informationen",
  "plan.notOnSite.group.held": "Zur\xFCckgehalten, bis Sie best\xE4tigen",
  "plan.notOnSite.group.reviews": "Nicht verwendete Bewertungen",
  "plan.notOnSite.group.pages": "Nicht erstellte Template-Seiten",
  "plan.notOnSite.group.people_spots": "Leer gelassene Bildpl\xE4tze f\xFCr Personen",
  "plan.notOnSite.group.other": "Sonstiges",
  "plan.notOnSite.lines.one": "{count} Zeile",
  "plan.notOnSite.lines.other": "{count} Zeilen",
  "plan.notOnSite.details.one": "Damit ist {count} Detail entfallen, das sonst nirgends gezeigt wird.",
  "plan.notOnSite.details.other": "Damit sind {count} Details entfallen, die sonst nirgends gezeigt werden.",
  "plan.notOnSite.restore": "Wiederherstellen",
  "plan.notOnSite.restoreLabel": "{what} wiederherstellen",
  "plan.notOnSite.cannotRestore": "Um dies wiederherzustellen, bitten Sie im Chat darum.",
  "plan.notOnSite.peopleSpots.one": "{count} Bildplatz f\xFCr eine Person",
  "plan.notOnSite.peopleSpots.other": "{count} Bildpl\xE4tze f\xFCr Personen",
  "plan.notOnSite.peopleSpots.reason": "Tracy erstellt nie Bilder von Personen, daher bleiben diese Pl\xE4tze leer, bis Sie Ihr eigenes Foto hinzuf\xFCgen.",
  "plan.leftOut.reason.owner_removed": "Sie haben dies aus dem Plan genommen.",
  "plan.leftOut.what.videos.one": "{count} Video",
  "plan.leftOut.what.videos.other": "{count} Videos",
  "plan.sources": "Von Ihren Links zur Site",
  "plan.sources.source": "Quelle",
  "plan.sources.got": "Was Tracy gefunden hat",
  "plan.sources.shown": "Auf der Site",
  "plan.sources.none": "Nichts",
  "plan.sources.shownOf": "{shown} von {what}",
  "plan.search": "Suche bei Google",
  "plan.search.title": "Was der Titel sagt",
  "plan.search.description": "Was die Beschreibung sagt",
  "plan.search.terms": "Suchbegriffe",
  "plan.search.add": "Suchbegriff hinzuf\xFCgen",
  "plan.search.addLabel": "Neuer Suchbegriff f\xFCr die Seite {page}",
  "plan.search.removeTerm": "Suchbegriff {term} entfernen",
  "plan.later": "Das k\xF6nnen Sie sp\xE4ter senden",
  "plan.later.what.later_prices": "Ihre Preise",
  "plan.later.reason.later_prices": "Senden Sie Ihre Preise, dann k\xF6nnen sie zusammen mit Ihrem Angebot gezeigt werden.",
  "plan.later.what.later_services": "Ihre Leistungsliste",
  "plan.later.reason.later_services": "Senden Sie die Leistungen, die Sie anbieten, dann kann jede einen eigenen Platz auf Ihrer Site erhalten.",
  "plan.later.what.later_menu": "Ihre Speisekarte",
  "plan.later.reason.later_menu": "Senden Sie Ihre Speisekarte, dann k\xF6nnen Ihre Gerichte auf Ihrer Site gezeigt werden.",
  "plan.later.what.later_hours": "Ihre \xD6ffnungszeiten",
  "plan.later.reason.later_hours": "Best\xE4tigen Sie Ihre \xD6ffnungszeiten, dann k\xF6nnen sie auf Ihrer Site gezeigt werden.",
  "plan.later.what.later_email": "Ihre E-Mail-Adresse",
  "plan.later.reason.later_email": "Senden Sie eine E-Mail-Adresse, dann k\xF6nnen Besucher Ihnen schreiben und ein Formular kann seine Antworten dorthin senden.",
  "plan.later.what.later_booking_link": "Ihr Buchungslink",
  "plan.later.reason.later_booking_link": "Senden Sie Ihren Buchungslink, dann k\xF6nnen Ihre Schaltfl\xE4chen Besucher direkt dorthin f\xFChren.",
  "plan.later.what.later_portraits": "Fotos Ihres Teams",
  "plan.later.reason.later_portraits": "Senden Sie ein Foto jeder Person, dann kann es neben dem Namen gezeigt werden.",
  "plan.later.what.later_logo": "Ihre Logo-Datei",
  "plan.later.reason.later_logo": "Senden Sie Ihre Logo-Datei, dann kann sie anstelle des Logos gezeigt werden, das Ihr Plan vorerst verwendet.",
  "plan.refused.first_page": "Die erste Seite Ihrer Site bleibt: Jede andere Seite f\xFChrt zu ihr zur\xFCck.",
  "plan.refused.privacy_page": "Diese Seite ist Ihre Datenschutzseite, daher bleibt sie.",
  "plan.refused.main_block": "Dieser Abschnitt ist der Hauptabschnitt seiner Seite, daher bleibt er, solange die Seite bleibt.",
  "plan.refused.site_chrome": "Dieser Abschnitt wird von jeder Seite Ihrer Site gemeinsam genutzt, daher kann er nicht von einer einzelnen Seite entfernt werden.",
  "plan.refused.end_action": "Ihre Seite endet mit diesem Abschnitt, daher bleibt er.",
  "plan.refused.main_button": "Ihre Hauptschaltfl\xE4che verwendet dies, daher bleibt es.",
  "plan.refused.too_few_items": "Dieser Abschnitt braucht mindestens {min} davon, daher bleibt dieser Eintrag.",
  "plan.refused.block_empty": "Dies ist das Letzte, was dieser Abschnitt zeigt. Entfernen Sie stattdessen den ganzen Abschnitt.",
  "plan.refused.not_in_footer": "Dies wird nicht in der Fu\xDFzeile Ihrer Seiten gezeigt.",
  "plan.refused.not_a_channel": "Nur eine Kontaktm\xF6glichkeit kann aus der Fu\xDFzeile entfernt werden.",
  "plan.refused.not_an_item": "Nur eine Leistung, eine Person, ein Foto oder eine Bewertung kann aus einem Abschnitt entfernt werden.",
  "plan.refused.needed_by_privacy_page": "Ihre Datenschutzseite braucht dies, daher bleibt es.",
  "plan.refused.needed_by_end_action": "Das Ende einer Seite f\xFChrt hierher, daher bleibt es.",
  "plan.refused.not_found": "Dies ist nicht mehr in Ihrem Plan.",
  "plan.refused.removal_unknown": "Hier gibt es nichts wiederherzustellen.",
  "plan.refused.restore_target_gone": "Dies geh\xF6rt in etwas, das Sie danach entfernt haben. Stellen Sie zuerst jenes wieder her.",
  "plan.refused.search_terms_empty": "Eine Seite beh\xE4lt mindestens einen Suchbegriff.",
  "plan.refused.search_term_too_long": "Ein Suchbegriff hat h\xF6chstens 60 Zeichen.",
  "plan.refused.search_term_twice": "Dieser Suchbegriff steht bereits auf der Seite.",
  "plan.refused.too_many_search_terms": "Eine Seite hat h\xF6chstens 10 Suchbegriffe.",
  "plan.refused.too_many_items": "Dieser Bereich zeigt h\xF6chstens {max} davon, daher passt diese \xC4nderung nicht.",
  "plan.refused.wrong_item_kind": "Dieser Bereich kann das nicht zeigen.",
  "plan.refused.library_rule": "Dieser Bereich zeigt das nicht.",
  "plan.refused.invented_item": "Diese \xC4nderung nennt etwas, das nicht zu Ihren Gesch\xE4ftsangaben geh\xF6rt.",
  "plan.refused.fact_without_field": "Dieser Bereich hat keinen Platz f\xFCr diese Angabe.",
  "plan.refused.main_block_missing": "Diese \xC4nderung w\xFCrde den Hauptbereich von seiner Seite entfernen.",
  "plan.refused.unknown_block": "Dieser Bereich geh\xF6rt nicht zu Ihrer Vorlage.",
  "plan.refused.withheld_shown": "Diese \xC4nderung w\xFCrde etwas zeigen, das Sie von Ihrer Website fernhalten.",
  "plan.refused.edit_invalid": "Diese \xC4nderung kann nicht gespeichert werden: Ihr Plan w\xE4re danach unvollst\xE4ndig.",
  "plan.refused.site_name_too_long": "Dieser Name ist zu lang f\xFCr Ihre Website.",
  "plan.refused.site_name_invalid": "Dieser Name kann f\xFCr Ihre Website nicht verwendet werden.",
  "plan.refused.value_over_limit": "Dieser Wert ist zu lang f\xFCr den Bereich, der ihn zeigt.",
  "plan.refused.data_unaccounted": "Nach dieser \xC4nderung w\xFCrde eine Angabe zu Ihrem Gesch\xE4ft nirgends gezeigt.",
  "plan.refused.picture_count": "Ihre Fotos konnten nach dieser \xC4nderung nicht neu gez\xE4hlt werden, daher wurde sie nicht gespeichert.",
  "plan.refused.plan_fault": "Diese \xC4nderung wurde nicht gespeichert: Ihr Plan hat ein eigenes Problem, das Tracy zuerst beheben muss. Sie k\xF6nnen die \xC4nderung im Chat anfragen.",
  "plan.refused.template_change": "Dieser Plan wurde f\xFCr das von Ihnen gew\xE4hlte Design erstellt und kann noch nicht auf ein anderes Design \xFCbertragen werden.",
  "plan.heldBack.field.prices": "Preise",
  "plan.heldBack.field.offerings": "Leistungen",
  "plan.heldBack.field.menu": "Speisekarte",
  "plan.heldBack.field.menu-link": "Link zur Speisekarte",
  "plan.heldBack.field.name": "Name des Unternehmens",
  "plan.heldBack.field.team": "Team",
  "plan.heldBack.field.socials": "Social-Media-Profile",
  "plan.heldBack.field.photos": "Fotos",
  "plan.heldBack.field.posts": "Beitr\xE4ge",
  "plan.heldBack.field.email": "E-Mail-Adresse",
  "plan.heldBack.field.phone": "Telefonnummer",
  "plan.heldBack.field.address": "Adresse",
  "plan.heldBack.field.about": "\xDCber das Unternehmen",
  "plan.heldBack.field.reviews": "Bewertungen",
  "plan.heldBack.field.booking": "Buchungslink",
  "plan.heldBack.field.offering-descriptions": "Beschreibungen der Leistungen",
  "plan.heldBack.field.story": "Ihre Geschichte",
  "plan.refused.item_field_fact": "Dieser Bereich zeigt einen ganzen Eintrag, nicht eine seiner Angaben.",
  "plan.refused.trade_terms": "Dieser Bereich beschreibt, wie Ihre Branche \xFCblicherweise arbeitet, und nennt daher keine Zahl, keinen Preis, keine Zeiten und kein Versprechen.",
  "plan.refused.trade_fact_missing": "Dieser Bereich erkl\xE4rt Ihre Branche anhand einer Angabe zu Ihrem Gesch\xE4ft, daher bleibt diese Angabe.",
  "plan.refused.item_repeated_on_page": "Diese \xC4nderung w\xFCrde dasselbe zweimal auf einer Seite zeigen.",
  "plan.refused.form_without_destination": "Ein Formular braucht eine E-Mail-Adresse, an die seine Nachrichten gehen.",
  "plan.refused.map_without_address": "Eine Karte braucht Ihre Adresse.",
  "plan.leftOut.reason.whatsapp_unconfirmed": "Keine Quelle sagt, dass diese Nummer WhatsApp-Nachrichten annimmt, daher verlinkt Ihre Website nicht auf WhatsApp.",
  "plan.leftOut.reason.contact_value_missing": "Sie haben gew\xE4hlt, wie Besucher Sie erreichen, aber noch keinen Wert angegeben, daher wird nichts angezeigt. F\xFCgen Sie ihn im Plan hinzu.",
  "plan.leftOut.reason.fact_longer_than_every_place": "Das ist l\xE4nger als jeder Platz, den Ihr Design daf\xFCr hat, und Tracy k\xFCrzt es nie.",
  "plan.leftOut.reason.no_room_left": "Jeder Platz, den Ihr Design daf\xFCr hat, ist bereits belegt.",
  "plan.leftOut.reason.no_room_left.item": "F\xFCr weitere davon ist kein Platz mehr.",
  "plan.leftOut.reason.fewer_than_section_needs": "Jeder Abschnitt daf\xFCr braucht mindestens {min}. Tracy erfindet nie welche, um einen Abschnitt zu f\xFCllen.",
  "plan.leftOut.reason.section_below_minimum": "Es stand in einem Abschnitt, der mindestens {min} davon braucht, und daf\xFCr blieben zu wenige \xFCbrig, daher wird es nicht angezeigt.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.one": "Dieses Foto erscheint bereits in einer Galerie auf einer anderen Seite, und jedes Foto erscheint nur einmal auf Ihrer Website, daher zeigt diese Galerie eines weniger.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.other": "Diese {count} Fotos erscheinen bereits in einer Galerie auf einer anderen Seite, und jedes Foto erscheint nur einmal auf Ihrer Website, daher zeigt diese Galerie {count} weniger.",
  "plan.leftOut.reason.data_over_limit": "Das ist l\xE4nger, als der Abschnitt anzeigen kann, daher wird es dort nicht angezeigt.",
  "plan.leftOut.reason.value_over_limit": "Das ist l\xE4nger, als der Abschnitt anzeigen kann, daher wird es nicht angezeigt.",
  "plan.leftOut.reason.row_beyond_stored_places": "Der Abschnitt, der diese zeigt, hat Platz f\xFCr weniger Zeilen, als Sie haben.",
  "plan.leftOut.reason.row_over_max": "Der Abschnitt, der diese zeigt, hat Platz f\xFCr weniger Zeilen, als Sie haben.",
  "plan.leftOut.reason.row_field_undeclared": "Der Abschnitt zeigt nur einen Teil dieser Zeile.",
  "plan.leftOut.reason.row_parts_over_fields": "Diese Zeile hat mehr Teile, als der Abschnitt Pl\xE4tze hat, daher wird sie nicht angezeigt.",
  "plan.leftOut.reason.row_value_over_limit": "Diese Zeile ist l\xE4nger, als der Abschnitt anzeigen kann, daher wird sie nicht angezeigt.",
  "plan.leftOut.reason.row_parts_order": "Die Zeiten dieser Zeile stehen vor ihren Tagen, daher wird sie nicht angezeigt.",
  "plan.leftOut.reason.row_no_list": "Kein Abschnitt der Vorlage zeigt Zeilen wie diese.",
  "plan.leftOut.reason.social_link_shortened": "Das ist ein gek\xFCrzter Link, daher ist unbekannt, zu welchem Netzwerk er f\xFChrt.",
  "plan.leftOut.reason.social_network_unknown": "Dieser Link f\xFChrt zu keinem sozialen Netzwerk, das der Abschnitt zeigen kann.",
  "plan.leftOut.reason.social_handle_without_network": "Dieser Name sagt nicht, in welchem Netzwerk er ist.",
  "plan.leftOut.reason.social_link_not_web": "Das ist kein Weblink.",
  "plan.leftOut.reason.no_social_link": "Es gibt keinen Link zum Anzeigen.",
  "plan.leftOut.reason.social_network_repeated": "Ein anderer Link zum selben Netzwerk wird bereits angezeigt.",
  "plan.leftOut.reason.social_link_over_rows": "Der Abschnitt, der diese zeigt, hat Platz f\xFCr weniger Zeilen, als Sie haben.",
  "plan.leftOut.reason.page_removed": "Sie haben gebeten, diese Seite zu entfernen.",
  "plan.leftOut.reason.no_longer_in_plan": "Es ist nicht Teil Ihres Plans.",
  "plan.leftOut.reason.requested_off": "Sie haben gebeten, dies aus dem Plan zu nehmen.",
  "plan.leftOut.reason.removed_page_data": "Es stand nur auf einer Seite, die Sie entfernen lassen wollten."
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
  "plan.trade": "Escrito a partir del conocimiento general de su sector. Qu\xEDtelo con Cambiar el plan si no encaja.",
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
  "stop.fault": "Este paso no se pudo completar, as\xED que me detuve aqu\xED. Lo que he reunido hasta ahora se conserva.",
  "stop.limit": "Hice una pausa porque este paso se ejecut\xF3 muchas veces en poco tiempo. Puede volver a intentarlo a partir de {time}.",
  "stop.limit.now": "Hice una pausa porque este paso se ejecut\xF3 muchas veces en poco tiempo. Puede volver a intentarlo ahora.",
  "stop.startOver": "Empezar de nuevo",
  "stop.startOver.confirm": "Empezar de nuevo descarta lo que Tracy ha reunido hasta ahora y abre una conversaci\xF3n nueva. Un site ya creado no se ve afectado.",
  "stop.startOver.yes": "Descartar y empezar de nuevo",
  "stop.cancel": "Cancelar",
  "stop.startOver.failed": "No puedo empezar de nuevo ahora. Puede continuar en esta conversaci\xF3n.",
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
  "ask.question.place_choice_found": "Buscamos tu negocio en Google Maps por su nombre y ciudad. \xBFEs alguno de estos?",
  "ask.question.brief_gap_offerings": "\xBFQu\xE9 ofrece tu negocio? Nombra tus principales servicios o productos.",
  "ask.question.brief_gap_menu": "\xBFQu\xE9 hay en tu carta? Nombra algunos platos o bebidas.",
  "ask.question.brief_gap_offering_descriptions": "\xBFC\xF3mo describir\xEDas lo que ofreces, en una o dos frases cada cosa?",
  "ask.question.brief_gap_prices": "\xBFCu\xE1nto cuestan tus principales servicios o productos?",
  "ask.question.brief_gap_hours": "\xBFCu\xE1l es tu horario de apertura?",
  "ask.question.brief_gap_phone": "\xBFA qu\xE9 n\xFAmero de tel\xE9fono deben llamar los clientes?",
  "ask.question.brief_gap_address": "\xBFCu\xE1l es tu direcci\xF3n, o la zona en la que trabajas?",
  "ask.question.brief_gap_booking": "\xBFC\xF3mo deben reservar contigo los clientes?",
  "ask.question.brief_gap_story": "\xBFC\xF3mo describir\xEDas tu negocio en unas pocas frases?",
  "ask.choice.brief_gap_skip": "Dejarlo fuera por ahora",
  "ask.question.business_trade": "\xBFQu\xE9 tipo de negocio es?",
  "ask.question.held_hours_unconfirmed": "Solo una fuente indica su horario, como abierto las 24 horas todos los d\xEDas. \xBFEs este su horario?",
  "ask.question.held_hours_disagree": "Sus fuentes indican horarios distintos. \xBFQu\xE9 horario debe mostrar su sitio?",
  "ask.question.held_hours_typed": "Escriba su horario, una l\xEDnea por grupo de d\xEDas, por ejemplo lun a vie 9:00 a 18:00.",
  "ask.choice.held_hours_keep": "Mantener este horario",
  "ask.choice.held_hours_edit": "Es incorrecto, lo escribir\xE9",
  "ask.choice.held_hours_leave": "No mostrar el horario en el sitio",
  "ask.choice.business_trade_food": "Comida y bebida",
  "ask.choice.business_trade_beauty": "Belleza",
  "ask.choice.business_trade_health": "Salud",
  "ask.choice.business_trade_fitness": "Deporte y fitness",
  "ask.choice.business_trade_hospitality": "Hotel o alojamiento",
  "ask.choice.business_trade_travel": "Viajes",
  "ask.choice.business_trade_professional": "Servicios profesionales",
  "ask.choice.business_trade_creative": "Trabajo creativo",
  "ask.choice.business_trade_education": "Educaci\xF3n",
  "ask.choice.business_trade_retail": "Tienda",
  "ask.choice.business_trade_auto": "Coches y veh\xEDculos",
  "ask.choice.business_trade_home": "Servicios para el hogar",
  "ask.choice.business_trade_events": "Eventos",
  "ask.choice.business_trade_nonprofit": "Sin \xE1nimo de lucro",
  "ask.choice.business_trade_other": "Otra cosa",
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
  "say.researchRead": "He le\xEDdo lo que me ha dado sobre su negocio.",
  "plan.leftOut.reason.no_place_in_design": "Su dise\xF1o no tiene un lugar que muestre esto.",
  "plan.leftOut.reason.no_place_for_whatsapp": "Este dise\xF1o no tiene lugar para un enlace de WhatsApp, as\xED que su sitio no lo muestra.",
  "plan.leftOut.reason.no_place_for_other_phones": "Este dise\xF1o muestra un n\xFAmero de tel\xE9fono, as\xED que su sitio muestra el principal.",
  "plan.leftOut.reason.no_place_for_google_rating": "Este dise\xF1o no tiene lugar para su valoraci\xF3n de Google, as\xED que su sitio no la muestra.",
  "plan.leftOut.reason.hours_unconfirmed": "Solo una fuente da su horario, abierto las 24 horas todos los d\xEDas, as\xED que queda fuera de su sitio hasta que usted lo confirme.",
  "plan.leftOut.reason.hours_sources_disagree": "Sus fuentes dan horarios distintos, as\xED que quedan fuera de su sitio hasta que usted los confirme.",
  "plan.leftOut.reason.not_collected": "Ninguna de las fuentes que le\xEDmos lo indica, as\xED que su sitio a\xFAn no lo muestra.",
  "plan.leftOut.reason.sources_disagree": "Sus fuentes no coinciden en esto, as\xED que queda fuera de su sitio hasta que usted lo confirme.",
  "plan.leftOut.reason.kept_off_site": "Esto queda fuera de su sitio hasta que usted lo confirme.",
  "plan.leftOut.reason.no_fitting_video": "Ninguno de sus v\xEDdeos encaja en este espacio (im\xE1genes anchas sin texto encima), as\xED que no muestra ning\xFAn v\xEDdeo.",
  "plan.leftOut.reason.page_nothing_to_show": "Todav\xEDa no tiene nada que mostrar en estas p\xE1ginas.",
  "plan.leftOut.reason.page_not_planned": "Su plan no necesita estas p\xE1ginas.",
  "plan.leftOut.reason.library_section_refused": "No se muestra en la secci\xF3n de Tracy: {why}.",
  "plan.leftOut.why.not_google_review": "no es una rese\xF1a de Google",
  "plan.leftOut.why.no_text": "no tiene texto",
  "plan.leftOut.why.no_star_rating": "no tiene puntuaci\xF3n de estrellas",
  "plan.leftOut.why.stars_below_four": "solo se muestran rese\xF1as de cuatro o cinco estrellas",
  "plan.leftOut.why.stars_not_whole": "su puntuaci\xF3n de estrellas no es un n\xFAmero entero",
  "plan.leftOut.why.reviewer_anonymous": "su autor es an\xF3nimo en Google",
  "plan.leftOut.why.no_reviewer_name": "no tiene nombre de autor",
  "plan.leftOut.why.reviewer_name_too_long": "el nombre del autor es m\xE1s largo de lo que cabe en la secci\xF3n, y un nombre nunca se recorta",
  "plan.leftOut.why.review_too_long": "es m\xE1s larga de lo que cabe en la secci\xF3n, y una rese\xF1a nunca se recorta",
  "plan.leftOut.what.no_place_for_whatsapp": "WhatsApp",
  "plan.leftOut.what.no_place_for_other_phones": "Otros n\xFAmeros de tel\xE9fono",
  "plan.leftOut.what.no_place_for_google_rating": "Valoraci\xF3n de Google",
  "plan.leftOut.what.hours_unconfirmed": "Horario de apertura",
  "plan.leftOut.what.hours_sources_disagree": "Horario de apertura",
  "plan.leftOut.what.no_fitting_video.one": "{count} espacio para v\xEDdeo",
  "plan.leftOut.what.no_fitting_video.other": "{count} espacios para v\xEDdeo",
  "plan.leftOut.what.pages.one": "P\xE1gina {page}",
  "plan.leftOut.what.pages.two": "P\xE1ginas {first} y {last}",
  "plan.leftOut.what.pages.three": "P\xE1ginas {first}, {second} y {last}",
  "plan.leftOut.what.pages.more": "P\xE1ginas {first}, {second}, {third} y {count} m\xE1s",
  "plan.pictures.ownOfValue.one": "{count} de sus {total} fotos, de {from}",
  "plan.pictures.ownOfValue.other": "{count} de sus {total} fotos, de {from}",
  "plan.assumption.accent_logo_moved.lighter": "El color de su logotipo se aclar\xF3 para que los botones y enlaces destaquen en el dise\xF1o.",
  "plan.assumption.accent_logo_moved.darker": "El color de su logotipo se oscureci\xF3 para que los botones y enlaces destaquen en el dise\xF1o.",
  "plan.assumption.accent_logo_kept": "Los botones y enlaces usan el color de su logotipo.",
  "plan.assumption.accent_no_hue.black": "Su logotipo no tiene color, as\xED que los botones y enlaces son negros.",
  "plan.assumption.accent_no_hue.white": "Su logotipo no tiene color, as\xED que los botones y enlaces son blancos.",
  "plan.assumption.accent_no_hue.both": "Su logotipo no tiene color, as\xED que los botones y enlaces son negros en las p\xE1ginas claras y blancos en las oscuras.",
  "plan.assumption.accent_unreadable.black": "El color de su logotipo se lee mal en los botones, as\xED que los botones y enlaces son negros.",
  "plan.assumption.accent_unreadable.white": "El color de su logotipo se lee mal en los botones, as\xED que los botones y enlaces son blancos.",
  "plan.assumption.accent_unreadable.both": "El color de su logotipo se lee mal en los botones, as\xED que los botones y enlaces son negros en las p\xE1ginas claras y blancos en las oscuras.",
  "plan.assumption.accent_kept_unmeasured": "No se pudieron leer los colores de su logotipo, as\xED que los botones y enlaces mantienen el color principal del dise\xF1o.",
  "plan.assumption.accent_kept_template": "Los colores de su logotipo no se leer\xEDan en este dise\xF1o, as\xED que los botones y enlaces mantienen el color principal del dise\xF1o.",
  "plan.edits.count.one": "{count} cambio",
  "plan.edits.count.other": "{count} cambios",
  "plan.edits.revert": "Volver al original",
  "plan.edits.revertAsk.one": "\xBFDescartar su cambio?",
  "plan.edits.revertAsk.other": "\xBFDescartar los {count} cambios?",
  "plan.edits.keep": "Conservar",
  "plan.edits.discard": "Descartar todo",
  "plan.remove": "Quitar {what}",
  "plan.get": "Lo que obtiene",
  "plan.get.lead": "Un sitio en {language} con {pages}: {names}.",
  "plan.get.pages.one": "{count} p\xE1gina",
  "plan.get.pages.other": "{count} p\xE1ginas",
  "plan.keyMessages": "Lo que dice primero su sitio",
  "plan.keyMessages.where": "P\xE1gina {page}: {sections}",
  "plan.keyMessages.nowhere": "Todav\xEDa ninguna secci\xF3n lo incluye.",
  "plan.keyMessage.n": "Mensaje clave {n}",
  "plan.tile.pages": "p\xE1ginas",
  "plan.tile.privacy": "y una p\xE1gina de privacidad",
  "plan.tile.services": "servicios",
  "plan.tile.people": "personas",
  "plan.tile.reviews": "rese\xF1as",
  "plan.tile.reviewsOf": "de {count} rese\xF1as",
  "plan.tile.photos": "de sus fotos usadas",
  "plan.tile.drawn.one": "unas {count} imagen m\xE1s que crea Tracy",
  "plan.tile.drawn.other": "unas {count} im\xE1genes m\xE1s que crea Tracy",
  "plan.look.logoOnLight": "Su logo sobre fondo claro",
  "plan.look.logoOnDark": "Su logo sobre fondo oscuro",
  "plan.reach": "C\xF3mo le contactan los clientes",
  "plan.reach.main": "Bot\xF3n principal",
  "plan.reach.where": "Se muestra en {places}.",
  "plan.reach.place": "{section} en {pages}",
  "plan.reach.nowhere": "Todav\xEDa ninguna secci\xF3n lo muestra.",
  "plan.reach.end": "Final de p\xE1gina",
  "plan.reach.endLine": "P\xE1gina {page}: {section}",
  "plan.reach.footerAll": "En el pie de p\xE1gina de todas las p\xE1ginas.",
  "plan.reach.footerSome": "En el pie de p\xE1gina de {pages}.",
  "plan.reach.on": "En {pages}.",
  "plan.pages.every": "Todas las p\xE1ginas",
  "plan.pages.menu": "Men\xFA",
  "plan.pages.header": "La cabecera muestra {facts}.",
  "plan.pages.footer": "El pie de p\xE1gina muestra {facts}.",
  "plan.pages.privacyLink": "un enlace a la p\xE1gina de privacidad",
  "plan.page.keyMessage": "Idea principal de la p\xE1gina",
  "plan.page.notes": "Notas para el redactor",
  "plan.page.visitorQuestion": "Un visitante viene para saber",
  "plan.tag.end": "Final de p\xE1gina",
  "plan.tag.library": "A\xF1adido por Tracy",
  "plan.standard": "P\xE1ginas est\xE1ndar",
  "plan.standard.sum": "Pol\xEDtica de privacidad, p\xE1gina no encontrada",
  "plan.standard.privacy": "Pol\xEDtica de privacidad",
  "plan.standard.privacyFrom": "Redactada a partir de {facts}. Enlazada en el pie de p\xE1gina, no en el men\xFA.",
  "plan.standard.notFound": "P\xE1gina no encontrada",
  "plan.standard.notFoundLine": "Indica que la p\xE1gina no existe y lleva al visitante a {pages}.",
  "plan.writtenAfter": "Los t\xEDtulos y textos de cada secci\xF3n se redactan despu\xE9s de que usted apruebe, solo a partir de lo que contiene este plan.",
  "plan.fact.offSite": "No est\xE1 en el sitio",
  "plan.notOnSite": "No est\xE1 en el sitio",
  "plan.notOnSite.group.removed": "Usted quit\xF3",
  "plan.notOnSite.group.no_place": "Su dise\xF1o no tiene lugar para esto",
  "plan.notOnSite.group.no_info": "A\xFAn no hay informaci\xF3n",
  "plan.notOnSite.group.held": "En espera hasta que usted confirme",
  "plan.notOnSite.group.reviews": "Rese\xF1as no usadas",
  "plan.notOnSite.group.pages": "P\xE1ginas de la plantilla sin crear",
  "plan.notOnSite.group.people_spots": "Espacios de im\xE1genes de personas que quedan vac\xEDos",
  "plan.notOnSite.group.other": "Otros",
  "plan.notOnSite.lines.one": "{count} l\xEDnea",
  "plan.notOnSite.lines.other": "{count} l\xEDneas",
  "plan.notOnSite.details.one": "Con ello se fue {count} detalle que no se muestra en ning\xFAn otro lugar.",
  "plan.notOnSite.details.other": "Con ello se fueron {count} detalles que no se muestran en ning\xFAn otro lugar.",
  "plan.notOnSite.restore": "Restaurar",
  "plan.notOnSite.restoreLabel": "Restaurar {what}",
  "plan.notOnSite.cannotRestore": "Para restaurarlo, p\xEDdalo en el chat.",
  "plan.notOnSite.peopleSpots.one": "{count} espacio de imagen de una persona",
  "plan.notOnSite.peopleSpots.other": "{count} espacios de im\xE1genes de personas",
  "plan.notOnSite.peopleSpots.reason": "Tracy nunca crea im\xE1genes de personas, as\xED que estos espacios quedan vac\xEDos hasta que usted a\xF1ada su propia foto.",
  "plan.leftOut.reason.owner_removed": "Usted quit\xF3 esto del plan.",
  "plan.leftOut.what.videos.one": "{count} v\xEDdeo",
  "plan.leftOut.what.videos.other": "{count} v\xEDdeos",
  "plan.sources": "De sus enlaces al sitio",
  "plan.sources.source": "Fuente",
  "plan.sources.got": "Lo que encontr\xF3 Tracy",
  "plan.sources.shown": "En el sitio",
  "plan.sources.none": "Nada",
  "plan.sources.shownOf": "{shown} de {what}",
  "plan.search": "B\xFAsqueda en Google",
  "plan.search.title": "Lo que dice el t\xEDtulo",
  "plan.search.description": "Lo que dice la descripci\xF3n",
  "plan.search.terms": "T\xE9rminos de b\xFAsqueda",
  "plan.search.add": "A\xF1adir un t\xE9rmino de b\xFAsqueda",
  "plan.search.addLabel": "Nuevo t\xE9rmino de b\xFAsqueda para la p\xE1gina {page}",
  "plan.search.removeTerm": "Quitar el t\xE9rmino de b\xFAsqueda {term}",
  "plan.later": "Puede enviar m\xE1s adelante",
  "plan.later.what.later_prices": "Sus precios",
  "plan.later.reason.later_prices": "Env\xEDe sus precios y podr\xE1n mostrarse junto con lo que ofrece.",
  "plan.later.what.later_services": "Su lista de servicios",
  "plan.later.reason.later_services": "Env\xEDe los servicios que ofrece y cada uno podr\xE1 tener su propio lugar en su sitio.",
  "plan.later.what.later_menu": "Su carta",
  "plan.later.reason.later_menu": "Env\xEDe su carta y sus platos podr\xE1n mostrarse en su sitio.",
  "plan.later.what.later_hours": "Su horario",
  "plan.later.reason.later_hours": "Confirme su horario y podr\xE1 mostrarse en su sitio.",
  "plan.later.what.later_email": "Su direcci\xF3n de email",
  "plan.later.reason.later_email": "Env\xEDe una direcci\xF3n de email y los visitantes podr\xE1n escribirle, y un formulario podr\xE1 enviar sus respuestas all\xED.",
  "plan.later.what.later_booking_link": "Su enlace de reservas",
  "plan.later.reason.later_booking_link": "Env\xEDe su enlace de reservas y sus botones podr\xE1n llevar a los visitantes directamente all\xED.",
  "plan.later.what.later_portraits": "Fotos de su equipo",
  "plan.later.reason.later_portraits": "Env\xEDe una foto de cada persona y podr\xE1 mostrarse junto a su nombre.",
  "plan.later.what.later_logo": "El archivo de su logo",
  "plan.later.reason.later_logo": "Env\xEDe el archivo de su logo y podr\xE1 mostrarse en lugar del que su plan usa por ahora.",
  "plan.refused.first_page": "La primera p\xE1gina de su sitio se mantiene: todas las dem\xE1s p\xE1ginas llevan de vuelta a ella.",
  "plan.refused.privacy_page": "Esta p\xE1gina es su p\xE1gina de privacidad, as\xED que se mantiene.",
  "plan.refused.main_block": "Esta secci\xF3n es la secci\xF3n principal de su p\xE1gina, as\xED que se mantiene mientras la p\xE1gina se mantenga.",
  "plan.refused.site_chrome": "Esta secci\xF3n la comparten todas las p\xE1ginas de su sitio, as\xED que no se puede quitar de una sola p\xE1gina.",
  "plan.refused.end_action": "Su p\xE1gina termina con esta secci\xF3n, as\xED que se mantiene.",
  "plan.refused.main_button": "Su bot\xF3n principal lo usa, as\xED que se mantiene.",
  "plan.refused.too_few_items": "Esta secci\xF3n necesita al menos {min} de estos, as\xED que este se mantiene.",
  "plan.refused.block_empty": "Es lo \xFAltimo que muestra esta secci\xF3n. Quite en su lugar la secci\xF3n completa.",
  "plan.refused.not_in_footer": "Esto no se muestra en el pie de p\xE1gina de sus p\xE1ginas.",
  "plan.refused.not_a_channel": "Del pie de p\xE1gina solo se puede quitar una v\xEDa de contacto.",
  "plan.refused.not_an_item": "De una secci\xF3n solo se puede quitar un servicio, una persona, una foto o una rese\xF1a.",
  "plan.refused.needed_by_privacy_page": "Su p\xE1gina de privacidad lo necesita, as\xED que se mantiene.",
  "plan.refused.needed_by_end_action": "El final de una p\xE1gina lleva a esto, as\xED que se mantiene.",
  "plan.refused.not_found": "Esto ya no est\xE1 en su plan.",
  "plan.refused.removal_unknown": "Aqu\xED no hay nada que restaurar.",
  "plan.refused.restore_target_gone": "Esto vuelve a algo que usted quit\xF3 despu\xE9s. Restaure primero eso.",
  "plan.refused.search_terms_empty": "Una p\xE1gina conserva al menos un t\xE9rmino de b\xFAsqueda.",
  "plan.refused.search_term_too_long": "Un t\xE9rmino de b\xFAsqueda tiene como m\xE1ximo 60 caracteres.",
  "plan.refused.search_term_twice": "Este t\xE9rmino de b\xFAsqueda ya est\xE1 en la p\xE1gina.",
  "plan.refused.too_many_search_terms": "Una p\xE1gina tiene como m\xE1ximo 10 t\xE9rminos de b\xFAsqueda.",
  "plan.refused.too_many_items": "Esta secci\xF3n muestra como m\xE1ximo {max}, as\xED que este cambio no cabe.",
  "plan.refused.wrong_item_kind": "Esta secci\xF3n no puede mostrar eso.",
  "plan.refused.library_rule": "Esta secci\xF3n no muestra eso.",
  "plan.refused.invented_item": "Este cambio nombra algo que no forma parte de los datos de su negocio.",
  "plan.refused.fact_without_field": "Esta secci\xF3n no tiene lugar para ese dato.",
  "plan.refused.main_block_missing": "Este cambio quitar\xEDa la secci\xF3n principal de su p\xE1gina.",
  "plan.refused.unknown_block": "Esta secci\xF3n no forma parte de su plantilla.",
  "plan.refused.withheld_shown": "Este cambio mostrar\xEDa algo que usted mantiene fuera de su sitio.",
  "plan.refused.edit_invalid": "Este cambio no se puede guardar: su plan quedar\xEDa incompleto.",
  "plan.refused.site_name_too_long": "Este nombre es demasiado largo para su sitio.",
  "plan.refused.site_name_invalid": "Este nombre no se puede usar para su sitio.",
  "plan.refused.value_over_limit": "Este valor es demasiado largo para la secci\xF3n que lo muestra.",
  "plan.refused.data_unaccounted": "Tras este cambio, un dato de su negocio no se mostrar\xEDa en ning\xFAn lugar.",
  "plan.refused.picture_count": "Sus fotos no se pudieron volver a contar tras este cambio, as\xED que no se guard\xF3.",
  "plan.refused.plan_fault": "Este cambio no se guard\xF3: su plan tiene un problema propio que Tracy debe corregir primero. Puede pedir el cambio en el chat.",
  "plan.refused.template_change": "Este plan se hizo para el dise\xF1o que eligi\xF3 y todav\xEDa no se puede pasar a otro dise\xF1o.",
  "plan.heldBack.field.prices": "Precios",
  "plan.heldBack.field.offerings": "Servicios",
  "plan.heldBack.field.menu": "Men\xFA",
  "plan.heldBack.field.menu-link": "Enlace del men\xFA",
  "plan.heldBack.field.name": "Nombre del negocio",
  "plan.heldBack.field.team": "Equipo",
  "plan.heldBack.field.socials": "Perfiles sociales",
  "plan.heldBack.field.photos": "Fotos",
  "plan.heldBack.field.posts": "Publicaciones",
  "plan.heldBack.field.email": "Direcci\xF3n de correo electr\xF3nico",
  "plan.heldBack.field.phone": "N\xFAmero de tel\xE9fono",
  "plan.heldBack.field.address": "Direcci\xF3n",
  "plan.heldBack.field.about": "Sobre el negocio",
  "plan.heldBack.field.reviews": "Rese\xF1as",
  "plan.heldBack.field.booking": "Enlace de reserva",
  "plan.heldBack.field.offering-descriptions": "Descripciones de los servicios",
  "plan.heldBack.field.story": "Su historia",
  "plan.refused.item_field_fact": "Esta secci\xF3n muestra un elemento completo, no uno de sus datos.",
  "plan.refused.trade_terms": "Esta secci\xF3n se escribe a partir de lo que suele hacer su oficio, as\xED que no puede indicar cifras, precios, horarios ni promesas.",
  "plan.refused.trade_fact_missing": "Esta secci\xF3n explica su oficio a partir de un dato de su negocio, as\xED que ese dato se mantiene.",
  "plan.refused.item_repeated_on_page": "Este cambio mostrar\xEDa lo mismo dos veces en una p\xE1gina.",
  "plan.refused.form_without_destination": "Un formulario necesita una direcci\xF3n de correo electr\xF3nico a la que enviar sus mensajes.",
  "plan.refused.map_without_address": "Un mapa necesita su direcci\xF3n.",
  "plan.leftOut.reason.whatsapp_unconfirmed": "Ninguna fuente dice que este n\xFAmero reciba mensajes de WhatsApp, as\xED que tu sitio no enlaza a WhatsApp.",
  "plan.leftOut.reason.contact_value_missing": "Elegiste c\xF3mo te contactan los visitantes pero a\xFAn no diste el dato, as\xED que no se muestra nada. A\xF1\xE1delo en el plan.",
  "plan.leftOut.reason.fact_longer_than_every_place": "Es m\xE1s largo que cualquier espacio que tu dise\xF1o tiene para ello, y Tracy nunca lo acorta.",
  "plan.leftOut.reason.no_room_left": "Todos los espacios que tu dise\xF1o tiene para esto ya est\xE1n ocupados.",
  "plan.leftOut.reason.no_room_left.item": "No queda espacio para m\xE1s de estos.",
  "plan.leftOut.reason.fewer_than_section_needs": "Cada secci\xF3n para estos necesita al menos {min}. Tracy nunca inventa m\xE1s para llenar una secci\xF3n.",
  "plan.leftOut.reason.section_below_minimum": "Estaba en una secci\xF3n que necesita al menos {min} de estos, y quedaron muy pocos para ella, as\xED que no se muestra.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.one": "Esta foto ya aparece en una galer\xEDa de otra p\xE1gina, y cada foto aparece una sola vez en tu sitio, as\xED que esta galer\xEDa muestra una menos.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.other": "Estas {count} fotos ya aparecen en una galer\xEDa de otra p\xE1gina, y cada foto aparece una sola vez en tu sitio, as\xED que esta galer\xEDa muestra {count} menos.",
  "plan.leftOut.reason.data_over_limit": "Es m\xE1s largo de lo que la secci\xF3n puede mostrar, as\xED que no se muestra ah\xED.",
  "plan.leftOut.reason.value_over_limit": "Es m\xE1s largo de lo que la secci\xF3n puede mostrar, as\xED que no se muestra.",
  "plan.leftOut.reason.row_beyond_stored_places": "La secci\xF3n que muestra estas filas tiene espacio para menos de las que tienes.",
  "plan.leftOut.reason.row_over_max": "La secci\xF3n que muestra estas filas tiene espacio para menos de las que tienes.",
  "plan.leftOut.reason.row_field_undeclared": "La secci\xF3n muestra solo parte de esta fila.",
  "plan.leftOut.reason.row_parts_over_fields": "Esta fila tiene m\xE1s partes que espacios en la secci\xF3n, as\xED que no se muestra.",
  "plan.leftOut.reason.row_value_over_limit": "Esta fila es m\xE1s larga de lo que la secci\xF3n puede mostrar, as\xED que no se muestra.",
  "plan.leftOut.reason.row_parts_order": "Los horarios de esta fila van antes de sus d\xEDas, as\xED que no se muestra.",
  "plan.leftOut.reason.row_no_list": "Ninguna secci\xF3n de la plantilla muestra filas como esta.",
  "plan.leftOut.reason.social_link_shortened": "Es un enlace acortado, as\xED que no se sabe a qu\xE9 red lleva.",
  "plan.leftOut.reason.social_network_unknown": "Este enlace no es de una red social que la secci\xF3n pueda mostrar.",
  "plan.leftOut.reason.social_handle_without_network": "Este nombre de usuario no dice en qu\xE9 red est\xE1.",
  "plan.leftOut.reason.social_link_not_web": "No es un enlace web.",
  "plan.leftOut.reason.no_social_link": "No hay ning\xFAn enlace que mostrar.",
  "plan.leftOut.reason.social_network_repeated": "Ya se muestra otro enlace a la misma red.",
  "plan.leftOut.reason.social_link_over_rows": "La secci\xF3n que muestra estas filas tiene espacio para menos de las que tienes.",
  "plan.leftOut.reason.page_removed": "Pediste quitar esta p\xE1gina.",
  "plan.leftOut.reason.no_longer_in_plan": "No forma parte de tu plan.",
  "plan.leftOut.reason.requested_off": "Pediste quitar esto del plan.",
  "plan.leftOut.reason.removed_page_data": "Solo estaba en una p\xE1gina que pediste quitar."
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
  "plan.trade": "R\xE9dig\xE9 \xE0 partir de connaissances g\xE9n\xE9rales sur votre m\xE9tier. Retirez-le avec Modifier le plan s\u2019il ne convient pas.",
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
  "stop.fault": "Cette \xE9tape n\u2019a pas pu aboutir, je me suis donc arr\xEAt\xE9 ici. Ce que j\u2019ai rassembl\xE9 jusqu\u2019ici est conserv\xE9.",
  "stop.limit": "J\u2019ai fait une pause car cette \xE9tape a \xE9t\xE9 lanc\xE9e de nombreuses fois en peu de temps. Vous pourrez r\xE9essayer \xE0 partir de {time}.",
  "stop.limit.now": "J\u2019ai fait une pause car cette \xE9tape a \xE9t\xE9 lanc\xE9e de nombreuses fois en peu de temps. Vous pouvez r\xE9essayer maintenant.",
  "stop.startOver": "Recommencer",
  "stop.startOver.confirm": "Recommencer supprime ce que Tracy a rassembl\xE9 jusqu\u2019ici et ouvre une nouvelle conversation. Un site d\xE9j\xE0 cr\xE9\xE9 n\u2019est pas concern\xE9.",
  "stop.startOver.yes": "Supprimer et recommencer",
  "stop.cancel": "Annuler",
  "stop.startOver.failed": "Je ne peux pas recommencer pour le moment. Vous pouvez continuer dans cette conversation.",
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
  "ask.question.place_choice_found": "Nous avons cherch\xE9 votre entreprise sur Google Maps par son nom et sa ville. Est-ce l\u2019un de ces lieux ?",
  "ask.question.brief_gap_offerings": "Que propose votre entreprise ? Citez vos principaux services ou produits.",
  "ask.question.brief_gap_menu": "Qu\u2019y a-t-il sur votre carte ? Citez quelques plats ou boissons.",
  "ask.question.brief_gap_offering_descriptions": "Comment d\xE9cririez-vous ce que vous proposez, en une ou deux phrases chacun ?",
  "ask.question.brief_gap_prices": "Combien co\xFBtent vos principaux services ou produits ?",
  "ask.question.brief_gap_hours": "Quels sont vos horaires d\u2019ouverture ?",
  "ask.question.brief_gap_phone": "Quel num\xE9ro de t\xE9l\xE9phone les clients doivent-ils appeler ?",
  "ask.question.brief_gap_address": "Quelle est votre adresse, ou la zone que vous desservez ?",
  "ask.question.brief_gap_booking": "Comment les clients doivent-ils r\xE9server chez vous ?",
  "ask.question.brief_gap_story": "Comment d\xE9cririez-vous votre entreprise en quelques phrases ?",
  "ask.choice.brief_gap_skip": "Laisser de c\xF4t\xE9 pour l\u2019instant",
  "ask.question.business_trade": "Quel type d\u2019entreprise est-ce ?",
  "ask.question.held_hours_unconfirmed": "Une seule source donne vos horaires, ouvert 24 heures sur 24 tous les jours. Sont-ce bien vos horaires ?",
  "ask.question.held_hours_disagree": "Vos sources donnent des horaires diff\xE9rents. Quels horaires votre site doit-il afficher ?",
  "ask.question.held_hours_typed": "Saisissez vos horaires, une ligne par groupe de jours, par exemple lun au ven 9:00 \xE0 18:00.",
  "ask.choice.held_hours_keep": "Garder ces horaires",
  "ask.choice.held_hours_edit": "Ils sont faux, je vais les saisir",
  "ask.choice.held_hours_leave": "Ne pas afficher les horaires sur le site",
  "ask.choice.business_trade_food": "Restauration",
  "ask.choice.business_trade_beauty": "Beaut\xE9",
  "ask.choice.business_trade_health": "Sant\xE9",
  "ask.choice.business_trade_fitness": "Sport et fitness",
  "ask.choice.business_trade_hospitality": "H\xF4tel ou h\xE9bergement",
  "ask.choice.business_trade_travel": "Voyage",
  "ask.choice.business_trade_professional": "Services professionnels",
  "ask.choice.business_trade_creative": "Travail cr\xE9atif",
  "ask.choice.business_trade_education": "\xC9ducation",
  "ask.choice.business_trade_retail": "Boutique",
  "ask.choice.business_trade_auto": "Automobiles et v\xE9hicules",
  "ask.choice.business_trade_home": "Services \xE0 domicile",
  "ask.choice.business_trade_events": "\xC9v\xE9nements",
  "ask.choice.business_trade_nonprofit": "Association \xE0 but non lucratif",
  "ask.choice.business_trade_other": "Autre chose",
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
  "say.researchRead": "J\u2019ai lu ce que vous m\u2019avez transmis sur votre entreprise.",
  "plan.leftOut.reason.no_place_in_design": "Votre design n\u2019a aucun emplacement qui affiche ceci.",
  "plan.leftOut.reason.no_place_for_whatsapp": "Ce design n\u2019a pas de place pour un lien WhatsApp, donc votre site ne l\u2019affiche pas.",
  "plan.leftOut.reason.no_place_for_other_phones": "Ce design affiche un seul num\xE9ro de t\xE9l\xE9phone, donc votre site affiche votre num\xE9ro principal.",
  "plan.leftOut.reason.no_place_for_google_rating": "Ce design n\u2019a pas de place pour votre note Google, donc votre site ne l\u2019affiche pas.",
  "plan.leftOut.reason.hours_unconfirmed": "Une seule source donne vos horaires, ouvert 24 heures sur 24 tous les jours, donc ils restent hors de votre site jusqu\u2019\xE0 ce que vous les confirmiez.",
  "plan.leftOut.reason.hours_sources_disagree": "Vos sources donnent des horaires diff\xE9rents, donc ils restent hors de votre site jusqu\u2019\xE0 ce que vous les confirmiez.",
  "plan.leftOut.reason.not_collected": "Aucune des sources lues ne donne cette information, donc votre site ne l\u2019affiche pas encore.",
  "plan.leftOut.reason.sources_disagree": "Vos sources ne concordent pas sur ce point, donc il reste hors de votre site jusqu\u2019\xE0 ce que vous le confirmiez.",
  "plan.leftOut.reason.kept_off_site": "Ceci reste hors de votre site jusqu\u2019\xE0 ce que vous le confirmiez.",
  "plan.leftOut.reason.no_fitting_video": "Aucune de vos vid\xE9os ne convient \xE0 cet emplacement (images larges sans texte par dessus), donc il n\u2019affiche pas de vid\xE9o.",
  "plan.leftOut.reason.page_nothing_to_show": "Vous n'avez encore rien \xE0 montrer sur ces pages.",
  "plan.leftOut.reason.page_not_planned": "Votre plan n'a pas besoin de ces pages.",
  "plan.leftOut.reason.library_section_refused": "Non affich\xE9 dans la section Tracy : {why}.",
  "plan.leftOut.why.not_google_review": "ce n'est pas un avis Google",
  "plan.leftOut.why.no_text": "il n'a pas de texte",
  "plan.leftOut.why.no_star_rating": "il n'a pas de note en \xE9toiles",
  "plan.leftOut.why.stars_below_four": "seuls les avis de quatre ou cinq \xE9toiles sont affich\xE9s",
  "plan.leftOut.why.stars_not_whole": "sa note en \xE9toiles n'est pas un nombre entier",
  "plan.leftOut.why.reviewer_anonymous": "son auteur est anonyme sur Google",
  "plan.leftOut.why.no_reviewer_name": "il n'a pas de nom d'auteur",
  "plan.leftOut.why.reviewer_name_too_long": "le nom de l'auteur est plus long que ce que la section peut contenir, et un nom n'est jamais coup\xE9",
  "plan.leftOut.why.review_too_long": "il est plus long que ce que la section peut contenir, et un avis n'est jamais coup\xE9",
  "plan.leftOut.what.no_place_for_whatsapp": "WhatsApp",
  "plan.leftOut.what.no_place_for_other_phones": "Autres num\xE9ros de t\xE9l\xE9phone",
  "plan.leftOut.what.no_place_for_google_rating": "Note Google",
  "plan.leftOut.what.hours_unconfirmed": "Horaires d\u2019ouverture",
  "plan.leftOut.what.hours_sources_disagree": "Horaires d\u2019ouverture",
  "plan.leftOut.what.no_fitting_video.one": "{count} emplacement vid\xE9o",
  "plan.leftOut.what.no_fitting_video.other": "{count} emplacements vid\xE9o",
  "plan.leftOut.what.pages.one": "Page {page}",
  "plan.leftOut.what.pages.two": "Pages {first} et {last}",
  "plan.leftOut.what.pages.three": "Pages {first}, {second} et {last}",
  "plan.leftOut.what.pages.more": "Pages {first}, {second}, {third} et {count} autres",
  "plan.pictures.ownOfValue.one": "{count} de vos {total} photos, depuis {from}",
  "plan.pictures.ownOfValue.other": "{count} de vos {total} photos, depuis {from}",
  "plan.assumption.accent_logo_moved.lighter": "La couleur de votre logo a \xE9t\xE9 \xE9claircie pour que les boutons et les liens ressortent sur le design.",
  "plan.assumption.accent_logo_moved.darker": "La couleur de votre logo a \xE9t\xE9 assombrie pour que les boutons et les liens ressortent sur le design.",
  "plan.assumption.accent_logo_kept": "Les boutons et les liens utilisent la couleur de votre logo.",
  "plan.assumption.accent_no_hue.black": "Votre logo n\u2019a pas de couleur, donc les boutons et les liens sont noirs.",
  "plan.assumption.accent_no_hue.white": "Votre logo n\u2019a pas de couleur, donc les boutons et les liens sont blancs.",
  "plan.assumption.accent_no_hue.both": "Votre logo n\u2019a pas de couleur, donc les boutons et les liens sont noirs sur les pages claires et blancs sur les pages sombres.",
  "plan.assumption.accent_unreadable.black": "La couleur de votre logo est difficile \xE0 lire sur les boutons, donc les boutons et les liens sont noirs.",
  "plan.assumption.accent_unreadable.white": "La couleur de votre logo est difficile \xE0 lire sur les boutons, donc les boutons et les liens sont blancs.",
  "plan.assumption.accent_unreadable.both": "La couleur de votre logo est difficile \xE0 lire sur les boutons, donc les boutons et les liens sont noirs sur les pages claires et blancs sur les pages sombres.",
  "plan.assumption.accent_kept_unmeasured": "Les couleurs de votre logo n\u2019ont pas pu \xEAtre lues, donc les boutons et les liens gardent la couleur principale du design.",
  "plan.assumption.accent_kept_template": "Les couleurs de votre logo ne seraient pas lisibles sur ce design, donc les boutons et les liens gardent la couleur principale du design.",
  "plan.edits.count.one": "{count} modification",
  "plan.edits.count.other": "{count} modifications",
  "plan.edits.revert": "Revenir \xE0 l\u2019original",
  "plan.edits.revertAsk.one": "Annuler votre modification ?",
  "plan.edits.revertAsk.other": "Annuler les {count} modifications ?",
  "plan.edits.keep": "Conserver",
  "plan.edits.discard": "Tout annuler",
  "plan.remove": "Retirer {what}",
  "plan.get": "Ce que vous obtenez",
  "plan.get.lead": "Un site en {language} avec {pages} : {names}.",
  "plan.get.pages.one": "{count} page",
  "plan.get.pages.other": "{count} pages",
  "plan.keyMessages": "Ce que votre site dit en premier",
  "plan.keyMessages.where": "Page {page} : {sections}",
  "plan.keyMessages.nowhere": "Aucune section ne le porte encore.",
  "plan.keyMessage.n": "Message cl\xE9 {n}",
  "plan.tile.pages": "pages",
  "plan.tile.privacy": "et une page de confidentialit\xE9",
  "plan.tile.services": "services",
  "plan.tile.people": "personnes",
  "plan.tile.reviews": "avis",
  "plan.tile.reviewsOf": "sur {count} avis",
  "plan.tile.photos": "de vos photos utilis\xE9es",
  "plan.tile.drawn.one": "environ {count} image de plus cr\xE9\xE9e par Tracy",
  "plan.tile.drawn.other": "environ {count} images de plus cr\xE9\xE9es par Tracy",
  "plan.look.logoOnLight": "Votre logo sur fond clair",
  "plan.look.logoOnDark": "Votre logo sur fond sombre",
  "plan.reach": "Comment les clients vous joignent",
  "plan.reach.main": "Bouton principal",
  "plan.reach.where": "Affich\xE9 dans {places}.",
  "plan.reach.place": "{section} sur {pages}",
  "plan.reach.nowhere": "Aucune section ne l\u2019affiche encore.",
  "plan.reach.end": "Fin de page",
  "plan.reach.endLine": "Page {page} : {section}",
  "plan.reach.footerAll": "Dans le pied de page de chaque page.",
  "plan.reach.footerSome": "Dans le pied de page de {pages}.",
  "plan.reach.on": "Sur {pages}.",
  "plan.pages.every": "Toutes les pages",
  "plan.pages.menu": "Menu",
  "plan.pages.header": "L\u2019en-t\xEAte affiche {facts}.",
  "plan.pages.footer": "Le pied de page affiche {facts}.",
  "plan.pages.privacyLink": "un lien vers la page de confidentialit\xE9",
  "plan.page.keyMessage": "Id\xE9e principale de la page",
  "plan.page.notes": "Notes pour le r\xE9dacteur",
  "plan.page.visitorQuestion": "Un visiteur vient pour savoir",
  "plan.tag.end": "Fin de page",
  "plan.tag.library": "Ajout\xE9 par Tracy",
  "plan.standard": "Pages standard",
  "plan.standard.sum": "Politique de confidentialit\xE9, page introuvable",
  "plan.standard.privacy": "Politique de confidentialit\xE9",
  "plan.standard.privacyFrom": "R\xE9dig\xE9e \xE0 partir de {facts}. Li\xE9e dans le pied de page, pas dans le menu.",
  "plan.standard.notFound": "Page introuvable",
  "plan.standard.notFoundLine": "Indique que la page n\u2019existe pas et dirige le visiteur vers {pages}.",
  "plan.writtenAfter": "Les titres et les textes de chaque section sont r\xE9dig\xE9s apr\xE8s votre validation, uniquement \xE0 partir de ce que contient ce plan.",
  "plan.fact.offSite": "Pas sur le site",
  "plan.notOnSite": "Pas sur le site",
  "plan.notOnSite.group.removed": "Vous avez retir\xE9",
  "plan.notOnSite.group.no_place": "Votre design n\u2019a pas d\u2019emplacement pour cela",
  "plan.notOnSite.group.no_info": "Pas encore d\u2019informations",
  "plan.notOnSite.group.held": "Mis en attente jusqu\u2019\xE0 votre confirmation",
  "plan.notOnSite.group.reviews": "Avis non utilis\xE9s",
  "plan.notOnSite.group.pages": "Pages du mod\xE8le non cr\xE9\xE9es",
  "plan.notOnSite.group.people_spots": "Emplacements d\u2019images de personnes laiss\xE9s vides",
  "plan.notOnSite.group.other": "Autres",
  "plan.notOnSite.lines.one": "{count} ligne",
  "plan.notOnSite.lines.other": "{count} lignes",
  "plan.notOnSite.details.one": "{count} d\xE9tail affich\xE9 nulle part ailleurs est parti avec.",
  "plan.notOnSite.details.other": "{count} d\xE9tails affich\xE9s nulle part ailleurs sont partis avec.",
  "plan.notOnSite.restore": "R\xE9tablir",
  "plan.notOnSite.restoreLabel": "R\xE9tablir {what}",
  "plan.notOnSite.cannotRestore": "Pour le r\xE9tablir, demandez-le dans le chat.",
  "plan.notOnSite.peopleSpots.one": "{count} emplacement d\u2019image d\u2019une personne",
  "plan.notOnSite.peopleSpots.other": "{count} emplacements d\u2019images de personnes",
  "plan.notOnSite.peopleSpots.reason": "Tracy ne cr\xE9e jamais d\u2019images de personnes, ces emplacements restent donc vides jusqu\u2019\xE0 ce que vous ajoutiez votre propre photo.",
  "plan.leftOut.reason.owner_removed": "Vous avez retir\xE9 ceci du plan.",
  "plan.leftOut.what.videos.one": "{count} vid\xE9o",
  "plan.leftOut.what.videos.other": "{count} vid\xE9os",
  "plan.sources": "De vos liens vers le site",
  "plan.sources.source": "Source",
  "plan.sources.got": "Ce que Tracy a trouv\xE9",
  "plan.sources.shown": "Sur le site",
  "plan.sources.none": "Rien",
  "plan.sources.shownOf": "{shown} sur {what}",
  "plan.search": "Recherche sur Google",
  "plan.search.title": "Ce que dit le titre",
  "plan.search.description": "Ce que dit la description",
  "plan.search.terms": "Termes de recherche",
  "plan.search.add": "Ajouter un terme de recherche",
  "plan.search.addLabel": "Nouveau terme de recherche pour la page {page}",
  "plan.search.removeTerm": "Retirer le terme de recherche {term}",
  "plan.later": "Ce que vous pouvez envoyer plus tard",
  "plan.later.what.later_prices": "Vos tarifs",
  "plan.later.reason.later_prices": "Envoyez vos tarifs et ils pourront \xEAtre affich\xE9s avec ce que vous proposez.",
  "plan.later.what.later_services": "Votre liste de services",
  "plan.later.reason.later_services": "Envoyez les services que vous proposez et chacun pourra avoir sa propre place sur votre site.",
  "plan.later.what.later_menu": "Votre carte",
  "plan.later.reason.later_menu": "Envoyez votre carte et vos plats pourront \xEAtre pr\xE9sent\xE9s sur votre site.",
  "plan.later.what.later_hours": "Vos horaires d\u2019ouverture",
  "plan.later.reason.later_hours": "Confirmez vos horaires d\u2019ouverture et ils pourront \xEAtre affich\xE9s sur votre site.",
  "plan.later.what.later_email": "Votre adresse email",
  "plan.later.reason.later_email": "Envoyez une adresse email pour que les visiteurs puissent vous \xE9crire et qu\u2019un formulaire puisse y envoyer ses r\xE9ponses.",
  "plan.later.what.later_booking_link": "Votre lien de r\xE9servation",
  "plan.later.reason.later_booking_link": "Envoyez votre lien de r\xE9servation et vos boutons pourront y mener directement les visiteurs.",
  "plan.later.what.later_portraits": "Photos de votre \xE9quipe",
  "plan.later.reason.later_portraits": "Envoyez une photo de chaque personne et elle pourra \xEAtre affich\xE9e \xE0 c\xF4t\xE9 de son nom.",
  "plan.later.what.later_logo": "Votre fichier de logo",
  "plan.later.reason.later_logo": "Envoyez votre fichier de logo et il pourra remplacer celui que votre plan utilise pour l\u2019instant.",
  "plan.refused.first_page": "La premi\xE8re page de votre site est conserv\xE9e : toutes les autres pages y ram\xE8nent.",
  "plan.refused.privacy_page": "Cette page est votre page de confidentialit\xE9, elle est donc conserv\xE9e.",
  "plan.refused.main_block": "Cette section est la section principale de sa page, elle est donc conserv\xE9e tant que la page l\u2019est.",
  "plan.refused.site_chrome": "Cette section est partag\xE9e par toutes les pages de votre site, elle ne peut donc pas \xEAtre retir\xE9e d\u2019une seule page.",
  "plan.refused.end_action": "Votre page se termine par cette section, elle est donc conserv\xE9e.",
  "plan.refused.main_button": "Votre bouton principal l\u2019utilise, il est donc conserv\xE9.",
  "plan.refused.too_few_items": "Cette section en demande au moins {min}, celui-ci est donc conserv\xE9.",
  "plan.refused.block_empty": "C\u2019est la derni\xE8re chose que cette section affiche. Retirez plut\xF4t la section enti\xE8re.",
  "plan.refused.not_in_footer": "Ceci n\u2019est pas affich\xE9 dans le pied de page de vos pages.",
  "plan.refused.not_a_channel": "Seul un moyen de vous contacter peut \xEAtre retir\xE9 du pied de page.",
  "plan.refused.not_an_item": "Seul un service, une personne, une photo ou un avis peut \xEAtre retir\xE9 d\u2019une section.",
  "plan.refused.needed_by_privacy_page": "Votre page de confidentialit\xE9 en a besoin, il est donc conserv\xE9.",
  "plan.refused.needed_by_end_action": "La fin d\u2019une page m\xE8ne \xE0 ceci, il est donc conserv\xE9.",
  "plan.refused.not_found": "Ceci ne figure plus dans votre plan.",
  "plan.refused.removal_unknown": "Il n\u2019y a rien \xE0 r\xE9tablir ici.",
  "plan.refused.restore_target_gone": "Ceci retourne dans un \xE9l\xE9ment que vous avez retir\xE9 ensuite. R\xE9tablissez-le d\u2019abord.",
  "plan.refused.search_terms_empty": "Une page conserve au moins un terme de recherche.",
  "plan.refused.search_term_too_long": "Un terme de recherche compte au plus 60 caract\xE8res.",
  "plan.refused.search_term_twice": "Ce terme de recherche figure d\xE9j\xE0 sur la page.",
  "plan.refused.too_many_search_terms": "Une page compte au plus 10 termes de recherche.",
  "plan.refused.too_many_items": "Cette section en affiche au plus {max}, donc cette modification ne rentre pas.",
  "plan.refused.wrong_item_kind": "Cette section ne peut pas afficher cela.",
  "plan.refused.library_rule": "Cette section n\u2019affiche pas cela.",
  "plan.refused.invented_item": "Cette modification cite quelque chose qui ne fait pas partie des informations de votre entreprise.",
  "plan.refused.fact_without_field": "Cette section n\u2019a pas de place pour cette information.",
  "plan.refused.main_block_missing": "Cette modification retirerait la section principale de sa page.",
  "plan.refused.unknown_block": "Cette section ne fait pas partie de votre mod\xE8le.",
  "plan.refused.withheld_shown": "Cette modification afficherait quelque chose que vous gardez hors de votre site.",
  "plan.refused.edit_invalid": "Cette modification ne peut pas \xEAtre enregistr\xE9e : votre plan serait incomplet.",
  "plan.refused.site_name_too_long": "Ce nom est trop long pour votre site.",
  "plan.refused.site_name_invalid": "Ce nom ne peut pas \xEAtre utilis\xE9 pour votre site.",
  "plan.refused.value_over_limit": "Cette valeur est trop longue pour la section qui l\u2019affiche.",
  "plan.refused.data_unaccounted": "Apr\xE8s cette modification, une information sur votre entreprise ne serait affich\xE9e nulle part.",
  "plan.refused.picture_count": "Vos photos n\u2019ont pas pu \xEAtre recompt\xE9es apr\xE8s cette modification, elle n\u2019a donc pas \xE9t\xE9 enregistr\xE9e.",
  "plan.refused.plan_fault": "Cette modification n\u2019a pas \xE9t\xE9 enregistr\xE9e : votre plan a un probl\xE8me propre que Tracy doit corriger d\u2019abord. Vous pouvez demander la modification dans le chat.",
  "plan.refused.template_change": "Ce plan a \xE9t\xE9 fait pour le design que vous avez choisi, et il ne peut pas encore passer \xE0 un autre design.",
  "plan.heldBack.field.prices": "Prix",
  "plan.heldBack.field.offerings": "Services",
  "plan.heldBack.field.menu": "Menu",
  "plan.heldBack.field.menu-link": "Lien du menu",
  "plan.heldBack.field.name": "Nom de l\u2019entreprise",
  "plan.heldBack.field.team": "\xC9quipe",
  "plan.heldBack.field.socials": "Profils sociaux",
  "plan.heldBack.field.photos": "Photos",
  "plan.heldBack.field.posts": "Publications",
  "plan.heldBack.field.email": "Adresse e-mail",
  "plan.heldBack.field.phone": "Num\xE9ro de t\xE9l\xE9phone",
  "plan.heldBack.field.address": "Adresse",
  "plan.heldBack.field.about": "\xC0 propos de l\u2019entreprise",
  "plan.heldBack.field.reviews": "Avis",
  "plan.heldBack.field.booking": "Lien de r\xE9servation",
  "plan.heldBack.field.offering-descriptions": "Descriptions des services",
  "plan.heldBack.field.story": "Votre histoire",
  "plan.refused.item_field_fact": "Cette section affiche un \xE9l\xE9ment entier, pas l\u2019un de ses d\xE9tails.",
  "plan.refused.trade_terms": "Cette section d\xE9crit ce que fait habituellement votre m\xE9tier : elle ne peut donc indiquer ni chiffre, ni prix, ni horaire, ni promesse.",
  "plan.refused.trade_fact_missing": "Cette section explique votre m\xE9tier \xE0 partir d\u2019une information sur votre entreprise, cette information reste donc.",
  "plan.refused.item_repeated_on_page": "Cette modification afficherait deux fois la m\xEAme chose sur une page.",
  "plan.refused.form_without_destination": "Un formulaire a besoin d\u2019une adresse e-mail o\xF9 envoyer ses messages.",
  "plan.refused.map_without_address": "Une carte a besoin de votre adresse.",
  "plan.leftOut.reason.whatsapp_unconfirmed": "Aucune source ne dit que ce num\xE9ro re\xE7oit des messages WhatsApp, donc votre site ne renvoie pas vers WhatsApp.",
  "plan.leftOut.reason.contact_value_missing": "Vous avez choisi comment les visiteurs vous joignent mais n\u2019avez pas encore donn\xE9 la valeur, donc rien n\u2019est affich\xE9. Ajoutez-la dans le plan.",
  "plan.leftOut.reason.fact_longer_than_every_place": "C\u2019est plus long que chaque emplacement pr\xE9vu par votre design, et Tracy ne le raccourcit jamais.",
  "plan.leftOut.reason.no_room_left": "Chaque emplacement pr\xE9vu par votre design pour cela est d\xE9j\xE0 pris.",
  "plan.leftOut.reason.no_room_left.item": "Il n\u2019y a plus de place pour d\u2019autres \xE9l\xE9ments de ce type.",
  "plan.leftOut.reason.fewer_than_section_needs": "Chaque section pour ces \xE9l\xE9ments en demande au moins {min}. Tracy n\u2019en invente jamais pour remplir une section.",
  "plan.leftOut.reason.section_below_minimum": "Il se trouvait dans une section qui en demande au moins {min}, et il n\u2019en restait pas assez pour elle, donc il n\u2019est pas affich\xE9.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.one": "Cette photo appara\xEEt d\xE9j\xE0 dans une galerie sur une autre page, et chaque photo n\u2019appara\xEEt qu\u2019une fois sur votre site, donc cette galerie en montre une de moins.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.other": "Ces {count} photos apparaissent d\xE9j\xE0 dans une galerie sur une autre page, et chaque photo n\u2019appara\xEEt qu\u2019une fois sur votre site, donc cette galerie en montre {count} de moins.",
  "plan.leftOut.reason.data_over_limit": "C\u2019est plus long que ce que la section peut afficher, donc ce n\u2019est pas affich\xE9 \xE0 cet endroit.",
  "plan.leftOut.reason.value_over_limit": "C\u2019est plus long que ce que la section peut afficher, donc ce n\u2019est pas affich\xE9.",
  "plan.leftOut.reason.row_beyond_stored_places": "La section qui les affiche a de la place pour moins de lignes que vous n\u2019en avez.",
  "plan.leftOut.reason.row_over_max": "La section qui les affiche a de la place pour moins de lignes que vous n\u2019en avez.",
  "plan.leftOut.reason.row_field_undeclared": "La section n\u2019affiche qu\u2019une partie de cette ligne.",
  "plan.leftOut.reason.row_parts_over_fields": "Cette ligne a plus de parties que la section n\u2019a d\u2019emplacements, donc elle n\u2019est pas affich\xE9e.",
  "plan.leftOut.reason.row_value_over_limit": "Cette ligne est plus longue que ce que la section peut afficher, donc elle n\u2019est pas affich\xE9e.",
  "plan.leftOut.reason.row_parts_order": "Les horaires de cette ligne viennent avant ses jours, donc elle n\u2019est pas affich\xE9e.",
  "plan.leftOut.reason.row_no_list": "Aucune section du mod\xE8le n\u2019affiche de lignes comme celle-ci.",
  "plan.leftOut.reason.social_link_shortened": "C\u2019est un lien raccourci, donc le r\xE9seau vers lequel il m\xE8ne est inconnu.",
  "plan.leftOut.reason.social_network_unknown": "Ce lien n\u2019est pas sur un r\xE9seau social que la section peut afficher.",
  "plan.leftOut.reason.social_handle_without_network": "Cet identifiant ne dit pas sur quel r\xE9seau il se trouve.",
  "plan.leftOut.reason.social_link_not_web": "Ce n\u2019est pas un lien web.",
  "plan.leftOut.reason.no_social_link": "Il n\u2019y a aucun lien \xE0 afficher.",
  "plan.leftOut.reason.social_network_repeated": "Un autre lien vers le m\xEAme r\xE9seau est d\xE9j\xE0 affich\xE9.",
  "plan.leftOut.reason.social_link_over_rows": "La section qui les affiche a de la place pour moins de lignes que vous n\u2019en avez.",
  "plan.leftOut.reason.page_removed": "Vous avez demand\xE9 de retirer cette page.",
  "plan.leftOut.reason.no_longer_in_plan": "Cela ne fait pas partie de votre plan.",
  "plan.leftOut.reason.requested_off": "Vous avez demand\xE9 de retirer cela du plan.",
  "plan.leftOut.reason.removed_page_data": "Cela ne figurait que sur une page que vous avez demand\xE9 de retirer."
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
  "plan.trade": "Scritto in base alla conoscenza generale del suo settore. Lo rimuova con Modifica il piano se non \xE8 adatto.",
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
  "stop.fault": "Questo passaggio non \xE8 stato completato, quindi mi sono fermato qui. Ci\xF2 che ho raccolto finora \xE8 conservato.",
  "stop.limit": "Mi sono fermato perch\xE9 questo passaggio \xE8 stato eseguito molte volte in poco tempo. Pu\xF2 riprovare a partire da {time}.",
  "stop.limit.now": "Mi sono fermato perch\xE9 questo passaggio \xE8 stato eseguito molte volte in poco tempo. Pu\xF2 riprovare ora.",
  "stop.startOver": "Ricomincia",
  "stop.startOver.confirm": "Ricominciare elimina ci\xF2 che Tracy ha raccolto finora e apre una nuova conversazione. Un site gi\xE0 creato non viene modificato.",
  "stop.startOver.yes": "Elimina e ricomincia",
  "stop.cancel": "Annulla",
  "stop.startOver.failed": "Non posso ricominciare in questo momento. Pu\xF2 continuare in questa conversazione.",
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
  "ask.question.place_choice_found": "Abbiamo cercato la tua attivit\xE0 su Google Maps per nome e citt\xE0. \xC8 uno di questi luoghi?",
  "ask.question.brief_gap_offerings": "Che cosa offre la tua attivit\xE0? Indica i tuoi principali servizi o prodotti.",
  "ask.question.brief_gap_menu": "Che cosa c\u2019\xE8 nel tuo menu? Indica qualche piatto o bevanda.",
  "ask.question.brief_gap_offering_descriptions": "Come descriveresti ci\xF2 che offri, con una o due frasi ciascuno?",
  "ask.question.brief_gap_prices": "Quanto costano i tuoi principali servizi o prodotti?",
  "ask.question.brief_gap_hours": "Quali sono i tuoi orari di apertura?",
  "ask.question.brief_gap_phone": "Quale numero di telefono devono chiamare i clienti?",
  "ask.question.brief_gap_address": "Qual \xE8 il tuo indirizzo, o la zona che servi?",
  "ask.question.brief_gap_booking": "Come devono prenotare i clienti con te?",
  "ask.question.brief_gap_story": "Come descriveresti la tua attivit\xE0 in poche frasi?",
  "ask.choice.brief_gap_skip": "Lascialo fuori per ora",
  "ask.question.business_trade": "Che tipo di attivit\xE0 \xE8?",
  "ask.question.held_hours_unconfirmed": "Solo una fonte indica i suoi orari, aperto 24 ore su 24 tutti i giorni. Sono questi i suoi orari?",
  "ask.question.held_hours_disagree": "Le sue fonti indicano orari diversi. Quali orari deve mostrare il suo sito?",
  "ask.question.held_hours_typed": "Scriva i suoi orari, una riga per gruppo di giorni, per esempio lun a ven 9:00 alle 18:00.",
  "ask.choice.held_hours_keep": "Mantieni questi orari",
  "ask.choice.held_hours_edit": "Sono sbagliati, li scrivo io",
  "ask.choice.held_hours_leave": "Non mostrare gli orari sul sito",
  "ask.choice.business_trade_food": "Cibo e bevande",
  "ask.choice.business_trade_beauty": "Bellezza",
  "ask.choice.business_trade_health": "Salute",
  "ask.choice.business_trade_fitness": "Sport e fitness",
  "ask.choice.business_trade_hospitality": "Hotel o alloggio",
  "ask.choice.business_trade_travel": "Viaggi",
  "ask.choice.business_trade_professional": "Servizi professionali",
  "ask.choice.business_trade_creative": "Lavoro creativo",
  "ask.choice.business_trade_education": "Istruzione",
  "ask.choice.business_trade_retail": "Negozio",
  "ask.choice.business_trade_auto": "Auto e veicoli",
  "ask.choice.business_trade_home": "Servizi per la casa",
  "ask.choice.business_trade_events": "Eventi",
  "ask.choice.business_trade_nonprofit": "Non profit",
  "ask.choice.business_trade_other": "Altro",
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
  "say.researchRead": "Ho letto ci\xF2 che mi ha fornito sulla sua attivit\xE0.",
  "plan.leftOut.reason.no_place_in_design": "Il tuo design non ha un posto che mostri questo.",
  "plan.leftOut.reason.no_place_for_whatsapp": "Questo design non ha posto per un link WhatsApp, quindi il tuo sito non lo mostra.",
  "plan.leftOut.reason.no_place_for_other_phones": "Questo design mostra un solo numero di telefono, quindi il tuo sito mostra quello principale.",
  "plan.leftOut.reason.no_place_for_google_rating": "Questo design non ha posto per la tua valutazione Google, quindi il tuo sito non la mostra.",
  "plan.leftOut.reason.hours_unconfirmed": "Solo una fonte indica i tuoi orari, aperto 24 ore su 24 ogni giorno, quindi restano fuori dal tuo sito finch\xE9 non li confermi.",
  "plan.leftOut.reason.hours_sources_disagree": "Le tue fonti indicano orari diversi, quindi restano fuori dal tuo sito finch\xE9 non li confermi.",
  "plan.leftOut.reason.not_collected": "Nessuna delle fonti lette lo indica, quindi il tuo sito non lo mostra ancora.",
  "plan.leftOut.reason.sources_disagree": "Le tue fonti non concordano su questo, quindi resta fuori dal tuo sito finch\xE9 non lo confermi.",
  "plan.leftOut.reason.kept_off_site": "Questo resta fuori dal tuo sito finch\xE9 non lo confermi.",
  "plan.leftOut.reason.no_fitting_video": "Nessuno dei tuoi video si adatta a questo spazio (immagini larghe senza testo sopra), quindi non mostra alcun video.",
  "plan.leftOut.reason.page_nothing_to_show": "Non ha ancora nulla da mostrare in queste pagine.",
  "plan.leftOut.reason.page_not_planned": "Il suo piano non ha bisogno di queste pagine.",
  "plan.leftOut.reason.library_section_refused": "Non mostrata nella sezione di Tracy: {why}.",
  "plan.leftOut.why.not_google_review": "non \xE8 una recensione Google",
  "plan.leftOut.why.no_text": "non ha testo",
  "plan.leftOut.why.no_star_rating": "non ha una valutazione in stelle",
  "plan.leftOut.why.stars_below_four": "sono mostrate solo recensioni da quattro o cinque stelle",
  "plan.leftOut.why.stars_not_whole": "la sua valutazione in stelle non \xE8 un numero intero",
  "plan.leftOut.why.reviewer_anonymous": "il suo autore \xE8 anonimo su Google",
  "plan.leftOut.why.no_reviewer_name": "non ha il nome dell'autore",
  "plan.leftOut.why.reviewer_name_too_long": "il nome dell'autore \xE8 pi\xF9 lungo di quanto la sezione contenga, e un nome non viene mai tagliato",
  "plan.leftOut.why.review_too_long": "\xE8 pi\xF9 lunga di quanto la sezione contenga, e una recensione non viene mai tagliata",
  "plan.leftOut.what.no_place_for_whatsapp": "WhatsApp",
  "plan.leftOut.what.no_place_for_other_phones": "Altri numeri di telefono",
  "plan.leftOut.what.no_place_for_google_rating": "Valutazione Google",
  "plan.leftOut.what.hours_unconfirmed": "Orari di apertura",
  "plan.leftOut.what.hours_sources_disagree": "Orari di apertura",
  "plan.leftOut.what.no_fitting_video.one": "{count} spazio video",
  "plan.leftOut.what.no_fitting_video.other": "{count} spazi video",
  "plan.leftOut.what.pages.one": "Pagina {page}",
  "plan.leftOut.what.pages.two": "Pagine {first} e {last}",
  "plan.leftOut.what.pages.three": "Pagine {first}, {second} e {last}",
  "plan.leftOut.what.pages.more": "Pagine {first}, {second}, {third} e altre {count}",
  "plan.pictures.ownOfValue.one": "{count} delle tue {total} foto, da {from}",
  "plan.pictures.ownOfValue.other": "{count} delle tue {total} foto, da {from}",
  "plan.assumption.accent_logo_moved.lighter": "Il colore del tuo logo \xE8 stato schiarito perch\xE9 pulsanti e link risaltino sul design.",
  "plan.assumption.accent_logo_moved.darker": "Il colore del tuo logo \xE8 stato scurito perch\xE9 pulsanti e link risaltino sul design.",
  "plan.assumption.accent_logo_kept": "Pulsanti e link usano il colore del tuo logo.",
  "plan.assumption.accent_no_hue.black": "Il tuo logo non ha colore, quindi pulsanti e link sono neri.",
  "plan.assumption.accent_no_hue.white": "Il tuo logo non ha colore, quindi pulsanti e link sono bianchi.",
  "plan.assumption.accent_no_hue.both": "Il tuo logo non ha colore, quindi pulsanti e link sono neri sulle pagine chiare e bianchi su quelle scure.",
  "plan.assumption.accent_unreadable.black": "Il colore del tuo logo \xE8 difficile da leggere sui pulsanti, quindi pulsanti e link sono neri.",
  "plan.assumption.accent_unreadable.white": "Il colore del tuo logo \xE8 difficile da leggere sui pulsanti, quindi pulsanti e link sono bianchi.",
  "plan.assumption.accent_unreadable.both": "Il colore del tuo logo \xE8 difficile da leggere sui pulsanti, quindi pulsanti e link sono neri sulle pagine chiare e bianchi su quelle scure.",
  "plan.assumption.accent_kept_unmeasured": "Non \xE8 stato possibile leggere i colori del tuo logo, quindi pulsanti e link mantengono il colore principale del design.",
  "plan.assumption.accent_kept_template": "I colori del tuo logo non si leggerebbero su questo design, quindi pulsanti e link mantengono il colore principale del design.",
  "plan.edits.count.one": "{count} modifica",
  "plan.edits.count.other": "{count} modifiche",
  "plan.edits.revert": "Torna all\u2019originale",
  "plan.edits.revertAsk.one": "Annullare la sua modifica?",
  "plan.edits.revertAsk.other": "Annullare tutte le {count} modifiche?",
  "plan.edits.keep": "Mantieni",
  "plan.edits.discard": "Annulla tutto",
  "plan.remove": "Rimuovi {what}",
  "plan.get": "Cosa ottiene",
  "plan.get.lead": "Un sito in {language} con {pages}: {names}.",
  "plan.get.pages.one": "{count} pagina",
  "plan.get.pages.other": "{count} pagine",
  "plan.keyMessages": "Cosa dice per prima il suo sito",
  "plan.keyMessages.where": "Pagina {page}: {sections}",
  "plan.keyMessages.nowhere": "Nessuna sezione lo riporta ancora.",
  "plan.keyMessage.n": "Messaggio chiave {n}",
  "plan.tile.pages": "pagine",
  "plan.tile.privacy": "e una pagina sulla privacy",
  "plan.tile.services": "servizi",
  "plan.tile.people": "persone",
  "plan.tile.reviews": "recensioni",
  "plan.tile.reviewsOf": "su {count} recensioni",
  "plan.tile.photos": "delle sue foto utilizzate",
  "plan.tile.drawn.one": "circa {count} immagine in pi\xF9 creata da Tracy",
  "plan.tile.drawn.other": "circa {count} immagini in pi\xF9 create da Tracy",
  "plan.look.logoOnLight": "Il suo logo su sfondo chiaro",
  "plan.look.logoOnDark": "Il suo logo su sfondo scuro",
  "plan.reach": "Come i clienti la raggiungono",
  "plan.reach.main": "Pulsante principale",
  "plan.reach.where": "Mostrato in {places}.",
  "plan.reach.place": "{section} su {pages}",
  "plan.reach.nowhere": "Nessuna sezione lo mostra ancora.",
  "plan.reach.end": "Fine pagina",
  "plan.reach.endLine": "Pagina {page}: {section}",
  "plan.reach.footerAll": "Nel pi\xE8 di pagina di ogni pagina.",
  "plan.reach.footerSome": "Nel pi\xE8 di pagina di {pages}.",
  "plan.reach.on": "Su {pages}.",
  "plan.pages.every": "Ogni pagina",
  "plan.pages.menu": "Menu",
  "plan.pages.header": "L\u2019intestazione mostra {facts}.",
  "plan.pages.footer": "Il pi\xE8 di pagina mostra {facts}.",
  "plan.pages.privacyLink": "un link alla pagina sulla privacy",
  "plan.page.keyMessage": "Punto principale della pagina",
  "plan.page.notes": "Note per chi scrive",
  "plan.page.visitorQuestion": "Un visitatore viene per sapere",
  "plan.tag.end": "Fine pagina",
  "plan.tag.library": "Aggiunto da Tracy",
  "plan.standard": "Pagine standard",
  "plan.standard.sum": "Informativa sulla privacy, pagina non trovata",
  "plan.standard.privacy": "Informativa sulla privacy",
  "plan.standard.privacyFrom": "Scritta a partire da {facts}. Collegata nel pi\xE8 di pagina, non nel menu.",
  "plan.standard.notFound": "Pagina non trovata",
  "plan.standard.notFoundLine": "Indica che la pagina non esiste e porta il visitatore a {pages}.",
  "plan.writtenAfter": "I titoli e i testi di ogni sezione vengono scritti dopo la sua approvazione, solo a partire da ci\xF2 che contiene questo piano.",
  "plan.fact.offSite": "Non presente sul sito",
  "plan.notOnSite": "Non presente sul sito",
  "plan.notOnSite.group.removed": "Rimosso da lei",
  "plan.notOnSite.group.no_place": "Il suo design non ha posto per questo",
  "plan.notOnSite.group.no_info": "Ancora nessuna informazione",
  "plan.notOnSite.group.held": "In attesa della sua conferma",
  "plan.notOnSite.group.reviews": "Recensioni non utilizzate",
  "plan.notOnSite.group.pages": "Pagine del template non create",
  "plan.notOnSite.group.people_spots": "Spazi per immagini di persone lasciati vuoti",
  "plan.notOnSite.group.other": "Altro",
  "plan.notOnSite.lines.one": "{count} riga",
  "plan.notOnSite.lines.other": "{count} righe",
  "plan.notOnSite.details.one": "Con esso \xE8 stato rimosso {count} dettaglio non mostrato altrove.",
  "plan.notOnSite.details.other": "Con esso sono stati rimossi {count} dettagli non mostrati altrove.",
  "plan.notOnSite.restore": "Ripristina",
  "plan.notOnSite.restoreLabel": "Ripristina {what}",
  "plan.notOnSite.cannotRestore": "Per ripristinarlo, lo chieda nella chat.",
  "plan.notOnSite.peopleSpots.one": "{count} spazio per l\u2019immagine di una persona",
  "plan.notOnSite.peopleSpots.other": "{count} spazi per immagini di persone",
  "plan.notOnSite.peopleSpots.reason": "Tracy non crea mai immagini di persone, quindi questi spazi restano vuoti finch\xE9 non aggiunge una sua foto.",
  "plan.leftOut.reason.owner_removed": "Lei ha tolto questo dal piano.",
  "plan.leftOut.what.videos.one": "{count} video",
  "plan.leftOut.what.videos.other": "{count} video",
  "plan.sources": "Dai suoi link al sito",
  "plan.sources.source": "Fonte",
  "plan.sources.got": "Cosa ha trovato Tracy",
  "plan.sources.shown": "Sul sito",
  "plan.sources.none": "Niente",
  "plan.sources.shownOf": "{shown} su {what}",
  "plan.search": "Ricerca su Google",
  "plan.search.title": "Cosa dice il titolo",
  "plan.search.description": "Cosa dice la descrizione",
  "plan.search.terms": "Termini di ricerca",
  "plan.search.add": "Aggiungi un termine di ricerca",
  "plan.search.addLabel": "Nuovo termine di ricerca per la pagina {page}",
  "plan.search.removeTerm": "Rimuovi il termine di ricerca {term}",
  "plan.later": "Pu\xF2 inviare pi\xF9 tardi",
  "plan.later.what.later_prices": "I suoi prezzi",
  "plan.later.reason.later_prices": "Invii i suoi prezzi e potranno essere mostrati insieme a ci\xF2 che offre.",
  "plan.later.what.later_services": "L\u2019elenco dei suoi servizi",
  "plan.later.reason.later_services": "Invii i servizi che offre e ciascuno potr\xE0 avere il proprio spazio sul suo sito.",
  "plan.later.what.later_menu": "Il suo menu",
  "plan.later.reason.later_menu": "Invii il suo menu e i suoi piatti potranno essere mostrati sul suo sito.",
  "plan.later.what.later_hours": "I suoi orari di apertura",
  "plan.later.reason.later_hours": "Confermi i suoi orari di apertura e potranno essere mostrati sul suo sito.",
  "plan.later.what.later_email": "Il suo indirizzo email",
  "plan.later.reason.later_email": "Invii un indirizzo email e i visitatori potranno scriverle, e un modulo potr\xE0 inviarvi le risposte.",
  "plan.later.what.later_booking_link": "Il suo link di prenotazione",
  "plan.later.reason.later_booking_link": "Invii il suo link di prenotazione e i suoi pulsanti potranno portare i visitatori direttamente l\xEC.",
  "plan.later.what.later_portraits": "Foto del suo team",
  "plan.later.reason.later_portraits": "Invii una foto di ogni persona e potr\xE0 essere mostrata accanto al suo nome.",
  "plan.later.what.later_logo": "Il file del suo logo",
  "plan.later.reason.later_logo": "Invii il file del suo logo e potr\xE0 essere mostrato al posto di quello che il suo piano usa per ora.",
  "plan.refused.first_page": "La prima pagina del suo sito resta: tutte le altre pagine riportano a essa.",
  "plan.refused.privacy_page": "Questa pagina \xE8 la sua pagina sulla privacy, quindi resta.",
  "plan.refused.main_block": "Questa sezione \xE8 la sezione principale della sua pagina, quindi resta finch\xE9 resta la pagina.",
  "plan.refused.site_chrome": "Questa sezione \xE8 condivisa da tutte le pagine del suo sito, quindi non pu\xF2 essere tolta da una sola pagina.",
  "plan.refused.end_action": "La sua pagina termina con questa sezione, quindi resta.",
  "plan.refused.main_button": "Il suo pulsante principale lo usa, quindi resta.",
  "plan.refused.too_few_items": "Questa sezione ne richiede almeno {min}, quindi questo resta.",
  "plan.refused.block_empty": "Questo \xE8 l\u2019ultimo elemento che questa sezione mostra. Rimuova invece l\u2019intera sezione.",
  "plan.refused.not_in_footer": "Questo non \xE8 mostrato nel pi\xE8 di pagina delle sue pagine.",
  "plan.refused.not_a_channel": "Dal pi\xE8 di pagina si pu\xF2 togliere solo un modo per contattarla.",
  "plan.refused.not_an_item": "Da una sezione si pu\xF2 togliere solo un servizio, una persona, una foto o una recensione.",
  "plan.refused.needed_by_privacy_page": "La sua pagina sulla privacy ne ha bisogno, quindi resta.",
  "plan.refused.needed_by_end_action": "La fine di una pagina porta a questo, quindi resta.",
  "plan.refused.not_found": "Questo non \xE8 pi\xF9 nel suo piano.",
  "plan.refused.removal_unknown": "Qui non c\u2019\xE8 nulla da ripristinare.",
  "plan.refused.restore_target_gone": "Questo torna in qualcosa che lei ha rimosso in seguito. Ripristini prima quello.",
  "plan.refused.search_terms_empty": "Una pagina mantiene almeno un termine di ricerca.",
  "plan.refused.search_term_too_long": "Un termine di ricerca ha al massimo 60 caratteri.",
  "plan.refused.search_term_twice": "Questo termine di ricerca \xE8 gi\xE0 presente nella pagina.",
  "plan.refused.too_many_search_terms": "Una pagina ha al massimo 10 termini di ricerca.",
  "plan.refused.too_many_items": "Questa sezione mostra al massimo {max} elementi di questo tipo, quindi questa modifica non ci sta.",
  "plan.refused.wrong_item_kind": "Questa sezione non pu\xF2 mostrarlo.",
  "plan.refused.library_rule": "Questa sezione non lo mostra.",
  "plan.refused.invented_item": "Questa modifica nomina qualcosa che non fa parte dei dati della sua attivit\xE0.",
  "plan.refused.fact_without_field": "Questa sezione non ha spazio per questo dato.",
  "plan.refused.main_block_missing": "Questa modifica toglierebbe la sezione principale dalla sua pagina.",
  "plan.refused.unknown_block": "Questa sezione non fa parte del suo modello.",
  "plan.refused.withheld_shown": "Questa modifica mostrerebbe qualcosa che lei tiene fuori dal suo sito.",
  "plan.refused.edit_invalid": "Questa modifica non pu\xF2 essere salvata: il suo piano resterebbe incompleto.",
  "plan.refused.site_name_too_long": "Questo nome \xE8 troppo lungo per il suo sito.",
  "plan.refused.site_name_invalid": "Questo nome non pu\xF2 essere usato per il suo sito.",
  "plan.refused.value_over_limit": "Questo valore \xE8 troppo lungo per la sezione che lo mostra.",
  "plan.refused.data_unaccounted": "Dopo questa modifica un dato della sua attivit\xE0 non sarebbe mostrato da nessuna parte.",
  "plan.refused.picture_count": "Le sue foto non hanno potuto essere ricontate dopo questa modifica, quindi non \xE8 stata salvata.",
  "plan.refused.plan_fault": "Questa modifica non \xE8 stata salvata: il suo piano ha un problema proprio che Tracy deve risolvere prima. Pu\xF2 chiedere la modifica nella chat.",
  "plan.refused.template_change": "Questo piano \xE8 stato fatto per il design che ha scelto e non pu\xF2 ancora essere spostato su un altro design.",
  "plan.heldBack.field.prices": "Prezzi",
  "plan.heldBack.field.offerings": "Servizi",
  "plan.heldBack.field.menu": "Men\xF9",
  "plan.heldBack.field.menu-link": "Link al men\xF9",
  "plan.heldBack.field.name": "Nome dell\u2019attivit\xE0",
  "plan.heldBack.field.team": "Team",
  "plan.heldBack.field.socials": "Profili social",
  "plan.heldBack.field.photos": "Foto",
  "plan.heldBack.field.posts": "Post",
  "plan.heldBack.field.email": "Indirizzo email",
  "plan.heldBack.field.phone": "Numero di telefono",
  "plan.heldBack.field.address": "Indirizzo",
  "plan.heldBack.field.about": "Informazioni sull\u2019attivit\xE0",
  "plan.heldBack.field.reviews": "Recensioni",
  "plan.heldBack.field.booking": "Link di prenotazione",
  "plan.heldBack.field.offering-descriptions": "Descrizioni dei servizi",
  "plan.heldBack.field.story": "La sua storia",
  "plan.refused.item_field_fact": "Questa sezione mostra un elemento intero, non uno dei suoi dettagli.",
  "plan.refused.trade_terms": "Questa sezione descrive come lavora di solito il suo settore, quindi non pu\xF2 indicare numeri, prezzi, orari o promesse.",
  "plan.refused.trade_fact_missing": "Questa sezione spiega il suo settore a partire da un dato della sua attivit\xE0, quindi quel dato resta.",
  "plan.refused.item_repeated_on_page": "Questa modifica mostrerebbe la stessa cosa due volte in una pagina.",
  "plan.refused.form_without_destination": "Un modulo ha bisogno di un indirizzo email a cui inviare i messaggi.",
  "plan.refused.map_without_address": "Una mappa ha bisogno del suo indirizzo.",
  "plan.leftOut.reason.whatsapp_unconfirmed": "Nessuna fonte dice che questo numero riceve messaggi WhatsApp, quindi il tuo sito non rimanda a WhatsApp.",
  "plan.leftOut.reason.contact_value_missing": "Hai scelto come i visitatori ti contattano ma non hai ancora dato il valore, quindi non viene mostrato nulla. Aggiungilo nel piano.",
  "plan.leftOut.reason.fact_longer_than_every_place": "\xC8 pi\xF9 lungo di ogni spazio che il tuo design ha per questo, e Tracy non lo accorcia mai.",
  "plan.leftOut.reason.no_room_left": "Ogni spazio che il tuo design ha per questo \xE8 gi\xE0 occupato.",
  "plan.leftOut.reason.no_room_left.item": "Non c\u2019\xE8 pi\xF9 spazio per altri di questi.",
  "plan.leftOut.reason.fewer_than_section_needs": "Ogni sezione per questi ne richiede almeno {min}. Tracy non ne inventa mai per riempire una sezione.",
  "plan.leftOut.reason.section_below_minimum": "Era in una sezione che ne richiede almeno {min}, e ne sono rimasti troppo pochi, quindi non viene mostrato.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.one": "Questa foto compare gi\xE0 in una galleria su un\u2019altra pagina, e ogni foto compare una sola volta sul tuo sito, quindi questa galleria ne mostra una in meno.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.other": "Queste {count} foto compaiono gi\xE0 in una galleria su un\u2019altra pagina, e ogni foto compare una sola volta sul tuo sito, quindi questa galleria ne mostra {count} in meno.",
  "plan.leftOut.reason.data_over_limit": "\xC8 pi\xF9 lungo di quanto la sezione possa mostrare, quindi l\xEC non viene mostrato.",
  "plan.leftOut.reason.value_over_limit": "\xC8 pi\xF9 lungo di quanto la sezione possa mostrare, quindi non viene mostrato.",
  "plan.leftOut.reason.row_beyond_stored_places": "La sezione che le mostra ha spazio per meno righe di quante ne hai.",
  "plan.leftOut.reason.row_over_max": "La sezione che le mostra ha spazio per meno righe di quante ne hai.",
  "plan.leftOut.reason.row_field_undeclared": "La sezione mostra solo una parte di questa riga.",
  "plan.leftOut.reason.row_parts_over_fields": "Questa riga ha pi\xF9 parti degli spazi della sezione, quindi non viene mostrata.",
  "plan.leftOut.reason.row_value_over_limit": "Questa riga \xE8 pi\xF9 lunga di quanto la sezione possa mostrare, quindi non viene mostrata.",
  "plan.leftOut.reason.row_parts_order": "Gli orari di questa riga vengono prima dei giorni, quindi non viene mostrata.",
  "plan.leftOut.reason.row_no_list": "Nessuna sezione del modello mostra righe come questa.",
  "plan.leftOut.reason.social_link_shortened": "\xC8 un link abbreviato, quindi non si sa a quale rete porti.",
  "plan.leftOut.reason.social_network_unknown": "Questo link non \xE8 di un social network che la sezione pu\xF2 mostrare.",
  "plan.leftOut.reason.social_handle_without_network": "Questo nome utente non dice su quale rete si trova.",
  "plan.leftOut.reason.social_link_not_web": "Non \xE8 un link web.",
  "plan.leftOut.reason.no_social_link": "Non c\u2019\xE8 nessun link da mostrare.",
  "plan.leftOut.reason.social_network_repeated": "Un altro link alla stessa rete \xE8 gi\xE0 mostrato.",
  "plan.leftOut.reason.social_link_over_rows": "La sezione che le mostra ha spazio per meno righe di quante ne hai.",
  "plan.leftOut.reason.page_removed": "Hai chiesto di togliere questa pagina.",
  "plan.leftOut.reason.no_longer_in_plan": "Non fa parte del tuo piano.",
  "plan.leftOut.reason.requested_off": "Hai chiesto di togliere questo dal piano.",
  "plan.leftOut.reason.removed_page_data": "Era solo su una pagina che hai chiesto di togliere."
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
  "plan.trade": "Geschreven op basis van algemene kennis van uw vak. Verwijder het met Plan wijzigen als het niet past.",
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
  "stop.fault": "Deze stap kon niet worden afgerond, dus ben ik hier gestopt. Wat ik tot nu toe heb verzameld, blijft bewaard.",
  "stop.limit": "Ik heb gepauzeerd omdat deze stap in korte tijd vaak is uitgevoerd. U kunt het vanaf {time} opnieuw proberen.",
  "stop.limit.now": "Ik heb gepauzeerd omdat deze stap in korte tijd vaak is uitgevoerd. U kunt het nu opnieuw proberen.",
  "stop.startOver": "Opnieuw beginnen",
  "stop.startOver.confirm": "Opnieuw beginnen verwijdert wat Tracy tot nu toe heeft verzameld en opent een nieuw gesprek. Een site die al is gebouwd, verandert niet.",
  "stop.startOver.yes": "Verwijderen en opnieuw beginnen",
  "stop.cancel": "Annuleren",
  "stop.startOver.failed": "Ik kan nu niet opnieuw beginnen. U kunt in dit gesprek verdergaan.",
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
  "ask.question.place_choice_found": "We hebben je bedrijf op Google Maps gezocht op naam en plaats. Is het een van deze?",
  "ask.question.brief_gap_offerings": "Wat biedt je bedrijf aan? Noem je belangrijkste diensten of producten.",
  "ask.question.brief_gap_menu": "Wat staat er op je kaart? Noem een paar gerechten of drankjes.",
  "ask.question.brief_gap_offering_descriptions": "Hoe zou je beschrijven wat je aanbiedt, in een of twee zinnen per onderdeel?",
  "ask.question.brief_gap_prices": "Wat kosten je belangrijkste diensten of producten?",
  "ask.question.brief_gap_hours": "Wat zijn je openingstijden?",
  "ask.question.brief_gap_phone": "Welk telefoonnummer moeten klanten bellen?",
  "ask.question.brief_gap_address": "Wat is je adres, of het gebied dat je bedient?",
  "ask.question.brief_gap_booking": "Hoe moeten klanten bij je boeken?",
  "ask.question.brief_gap_story": "Hoe zou je je bedrijf in een paar zinnen beschrijven?",
  "ask.choice.brief_gap_skip": "Voorlopig weglaten",
  "ask.question.business_trade": "Wat voor soort bedrijf is het?",
  "ask.question.held_hours_unconfirmed": "Slechts \xE9\xE9n bron noemt uw openingstijden, elke dag 24 uur open. Zijn dit uw openingstijden?",
  "ask.question.held_hours_disagree": "Uw bronnen noemen verschillende openingstijden. Welke tijden moet uw site tonen?",
  "ask.question.held_hours_typed": "Typ uw openingstijden, \xE9\xE9n regel per groep dagen, bijvoorbeeld ma tot vr 9:00 tot 18:00.",
  "ask.choice.held_hours_keep": "Deze tijden houden",
  "ask.choice.held_hours_edit": "Ze kloppen niet, ik typ ze",
  "ask.choice.held_hours_leave": "Geen openingstijden op de site",
  "ask.choice.business_trade_food": "Eten en drinken",
  "ask.choice.business_trade_beauty": "Beauty",
  "ask.choice.business_trade_health": "Gezondheid",
  "ask.choice.business_trade_fitness": "Sport en fitness",
  "ask.choice.business_trade_hospitality": "Hotel of verblijf",
  "ask.choice.business_trade_travel": "Reizen",
  "ask.choice.business_trade_professional": "Zakelijke dienstverlening",
  "ask.choice.business_trade_creative": "Creatief werk",
  "ask.choice.business_trade_education": "Onderwijs",
  "ask.choice.business_trade_retail": "Winkel",
  "ask.choice.business_trade_auto": "Auto's en voertuigen",
  "ask.choice.business_trade_home": "Diensten aan huis",
  "ask.choice.business_trade_events": "Evenementen",
  "ask.choice.business_trade_nonprofit": "Non-profit",
  "ask.choice.business_trade_other": "Iets anders",
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
  "say.researchRead": "Ik heb gelezen wat u mij over uw bedrijf hebt gegeven.",
  "plan.leftOut.reason.no_place_in_design": "Uw ontwerp heeft geen plek die dit toont.",
  "plan.leftOut.reason.no_place_for_whatsapp": "Dit ontwerp heeft geen plek voor een WhatsApp link, dus uw site toont die niet.",
  "plan.leftOut.reason.no_place_for_other_phones": "Dit ontwerp toont \xE9\xE9n telefoonnummer, dus uw site toont uw hoofdnummer.",
  "plan.leftOut.reason.no_place_for_google_rating": "Dit ontwerp heeft geen plek voor uw Google beoordeling, dus uw site toont die niet.",
  "plan.leftOut.reason.hours_unconfirmed": "Slechts \xE9\xE9n bron noemt uw openingstijden, elke dag 24 uur open, dus ze blijven van uw site tot u ze bevestigt.",
  "plan.leftOut.reason.hours_sources_disagree": "Uw bronnen noemen verschillende openingstijden, dus ze blijven van uw site tot u ze bevestigt.",
  "plan.leftOut.reason.not_collected": "Geen van de gelezen bronnen noemt dit, dus uw site toont het nog niet.",
  "plan.leftOut.reason.sources_disagree": "Uw bronnen zijn het hierover oneens, dus het blijft van uw site tot u het bevestigt.",
  "plan.leftOut.reason.kept_off_site": "Dit blijft van uw site tot u het bevestigt.",
  "plan.leftOut.reason.no_fitting_video": "Geen van uw video\u2019s past op deze plek (brede beelden zonder tekst erover), dus hij toont geen video.",
  "plan.leftOut.reason.page_nothing_to_show": "U hebt nog niets om op deze pagina's te tonen.",
  "plan.leftOut.reason.page_not_planned": "Uw plan heeft deze pagina's niet nodig.",
  "plan.leftOut.reason.library_section_refused": "Niet getoond in de Tracy-sectie: {why}.",
  "plan.leftOut.why.not_google_review": "het is geen Google-review",
  "plan.leftOut.why.no_text": "hij heeft geen tekst",
  "plan.leftOut.why.no_star_rating": "hij heeft geen sterrenwaardering",
  "plan.leftOut.why.stars_below_four": "alleen reviews met vier of vijf sterren worden getoond",
  "plan.leftOut.why.stars_not_whole": "de sterrenwaardering is geen heel getal",
  "plan.leftOut.why.reviewer_anonymous": "de schrijver is anoniem op Google",
  "plan.leftOut.why.no_reviewer_name": "hij heeft geen naam van de schrijver",
  "plan.leftOut.why.reviewer_name_too_long": "de naam van de schrijver is langer dan de sectie toelaat, en een naam wordt nooit ingekort",
  "plan.leftOut.why.review_too_long": "hij is langer dan de sectie toelaat, en een review wordt nooit ingekort",
  "plan.leftOut.what.no_place_for_whatsapp": "WhatsApp",
  "plan.leftOut.what.no_place_for_other_phones": "Andere telefoonnummers",
  "plan.leftOut.what.no_place_for_google_rating": "Google beoordeling",
  "plan.leftOut.what.hours_unconfirmed": "Openingstijden",
  "plan.leftOut.what.hours_sources_disagree": "Openingstijden",
  "plan.leftOut.what.no_fitting_video.one": "{count} videoplek",
  "plan.leftOut.what.no_fitting_video.other": "{count} videoplekken",
  "plan.leftOut.what.pages.one": "Pagina {page}",
  "plan.leftOut.what.pages.two": "Pagina's {first} en {last}",
  "plan.leftOut.what.pages.three": "Pagina's {first}, {second} en {last}",
  "plan.leftOut.what.pages.more": "Pagina's {first}, {second}, {third} en nog {count}",
  "plan.pictures.ownOfValue.one": "{count} van uw {total} foto\u2019s, van {from}",
  "plan.pictures.ownOfValue.other": "{count} van uw {total} foto\u2019s, van {from}",
  "plan.assumption.accent_logo_moved.lighter": "De kleur van uw logo is lichter gemaakt zodat knoppen en links opvallen in het ontwerp.",
  "plan.assumption.accent_logo_moved.darker": "De kleur van uw logo is donkerder gemaakt zodat knoppen en links opvallen in het ontwerp.",
  "plan.assumption.accent_logo_kept": "Knoppen en links gebruiken de kleur van uw logo.",
  "plan.assumption.accent_no_hue.black": "Uw logo heeft geen kleur, dus knoppen en links zijn zwart.",
  "plan.assumption.accent_no_hue.white": "Uw logo heeft geen kleur, dus knoppen en links zijn wit.",
  "plan.assumption.accent_no_hue.both": "Uw logo heeft geen kleur, dus knoppen en links zijn zwart op lichte pagina\u2019s en wit op donkere pagina\u2019s.",
  "plan.assumption.accent_unreadable.black": "De kleur van uw logo is slecht leesbaar op knoppen, dus knoppen en links zijn zwart.",
  "plan.assumption.accent_unreadable.white": "De kleur van uw logo is slecht leesbaar op knoppen, dus knoppen en links zijn wit.",
  "plan.assumption.accent_unreadable.both": "De kleur van uw logo is slecht leesbaar op knoppen, dus knoppen en links zijn zwart op lichte pagina\u2019s en wit op donkere pagina\u2019s.",
  "plan.assumption.accent_kept_unmeasured": "De kleuren van uw logo konden niet worden gelezen, dus knoppen en links houden de hoofdkleur van het ontwerp.",
  "plan.assumption.accent_kept_template": "De kleuren van uw logo zouden in dit ontwerp niet leesbaar zijn, dus knoppen en links houden de hoofdkleur van het ontwerp.",
  "plan.edits.count.one": "{count} wijziging",
  "plan.edits.count.other": "{count} wijzigingen",
  "plan.edits.revert": "Terug naar het origineel",
  "plan.edits.revertAsk.one": "Uw wijziging verwerpen?",
  "plan.edits.revertAsk.other": "Alle {count} wijzigingen verwerpen?",
  "plan.edits.keep": "Behouden",
  "plan.edits.discard": "Alles verwerpen",
  "plan.remove": "{what} verwijderen",
  "plan.get": "Dit krijgt u",
  "plan.get.lead": "Een site in het {language} met {pages}: {names}.",
  "plan.get.pages.one": "{count} pagina",
  "plan.get.pages.other": "{count} pagina\u2019s",
  "plan.keyMessages": "Wat uw site als eerste zegt",
  "plan.keyMessages.where": "Pagina {page}: {sections}",
  "plan.keyMessages.nowhere": "Nog geen sectie bevat dit.",
  "plan.keyMessage.n": "Kernboodschap {n}",
  "plan.tile.pages": "pagina\u2019s",
  "plan.tile.privacy": "en een privacypagina",
  "plan.tile.services": "diensten",
  "plan.tile.people": "personen",
  "plan.tile.reviews": "beoordelingen",
  "plan.tile.reviewsOf": "van {count} beoordelingen",
  "plan.tile.photos": "van uw foto\u2019s gebruikt",
  "plan.tile.drawn.one": "ongeveer {count} extra afbeelding die Tracy maakt",
  "plan.tile.drawn.other": "ongeveer {count} extra afbeeldingen die Tracy maakt",
  "plan.look.logoOnLight": "Uw logo op een lichte achtergrond",
  "plan.look.logoOnDark": "Uw logo op een donkere achtergrond",
  "plan.reach": "Hoe klanten u bereiken",
  "plan.reach.main": "Hoofdknop",
  "plan.reach.where": "Getoond in {places}.",
  "plan.reach.place": "{section} op {pages}",
  "plan.reach.nowhere": "Nog geen sectie toont het.",
  "plan.reach.end": "Einde van de pagina",
  "plan.reach.endLine": "Pagina {page}: {section}",
  "plan.reach.footerAll": "In de voettekst van elke pagina.",
  "plan.reach.footerSome": "In de voettekst van {pages}.",
  "plan.reach.on": "Op {pages}.",
  "plan.pages.every": "Elke pagina",
  "plan.pages.menu": "Menu",
  "plan.pages.header": "De koptekst toont {facts}.",
  "plan.pages.footer": "De voettekst toont {facts}.",
  "plan.pages.privacyLink": "een link naar de privacypagina",
  "plan.page.keyMessage": "Hoofdpunt van de pagina",
  "plan.page.notes": "Notities voor de schrijver",
  "plan.page.visitorQuestion": "Een bezoeker komt om te weten",
  "plan.tag.end": "Einde van de pagina",
  "plan.tag.library": "Toegevoegd door Tracy",
  "plan.standard": "Standaardpagina\u2019s",
  "plan.standard.sum": "Privacybeleid, pagina niet gevonden",
  "plan.standard.privacy": "Privacybeleid",
  "plan.standard.privacyFrom": "Geschreven op basis van {facts}. Gelinkt in de voettekst, niet in het menu.",
  "plan.standard.notFound": "Pagina niet gevonden",
  "plan.standard.notFoundLine": "Meldt dat de pagina er niet is en leidt de bezoeker naar {pages}.",
  "plan.writtenAfter": "De koppen en teksten van elke sectie worden geschreven nadat u akkoord bent gegaan, alleen op basis van wat dit plan bevat.",
  "plan.fact.offSite": "Niet op de site",
  "plan.notOnSite": "Niet op de site",
  "plan.notOnSite.group.removed": "U heeft verwijderd",
  "plan.notOnSite.group.no_place": "Uw ontwerp heeft er geen plek voor",
  "plan.notOnSite.group.no_info": "Nog geen informatie",
  "plan.notOnSite.group.held": "In afwachting van uw bevestiging",
  "plan.notOnSite.group.reviews": "Niet gebruikte beoordelingen",
  "plan.notOnSite.group.pages": "Niet gebouwde sjabloonpagina\u2019s",
  "plan.notOnSite.group.people_spots": "Leeggelaten plekken voor foto\u2019s van personen",
  "plan.notOnSite.group.other": "Overig",
  "plan.notOnSite.lines.one": "{count} regel",
  "plan.notOnSite.lines.other": "{count} regels",
  "plan.notOnSite.details.one": "Daarmee verdween {count} detail dat nergens anders wordt getoond.",
  "plan.notOnSite.details.other": "Daarmee verdwenen {count} details die nergens anders worden getoond.",
  "plan.notOnSite.restore": "Herstellen",
  "plan.notOnSite.restoreLabel": "{what} herstellen",
  "plan.notOnSite.cannotRestore": "Om dit te herstellen, vraagt u erom in de chat.",
  "plan.notOnSite.peopleSpots.one": "{count} plek voor een foto van een persoon",
  "plan.notOnSite.peopleSpots.other": "{count} plekken voor foto\u2019s van personen",
  "plan.notOnSite.peopleSpots.reason": "Tracy maakt nooit afbeeldingen van personen, dus deze plekken blijven leeg totdat u uw eigen foto toevoegt.",
  "plan.leftOut.reason.owner_removed": "U heeft dit uit het plan gehaald.",
  "plan.leftOut.what.videos.one": "{count} video",
  "plan.leftOut.what.videos.other": "{count} video\u2019s",
  "plan.sources": "Van uw links naar de site",
  "plan.sources.source": "Bron",
  "plan.sources.got": "Wat Tracy heeft gevonden",
  "plan.sources.shown": "Op de site",
  "plan.sources.none": "Niets",
  "plan.sources.shownOf": "{shown} van {what}",
  "plan.search": "Zoeken in Google",
  "plan.search.title": "Wat de titel zegt",
  "plan.search.description": "Wat de beschrijving zegt",
  "plan.search.terms": "Zoektermen",
  "plan.search.add": "Zoekterm toevoegen",
  "plan.search.addLabel": "Nieuwe zoekterm voor de pagina {page}",
  "plan.search.removeTerm": "Zoekterm {term} verwijderen",
  "plan.later": "Dit kunt u later sturen",
  "plan.later.what.later_prices": "Uw prijzen",
  "plan.later.reason.later_prices": "Stuur uw prijzen en ze kunnen samen met uw aanbod worden getoond.",
  "plan.later.what.later_services": "Uw lijst met diensten",
  "plan.later.reason.later_services": "Stuur de diensten die u aanbiedt en elk kan een eigen plek op uw site krijgen.",
  "plan.later.what.later_menu": "Uw menukaart",
  "plan.later.reason.later_menu": "Stuur uw menukaart en uw gerechten kunnen op uw site worden getoond.",
  "plan.later.what.later_hours": "Uw openingstijden",
  "plan.later.reason.later_hours": "Bevestig uw openingstijden en ze kunnen op uw site worden getoond.",
  "plan.later.what.later_email": "Uw e-mailadres",
  "plan.later.reason.later_email": "Stuur een e-mailadres en bezoekers kunnen u schrijven, en een formulier kan de antwoorden daarheen sturen.",
  "plan.later.what.later_booking_link": "Uw boekingslink",
  "plan.later.reason.later_booking_link": "Stuur uw boekingslink en uw knoppen kunnen bezoekers er rechtstreeks naartoe leiden.",
  "plan.later.what.later_portraits": "Foto\u2019s van uw team",
  "plan.later.reason.later_portraits": "Stuur een foto van elke persoon en die kan naast de naam worden getoond.",
  "plan.later.what.later_logo": "Uw logobestand",
  "plan.later.reason.later_logo": "Stuur uw logobestand en het kan worden getoond in plaats van het logo dat uw plan voorlopig gebruikt.",
  "plan.refused.first_page": "De eerste pagina van uw site blijft: elke andere pagina leidt ernaar terug.",
  "plan.refused.privacy_page": "Deze pagina is uw privacypagina, dus ze blijft.",
  "plan.refused.main_block": "Deze sectie is de hoofdsectie van haar pagina, dus ze blijft zolang de pagina blijft.",
  "plan.refused.site_chrome": "Deze sectie wordt door elke pagina van uw site gedeeld, dus ze kan niet van \xE9\xE9n pagina worden verwijderd.",
  "plan.refused.end_action": "Uw pagina eindigt met deze sectie, dus ze blijft.",
  "plan.refused.main_button": "Uw hoofdknop gebruikt dit, dus het blijft.",
  "plan.refused.too_few_items": "Deze sectie heeft er minstens {min} nodig, dus deze blijft.",
  "plan.refused.block_empty": "Dit is het laatste wat deze sectie toont. Verwijder in plaats daarvan de hele sectie.",
  "plan.refused.not_in_footer": "Dit wordt niet getoond in de voettekst van uw pagina\u2019s.",
  "plan.refused.not_a_channel": "Alleen een manier om contact met u op te nemen kan uit de voettekst worden verwijderd.",
  "plan.refused.not_an_item": "Alleen een dienst, een persoon, een foto of een beoordeling kan uit een sectie worden verwijderd.",
  "plan.refused.needed_by_privacy_page": "Uw privacypagina heeft dit nodig, dus het blijft.",
  "plan.refused.needed_by_end_action": "Het einde van een pagina leidt hiernaartoe, dus het blijft.",
  "plan.refused.not_found": "Dit staat niet meer in uw plan.",
  "plan.refused.removal_unknown": "Er is hier niets om te herstellen.",
  "plan.refused.restore_target_gone": "Dit hoort terug in iets wat u daarna heeft verwijderd. Herstel eerst dat.",
  "plan.refused.search_terms_empty": "Een pagina behoudt minstens \xE9\xE9n zoekterm.",
  "plan.refused.search_term_too_long": "Een zoekterm heeft maximaal 60 tekens.",
  "plan.refused.search_term_twice": "Deze zoekterm staat al op de pagina.",
  "plan.refused.too_many_search_terms": "Een pagina heeft maximaal 10 zoektermen.",
  "plan.refused.too_many_items": "Dit onderdeel toont er hoogstens {max}, dus deze wijziging past niet.",
  "plan.refused.wrong_item_kind": "Dit onderdeel kan dat niet tonen.",
  "plan.refused.library_rule": "Dit onderdeel toont dat niet.",
  "plan.refused.invented_item": "Deze wijziging noemt iets dat niet bij uw bedrijfsgegevens hoort.",
  "plan.refused.fact_without_field": "Dit onderdeel heeft geen plek voor dat gegeven.",
  "plan.refused.main_block_missing": "Deze wijziging zou het hoofdonderdeel van zijn pagina halen.",
  "plan.refused.unknown_block": "Dit onderdeel hoort niet bij uw sjabloon.",
  "plan.refused.withheld_shown": "Deze wijziging zou iets tonen dat u van uw site houdt.",
  "plan.refused.edit_invalid": "Deze wijziging kan niet worden opgeslagen: uw plan zou onvolledig worden.",
  "plan.refused.site_name_too_long": "Deze naam is te lang voor uw site.",
  "plan.refused.site_name_invalid": "Deze naam kan niet voor uw site worden gebruikt.",
  "plan.refused.value_over_limit": "Deze waarde is te lang voor het onderdeel dat hem toont.",
  "plan.refused.data_unaccounted": "Na deze wijziging zou een gegeven van uw bedrijf nergens worden getoond.",
  "plan.refused.picture_count": "Uw foto\u2019s konden na deze wijziging niet opnieuw worden geteld, dus is ze niet opgeslagen.",
  "plan.refused.plan_fault": "Deze wijziging is niet opgeslagen: uw plan heeft zelf een probleem dat Tracy eerst moet oplossen. U kunt de wijziging in de chat vragen.",
  "plan.refused.template_change": "Dit plan is gemaakt voor het ontwerp dat u koos, en kan nog niet naar een ander ontwerp worden verplaatst.",
  "plan.heldBack.field.prices": "Prijzen",
  "plan.heldBack.field.offerings": "Diensten",
  "plan.heldBack.field.menu": "Menu",
  "plan.heldBack.field.menu-link": "Link naar het menu",
  "plan.heldBack.field.name": "Bedrijfsnaam",
  "plan.heldBack.field.team": "Team",
  "plan.heldBack.field.socials": "Socialemediaprofielen",
  "plan.heldBack.field.photos": "Foto\u2019s",
  "plan.heldBack.field.posts": "Berichten",
  "plan.heldBack.field.email": "E-mailadres",
  "plan.heldBack.field.phone": "Telefoonnummer",
  "plan.heldBack.field.address": "Adres",
  "plan.heldBack.field.about": "Over het bedrijf",
  "plan.heldBack.field.reviews": "Beoordelingen",
  "plan.heldBack.field.booking": "Boekingslink",
  "plan.heldBack.field.offering-descriptions": "Beschrijvingen van de diensten",
  "plan.heldBack.field.story": "Uw verhaal",
  "plan.refused.item_field_fact": "Dit onderdeel toont een heel item, niet een van zijn gegevens.",
  "plan.refused.trade_terms": "Dit onderdeel beschrijft hoe uw vak meestal werkt, dus het noemt geen getal, prijs, tijden of belofte.",
  "plan.refused.trade_fact_missing": "Dit onderdeel legt uw vak uit aan de hand van een gegeven van uw bedrijf, dus dat gegeven blijft.",
  "plan.refused.item_repeated_on_page": "Deze wijziging zou hetzelfde twee keer op \xE9\xE9n pagina tonen.",
  "plan.refused.form_without_destination": "Een formulier heeft een e-mailadres nodig waar de berichten heen gaan.",
  "plan.refused.map_without_address": "Een kaart heeft uw adres nodig.",
  "plan.leftOut.reason.whatsapp_unconfirmed": "Geen bron zegt dat dit nummer WhatsApp-berichten ontvangt, dus je site linkt niet naar WhatsApp.",
  "plan.leftOut.reason.contact_value_missing": "Je hebt gekozen hoe bezoekers je bereiken, maar nog geen waarde gegeven, dus er wordt niets getoond. Voeg die toe in het plan.",
  "plan.leftOut.reason.fact_longer_than_every_place": "Dit is langer dan elke plek die je ontwerp ervoor heeft, en Tracy kort het nooit in.",
  "plan.leftOut.reason.no_room_left": "Elke plek die je ontwerp hiervoor heeft, is al bezet.",
  "plan.leftOut.reason.no_room_left.item": "Er is geen ruimte meer voor meer hiervan.",
  "plan.leftOut.reason.fewer_than_section_needs": "Elke sectie hiervoor heeft er minstens {min} nodig. Tracy verzint er nooit bij om een sectie te vullen.",
  "plan.leftOut.reason.section_below_minimum": "Het stond in een sectie die er minstens {min} nodig heeft, en er bleven te weinig over, dus het wordt niet getoond.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.one": "Deze foto staat al in een galerij op een andere pagina, en elke foto staat maar \xE9\xE9n keer op je site, dus deze galerij toont er \xE9\xE9n minder.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.other": "Deze {count} foto\u2019s staan al in een galerij op een andere pagina, en elke foto staat maar \xE9\xE9n keer op je site, dus deze galerij toont er {count} minder.",
  "plan.leftOut.reason.data_over_limit": "Dit is langer dan de sectie kan tonen, dus het wordt daar niet getoond.",
  "plan.leftOut.reason.value_over_limit": "Dit is langer dan de sectie kan tonen, dus het wordt niet getoond.",
  "plan.leftOut.reason.row_beyond_stored_places": "De sectie die deze toont, heeft ruimte voor minder rijen dan je hebt.",
  "plan.leftOut.reason.row_over_max": "De sectie die deze toont, heeft ruimte voor minder rijen dan je hebt.",
  "plan.leftOut.reason.row_field_undeclared": "De sectie toont maar een deel van deze rij.",
  "plan.leftOut.reason.row_parts_over_fields": "Deze rij heeft meer delen dan de sectie plekken heeft, dus ze wordt niet getoond.",
  "plan.leftOut.reason.row_value_over_limit": "Deze rij is langer dan de sectie kan tonen, dus ze wordt niet getoond.",
  "plan.leftOut.reason.row_parts_order": "De tijden van deze rij staan voor de dagen, dus ze wordt niet getoond.",
  "plan.leftOut.reason.row_no_list": "Geen sectie van de template toont rijen zoals deze.",
  "plan.leftOut.reason.social_link_shortened": "Dit is een verkorte link, dus het is onbekend naar welk netwerk hij leidt.",
  "plan.leftOut.reason.social_network_unknown": "Deze link is niet van een sociaal netwerk dat de sectie kan tonen.",
  "plan.leftOut.reason.social_handle_without_network": "Deze naam zegt niet op welk netwerk hij staat.",
  "plan.leftOut.reason.social_link_not_web": "Dit is geen weblink.",
  "plan.leftOut.reason.no_social_link": "Er is geen link om te tonen.",
  "plan.leftOut.reason.social_network_repeated": "Er wordt al een andere link naar hetzelfde netwerk getoond.",
  "plan.leftOut.reason.social_link_over_rows": "De sectie die deze toont, heeft ruimte voor minder rijen dan je hebt.",
  "plan.leftOut.reason.page_removed": "Je hebt gevraagd deze pagina te verwijderen.",
  "plan.leftOut.reason.no_longer_in_plan": "Het hoort niet bij je plan.",
  "plan.leftOut.reason.requested_off": "Je hebt gevraagd dit uit het plan te halen.",
  "plan.leftOut.reason.removed_page_data": "Het stond alleen op een pagina die je liet verwijderen."
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
  "plan.trade": "\u6839\u636E\u4F60\u6240\u5728\u884C\u4E1A\u7684\u901A\u7528\u77E5\u8BC6\u64B0\u5199\u3002\u5982\u679C\u4E0D\u5408\u9002\uFF0C\u53EF\u4EE5\u7528\u201C\u4FEE\u6539\u8BA1\u5212\u201D\u5220\u9664\u3002",
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
  "stop.fault": "\u8FD9\u4E00\u6B65\u672A\u80FD\u5B8C\u6210\uFF0C\u6240\u4EE5\u6211\u5728\u8FD9\u91CC\u505C\u4E86\u4E0B\u6765\u3002\u5230\u76EE\u524D\u4E3A\u6B62\u6536\u96C6\u7684\u5185\u5BB9\u90FD\u5DF2\u4FDD\u7559\u3002",
  "stop.limit": "\u8FD9\u4E00\u6B65\u5728\u77ED\u65F6\u95F4\u5185\u8FD0\u884C\u4E86\u592A\u591A\u6B21\uFF0C\u6240\u4EE5\u6211\u6682\u505C\u4E86\u3002\u4F60\u53EF\u4EE5\u4ECE {time} \u8D77\u91CD\u8BD5\u3002",
  "stop.limit.now": "\u8FD9\u4E00\u6B65\u5728\u77ED\u65F6\u95F4\u5185\u8FD0\u884C\u4E86\u592A\u591A\u6B21\uFF0C\u6240\u4EE5\u6211\u6682\u505C\u4E86\u3002\u4F60\u73B0\u5728\u53EF\u4EE5\u91CD\u8BD5\u3002",
  "stop.startOver": "\u91CD\u65B0\u5F00\u59CB",
  "stop.startOver.confirm": "\u91CD\u65B0\u5F00\u59CB\u4F1A\u4E22\u5F03 Tracy \u5230\u76EE\u524D\u4E3A\u6B62\u6536\u96C6\u7684\u5185\u5BB9\uFF0C\u5E76\u6253\u5F00\u65B0\u7684\u5BF9\u8BDD\u3002\u5DF2\u7ECF\u5EFA\u597D\u7684 site \u4E0D\u53D7\u5F71\u54CD\u3002",
  "stop.startOver.yes": "\u4E22\u5F03\u5E76\u91CD\u65B0\u5F00\u59CB",
  "stop.cancel": "\u53D6\u6D88",
  "stop.startOver.failed": "\u73B0\u5728\u65E0\u6CD5\u91CD\u65B0\u5F00\u59CB\u3002\u4F60\u53EF\u4EE5\u5728\u8FD9\u4E2A\u5BF9\u8BDD\u4E2D\u7EE7\u7EED\u3002",
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
  "ask.question.place_choice_found": "\u6211\u4EEC\u6309\u540D\u79F0\u548C\u57CE\u5E02\u5728 Google \u5730\u56FE\u4E0A\u67E5\u627E\u4E86\u4F60\u7684\u5546\u5BB6\u3002\u662F\u4EE5\u4E0B\u5176\u4E2D\u4E4B\u4E00\u5417\uFF1F",
  "ask.question.brief_gap_offerings": "\u4F60\u7684\u5546\u5BB6\u63D0\u4F9B\u4EC0\u4E48\uFF1F\u8BF7\u8BF4\u51FA\u4F60\u7684\u4E3B\u8981\u670D\u52A1\u6216\u4EA7\u54C1\u3002",
  "ask.question.brief_gap_menu": "\u4F60\u7684\u83DC\u5355\u4E0A\u6709\u4EC0\u4E48\uFF1F\u8BF7\u8BF4\u51FA\u51E0\u9053\u83DC\u6216\u996E\u54C1\u3002",
  "ask.question.brief_gap_offering_descriptions": "\u4F60\u4F1A\u5982\u4F55\u63CF\u8FF0\u4F60\u63D0\u4F9B\u7684\u4E1C\u897F\uFF0C\u6BCF\u6837\u7528\u4E00\u4E24\u53E5\u8BDD\uFF1F",
  "ask.question.brief_gap_prices": "\u4F60\u7684\u4E3B\u8981\u670D\u52A1\u6216\u4EA7\u54C1\u4EF7\u683C\u662F\u591A\u5C11\uFF1F",
  "ask.question.brief_gap_hours": "\u4F60\u7684\u8425\u4E1A\u65F6\u95F4\u662F\u4EC0\u4E48\uFF1F",
  "ask.question.brief_gap_phone": "\u5BA2\u6237\u5E94\u8BE5\u62E8\u6253\u54EA\u4E2A\u7535\u8BDD\u53F7\u7801\uFF1F",
  "ask.question.brief_gap_address": "\u4F60\u7684\u8857\u9053\u5730\u5740\u662F\u4EC0\u4E48\uFF0C\u6216\u4F60\u670D\u52A1\u7684\u533A\u57DF\uFF1F",
  "ask.question.brief_gap_booking": "\u5BA2\u6237\u5E94\u8BE5\u5982\u4F55\u5411\u4F60\u9884\u7EA6\uFF1F",
  "ask.question.brief_gap_story": "\u4F60\u4F1A\u5982\u4F55\u7528\u51E0\u53E5\u8BDD\u63CF\u8FF0\u4F60\u7684\u5546\u5BB6\uFF1F",
  "ask.choice.brief_gap_skip": "\u6682\u65F6\u4E0D\u586B",
  "ask.question.business_trade": "\u8FD9\u662F\u4EC0\u4E48\u7C7B\u578B\u7684\u5546\u5BB6\uFF1F",
  "ask.question.held_hours_unconfirmed": "\u53EA\u6709\u4E00\u4E2A\u6765\u6E90\u7ED9\u51FA\u4E86\u60A8\u7684\u8425\u4E1A\u65F6\u95F4\uFF0C\u663E\u793A\u4E3A\u6BCF\u5929 24 \u5C0F\u65F6\u8425\u4E1A\u3002\u8FD9\u662F\u60A8\u7684\u8425\u4E1A\u65F6\u95F4\u5417\uFF1F",
  "ask.question.held_hours_disagree": "\u60A8\u7684\u5404\u4E2A\u6765\u6E90\u7ED9\u51FA\u7684\u8425\u4E1A\u65F6\u95F4\u4E0D\u4E00\u81F4\u3002\u60A8\u7684\u7F51\u7AD9\u5E94\u663E\u793A\u54EA\u4E2A\u65F6\u95F4\uFF1F",
  "ask.question.held_hours_typed": "\u8BF7\u8F93\u5165\u60A8\u7684\u8425\u4E1A\u65F6\u95F4\uFF0C\u6BCF\u7EC4\u65E5\u671F\u4E00\u884C\uFF0C\u4F8B\u5982 \u5468\u4E00\u81F3\u5468\u4E94 9:00 \u81F3 18:00\u3002",
  "ask.choice.held_hours_keep": "\u4FDD\u7559\u8FD9\u4E9B\u65F6\u95F4",
  "ask.choice.held_hours_edit": "\u65F6\u95F4\u4E0D\u5BF9\uFF0C\u6211\u6765\u8F93\u5165",
  "ask.choice.held_hours_leave": "\u7F51\u7AD9\u4E0A\u4E0D\u663E\u793A\u8425\u4E1A\u65F6\u95F4",
  "ask.choice.business_trade_food": "\u9910\u996E",
  "ask.choice.business_trade_beauty": "\u7F8E\u5BB9",
  "ask.choice.business_trade_health": "\u5065\u5EB7",
  "ask.choice.business_trade_fitness": "\u8FD0\u52A8\u5065\u8EAB",
  "ask.choice.business_trade_hospitality": "\u9152\u5E97\u6216\u4F4F\u5BBF",
  "ask.choice.business_trade_travel": "\u65C5\u884C",
  "ask.choice.business_trade_professional": "\u4E13\u4E1A\u670D\u52A1",
  "ask.choice.business_trade_creative": "\u521B\u610F\u5DE5\u4F5C",
  "ask.choice.business_trade_education": "\u6559\u80B2",
  "ask.choice.business_trade_retail": "\u5546\u5E97",
  "ask.choice.business_trade_auto": "\u6C7D\u8F66",
  "ask.choice.business_trade_home": "\u5BB6\u5C45\u670D\u52A1",
  "ask.choice.business_trade_events": "\u6D3B\u52A8",
  "ask.choice.business_trade_nonprofit": "\u975E\u8425\u5229",
  "ask.choice.business_trade_other": "\u5176\u4ED6",
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
  "say.researchRead": "\u6211\u5DF2\u9605\u8BFB\u4F60\u63D0\u4F9B\u7684\u4E1A\u52A1\u4FE1\u606F\u3002",
  "plan.leftOut.reason.no_place_in_design": "\u60A8\u7684\u8BBE\u8BA1\u6CA1\u6709\u53EF\u4EE5\u663E\u793A\u6B64\u9879\u7684\u4F4D\u7F6E\u3002",
  "plan.leftOut.reason.no_place_for_whatsapp": "\u6B64\u8BBE\u8BA1\u6CA1\u6709\u653E\u7F6E WhatsApp \u94FE\u63A5\u7684\u4F4D\u7F6E\uFF0C\u56E0\u6B64\u60A8\u7684\u7F51\u7AD9\u4E0D\u663E\u793A\u5B83\u3002",
  "plan.leftOut.reason.no_place_for_other_phones": "\u6B64\u8BBE\u8BA1\u53EA\u663E\u793A\u4E00\u4E2A\u7535\u8BDD\u53F7\u7801\uFF0C\u56E0\u6B64\u60A8\u7684\u7F51\u7AD9\u663E\u793A\u60A8\u7684\u4E3B\u53F7\u7801\u3002",
  "plan.leftOut.reason.no_place_for_google_rating": "\u6B64\u8BBE\u8BA1\u6CA1\u6709\u653E\u7F6E\u60A8\u7684 Google \u8BC4\u5206\u7684\u4F4D\u7F6E\uFF0C\u56E0\u6B64\u60A8\u7684\u7F51\u7AD9\u4E0D\u663E\u793A\u5B83\u3002",
  "plan.leftOut.reason.hours_unconfirmed": "\u53EA\u6709\u4E00\u4E2A\u6765\u6E90\u7ED9\u51FA\u60A8\u7684\u8425\u4E1A\u65F6\u95F4\uFF0C\u4E14\u4E3A\u6BCF\u5929 24 \u5C0F\u65F6\u8425\u4E1A\uFF0C\u56E0\u6B64\u5728\u60A8\u786E\u8BA4\u4E4B\u524D\u4E0D\u4F1A\u653E\u5230\u7F51\u7AD9\u4E0A\u3002",
  "plan.leftOut.reason.hours_sources_disagree": "\u60A8\u7684\u5404\u4E2A\u6765\u6E90\u7ED9\u51FA\u7684\u8425\u4E1A\u65F6\u95F4\u4E0D\u540C\uFF0C\u56E0\u6B64\u5728\u60A8\u786E\u8BA4\u4E4B\u524D\u4E0D\u4F1A\u653E\u5230\u7F51\u7AD9\u4E0A\u3002",
  "plan.leftOut.reason.not_collected": "\u6211\u4EEC\u8BFB\u53D6\u7684\u6765\u6E90\u90FD\u6CA1\u6709\u63D0\u4F9B\u8FD9\u9879\u4FE1\u606F\uFF0C\u56E0\u6B64\u60A8\u7684\u7F51\u7AD9\u6682\u4E0D\u663E\u793A\u3002",
  "plan.leftOut.reason.sources_disagree": "\u60A8\u7684\u5404\u4E2A\u6765\u6E90\u5BF9\u6B64\u8BF4\u6CD5\u4E0D\u4E00\uFF0C\u56E0\u6B64\u5728\u60A8\u786E\u8BA4\u4E4B\u524D\u4E0D\u4F1A\u653E\u5230\u7F51\u7AD9\u4E0A\u3002",
  "plan.leftOut.reason.kept_off_site": "\u5728\u60A8\u786E\u8BA4\u4E4B\u524D\uFF0C\u8FD9\u9879\u5185\u5BB9\u4E0D\u4F1A\u653E\u5230\u7F51\u7AD9\u4E0A\u3002",
  "plan.leftOut.reason.no_fitting_video": "\u60A8\u7684\u89C6\u9891\u90FD\u4E0D\u9002\u5408\u8FD9\u4E2A\u4F4D\u7F6E\uFF08\u6A2A\u5411\u753B\u9762\u4E14\u4E0A\u9762\u6CA1\u6709\u6587\u5B57\uFF09\uFF0C\u56E0\u6B64\u8FD9\u91CC\u4E0D\u663E\u793A\u89C6\u9891\u3002",
  "plan.leftOut.reason.page_nothing_to_show": "\u60A8\u76EE\u524D\u8FD8\u6CA1\u6709\u53EF\u5728\u8FD9\u4E9B\u9875\u9762\u4E0A\u5C55\u793A\u7684\u5185\u5BB9\u3002",
  "plan.leftOut.reason.page_not_planned": "\u60A8\u7684\u8BA1\u5212\u4E0D\u9700\u8981\u8FD9\u4E9B\u9875\u9762\u3002",
  "plan.leftOut.reason.library_section_refused": "\u672A\u5728 Tracy \u677F\u5757\u4E2D\u663E\u793A\uFF1A{why}\u3002",
  "plan.leftOut.why.not_google_review": "\u8FD9\u4E0D\u662F Google \u8BC4\u4EF7",
  "plan.leftOut.why.no_text": "\u5B83\u6CA1\u6709\u6587\u5B57",
  "plan.leftOut.why.no_star_rating": "\u5B83\u6CA1\u6709\u661F\u7EA7\u8BC4\u5206",
  "plan.leftOut.why.stars_below_four": "\u53EA\u663E\u793A\u56DB\u661F\u6216\u4E94\u661F\u7684\u8BC4\u4EF7",
  "plan.leftOut.why.stars_not_whole": "\u5B83\u7684\u661F\u7EA7\u8BC4\u5206\u4E0D\u662F\u6574\u6570",
  "plan.leftOut.why.reviewer_anonymous": "\u8BC4\u4EF7\u8005\u5728 Google \u4E0A\u662F\u533F\u540D\u7684",
  "plan.leftOut.why.no_reviewer_name": "\u5B83\u6CA1\u6709\u8BC4\u4EF7\u8005\u59D3\u540D",
  "plan.leftOut.why.reviewer_name_too_long": "\u8BC4\u4EF7\u8005\u59D3\u540D\u8D85\u8FC7\u4E86\u8BE5\u677F\u5757\u7684\u957F\u5EA6\uFF0C\u59D3\u540D\u4ECE\u4E0D\u622A\u65AD",
  "plan.leftOut.why.review_too_long": "\u5B83\u8D85\u8FC7\u4E86\u8BE5\u677F\u5757\u7684\u957F\u5EA6\uFF0C\u8BC4\u4EF7\u4ECE\u4E0D\u622A\u65AD",
  "plan.leftOut.what.no_place_for_whatsapp": "WhatsApp",
  "plan.leftOut.what.no_place_for_other_phones": "\u5176\u4ED6\u7535\u8BDD\u53F7\u7801",
  "plan.leftOut.what.no_place_for_google_rating": "Google \u8BC4\u5206",
  "plan.leftOut.what.hours_unconfirmed": "\u8425\u4E1A\u65F6\u95F4",
  "plan.leftOut.what.hours_sources_disagree": "\u8425\u4E1A\u65F6\u95F4",
  "plan.leftOut.what.no_fitting_video.one": "{count} \u4E2A\u89C6\u9891\u4F4D\u7F6E",
  "plan.leftOut.what.no_fitting_video.other": "{count} \u4E2A\u89C6\u9891\u4F4D\u7F6E",
  "plan.leftOut.what.pages.one": "{page} \u9875\u9762",
  "plan.leftOut.what.pages.two": "{first} \u548C {last} \u9875\u9762",
  "plan.leftOut.what.pages.three": "{first}\u3001{second} \u548C {last} \u9875\u9762",
  "plan.leftOut.what.pages.more": "{first}\u3001{second}\u3001{third} \u7B49\u53E6\u5916 {count} \u4E2A\u9875\u9762",
  "plan.pictures.ownOfValue.one": "\u60A8\u7684 {total} \u5F20\u7167\u7247\u4E2D\u7684 {count} \u5F20\uFF0C\u6765\u81EA {from}",
  "plan.pictures.ownOfValue.other": "\u60A8\u7684 {total} \u5F20\u7167\u7247\u4E2D\u7684 {count} \u5F20\uFF0C\u6765\u81EA {from}",
  "plan.assumption.accent_logo_moved.lighter": "\u60A8\u7684\u6807\u5FD7\u989C\u8272\u5DF2\u8C03\u4EAE\uFF0C\u4F7F\u6309\u94AE\u548C\u94FE\u63A5\u5728\u8BBE\u8BA1\u4E2D\u66F4\u9192\u76EE\u3002",
  "plan.assumption.accent_logo_moved.darker": "\u60A8\u7684\u6807\u5FD7\u989C\u8272\u5DF2\u8C03\u6697\uFF0C\u4F7F\u6309\u94AE\u548C\u94FE\u63A5\u5728\u8BBE\u8BA1\u4E2D\u66F4\u9192\u76EE\u3002",
  "plan.assumption.accent_logo_kept": "\u6309\u94AE\u548C\u94FE\u63A5\u4F7F\u7528\u60A8\u7684\u6807\u5FD7\u989C\u8272\u3002",
  "plan.assumption.accent_no_hue.black": "\u60A8\u7684\u6807\u5FD7\u6CA1\u6709\u989C\u8272\uFF0C\u56E0\u6B64\u6309\u94AE\u548C\u94FE\u63A5\u4E3A\u9ED1\u8272\u3002",
  "plan.assumption.accent_no_hue.white": "\u60A8\u7684\u6807\u5FD7\u6CA1\u6709\u989C\u8272\uFF0C\u56E0\u6B64\u6309\u94AE\u548C\u94FE\u63A5\u4E3A\u767D\u8272\u3002",
  "plan.assumption.accent_no_hue.both": "\u60A8\u7684\u6807\u5FD7\u6CA1\u6709\u989C\u8272\uFF0C\u56E0\u6B64\u6309\u94AE\u548C\u94FE\u63A5\u5728\u6D45\u8272\u9875\u9762\u4E0A\u4E3A\u9ED1\u8272\uFF0C\u5728\u6DF1\u8272\u9875\u9762\u4E0A\u4E3A\u767D\u8272\u3002",
  "plan.assumption.accent_unreadable.black": "\u60A8\u7684\u6807\u5FD7\u989C\u8272\u5728\u6309\u94AE\u4E0A\u96BE\u4EE5\u8FA8\u8BA4\uFF0C\u56E0\u6B64\u6309\u94AE\u548C\u94FE\u63A5\u4E3A\u9ED1\u8272\u3002",
  "plan.assumption.accent_unreadable.white": "\u60A8\u7684\u6807\u5FD7\u989C\u8272\u5728\u6309\u94AE\u4E0A\u96BE\u4EE5\u8FA8\u8BA4\uFF0C\u56E0\u6B64\u6309\u94AE\u548C\u94FE\u63A5\u4E3A\u767D\u8272\u3002",
  "plan.assumption.accent_unreadable.both": "\u60A8\u7684\u6807\u5FD7\u989C\u8272\u5728\u6309\u94AE\u4E0A\u96BE\u4EE5\u8FA8\u8BA4\uFF0C\u56E0\u6B64\u6309\u94AE\u548C\u94FE\u63A5\u5728\u6D45\u8272\u9875\u9762\u4E0A\u4E3A\u9ED1\u8272\uFF0C\u5728\u6DF1\u8272\u9875\u9762\u4E0A\u4E3A\u767D\u8272\u3002",
  "plan.assumption.accent_kept_unmeasured": "\u65E0\u6CD5\u8BFB\u53D6\u60A8\u7684\u6807\u5FD7\u989C\u8272\uFF0C\u56E0\u6B64\u6309\u94AE\u548C\u94FE\u63A5\u4FDD\u7559\u8BBE\u8BA1\u7684\u4E3B\u8272\u3002",
  "plan.assumption.accent_kept_template": "\u60A8\u7684\u6807\u5FD7\u989C\u8272\u5728\u6B64\u8BBE\u8BA1\u4E0A\u4E0D\u6613\u8FA8\u8BA4\uFF0C\u56E0\u6B64\u6309\u94AE\u548C\u94FE\u63A5\u4FDD\u7559\u8BBE\u8BA1\u7684\u4E3B\u8272\u3002",
  "plan.edits.count.one": "{count} \u5904\u4FEE\u6539",
  "plan.edits.count.other": "{count} \u5904\u4FEE\u6539",
  "plan.edits.revert": "\u6062\u590D\u539F\u6837",
  "plan.edits.revertAsk.one": "\u653E\u5F03\u4F60\u7684\u4FEE\u6539\uFF1F",
  "plan.edits.revertAsk.other": "\u653E\u5F03\u5168\u90E8 {count} \u5904\u4FEE\u6539\uFF1F",
  "plan.edits.keep": "\u4FDD\u7559",
  "plan.edits.discard": "\u5168\u90E8\u653E\u5F03",
  "plan.remove": "\u5220\u9664 {what}",
  "plan.get": "\u4F60\u5C06\u83B7\u5F97",
  "plan.get.lead": "\u4E00\u4E2A {language} \u7F51\u7AD9\uFF0C\u5171 {pages}\uFF1A{names}\u3002",
  "plan.get.pages.one": "{count} \u4E2A\u9875\u9762",
  "plan.get.pages.other": "{count} \u4E2A\u9875\u9762",
  "plan.keyMessages": "\u4F60\u7684\u7F51\u7AD9\u6700\u5148\u4F20\u8FBE\u7684\u5185\u5BB9",
  "plan.keyMessages.where": "{page} \u9875\u9762\uFF1A{sections}",
  "plan.keyMessages.nowhere": "\u76EE\u524D\u8FD8\u6CA1\u6709\u677F\u5757\u5305\u542B\u8FD9\u4E00\u70B9\u3002",
  "plan.keyMessage.n": "\u6838\u5FC3\u4FE1\u606F {n}",
  "plan.tile.pages": "\u9875\u9762",
  "plan.tile.privacy": "\u4EE5\u53CA\u4E00\u4E2A\u9690\u79C1\u9875\u9762",
  "plan.tile.services": "\u670D\u52A1",
  "plan.tile.people": "\u4EBA\u5458",
  "plan.tile.reviews": "\u8BC4\u4EF7",
  "plan.tile.reviewsOf": "\u5171 {count} \u6761\u8BC4\u4EF7",
  "plan.tile.photos": "\u4F60\u7684\u7167\u7247\u5DF2\u4F7F\u7528",
  "plan.tile.drawn.one": "Tracy \u8FD8\u5C06\u521B\u5EFA\u7EA6 {count} \u5F20\u56FE\u7247",
  "plan.tile.drawn.other": "Tracy \u8FD8\u5C06\u521B\u5EFA\u7EA6 {count} \u5F20\u56FE\u7247",
  "plan.look.logoOnLight": "\u4F60\u7684 logo \u5728\u6D45\u8272\u80CC\u666F\u4E0A",
  "plan.look.logoOnDark": "\u4F60\u7684 logo \u5728\u6DF1\u8272\u80CC\u666F\u4E0A",
  "plan.reach": "\u5BA2\u6237\u5982\u4F55\u8054\u7CFB\u4F60",
  "plan.reach.main": "\u4E3B\u6309\u94AE",
  "plan.reach.where": "\u663E\u793A\u4F4D\u7F6E\uFF1A{places}\u3002",
  "plan.reach.place": "{pages}\u4E0A\u7684{section}",
  "plan.reach.nowhere": "\u76EE\u524D\u8FD8\u6CA1\u6709\u677F\u5757\u663E\u793A\u5B83\u3002",
  "plan.reach.end": "\u9875\u9762\u672B\u5C3E",
  "plan.reach.endLine": "{page} \u9875\u9762\uFF1A{section}",
  "plan.reach.footerAll": "\u5728\u6BCF\u4E2A\u9875\u9762\u7684\u9875\u811A\u3002",
  "plan.reach.footerSome": "\u5728{pages}\u7684\u9875\u811A\u3002",
  "plan.reach.on": "\u5728{pages}\u3002",
  "plan.pages.every": "\u6240\u6709\u9875\u9762",
  "plan.pages.menu": "\u83DC\u5355",
  "plan.pages.header": "\u9875\u5934\u663E\u793A{facts}\u3002",
  "plan.pages.footer": "\u9875\u811A\u663E\u793A{facts}\u3002",
  "plan.pages.privacyLink": "\u9690\u79C1\u9875\u9762\u94FE\u63A5",
  "plan.page.keyMessage": "\u9875\u9762\u8981\u70B9",
  "plan.page.notes": "\u7ED9\u64B0\u7A3F\u4EBA\u7684\u8BF4\u660E",
  "plan.page.visitorQuestion": "\u8BBF\u5BA2\u6765\u8FD9\u91CC\u662F\u60F3\u4E86\u89E3",
  "plan.tag.end": "\u9875\u9762\u672B\u5C3E",
  "plan.tag.library": "\u7531 Tracy \u6DFB\u52A0",
  "plan.standard": "\u6807\u51C6\u9875\u9762",
  "plan.standard.sum": "\u9690\u79C1\u653F\u7B56\u3001\u9875\u9762\u672A\u627E\u5230",
  "plan.standard.privacy": "\u9690\u79C1\u653F\u7B56",
  "plan.standard.privacyFrom": "\u6839\u636E{facts}\u64B0\u5199\u3002\u94FE\u63A5\u653E\u5728\u9875\u811A\uFF0C\u4E0D\u5728\u83DC\u5355\u4E2D\u3002",
  "plan.standard.notFound": "\u9875\u9762\u672A\u627E\u5230",
  "plan.standard.notFoundLine": "\u8BF4\u660E\u8BE5\u9875\u9762\u4E0D\u5B58\u5728\uFF0C\u5E76\u5F15\u5BFC\u8BBF\u5BA2\u524D\u5F80{pages}\u3002",
  "plan.writtenAfter": "\u6BCF\u4E2A\u677F\u5757\u7684\u6807\u9898\u548C\u6587\u5B57\u4F1A\u5728\u4F60\u786E\u8BA4\u540E\u64B0\u5199\uFF0C\u4EC5\u4F9D\u636E\u6B64\u8BA1\u5212\u4E2D\u7684\u5185\u5BB9\u3002",
  "plan.fact.offSite": "\u4E0D\u5728\u7F51\u7AD9\u4E0A",
  "plan.notOnSite": "\u4E0D\u5728\u7F51\u7AD9\u4E0A",
  "plan.notOnSite.group.removed": "\u4F60\u5DF2\u5220\u9664",
  "plan.notOnSite.group.no_place": "\u4F60\u7684\u8BBE\u8BA1\u6CA1\u6709\u4F4D\u7F6E\u653E\u7F6E",
  "plan.notOnSite.group.no_info": "\u6682\u65E0\u4FE1\u606F",
  "plan.notOnSite.group.held": "\u5F85\u4F60\u786E\u8BA4\u540E\u518D\u4F7F\u7528",
  "plan.notOnSite.group.reviews": "\u672A\u4F7F\u7528\u7684\u8BC4\u4EF7",
  "plan.notOnSite.group.pages": "\u672A\u521B\u5EFA\u7684\u6A21\u677F\u9875\u9762",
  "plan.notOnSite.group.people_spots": "\u7559\u7A7A\u7684\u4EBA\u7269\u56FE\u7247\u4F4D\u7F6E",
  "plan.notOnSite.group.other": "\u5176\u4ED6",
  "plan.notOnSite.lines.one": "{count} \u884C",
  "plan.notOnSite.lines.other": "{count} \u884C",
  "plan.notOnSite.details.one": "\u968F\u4E4B\u79FB\u9664\u7684\u8FD8\u6709 {count} \u9879\u4E0D\u5728\u5176\u4ED6\u5730\u65B9\u663E\u793A\u7684\u7EC6\u8282\u3002",
  "plan.notOnSite.details.other": "\u968F\u4E4B\u79FB\u9664\u7684\u8FD8\u6709 {count} \u9879\u4E0D\u5728\u5176\u4ED6\u5730\u65B9\u663E\u793A\u7684\u7EC6\u8282\u3002",
  "plan.notOnSite.restore": "\u6062\u590D",
  "plan.notOnSite.restoreLabel": "\u6062\u590D {what}",
  "plan.notOnSite.cannotRestore": "\u5982\u9700\u6062\u590D\uFF0C\u8BF7\u5728\u804A\u5929\u4E2D\u63D0\u51FA\u3002",
  "plan.notOnSite.peopleSpots.one": "{count} \u4E2A\u4EBA\u7269\u56FE\u7247\u4F4D\u7F6E",
  "plan.notOnSite.peopleSpots.other": "{count} \u4E2A\u4EBA\u7269\u56FE\u7247\u4F4D\u7F6E",
  "plan.notOnSite.peopleSpots.reason": "Tracy \u4ECE\u4E0D\u751F\u6210\u4EBA\u7269\u56FE\u7247\uFF0C\u56E0\u6B64\u8FD9\u4E9B\u4F4D\u7F6E\u4F1A\u4FDD\u6301\u7A7A\u767D\uFF0C\u76F4\u5230\u4F60\u6DFB\u52A0\u81EA\u5DF1\u7684\u7167\u7247\u3002",
  "plan.leftOut.reason.owner_removed": "\u4F60\u5DF2\u5C06\u6B64\u9879\u4ECE\u8BA1\u5212\u4E2D\u79FB\u9664\u3002",
  "plan.leftOut.what.videos.one": "{count} \u4E2A\u89C6\u9891",
  "plan.leftOut.what.videos.other": "{count} \u4E2A\u89C6\u9891",
  "plan.sources": "\u4ECE\u4F60\u7684\u94FE\u63A5\u5230\u7F51\u7AD9",
  "plan.sources.source": "\u6765\u6E90",
  "plan.sources.got": "Tracy \u627E\u5230\u7684\u5185\u5BB9",
  "plan.sources.shown": "\u7F51\u7AD9\u4E0A\u4F7F\u7528",
  "plan.sources.none": "\u65E0",
  "plan.sources.shownOf": "{what}\u4E2D\u7684 {shown}",
  "plan.search": "Google \u641C\u7D22",
  "plan.search.title": "\u6807\u9898\u5185\u5BB9",
  "plan.search.description": "\u63CF\u8FF0\u5185\u5BB9",
  "plan.search.terms": "\u641C\u7D22\u8BCD",
  "plan.search.add": "\u6DFB\u52A0\u641C\u7D22\u8BCD",
  "plan.search.addLabel": "{page} \u9875\u9762\u7684\u65B0\u641C\u7D22\u8BCD",
  "plan.search.removeTerm": "\u5220\u9664\u641C\u7D22\u8BCD {term}",
  "plan.later": "\u4F60\u53EF\u4EE5\u7A0D\u540E\u63D0\u4F9B",
  "plan.later.what.later_prices": "\u4F60\u7684\u4EF7\u683C",
  "plan.later.reason.later_prices": "\u53D1\u9001\u4F60\u7684\u4EF7\u683C\u540E\uFF0C\u5B83\u4EEC\u53EF\u4EE5\u4E0E\u4F60\u7684\u670D\u52A1\u4E00\u8D77\u663E\u793A\u3002",
  "plan.later.what.later_services": "\u4F60\u7684\u670D\u52A1\u5217\u8868",
  "plan.later.reason.later_services": "\u53D1\u9001\u4F60\u63D0\u4F9B\u7684\u670D\u52A1\u540E\uFF0C\u6BCF\u9879\u670D\u52A1\u90FD\u53EF\u4EE5\u5728\u7F51\u7AD9\u4E0A\u62E5\u6709\u81EA\u5DF1\u7684\u4F4D\u7F6E\u3002",
  "plan.later.what.later_menu": "\u4F60\u7684\u83DC\u5355",
  "plan.later.reason.later_menu": "\u53D1\u9001\u4F60\u7684\u83DC\u5355\u540E\uFF0C\u4F60\u7684\u83DC\u54C1\u53EF\u4EE5\u663E\u793A\u5728\u7F51\u7AD9\u4E0A\u3002",
  "plan.later.what.later_hours": "\u4F60\u7684\u8425\u4E1A\u65F6\u95F4",
  "plan.later.reason.later_hours": "\u786E\u8BA4\u4F60\u7684\u8425\u4E1A\u65F6\u95F4\u540E\uFF0C\u5B83\u4EEC\u53EF\u4EE5\u663E\u793A\u5728\u7F51\u7AD9\u4E0A\u3002",
  "plan.later.what.later_email": "\u4F60\u7684 email \u5730\u5740",
  "plan.later.reason.later_email": "\u53D1\u9001\u4E00\u4E2A email \u5730\u5740\u540E\uFF0C\u8BBF\u5BA2\u53EF\u4EE5\u7ED9\u4F60\u5199\u4FE1\uFF0C\u8868\u5355\u4E5F\u53EF\u4EE5\u628A\u56DE\u7B54\u53D1\u9001\u5230\u8BE5\u5730\u5740\u3002",
  "plan.later.what.later_booking_link": "\u4F60\u7684\u9884\u8BA2\u94FE\u63A5",
  "plan.later.reason.later_booking_link": "\u53D1\u9001\u4F60\u7684\u9884\u8BA2\u94FE\u63A5\u540E\uFF0C\u4F60\u7684\u6309\u94AE\u53EF\u4EE5\u76F4\u63A5\u628A\u8BBF\u5BA2\u5E26\u5230\u90A3\u91CC\u3002",
  "plan.later.what.later_portraits": "\u56E2\u961F\u6210\u5458\u7684\u7167\u7247",
  "plan.later.reason.later_portraits": "\u53D1\u9001\u6BCF\u4E2A\u4EBA\u7684\u7167\u7247\u540E\uFF0C\u7167\u7247\u53EF\u4EE5\u663E\u793A\u5728\u5176\u59D3\u540D\u65C1\u8FB9\u3002",
  "plan.later.what.later_logo": "\u4F60\u7684 logo \u6587\u4EF6",
  "plan.later.reason.later_logo": "\u53D1\u9001\u4F60\u7684 logo \u6587\u4EF6\u540E\uFF0C\u5B83\u53EF\u4EE5\u66FF\u6362\u8BA1\u5212\u6682\u65F6\u4F7F\u7528\u7684 logo\u3002",
  "plan.refused.first_page": "\u7F51\u7AD9\u7684\u9996\u9875\u4F1A\u4FDD\u7559\uFF1A\u5176\u4ED6\u6240\u6709\u9875\u9762\u90FD\u4F1A\u94FE\u63A5\u56DE\u9996\u9875\u3002",
  "plan.refused.privacy_page": "\u6B64\u9875\u9762\u662F\u4F60\u7684\u9690\u79C1\u9875\u9762\uFF0C\u56E0\u6B64\u4F1A\u4FDD\u7559\u3002",
  "plan.refused.main_block": "\u6B64\u677F\u5757\u662F\u6240\u5728\u9875\u9762\u7684\u4E3B\u677F\u5757\uFF0C\u53EA\u8981\u8BE5\u9875\u9762\u5B58\u5728\u5C31\u4F1A\u4FDD\u7559\u3002",
  "plan.refused.site_chrome": "\u6B64\u677F\u5757\u7531\u7F51\u7AD9\u7684\u6240\u6709\u9875\u9762\u5171\u7528\uFF0C\u56E0\u6B64\u4E0D\u80FD\u53EA\u4ECE\u67D0\u4E00\u4E2A\u9875\u9762\u4E2D\u5220\u9664\u3002",
  "plan.refused.end_action": "\u4F60\u7684\u9875\u9762\u4EE5\u6B64\u677F\u5757\u7ED3\u5C3E\uFF0C\u56E0\u6B64\u4F1A\u4FDD\u7559\u3002",
  "plan.refused.main_button": "\u4F60\u7684\u4E3B\u6309\u94AE\u4F7F\u7528\u4E86\u6B64\u9879\uFF0C\u56E0\u6B64\u4F1A\u4FDD\u7559\u3002",
  "plan.refused.too_few_items": "\u6B64\u677F\u5757\u81F3\u5C11\u9700\u8981 {min} \u9879\u8FD9\u6837\u7684\u5185\u5BB9\uFF0C\u56E0\u6B64\u8FD9\u4E00\u9879\u4F1A\u4FDD\u7559\u3002",
  "plan.refused.block_empty": "\u8FD9\u662F\u6B64\u677F\u5757\u663E\u793A\u7684\u6700\u540E\u4E00\u9879\u5185\u5BB9\u3002\u8BF7\u6539\u4E3A\u5220\u9664\u6574\u4E2A\u677F\u5757\u3002",
  "plan.refused.not_in_footer": "\u6B64\u9879\u6CA1\u6709\u663E\u793A\u5728\u4F60\u9875\u9762\u7684\u9875\u811A\u4E2D\u3002",
  "plan.refused.not_a_channel": "\u53EA\u6709\u8054\u7CFB\u65B9\u5F0F\u53EF\u4EE5\u4ECE\u9875\u811A\u4E2D\u5220\u9664\u3002",
  "plan.refused.not_an_item": "\u53EA\u6709\u670D\u52A1\u3001\u4EBA\u5458\u3001\u7167\u7247\u6216\u8BC4\u4EF7\u53EF\u4EE5\u4ECE\u677F\u5757\u4E2D\u5220\u9664\u3002",
  "plan.refused.needed_by_privacy_page": "\u4F60\u7684\u9690\u79C1\u9875\u9762\u9700\u8981\u6B64\u9879\uFF0C\u56E0\u6B64\u4F1A\u4FDD\u7559\u3002",
  "plan.refused.needed_by_end_action": "\u9875\u9762\u672B\u5C3E\u4F1A\u94FE\u63A5\u5230\u6B64\u9879\uFF0C\u56E0\u6B64\u4F1A\u4FDD\u7559\u3002",
  "plan.refused.not_found": "\u6B64\u9879\u5DF2\u4E0D\u5728\u4F60\u7684\u8BA1\u5212\u4E2D\u3002",
  "plan.refused.removal_unknown": "\u8FD9\u91CC\u6CA1\u6709\u53EF\u6062\u590D\u7684\u5185\u5BB9\u3002",
  "plan.refused.restore_target_gone": "\u6B64\u9879\u8981\u653E\u56DE\u4F60\u4E4B\u540E\u5220\u9664\u7684\u5185\u5BB9\u4E2D\u3002\u8BF7\u5148\u6062\u590D\u90A3\u4E00\u9879\u3002",
  "plan.refused.search_terms_empty": "\u6BCF\u4E2A\u9875\u9762\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A\u641C\u7D22\u8BCD\u3002",
  "plan.refused.search_term_too_long": "\u6BCF\u4E2A\u641C\u7D22\u8BCD\u6700\u591A 60 \u4E2A\u5B57\u7B26\u3002",
  "plan.refused.search_term_twice": "\u6B64\u641C\u7D22\u8BCD\u5DF2\u5728\u8BE5\u9875\u9762\u4E0A\u3002",
  "plan.refused.too_many_search_terms": "\u6BCF\u4E2A\u9875\u9762\u6700\u591A 10 \u4E2A\u641C\u7D22\u8BCD\u3002",
  "plan.refused.too_many_items": "\u6B64\u90E8\u5206\u6700\u591A\u663E\u793A {max} \u9879\uFF0C\u56E0\u6B64\u6B64\u66F4\u6539\u653E\u4E0D\u4E0B\u3002",
  "plan.refused.wrong_item_kind": "\u6B64\u90E8\u5206\u65E0\u6CD5\u663E\u793A\u8BE5\u5185\u5BB9\u3002",
  "plan.refused.library_rule": "\u6B64\u90E8\u5206\u4E0D\u663E\u793A\u8BE5\u5185\u5BB9\u3002",
  "plan.refused.invented_item": "\u6B64\u66F4\u6539\u63D0\u5230\u7684\u5185\u5BB9\u4E0D\u5C5E\u4E8E\u4F60\u7684\u5546\u5BB6\u4FE1\u606F\u3002",
  "plan.refused.fact_without_field": "\u6B64\u90E8\u5206\u6CA1\u6709\u4F4D\u7F6E\u653E\u8FD9\u9879\u4FE1\u606F\u3002",
  "plan.refused.main_block_missing": "\u6B64\u66F4\u6539\u4F1A\u628A\u4E3B\u8981\u90E8\u5206\u4ECE\u5176\u9875\u9762\u4E0A\u79FB\u9664\u3002",
  "plan.refused.unknown_block": "\u6B64\u90E8\u5206\u4E0D\u5C5E\u4E8E\u4F60\u7684\u6A21\u677F\u3002",
  "plan.refused.withheld_shown": "\u6B64\u66F4\u6539\u4F1A\u663E\u793A\u4F60\u4E0D\u60F3\u653E\u5728\u7F51\u7AD9\u4E0A\u7684\u5185\u5BB9\u3002",
  "plan.refused.edit_invalid": "\u65E0\u6CD5\u4FDD\u5B58\u6B64\u66F4\u6539\uFF1A\u4F60\u7684\u65B9\u6848\u4F1A\u56E0\u6B64\u4E0D\u5B8C\u6574\u3002",
  "plan.refused.site_name_too_long": "\u8FD9\u4E2A\u540D\u79F0\u5BF9\u4F60\u7684\u7F51\u7AD9\u6765\u8BF4\u592A\u957F\u3002",
  "plan.refused.site_name_invalid": "\u8FD9\u4E2A\u540D\u79F0\u4E0D\u80FD\u7528\u4E8E\u4F60\u7684\u7F51\u7AD9\u3002",
  "plan.refused.value_over_limit": "\u8FD9\u4E2A\u503C\u5BF9\u663E\u793A\u5B83\u7684\u90E8\u5206\u6765\u8BF4\u592A\u957F\u3002",
  "plan.refused.data_unaccounted": "\u6B64\u66F4\u6539\u540E\uFF0C\u4F60\u7684\u4E00\u9879\u5546\u5BB6\u4FE1\u606F\u5C06\u4E0D\u4F1A\u5728\u4EFB\u4F55\u5730\u65B9\u663E\u793A\u3002",
  "plan.refused.picture_count": "\u6B64\u66F4\u6539\u540E\u65E0\u6CD5\u91CD\u65B0\u7EDF\u8BA1\u4F60\u7684\u7167\u7247\uFF0C\u56E0\u6B64\u6CA1\u6709\u4FDD\u5B58\u3002",
  "plan.refused.plan_fault": "\u6B64\u66F4\u6539\u672A\u4FDD\u5B58\uFF1A\u4F60\u7684\u65B9\u6848\u672C\u8EAB\u6709\u4E00\u4E2A\u95EE\u9898\uFF0C\u9700\u8981 Tracy \u5148\u4FEE\u590D\u3002\u4F60\u53EF\u4EE5\u5728\u804A\u5929\u4E2D\u63D0\u51FA\u8FD9\u9879\u66F4\u6539\u3002",
  "plan.refused.template_change": "\u6B64\u65B9\u6848\u662F\u4E3A\u4F60\u9009\u62E9\u7684\u8BBE\u8BA1\u5236\u5B9A\u7684\uFF0C\u76EE\u524D\u8FD8\u4E0D\u80FD\u6362\u5230\u5176\u4ED6\u8BBE\u8BA1\u3002",
  "plan.heldBack.field.prices": "\u4EF7\u683C",
  "plan.heldBack.field.offerings": "\u670D\u52A1",
  "plan.heldBack.field.menu": "\u83DC\u5355",
  "plan.heldBack.field.menu-link": "\u83DC\u5355\u94FE\u63A5",
  "plan.heldBack.field.name": "\u5546\u5BB6\u540D\u79F0",
  "plan.heldBack.field.team": "\u56E2\u961F",
  "plan.heldBack.field.socials": "\u793E\u4EA4\u5A92\u4F53\u4E3B\u9875",
  "plan.heldBack.field.photos": "\u7167\u7247",
  "plan.heldBack.field.posts": "\u5E16\u5B50",
  "plan.heldBack.field.email": "\u7535\u5B50\u90AE\u4EF6\u5730\u5740",
  "plan.heldBack.field.phone": "\u7535\u8BDD\u53F7\u7801",
  "plan.heldBack.field.address": "\u5730\u5740",
  "plan.heldBack.field.about": "\u5546\u5BB6\u7B80\u4ECB",
  "plan.heldBack.field.reviews": "\u8BC4\u4EF7",
  "plan.heldBack.field.booking": "\u9884\u8BA2\u94FE\u63A5",
  "plan.heldBack.field.offering-descriptions": "\u670D\u52A1\u4ECB\u7ECD",
  "plan.heldBack.field.story": "\u4F60\u7684\u6545\u4E8B",
  "plan.refused.item_field_fact": "\u6B64\u90E8\u5206\u663E\u793A\u7684\u662F\u5B8C\u6574\u7684\u4E00\u9879\uFF0C\u800C\u4E0D\u662F\u5176\u4E2D\u7684\u67D0\u4E2A\u7EC6\u8282\u3002",
  "plan.refused.trade_terms": "\u6B64\u90E8\u5206\u4F9D\u636E\u4F60\u6240\u5728\u884C\u4E1A\u7684\u5E38\u89C1\u505A\u6CD5\u64B0\u5199\uFF0C\u56E0\u6B64\u4E0D\u80FD\u5199\u51FA\u6570\u5B57\u3001\u4EF7\u683C\u3001\u65F6\u95F4\u5B89\u6392\u6216\u627F\u8BFA\u3002",
  "plan.refused.trade_fact_missing": "\u6B64\u90E8\u5206\u6839\u636E\u4F60\u7684\u4E00\u9879\u5546\u5BB6\u4FE1\u606F\u6765\u4ECB\u7ECD\u4F60\u7684\u884C\u4E1A\uFF0C\u56E0\u6B64\u8FD9\u9879\u4FE1\u606F\u4F1A\u4FDD\u7559\u3002",
  "plan.refused.item_repeated_on_page": "\u6B64\u66F4\u6539\u4F1A\u5728\u540C\u4E00\u9875\u9762\u4E0A\u628A\u540C\u4E00\u5185\u5BB9\u663E\u793A\u4E24\u6B21\u3002",
  "plan.refused.form_without_destination": "\u8868\u5355\u9700\u8981\u4E00\u4E2A\u63A5\u6536\u7559\u8A00\u7684\u7535\u5B50\u90AE\u4EF6\u5730\u5740\u3002",
  "plan.refused.map_without_address": "\u5730\u56FE\u9700\u8981\u4F60\u7684\u5730\u5740\u3002",
  "plan.leftOut.reason.whatsapp_unconfirmed": "\u6CA1\u6709\u6765\u6E90\u8BF4\u660E\u8FD9\u4E2A\u53F7\u7801\u63A5\u6536 WhatsApp \u6D88\u606F\uFF0C\u6240\u4EE5\u4F60\u7684\u7F51\u7AD9\u4E0D\u94FE\u63A5\u5230 WhatsApp\u3002",
  "plan.leftOut.reason.contact_value_missing": "\u4F60\u9009\u62E9\u4E86\u8BBF\u5BA2\u8054\u7CFB\u4F60\u7684\u65B9\u5F0F\uFF0C\u4F46\u8FD8\u6CA1\u6709\u586B\u5199\u5177\u4F53\u5185\u5BB9\uFF0C\u6240\u4EE5\u4E0D\u663E\u793A\u4EFB\u4F55\u5185\u5BB9\u3002\u8BF7\u5728\u65B9\u6848\u4E2D\u6DFB\u52A0\u3002",
  "plan.leftOut.reason.fact_longer_than_every_place": "\u8FD9\u9879\u5185\u5BB9\u6BD4\u4F60\u7684\u8BBE\u8BA1\u4E3A\u5B83\u51C6\u5907\u7684\u6BCF\u4E2A\u4F4D\u7F6E\u90FD\u957F\uFF0C\u800C Tracy \u4ECE\u4E0D\u622A\u77ED\u5185\u5BB9\u3002",
  "plan.leftOut.reason.no_room_left": "\u4F60\u7684\u8BBE\u8BA1\u4E3A\u8FD9\u9879\u5185\u5BB9\u51C6\u5907\u7684\u6BCF\u4E2A\u4F4D\u7F6E\u90FD\u5DF2\u88AB\u5360\u7528\u3002",
  "plan.leftOut.reason.no_room_left.item": "\u5DF2\u7ECF\u6CA1\u6709\u4F4D\u7F6E\u518D\u653E\u66F4\u591A\u8FD9\u7C7B\u5185\u5BB9\u3002",
  "plan.leftOut.reason.fewer_than_section_needs": "\u6BCF\u4E2A\u5C55\u793A\u8FD9\u7C7B\u5185\u5BB9\u7684\u7248\u5757\u81F3\u5C11\u9700\u8981 {min} \u4E2A\u3002Tracy \u4ECE\u4E0D\u7F16\u9020\u5185\u5BB9\u6765\u586B\u6EE1\u7248\u5757\u3002",
  "plan.leftOut.reason.section_below_minimum": "\u5B83\u6240\u5728\u7684\u7248\u5757\u81F3\u5C11\u9700\u8981 {min} \u4E2A\u8FD9\u7C7B\u5185\u5BB9\uFF0C\u800C\u5269\u4E0B\u7684\u4E0D\u591F\uFF0C\u6240\u4EE5\u4E0D\u663E\u793A\u3002",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.one": "\u8FD9\u5F20\u7167\u7247\u5DF2\u7ECF\u663E\u793A\u5728\u53E6\u4E00\u9875\u7684\u76F8\u518C\u4E2D\uFF0C\u6BCF\u5F20\u7167\u7247\u5728\u4F60\u7684\u7F51\u7AD9\u4E0A\u53EA\u663E\u793A\u4E00\u6B21\uFF0C\u6240\u4EE5\u8FD9\u4E2A\u76F8\u518C\u5C11\u663E\u793A\u4E00\u5F20\u3002",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.other": "\u8FD9 {count} \u5F20\u7167\u7247\u5DF2\u7ECF\u663E\u793A\u5728\u53E6\u4E00\u9875\u7684\u76F8\u518C\u4E2D\uFF0C\u6BCF\u5F20\u7167\u7247\u5728\u4F60\u7684\u7F51\u7AD9\u4E0A\u53EA\u663E\u793A\u4E00\u6B21\uFF0C\u6240\u4EE5\u8FD9\u4E2A\u76F8\u518C\u5C11\u663E\u793A {count} \u5F20\u3002",
  "plan.leftOut.reason.data_over_limit": "\u8FD9\u9879\u5185\u5BB9\u8D85\u51FA\u4E86\u8BE5\u7248\u5757\u80FD\u663E\u793A\u7684\u957F\u5EA6\uFF0C\u6240\u4EE5\u4E0D\u5728\u90A3\u91CC\u663E\u793A\u3002",
  "plan.leftOut.reason.value_over_limit": "\u8FD9\u9879\u5185\u5BB9\u8D85\u51FA\u4E86\u8BE5\u7248\u5757\u80FD\u663E\u793A\u7684\u957F\u5EA6\uFF0C\u6240\u4EE5\u4E0D\u663E\u793A\u3002",
  "plan.leftOut.reason.row_beyond_stored_places": "\u663E\u793A\u8FD9\u4E9B\u5185\u5BB9\u7684\u7248\u5757\u80FD\u5BB9\u7EB3\u7684\u884C\u6570\u5C11\u4E8E\u4F60\u62E5\u6709\u7684\u884C\u6570\u3002",
  "plan.leftOut.reason.row_over_max": "\u663E\u793A\u8FD9\u4E9B\u5185\u5BB9\u7684\u7248\u5757\u80FD\u5BB9\u7EB3\u7684\u884C\u6570\u5C11\u4E8E\u4F60\u62E5\u6709\u7684\u884C\u6570\u3002",
  "plan.leftOut.reason.row_field_undeclared": "\u8BE5\u7248\u5757\u53EA\u663E\u793A\u8FD9\u4E00\u884C\u7684\u4E00\u90E8\u5206\u3002",
  "plan.leftOut.reason.row_parts_over_fields": "\u8FD9\u4E00\u884C\u7684\u90E8\u5206\u591A\u4E8E\u8BE5\u7248\u5757\u7684\u4F4D\u7F6E\uFF0C\u6240\u4EE5\u4E0D\u663E\u793A\u3002",
  "plan.leftOut.reason.row_value_over_limit": "\u8FD9\u4E00\u884C\u8D85\u51FA\u4E86\u8BE5\u7248\u5757\u80FD\u663E\u793A\u7684\u957F\u5EA6\uFF0C\u6240\u4EE5\u4E0D\u663E\u793A\u3002",
  "plan.leftOut.reason.row_parts_order": "\u8FD9\u4E00\u884C\u7684\u65F6\u95F4\u6392\u5728\u65E5\u671F\u4E4B\u524D\uFF0C\u6240\u4EE5\u4E0D\u663E\u793A\u3002",
  "plan.leftOut.reason.row_no_list": "\u6A21\u677F\u4E2D\u6CA1\u6709\u7248\u5757\u663E\u793A\u8FD9\u6837\u7684\u884C\u3002",
  "plan.leftOut.reason.social_link_shortened": "\u8FD9\u662F\u4E00\u4E2A\u77ED\u94FE\u63A5\uFF0C\u65E0\u6CD5\u77E5\u9053\u5B83\u6307\u5411\u54EA\u4E2A\u793E\u4EA4\u7F51\u7EDC\u3002",
  "plan.leftOut.reason.social_network_unknown": "\u8FD9\u4E2A\u94FE\u63A5\u4E0D\u5C5E\u4E8E\u8BE5\u7248\u5757\u80FD\u663E\u793A\u7684\u793E\u4EA4\u7F51\u7EDC\u3002",
  "plan.leftOut.reason.social_handle_without_network": "\u8FD9\u4E2A\u8D26\u53F7\u540D\u6CA1\u6709\u8BF4\u660E\u5B83\u5728\u54EA\u4E2A\u7F51\u7EDC\u4E0A\u3002",
  "plan.leftOut.reason.social_link_not_web": "\u8FD9\u4E0D\u662F\u7F51\u9875\u94FE\u63A5\u3002",
  "plan.leftOut.reason.no_social_link": "\u6CA1\u6709\u53EF\u663E\u793A\u7684\u94FE\u63A5\u3002",
  "plan.leftOut.reason.social_network_repeated": "\u5DF2\u7ECF\u663E\u793A\u4E86\u6307\u5411\u540C\u4E00\u7F51\u7EDC\u7684\u53E6\u4E00\u4E2A\u94FE\u63A5\u3002",
  "plan.leftOut.reason.social_link_over_rows": "\u663E\u793A\u8FD9\u4E9B\u5185\u5BB9\u7684\u7248\u5757\u80FD\u5BB9\u7EB3\u7684\u884C\u6570\u5C11\u4E8E\u4F60\u62E5\u6709\u7684\u884C\u6570\u3002",
  "plan.leftOut.reason.page_removed": "\u4F60\u8981\u6C42\u5220\u9664\u8FD9\u4E2A\u9875\u9762\u3002",
  "plan.leftOut.reason.no_longer_in_plan": "\u5B83\u4E0D\u5C5E\u4E8E\u4F60\u7684\u65B9\u6848\u3002",
  "plan.leftOut.reason.requested_off": "\u4F60\u8981\u6C42\u628A\u8FD9\u9879\u4ECE\u65B9\u6848\u4E2D\u79FB\u9664\u3002",
  "plan.leftOut.reason.removed_page_data": "\u5B83\u53EA\u51FA\u73B0\u5728\u4F60\u8981\u6C42\u5220\u9664\u7684\u9875\u9762\u4E0A\u3002"
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
  "plan.trade": "Vi\u1EBFt t\u1EEB hi\u1EC3u bi\u1EBFt chung v\u1EC1 ng\xE0nh c\u1EE7a b\u1EA1n. B\u1ECF m\u1EE5c n\xE0y b\u1EB1ng \u0110\u1ED5i k\u1EBF ho\u1EA1ch n\u1EBFu kh\xF4ng ph\xF9 h\u1EE3p.",
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
  "stop.fault": "B\u01B0\u1EDBc n\xE0y kh\xF4ng ho\xE0n t\u1EA5t \u0111\u01B0\u1EE3c n\xEAn m\xECnh \u0111\xE3 d\u1EEBng \u1EDF \u0111\xE2y. Nh\u1EEFng g\xEC m\xECnh thu th\u1EADp \u0111\u01B0\u1EE3c \u0111\u1EBFn gi\u1EDD v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "stop.limit": "M\xECnh t\u1EA1m d\u1EEBng v\xEC b\u01B0\u1EDBc n\xE0y \u0111\xE3 ch\u1EA1y qu\xE1 nhi\u1EC1u l\u1EA7n trong th\u1EDDi gian ng\u1EAFn. B\u1EA1n c\xF3 th\u1EC3 th\u1EED l\u1EA1i t\u1EEB {time}.",
  "stop.limit.now": "M\xECnh t\u1EA1m d\u1EEBng v\xEC b\u01B0\u1EDBc n\xE0y \u0111\xE3 ch\u1EA1y qu\xE1 nhi\u1EC1u l\u1EA7n trong th\u1EDDi gian ng\u1EAFn. B\u1EA1n c\xF3 th\u1EC3 th\u1EED l\u1EA1i ngay b\xE2y gi\u1EDD.",
  "stop.startOver": "B\u1EAFt \u0111\u1EA7u l\u1EA1i",
  "stop.startOver.confirm": "B\u1EAFt \u0111\u1EA7u l\u1EA1i s\u1EBD b\u1ECF nh\u1EEFng g\xEC Tracy \u0111\xE3 thu th\u1EADp \u0111\u1EBFn gi\u1EDD v\xE0 m\u1EDF m\u1ED9t cu\u1ED9c tr\xF2 chuy\u1EC7n m\u1EDBi. Site \u0111\xE3 d\u1EF1ng xong kh\xF4ng b\u1ECB \u1EA3nh h\u01B0\u1EDFng.",
  "stop.startOver.yes": "B\u1ECF v\xE0 b\u1EAFt \u0111\u1EA7u l\u1EA1i",
  "stop.cancel": "Hu\u1EF7",
  "stop.startOver.failed": "Hi\u1EC7n m\xECnh ch\u01B0a th\u1EC3 b\u1EAFt \u0111\u1EA7u l\u1EA1i. B\u1EA1n c\xF3 th\u1EC3 ti\u1EBFp t\u1EE5c trong cu\u1ED9c tr\xF2 chuy\u1EC7n n\xE0y.",
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
  "ask.question.place_choice_found": "Ch\xFAng t\xF4i \u0111\xE3 t\xECm doanh nghi\u1EC7p c\u1EE7a b\u1EA1n tr\xEAn Google Maps theo t\xEAn v\xE0 th\xE0nh ph\u1ED1. C\xF3 ph\u1EA3i l\xE0 m\u1ED9t trong nh\u1EEFng \u0111\u1ECBa \u0111i\u1EC3m n\xE0y kh\xF4ng?",
  "ask.question.brief_gap_offerings": "Doanh nghi\u1EC7p c\u1EE7a b\u1EA1n cung c\u1EA5p g\xEC? H\xE3y k\u1EC3 t\xEAn c\xE1c d\u1ECBch v\u1EE5 ho\u1EB7c s\u1EA3n ph\u1EA9m ch\xEDnh.",
  "ask.question.brief_gap_menu": "Th\u1EF1c \u0111\u01A1n c\u1EE7a b\u1EA1n c\xF3 g\xEC? H\xE3y k\u1EC3 t\xEAn v\xE0i m\xF3n \u0103n ho\u1EB7c \u0111\u1ED3 u\u1ED1ng.",
  "ask.question.brief_gap_offering_descriptions": "B\u1EA1n m\xF4 t\u1EA3 nh\u1EEFng g\xEC b\u1EA1n cung c\u1EA5p th\u1EBF n\xE0o, m\u1ED7i th\u1EE9 m\u1ED9t hai c\xE2u?",
  "ask.question.brief_gap_prices": "C\xE1c d\u1ECBch v\u1EE5 ho\u1EB7c s\u1EA3n ph\u1EA9m ch\xEDnh c\u1EE7a b\u1EA1n c\xF3 gi\xE1 bao nhi\xEAu?",
  "ask.question.brief_gap_hours": "Gi\u1EDD m\u1EDF c\u1EEDa c\u1EE7a b\u1EA1n l\xE0 khi n\xE0o?",
  "ask.question.brief_gap_phone": "Kh\xE1ch h\xE0ng n\xEAn g\u1ECDi s\u1ED1 \u0111i\u1EC7n tho\u1EA1i n\xE0o?",
  "ask.question.brief_gap_address": "\u0110\u1ECBa ch\u1EC9 c\u1EE7a b\u1EA1n l\xE0 g\xEC, ho\u1EB7c khu v\u1EF1c b\u1EA1n ph\u1EE5c v\u1EE5?",
  "ask.question.brief_gap_booking": "Kh\xE1ch h\xE0ng n\xEAn \u0111\u1EB7t l\u1ECBch v\u1EDBi b\u1EA1n b\u1EB1ng c\xE1ch n\xE0o?",
  "ask.question.brief_gap_story": "B\u1EA1n m\xF4 t\u1EA3 doanh nghi\u1EC7p c\u1EE7a m\xECnh th\u1EBF n\xE0o trong v\xE0i c\xE2u?",
  "ask.choice.brief_gap_skip": "T\u1EA1m th\u1EDDi b\u1ECF qua",
  "ask.question.business_trade": "Doanh nghi\u1EC7p c\u1EE7a b\u1EA1n thu\u1ED9c lo\u1EA1i n\xE0o?",
  "ask.question.held_hours_unconfirmed": "Ch\u1EC9 m\u1ED9t ngu\u1ED3n ghi gi\u1EDD m\u1EDF c\u1EEDa c\u1EE7a b\u1EA1n, l\xE0 m\u1EDF 24 gi\u1EDD m\u1ED7i ng\xE0y. \u0110\xE2y c\xF3 ph\u1EA3i gi\u1EDD m\u1EDF c\u1EEDa c\u1EE7a b\u1EA1n kh\xF4ng?",
  "ask.question.held_hours_disagree": "C\xE1c ngu\u1ED3n ghi gi\u1EDD m\u1EDF c\u1EEDa kh\xE1c nhau. Site c\u1EE7a b\u1EA1n n\xEAn hi\u1EC3n th\u1ECB gi\u1EDD n\xE0o?",
  "ask.question.held_hours_typed": "H\xE3y g\xF5 gi\u1EDD m\u1EDF c\u1EEDa c\u1EE7a b\u1EA1n, m\u1ED7i nh\xF3m ng\xE0y m\u1ED9t d\xF2ng, v\xED d\u1EE5 Th\u1EE9 Hai \u0111\u1EBFn Th\u1EE9 S\xE1u 9:00 \u0111\u1EBFn 18:00.",
  "ask.choice.held_hours_keep": "Gi\u1EEF gi\u1EDD n\xE0y",
  "ask.choice.held_hours_edit": "Gi\u1EDD n\xE0y sai, t\xF4i s\u1EBD g\xF5 l\u1EA1i",
  "ask.choice.held_hours_leave": "Kh\xF4ng \u0111\u01B0a gi\u1EDD m\u1EDF c\u1EEDa l\xEAn site",
  "ask.choice.business_trade_food": "\u0102n u\u1ED1ng",
  "ask.choice.business_trade_beauty": "L\xE0m \u0111\u1EB9p",
  "ask.choice.business_trade_health": "S\u1EE9c kh\u1ECFe",
  "ask.choice.business_trade_fitness": "Th\u1EC3 thao v\xE0 th\u1EC3 h\xECnh",
  "ask.choice.business_trade_hospitality": "Kh\xE1ch s\u1EA1n ho\u1EB7c l\u01B0u tr\xFA",
  "ask.choice.business_trade_travel": "Du l\u1ECBch",
  "ask.choice.business_trade_professional": "D\u1ECBch v\u1EE5 chuy\xEAn nghi\u1EC7p",
  "ask.choice.business_trade_creative": "S\xE1ng t\u1EA1o",
  "ask.choice.business_trade_education": "Gi\xE1o d\u1EE5c",
  "ask.choice.business_trade_retail": "C\u1EEDa h\xE0ng",
  "ask.choice.business_trade_auto": "\xD4 t\xF4 v\xE0 xe c\u1ED9",
  "ask.choice.business_trade_home": "D\u1ECBch v\u1EE5 t\u1EA1i nh\xE0",
  "ask.choice.business_trade_events": "S\u1EF1 ki\u1EC7n",
  "ask.choice.business_trade_nonprofit": "Phi l\u1EE3i nhu\u1EADn",
  "ask.choice.business_trade_other": "Lo\u1EA1i kh\xE1c",
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
  "say.researchRead": "M\xECnh \u0111\xE3 \u0111\u1ECDc nh\u1EEFng g\xEC b\u1EA1n g\u1EEDi v\u1EC1 doanh nghi\u1EC7p c\u1EE7a b\u1EA1n.",
  "plan.leftOut.reason.no_place_in_design": "M\u1EABu thi\u1EBFt k\u1EBF c\u1EE7a b\u1EA1n kh\xF4ng c\xF3 ch\u1ED7 n\xE0o hi\u1EC3n th\u1ECB m\u1EE5c n\xE0y.",
  "plan.leftOut.reason.no_place_for_whatsapp": "M\u1EABu thi\u1EBFt k\u1EBF n\xE0y kh\xF4ng c\xF3 ch\u1ED7 cho \u0111\u01B0\u1EDDng d\u1EABn WhatsApp, n\xEAn site c\u1EE7a b\u1EA1n kh\xF4ng hi\u1EC3n th\u1ECB n\xF3.",
  "plan.leftOut.reason.no_place_for_other_phones": "M\u1EABu thi\u1EBFt k\u1EBF n\xE0y ch\u1EC9 hi\u1EC3n th\u1ECB m\u1ED9t s\u1ED1 \u0111i\u1EC7n tho\u1EA1i, n\xEAn site c\u1EE7a b\u1EA1n hi\u1EC3n th\u1ECB s\u1ED1 ch\xEDnh.",
  "plan.leftOut.reason.no_place_for_google_rating": "M\u1EABu thi\u1EBFt k\u1EBF n\xE0y kh\xF4ng c\xF3 ch\u1ED7 cho \u0111i\u1EC3m \u0111\xE1nh gi\xE1 Google c\u1EE7a b\u1EA1n, n\xEAn site c\u1EE7a b\u1EA1n kh\xF4ng hi\u1EC3n th\u1ECB n\xF3.",
  "plan.leftOut.reason.hours_unconfirmed": "Ch\u1EC9 m\u1ED9t ngu\u1ED3n ghi gi\u1EDD m\u1EDF c\u1EEDa c\u1EE7a b\u1EA1n l\xE0 m\u1EDF 24 gi\u1EDD m\u1ED7i ng\xE0y, n\xEAn gi\u1EDD m\u1EDF c\u1EEDa ch\u01B0a l\xEAn site cho \u0111\u1EBFn khi b\u1EA1n x\xE1c nh\u1EADn.",
  "plan.leftOut.reason.hours_sources_disagree": "C\xE1c ngu\u1ED3n c\u1EE7a b\u1EA1n ghi gi\u1EDD m\u1EDF c\u1EEDa kh\xE1c nhau, n\xEAn gi\u1EDD m\u1EDF c\u1EEDa ch\u01B0a l\xEAn site cho \u0111\u1EBFn khi b\u1EA1n x\xE1c nh\u1EADn.",
  "plan.leftOut.reason.not_collected": "Kh\xF4ng ngu\u1ED3n n\xE0o ch\xFAng t\xF4i \u0111\u1ECDc c\xF3 th\xF4ng tin n\xE0y, n\xEAn site c\u1EE7a b\u1EA1n ch\u01B0a hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.sources_disagree": "C\xE1c ngu\u1ED3n c\u1EE7a b\u1EA1n ghi kh\xE1c nhau v\u1EC1 m\u1EE5c n\xE0y, n\xEAn m\u1EE5c n\xE0y ch\u01B0a l\xEAn site cho \u0111\u1EBFn khi b\u1EA1n x\xE1c nh\u1EADn.",
  "plan.leftOut.reason.kept_off_site": "M\u1EE5c n\xE0y ch\u01B0a l\xEAn site cho \u0111\u1EBFn khi b\u1EA1n x\xE1c nh\u1EADn.",
  "plan.leftOut.reason.no_fitting_video": "Kh\xF4ng video n\xE0o c\u1EE7a b\u1EA1n v\u1EEBa ch\u1ED7 n\xE0y (\u1EA3nh ngang, kh\xF4ng c\xF3 ch\u1EEF \u0111\xE8 l\xEAn), n\xEAn ch\u1ED7 n\xE0y kh\xF4ng hi\u1EC3n th\u1ECB video.",
  "plan.leftOut.reason.page_nothing_to_show": "B\u1EA1n ch\u01B0a c\xF3 g\xEC \u0111\u1EC3 \u0111\u01B0a l\xEAn c\xE1c trang n\xE0y.",
  "plan.leftOut.reason.page_not_planned": "K\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n kh\xF4ng c\u1EA7n c\xE1c trang n\xE0y.",
  "plan.leftOut.reason.library_section_refused": "Kh\xF4ng hi\u1EC3n th\u1ECB trong ph\u1EA7n \u0111\xE1nh gi\xE1 c\u1EE7a Tracy: {why}.",
  "plan.leftOut.why.not_google_review": "\u0111\xE2y kh\xF4ng ph\u1EA3i \u0111\xE1nh gi\xE1 tr\xEAn Google",
  "plan.leftOut.why.no_text": "\u0111\xE1nh gi\xE1 kh\xF4ng c\xF3 n\u1ED9i dung",
  "plan.leftOut.why.no_star_rating": "\u0111\xE1nh gi\xE1 kh\xF4ng c\xF3 s\u1ED1 sao",
  "plan.leftOut.why.stars_below_four": "ch\u1EC9 hi\u1EC3n th\u1ECB \u0111\xE1nh gi\xE1 b\u1ED1n ho\u1EB7c n\u0103m sao",
  "plan.leftOut.why.stars_not_whole": "s\u1ED1 sao kh\xF4ng ph\u1EA3i s\u1ED1 nguy\xEAn",
  "plan.leftOut.why.reviewer_anonymous": "ng\u01B0\u1EDDi \u0111\xE1nh gi\xE1 \u1EA9n danh tr\xEAn Google",
  "plan.leftOut.why.no_reviewer_name": "\u0111\xE1nh gi\xE1 kh\xF4ng c\xF3 t\xEAn ng\u01B0\u1EDDi vi\u1EBFt",
  "plan.leftOut.why.reviewer_name_too_long": "t\xEAn ng\u01B0\u1EDDi \u0111\xE1nh gi\xE1 d\xE0i h\u01A1n ch\u1ED7 c\u1EE7a ph\u1EA7n n\xE0y, v\xE0 t\xEAn kh\xF4ng bao gi\u1EDD b\u1ECB c\u1EAFt",
  "plan.leftOut.why.review_too_long": "\u0111\xE1nh gi\xE1 d\xE0i h\u01A1n ch\u1ED7 c\u1EE7a ph\u1EA7n n\xE0y, v\xE0 \u0111\xE1nh gi\xE1 kh\xF4ng bao gi\u1EDD b\u1ECB c\u1EAFt",
  "plan.leftOut.what.no_place_for_whatsapp": "WhatsApp",
  "plan.leftOut.what.no_place_for_other_phones": "C\xE1c s\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xE1c",
  "plan.leftOut.what.no_place_for_google_rating": "\u0110i\u1EC3m \u0111\xE1nh gi\xE1 Google",
  "plan.leftOut.what.hours_unconfirmed": "Gi\u1EDD m\u1EDF c\u1EEDa",
  "plan.leftOut.what.hours_sources_disagree": "Gi\u1EDD m\u1EDF c\u1EEDa",
  "plan.leftOut.what.no_fitting_video.one": "{count} ch\u1ED7 \u0111\u1EB7t video",
  "plan.leftOut.what.no_fitting_video.other": "{count} ch\u1ED7 \u0111\u1EB7t video",
  "plan.leftOut.what.pages.one": "Trang {page}",
  "plan.leftOut.what.pages.two": "C\xE1c trang {first} v\xE0 {last}",
  "plan.leftOut.what.pages.three": "C\xE1c trang {first}, {second} v\xE0 {last}",
  "plan.leftOut.what.pages.more": "C\xE1c trang {first}, {second}, {third} v\xE0 {count} trang kh\xE1c",
  "plan.pictures.ownOfValue.one": "{count} trong {total} \u1EA3nh c\u1EE7a b\u1EA1n, t\u1EEB {from}",
  "plan.pictures.ownOfValue.other": "{count} trong {total} \u1EA3nh c\u1EE7a b\u1EA1n, t\u1EEB {from}",
  "plan.assumption.accent_logo_moved.lighter": "M\xE0u logo c\u1EE7a b\u1EA1n \u0111\u01B0\u1EE3c l\xE0m s\xE1ng h\u01A1n \u0111\u1EC3 n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn n\u1ED5i b\u1EADt tr\xEAn m\u1EABu thi\u1EBFt k\u1EBF.",
  "plan.assumption.accent_logo_moved.darker": "M\xE0u logo c\u1EE7a b\u1EA1n \u0111\u01B0\u1EE3c l\xE0m t\u1ED1i h\u01A1n \u0111\u1EC3 n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn n\u1ED5i b\u1EADt tr\xEAn m\u1EABu thi\u1EBFt k\u1EBF.",
  "plan.assumption.accent_logo_kept": "N\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn d\xF9ng m\xE0u logo c\u1EE7a b\u1EA1n.",
  "plan.assumption.accent_no_hue.black": "Logo c\u1EE7a b\u1EA1n kh\xF4ng c\xF3 m\xE0u, n\xEAn n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn c\xF3 m\xE0u \u0111en.",
  "plan.assumption.accent_no_hue.white": "Logo c\u1EE7a b\u1EA1n kh\xF4ng c\xF3 m\xE0u, n\xEAn n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn c\xF3 m\xE0u tr\u1EAFng.",
  "plan.assumption.accent_no_hue.both": "Logo c\u1EE7a b\u1EA1n kh\xF4ng c\xF3 m\xE0u, n\xEAn n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn m\xE0u \u0111en tr\xEAn trang n\u1EC1n s\xE1ng v\xE0 m\xE0u tr\u1EAFng tr\xEAn trang n\u1EC1n t\u1ED1i.",
  "plan.assumption.accent_unreadable.black": "M\xE0u logo c\u1EE7a b\u1EA1n kh\xF3 \u0111\u1ECDc tr\xEAn n\xFAt b\u1EA5m, n\xEAn n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn c\xF3 m\xE0u \u0111en.",
  "plan.assumption.accent_unreadable.white": "M\xE0u logo c\u1EE7a b\u1EA1n kh\xF3 \u0111\u1ECDc tr\xEAn n\xFAt b\u1EA5m, n\xEAn n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn c\xF3 m\xE0u tr\u1EAFng.",
  "plan.assumption.accent_unreadable.both": "M\xE0u logo c\u1EE7a b\u1EA1n kh\xF3 \u0111\u1ECDc tr\xEAn n\xFAt b\u1EA5m, n\xEAn n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn m\xE0u \u0111en tr\xEAn trang n\u1EC1n s\xE1ng v\xE0 m\xE0u tr\u1EAFng tr\xEAn trang n\u1EC1n t\u1ED1i.",
  "plan.assumption.accent_kept_unmeasured": "M\xECnh kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c m\xE0u logo c\u1EE7a b\u1EA1n, n\xEAn n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn gi\u1EEF m\xE0u ch\xEDnh c\u1EE7a m\u1EABu thi\u1EBFt k\u1EBF.",
  "plan.assumption.accent_kept_template": "M\xE0u logo c\u1EE7a b\u1EA1n kh\xF4ng \u0111\u1ECDc r\xF5 tr\xEAn m\u1EABu thi\u1EBFt k\u1EBF n\xE0y, n\xEAn n\xFAt b\u1EA5m v\xE0 \u0111\u01B0\u1EDDng d\u1EABn gi\u1EEF m\xE0u ch\xEDnh c\u1EE7a m\u1EABu thi\u1EBFt k\u1EBF.",
  "plan.edits.count.one": "{count} thay \u0111\u1ED5i",
  "plan.edits.count.other": "{count} thay \u0111\u1ED5i",
  "plan.edits.revert": "Quay v\u1EC1 b\u1EA3n g\u1ED1c",
  "plan.edits.revertAsk.one": "Hu\u1EF7 thay \u0111\u1ED5i c\u1EE7a b\u1EA1n?",
  "plan.edits.revertAsk.other": "Hu\u1EF7 c\u1EA3 {count} thay \u0111\u1ED5i?",
  "plan.edits.keep": "Gi\u1EEF l\u1EA1i",
  "plan.edits.discard": "Hu\u1EF7 t\u1EA5t c\u1EA3",
  "plan.remove": "B\u1ECF {what}",
  "plan.get": "B\u1EA1n nh\u1EADn \u0111\u01B0\u1EE3c",
  "plan.get.lead": "M\u1ED9t site b\u1EB1ng {language} v\u1EDBi {pages}: {names}.",
  "plan.get.pages.one": "{count} trang",
  "plan.get.pages.other": "{count} trang",
  "plan.keyMessages": "\u0110i\u1EC1u site c\u1EE7a b\u1EA1n n\xF3i \u0111\u1EA7u ti\xEAn",
  "plan.keyMessages.where": "Trang {page}: {sections}",
  "plan.keyMessages.nowhere": "Ch\u01B0a c\xF3 ph\u1EA7n n\xE0o n\xEAu \u0111i\u1EC1u n\xE0y.",
  "plan.keyMessage.n": "Th\xF4ng \u0111i\u1EC7p ch\xEDnh {n}",
  "plan.tile.pages": "trang",
  "plan.tile.privacy": "v\xE0 m\u1ED9t trang ch\xEDnh s\xE1ch b\u1EA3o m\u1EADt",
  "plan.tile.services": "d\u1ECBch v\u1EE5",
  "plan.tile.people": "ng\u01B0\u1EDDi",
  "plan.tile.reviews": "\u0111\xE1nh gi\xE1",
  "plan.tile.reviewsOf": "tr\xEAn {count} \u0111\xE1nh gi\xE1",
  "plan.tile.photos": "\u1EA3nh c\u1EE7a b\u1EA1n \u0111\u01B0\u1EE3c d\xF9ng",
  "plan.tile.drawn.one": "kho\u1EA3ng {count} \u1EA3nh n\u1EEFa do Tracy t\u1EA1o",
  "plan.tile.drawn.other": "kho\u1EA3ng {count} \u1EA3nh n\u1EEFa do Tracy t\u1EA1o",
  "plan.look.logoOnLight": "Logo c\u1EE7a b\u1EA1n tr\xEAn n\u1EC1n s\xE1ng",
  "plan.look.logoOnDark": "Logo c\u1EE7a b\u1EA1n tr\xEAn n\u1EC1n t\u1ED1i",
  "plan.reach": "Kh\xE1ch h\xE0ng li\xEAn h\u1EC7 b\u1EA1n b\u1EB1ng c\xE1ch n\xE0o",
  "plan.reach.main": "N\xFAt ch\xEDnh",
  "plan.reach.where": "Hi\u1EC3n th\u1ECB \u1EDF {places}.",
  "plan.reach.place": "Ph\u1EA7n {section} tr\xEAn {pages}",
  "plan.reach.nowhere": "Ch\u01B0a c\xF3 ph\u1EA7n n\xE0o hi\u1EC3n th\u1ECB n\xFAt n\xE0y.",
  "plan.reach.end": "Cu\u1ED1i trang",
  "plan.reach.endLine": "Trang {page}: {section}",
  "plan.reach.footerAll": "\u1EDE ch\xE2n trang c\u1EE7a m\u1ECDi trang.",
  "plan.reach.footerSome": "\u1EDE ch\xE2n trang c\u1EE7a {pages}.",
  "plan.reach.on": "Tr\xEAn {pages}.",
  "plan.pages.every": "M\u1ECDi trang",
  "plan.pages.menu": "Thanh \u0111i\u1EC1u h\u01B0\u1EDBng",
  "plan.pages.header": "Ph\u1EA7n \u0111\u1EA7u trang hi\u1EC3n th\u1ECB {facts}.",
  "plan.pages.footer": "Ch\xE2n trang hi\u1EC3n th\u1ECB {facts}.",
  "plan.pages.privacyLink": "link \u0111\u1EBFn trang ch\xEDnh s\xE1ch b\u1EA3o m\u1EADt",
  "plan.page.keyMessage": "\xDD ch\xEDnh c\u1EE7a trang",
  "plan.page.notes": "Ghi ch\xFA cho ng\u01B0\u1EDDi vi\u1EBFt",
  "plan.page.visitorQuestion": "Kh\xE1ch truy c\u1EADp \u0111\u1EBFn \u0111\u1EC3 t\xECm hi\u1EC3u",
  "plan.tag.end": "Cu\u1ED1i trang",
  "plan.tag.library": "Tracy th\xEAm v\xE0o",
  "plan.standard": "C\xE1c trang ti\xEAu chu\u1EA9n",
  "plan.standard.sum": "Ch\xEDnh s\xE1ch b\u1EA3o m\u1EADt, kh\xF4ng t\xECm th\u1EA5y trang",
  "plan.standard.privacy": "Ch\xEDnh s\xE1ch b\u1EA3o m\u1EADt",
  "plan.standard.privacyFrom": "\u0110\u01B0\u1EE3c vi\u1EBFt t\u1EEB {facts}. C\xF3 link \u1EDF ch\xE2n trang, kh\xF4ng n\u1EB1m trong menu.",
  "plan.standard.notFound": "Kh\xF4ng t\xECm th\u1EA5y trang",
  "plan.standard.notFoundLine": "Cho bi\u1EBFt trang kh\xF4ng t\u1ED3n t\u1EA1i v\xE0 d\u1EABn kh\xE1ch truy c\u1EADp \u0111\u1EBFn {pages}.",
  "plan.writtenAfter": "Ti\xEAu \u0111\u1EC1 v\xE0 n\u1ED9i dung c\u1EE7a t\u1EEBng ph\u1EA7n \u0111\u01B0\u1EE3c vi\u1EBFt sau khi b\u1EA1n duy\u1EC7t, ch\u1EC9 d\u1EF1a tr\xEAn nh\u1EEFng g\xEC c\xF3 trong k\u1EBF ho\u1EA1ch n\xE0y.",
  "plan.fact.offSite": "Kh\xF4ng c\xF3 tr\xEAn site",
  "plan.notOnSite": "Kh\xF4ng c\xF3 tr\xEAn site",
  "plan.notOnSite.group.removed": "B\u1EA1n \u0111\xE3 b\u1ECF",
  "plan.notOnSite.group.no_place": "M\u1EABu thi\u1EBFt k\u1EBF c\u1EE7a b\u1EA1n kh\xF4ng c\xF3 ch\u1ED7 cho m\u1EE5c n\xE0y",
  "plan.notOnSite.group.no_info": "Ch\u01B0a c\xF3 th\xF4ng tin",
  "plan.notOnSite.group.held": "Gi\u1EEF l\u1EA1i cho \u0111\u1EBFn khi b\u1EA1n x\xE1c nh\u1EADn",
  "plan.notOnSite.group.reviews": "\u0110\xE1nh gi\xE1 kh\xF4ng \u0111\u01B0\u1EE3c d\xF9ng",
  "plan.notOnSite.group.pages": "C\xE1c trang c\u1EE7a template ch\u01B0a \u0111\u01B0\u1EE3c d\u1EF1ng",
  "plan.notOnSite.group.people_spots": "Ch\u1ED7 \u0111\u1EB7t \u1EA3nh ng\u01B0\u1EDDi c\xF2n \u0111\u1EC3 tr\u1ED1ng",
  "plan.notOnSite.group.other": "Kh\xE1c",
  "plan.notOnSite.lines.one": "{count} d\xF2ng",
  "plan.notOnSite.lines.other": "{count} d\xF2ng",
  "plan.notOnSite.details.one": "K\xE8m theo \u0111\xF3 l\xE0 {count} chi ti\u1EBFt kh\xF4ng hi\u1EC3n th\u1ECB \u1EDF n\u01A1i n\xE0o kh\xE1c.",
  "plan.notOnSite.details.other": "K\xE8m theo \u0111\xF3 l\xE0 {count} chi ti\u1EBFt kh\xF4ng hi\u1EC3n th\u1ECB \u1EDF n\u01A1i n\xE0o kh\xE1c.",
  "plan.notOnSite.restore": "Kh\xF4i ph\u1EE5c",
  "plan.notOnSite.restoreLabel": "Kh\xF4i ph\u1EE5c {what}",
  "plan.notOnSite.cannotRestore": "\u0110\u1EC3 kh\xF4i ph\u1EE5c m\u1EE5c n\xE0y, h\xE3y nh\u1EDD trong chat.",
  "plan.notOnSite.peopleSpots.one": "{count} ch\u1ED7 \u0111\u1EB7t \u1EA3nh ng\u01B0\u1EDDi",
  "plan.notOnSite.peopleSpots.other": "{count} ch\u1ED7 \u0111\u1EB7t \u1EA3nh ng\u01B0\u1EDDi",
  "plan.notOnSite.peopleSpots.reason": "Tracy kh\xF4ng bao gi\u1EDD t\u1EA1o \u1EA3nh ng\u01B0\u1EDDi, n\xEAn nh\u1EEFng ch\u1ED7 n\xE0y \u0111\u1EC3 tr\u1ED1ng cho \u0111\u1EBFn khi b\u1EA1n th\xEAm \u1EA3nh c\u1EE7a ch\xEDnh m\xECnh.",
  "plan.leftOut.reason.owner_removed": "B\u1EA1n \u0111\xE3 b\u1ECF m\u1EE5c n\xE0y kh\u1ECFi k\u1EBF ho\u1EA1ch.",
  "plan.leftOut.what.videos.one": "{count} \u0111o\u1EA1n video",
  "plan.leftOut.what.videos.other": "{count} \u0111o\u1EA1n video",
  "plan.sources": "T\u1EEB c\xE1c link c\u1EE7a b\u1EA1n \u0111\u1EBFn site",
  "plan.sources.source": "Ngu\u1ED3n",
  "plan.sources.got": "Tracy t\xECm th\u1EA5y g\xEC",
  "plan.sources.shown": "Tr\xEAn site",
  "plan.sources.none": "Kh\xF4ng c\xF3 g\xEC",
  "plan.sources.shownOf": "{shown} tr\xEAn {what}",
  "plan.search": "T\xECm ki\u1EBFm tr\xEAn Google",
  "plan.search.title": "Ti\xEAu \u0111\u1EC1 n\xF3i g\xEC",
  "plan.search.description": "M\xF4 t\u1EA3 n\xF3i g\xEC",
  "plan.search.terms": "T\u1EEB kho\xE1 t\xECm ki\u1EBFm",
  "plan.search.add": "Th\xEAm t\u1EEB kho\xE1 t\xECm ki\u1EBFm",
  "plan.search.addLabel": "T\u1EEB kho\xE1 t\xECm ki\u1EBFm m\u1EDBi cho trang {page}",
  "plan.search.removeTerm": "B\u1ECF t\u1EEB kho\xE1 t\xECm ki\u1EBFm {term}",
  "plan.later": "B\u1EA1n c\xF3 th\u1EC3 g\u1EEDi sau",
  "plan.later.what.later_prices": "B\u1EA3ng gi\xE1 c\u1EE7a b\u1EA1n",
  "plan.later.reason.later_prices": "H\xE3y g\u1EEDi b\u1EA3ng gi\xE1 v\xE0 ch\xFAng c\xF3 th\u1EC3 \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB c\xF9ng v\u1EDBi nh\u1EEFng g\xEC b\u1EA1n cung c\u1EA5p.",
  "plan.later.what.later_services": "Danh s\xE1ch d\u1ECBch v\u1EE5 c\u1EE7a b\u1EA1n",
  "plan.later.reason.later_services": "H\xE3y g\u1EEDi c\xE1c d\u1ECBch v\u1EE5 b\u1EA1n cung c\u1EA5p v\xE0 m\u1ED7i d\u1ECBch v\u1EE5 c\xF3 th\u1EC3 c\xF3 ch\u1ED7 ri\xEAng tr\xEAn site c\u1EE7a b\u1EA1n.",
  "plan.later.what.later_menu": "Th\u1EF1c \u0111\u01A1n c\u1EE7a b\u1EA1n",
  "plan.later.reason.later_menu": "H\xE3y g\u1EEDi th\u1EF1c \u0111\u01A1n v\xE0 c\xE1c m\xF3n c\u1EE7a b\u1EA1n c\xF3 th\u1EC3 \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB tr\xEAn site.",
  "plan.later.what.later_hours": "Gi\u1EDD m\u1EDF c\u1EEDa c\u1EE7a b\u1EA1n",
  "plan.later.reason.later_hours": "H\xE3y x\xE1c nh\u1EADn gi\u1EDD m\u1EDF c\u1EEDa v\xE0 ch\xFAng c\xF3 th\u1EC3 \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB tr\xEAn site.",
  "plan.later.what.later_email": "\u0110\u1ECBa ch\u1EC9 email c\u1EE7a b\u1EA1n",
  "plan.later.reason.later_email": "H\xE3y g\u1EEDi m\u1ED9t \u0111\u1ECBa ch\u1EC9 email \u0111\u1EC3 kh\xE1ch truy c\u1EADp c\xF3 th\u1EC3 vi\u1EBFt cho b\u1EA1n, v\xE0 bi\u1EC3u m\u1EABu c\xF3 th\u1EC3 g\u1EEDi c\xE2u tr\u1EA3 l\u1EDDi \u0111\u1EBFn \u0111\xF3.",
  "plan.later.what.later_booking_link": "Link \u0111\u1EB7t l\u1ECBch c\u1EE7a b\u1EA1n",
  "plan.later.reason.later_booking_link": "H\xE3y g\u1EEDi link \u0111\u1EB7t l\u1ECBch v\xE0 c\xE1c n\xFAt c\u1EE7a b\u1EA1n c\xF3 th\u1EC3 \u0111\u01B0a kh\xE1ch truy c\u1EADp th\u1EB3ng \u0111\u1EBFn \u0111\xF3.",
  "plan.later.what.later_portraits": "\u1EA2nh c\u1EE7a \u0111\u1ED9i ng\u0169",
  "plan.later.reason.later_portraits": "H\xE3y g\u1EEDi \u1EA3nh c\u1EE7a t\u1EEBng ng\u01B0\u1EDDi v\xE0 \u1EA3nh c\xF3 th\u1EC3 \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB b\xEAn c\u1EA1nh t\xEAn c\u1EE7a h\u1ECD.",
  "plan.later.what.later_logo": "File logo c\u1EE7a b\u1EA1n",
  "plan.later.reason.later_logo": "H\xE3y g\u1EEDi file logo v\xE0 n\xF3 c\xF3 th\u1EC3 \u0111\u01B0\u1EE3c d\xF9ng thay cho logo m\xE0 k\u1EBF ho\u1EA1ch \u0111ang t\u1EA1m d\xF9ng.",
  "plan.refused.first_page": "Trang \u0111\u1EA7u ti\xEAn c\u1EE7a site \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i: m\u1ECDi trang kh\xE1c \u0111\u1EC1u d\u1EABn v\u1EC1 trang n\xE0y.",
  "plan.refused.privacy_page": "Trang n\xE0y l\xE0 trang ch\xEDnh s\xE1ch b\u1EA3o m\u1EADt c\u1EE7a b\u1EA1n, n\xEAn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "plan.refused.main_block": "Ph\u1EA7n n\xE0y l\xE0 ph\u1EA7n ch\xEDnh c\u1EE7a trang, n\xEAn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i ch\u1EEBng n\xE0o trang c\xF2n t\u1ED3n t\u1EA1i.",
  "plan.refused.site_chrome": "Ph\u1EA7n n\xE0y d\xF9ng chung cho m\u1ECDi trang c\u1EE7a site, n\xEAn kh\xF4ng th\u1EC3 ch\u1EC9 b\u1ECF kh\u1ECFi m\u1ED9t trang.",
  "plan.refused.end_action": "Trang c\u1EE7a b\u1EA1n k\u1EBFt th\xFAc b\u1EB1ng ph\u1EA7n n\xE0y, n\xEAn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "plan.refused.main_button": "N\xFAt ch\xEDnh c\u1EE7a b\u1EA1n \u0111ang d\xF9ng m\u1EE5c n\xE0y, n\xEAn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "plan.refused.too_few_items": "Ph\u1EA7n n\xE0y c\u1EA7n \xEDt nh\u1EA5t {min} m\u1EE5c nh\u01B0 v\u1EADy, n\xEAn m\u1EE5c n\xE0y \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "plan.refused.block_empty": "\u0110\xE2y l\xE0 m\u1EE5c cu\u1ED1i c\xF9ng m\xE0 ph\u1EA7n n\xE0y hi\u1EC3n th\u1ECB. H\xE3y b\u1ECF c\u1EA3 ph\u1EA7n thay v\xEC b\u1ECF ri\xEAng m\u1EE5c n\xE0y.",
  "plan.refused.not_in_footer": "M\u1EE5c n\xE0y kh\xF4ng \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB \u1EDF ch\xE2n trang c\u1EE7a c\xE1c trang.",
  "plan.refused.not_a_channel": "Ch\u1EC9 c\xF3 th\u1EC3 b\u1ECF kh\u1ECFi ch\xE2n trang m\u1ED9t c\xE1ch li\xEAn h\u1EC7 v\u1EDBi b\u1EA1n.",
  "plan.refused.not_an_item": "Ch\u1EC9 m\u1ED9t d\u1ECBch v\u1EE5, m\u1ED9t ng\u01B0\u1EDDi, m\u1ED9t \u1EA3nh ho\u1EB7c m\u1ED9t \u0111\xE1nh gi\xE1 m\u1EDBi c\xF3 th\u1EC3 b\u1ECF kh\u1ECFi m\u1ED9t ph\u1EA7n.",
  "plan.refused.needed_by_privacy_page": "Trang ch\xEDnh s\xE1ch b\u1EA3o m\u1EADt c\u1EE7a b\u1EA1n c\u1EA7n m\u1EE5c n\xE0y, n\xEAn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "plan.refused.needed_by_end_action": "Ph\u1EA7n cu\u1ED1i trang d\u1EABn \u0111\u1EBFn m\u1EE5c n\xE0y, n\xEAn \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "plan.refused.not_found": "M\u1EE5c n\xE0y kh\xF4ng c\xF2n trong k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n.",
  "plan.refused.removal_unknown": "\u1EDE \u0111\xE2y kh\xF4ng c\xF3 g\xEC \u0111\u1EC3 kh\xF4i ph\u1EE5c.",
  "plan.refused.restore_target_gone": "M\u1EE5c n\xE0y s\u1EBD quay l\u1EA1i v\xE0o m\u1ED9t th\u1EE9 b\u1EA1n \u0111\xE3 b\u1ECF sau \u0111\xF3. H\xE3y kh\xF4i ph\u1EE5c th\u1EE9 \u0111\xF3 tr\u01B0\u1EDBc.",
  "plan.refused.search_terms_empty": "M\u1ED7i trang gi\u1EEF l\u1EA1i \xEDt nh\u1EA5t m\u1ED9t t\u1EEB kho\xE1 t\xECm ki\u1EBFm.",
  "plan.refused.search_term_too_long": "M\u1ED9t t\u1EEB kho\xE1 t\xECm ki\u1EBFm d\xE0i t\u1ED1i \u0111a 60 k\xFD t\u1EF1.",
  "plan.refused.search_term_twice": "T\u1EEB kho\xE1 t\xECm ki\u1EBFm n\xE0y \u0111\xE3 c\xF3 tr\xEAn trang.",
  "plan.refused.too_many_search_terms": "M\u1ED7i trang c\xF3 t\u1ED1i \u0111a 10 t\u1EEB kho\xE1 t\xECm ki\u1EBFm.",
  "plan.refused.too_many_items": "Ph\u1EA7n n\xE0y hi\u1EC3n th\u1ECB t\u1ED1i \u0111a {max} m\u1EE5c nh\u01B0 v\u1EADy, n\xEAn thay \u0111\u1ED5i n\xE0y kh\xF4ng v\u1EEBa.",
  "plan.refused.wrong_item_kind": "Ph\u1EA7n n\xE0y kh\xF4ng th\u1EC3 hi\u1EC3n th\u1ECB m\u1EE5c \u0111\xF3.",
  "plan.refused.library_rule": "Ph\u1EA7n n\xE0y kh\xF4ng hi\u1EC3n th\u1ECB m\u1EE5c \u0111\xF3.",
  "plan.refused.invented_item": "Thay \u0111\u1ED5i n\xE0y nh\u1EAFc \u0111\u1EBFn m\u1ED9t th\u1EE9 kh\xF4ng thu\u1ED9c th\xF4ng tin doanh nghi\u1EC7p c\u1EE7a b\u1EA1n.",
  "plan.refused.fact_without_field": "Ph\u1EA7n n\xE0y kh\xF4ng c\xF3 ch\u1ED7 cho th\xF4ng tin \u0111\xF3.",
  "plan.refused.main_block_missing": "Thay \u0111\u1ED5i n\xE0y s\u1EBD b\u1ECF ph\u1EA7n ch\xEDnh kh\u1ECFi trang c\u1EE7a n\xF3.",
  "plan.refused.unknown_block": "Ph\u1EA7n n\xE0y kh\xF4ng thu\u1ED9c m\u1EABu giao di\u1EC7n c\u1EE7a b\u1EA1n.",
  "plan.refused.withheld_shown": "Thay \u0111\u1ED5i n\xE0y s\u1EBD hi\u1EC3n th\u1ECB m\u1ED9t th\u1EE9 b\u1EA1n mu\u1ED1n gi\u1EEF ngo\xE0i site.",
  "plan.refused.edit_invalid": "Kh\xF4ng th\u1EC3 l\u01B0u thay \u0111\u1ED5i n\xE0y: k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n s\u1EBD b\u1ECB thi\u1EBFu.",
  "plan.refused.site_name_too_long": "T\xEAn n\xE0y qu\xE1 d\xE0i cho site c\u1EE7a b\u1EA1n.",
  "plan.refused.site_name_invalid": "Kh\xF4ng th\u1EC3 d\xF9ng t\xEAn n\xE0y cho site c\u1EE7a b\u1EA1n.",
  "plan.refused.value_over_limit": "Gi\xE1 tr\u1ECB n\xE0y qu\xE1 d\xE0i cho ph\u1EA7n hi\u1EC3n th\u1ECB n\xF3.",
  "plan.refused.data_unaccounted": "Sau thay \u0111\u1ED5i n\xE0y, m\u1ED9t th\xF4ng tin v\u1EC1 doanh nghi\u1EC7p c\u1EE7a b\u1EA1n s\u1EBD kh\xF4ng \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB \u1EDF \u0111\xE2u c\u1EA3.",
  "plan.refused.picture_count": "Kh\xF4ng th\u1EC3 \u0111\u1EBFm l\u1EA1i \u1EA3nh c\u1EE7a b\u1EA1n sau thay \u0111\u1ED5i n\xE0y, n\xEAn thay \u0111\u1ED5i ch\u01B0a \u0111\u01B0\u1EE3c l\u01B0u.",
  "plan.refused.plan_fault": "Thay \u0111\u1ED5i n\xE0y ch\u01B0a \u0111\u01B0\u1EE3c l\u01B0u: k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n \u0111ang c\xF3 m\u1ED9t l\u1ED7i ri\xEAng m\xE0 Tracy c\u1EA7n s\u1EEDa tr\u01B0\u1EDBc. B\u1EA1n c\xF3 th\u1EC3 y\xEAu c\u1EA7u thay \u0111\u1ED5i n\xE0y trong khung chat.",
  "plan.refused.template_change": "K\u1EBF ho\u1EA1ch n\xE0y \u0111\u01B0\u1EE3c l\u1EADp cho m\u1EABu giao di\u1EC7n b\u1EA1n \u0111\xE3 ch\u1ECDn, v\xE0 hi\u1EC7n ch\u01B0a th\u1EC3 chuy\u1EC3n sang m\u1EABu kh\xE1c.",
  "plan.heldBack.field.prices": "Gi\xE1",
  "plan.heldBack.field.offerings": "D\u1ECBch v\u1EE5",
  "plan.heldBack.field.menu": "Th\u1EF1c \u0111\u01A1n",
  "plan.heldBack.field.menu-link": "Li\xEAn k\u1EBFt th\u1EF1c \u0111\u01A1n",
  "plan.heldBack.field.name": "T\xEAn doanh nghi\u1EC7p",
  "plan.heldBack.field.team": "\u0110\u1ED9i ng\u0169",
  "plan.heldBack.field.socials": "Trang m\u1EA1ng x\xE3 h\u1ED9i",
  "plan.heldBack.field.photos": "\u1EA2nh",
  "plan.heldBack.field.posts": "B\xE0i \u0111\u0103ng",
  "plan.heldBack.field.email": "\u0110\u1ECBa ch\u1EC9 email",
  "plan.heldBack.field.phone": "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i",
  "plan.heldBack.field.address": "\u0110\u1ECBa ch\u1EC9",
  "plan.heldBack.field.about": "Gi\u1EDBi thi\u1EC7u doanh nghi\u1EC7p",
  "plan.heldBack.field.reviews": "\u0110\xE1nh gi\xE1",
  "plan.heldBack.field.booking": "Li\xEAn k\u1EBFt \u0111\u1EB7t ch\u1ED7",
  "plan.heldBack.field.offering-descriptions": "M\xF4 t\u1EA3 d\u1ECBch v\u1EE5",
  "plan.heldBack.field.story": "C\xE2u chuy\u1EC7n c\u1EE7a b\u1EA1n",
  "plan.refused.item_field_fact": "Ph\u1EA7n n\xE0y hi\u1EC3n th\u1ECB c\u1EA3 m\u1ED9t m\u1EE5c, kh\xF4ng ph\u1EA3i m\u1ED9t chi ti\u1EBFt c\u1EE7a m\u1EE5c \u0111\xF3.",
  "plan.refused.trade_terms": "Ph\u1EA7n n\xE0y \u0111\u01B0\u1EE3c vi\u1EBFt d\u1EF1a tr\xEAn c\xE1ch ng\xE0nh c\u1EE7a b\u1EA1n th\u01B0\u1EDDng l\xE0m, n\xEAn kh\xF4ng th\u1EC3 n\xEAu con s\u1ED1, gi\xE1, l\u1ECBch hay l\u1EDDi cam k\u1EBFt.",
  "plan.refused.trade_fact_missing": "Ph\u1EA7n n\xE0y gi\u1EA3i th\xEDch ng\xE0nh c\u1EE7a b\u1EA1n d\u1EF1a tr\xEAn m\u1ED9t th\xF4ng tin v\u1EC1 doanh nghi\u1EC7p, n\xEAn th\xF4ng tin \u0111\xF3 \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.",
  "plan.refused.item_repeated_on_page": "Thay \u0111\u1ED5i n\xE0y s\u1EBD hi\u1EC3n th\u1ECB c\xF9ng m\u1ED9t th\u1EE9 hai l\u1EA7n tr\xEAn m\u1ED9t trang.",
  "plan.refused.form_without_destination": "Bi\u1EC3u m\u1EABu c\u1EA7n m\u1ED9t \u0111\u1ECBa ch\u1EC9 email \u0111\u1EC3 nh\u1EADn tin nh\u1EAFn.",
  "plan.refused.map_without_address": "B\u1EA3n \u0111\u1ED3 c\u1EA7n \u0111\u1ECBa ch\u1EC9 c\u1EE7a b\u1EA1n.",
  "plan.leftOut.reason.whatsapp_unconfirmed": "Kh\xF4ng ngu\u1ED3n n\xE0o cho bi\u1EBFt s\u1ED1 n\xE0y nh\u1EADn tin nh\u1EAFn WhatsApp, n\xEAn trang c\u1EE7a b\u1EA1n kh\xF4ng li\xEAn k\u1EBFt t\u1EDBi WhatsApp.",
  "plan.leftOut.reason.contact_value_missing": "B\u1EA1n \u0111\xE3 ch\u1ECDn c\xE1ch kh\xE1ch li\xEAn h\u1EC7 nh\u01B0ng ch\u01B0a cho gi\xE1 tr\u1ECB, n\xEAn ch\u01B0a hi\u1EC3n th\u1ECB g\xEC. H\xE3y th\xEAm n\xF3 tr\xEAn k\u1EBF ho\u1EA1ch.",
  "plan.leftOut.reason.fact_longer_than_every_place": "N\u1ED9i dung n\xE0y d\xE0i h\u01A1n m\u1ECDi ch\u1ED7 thi\u1EBFt k\u1EBF c\u1EE7a b\u1EA1n c\xF3 cho n\xF3, v\xE0 Tracy kh\xF4ng bao gi\u1EDD c\u1EAFt ng\u1EAFn.",
  "plan.leftOut.reason.no_room_left": "M\u1ECDi ch\u1ED7 thi\u1EBFt k\u1EBF c\u1EE7a b\u1EA1n c\xF3 cho n\u1ED9i dung n\xE0y \u0111\u1EC1u \u0111\xE3 \u0111\u01B0\u1EE3c d\xF9ng.",
  "plan.leftOut.reason.no_room_left.item": "Kh\xF4ng c\xF2n ch\u1ED7 cho th\xEAm nh\u1EEFng m\u1EE5c n\xE0y.",
  "plan.leftOut.reason.fewer_than_section_needs": "M\u1ED7i ph\u1EA7n cho nh\u1EEFng m\u1EE5c n\xE0y c\u1EA7n \xEDt nh\u1EA5t {min}. Tracy kh\xF4ng bao gi\u1EDD t\u1EF1 b\u1ECBa th\xEAm \u0111\u1EC3 l\u1EA5p ph\u1EA7n \u0111\xF3.",
  "plan.leftOut.reason.section_below_minimum": "N\xF3 n\u1EB1m trong m\u1ED9t ph\u1EA7n c\u1EA7n \xEDt nh\u1EA5t {min} m\u1EE5c nh\u01B0 v\u1EADy, v\xE0 kh\xF4ng c\xF2n \u0111\u1EE7 m\u1EE5c cho ph\u1EA7n \u0111\xF3, n\xEAn n\xF3 kh\xF4ng \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.one": "\u1EA2nh n\xE0y \u0111\xE3 hi\u1EC7n trong m\u1ED9t th\u01B0 vi\u1EC7n \u1EA3nh \u1EDF trang kh\xE1c, v\xE0 m\u1ED7i \u1EA3nh ch\u1EC9 hi\u1EC7n m\u1ED9t l\u1EA7n tr\xEAn trang c\u1EE7a b\u1EA1n, n\xEAn th\u01B0 vi\u1EC7n n\xE0y hi\u1EC7n \xEDt h\u01A1n m\u1ED9t \u1EA3nh.",
  "plan.leftOut.reason.gallery_photo_shown_elsewhere.other": "{count} \u1EA3nh n\xE0y \u0111\xE3 hi\u1EC7n trong m\u1ED9t th\u01B0 vi\u1EC7n \u1EA3nh \u1EDF trang kh\xE1c, v\xE0 m\u1ED7i \u1EA3nh ch\u1EC9 hi\u1EC7n m\u1ED9t l\u1EA7n tr\xEAn trang c\u1EE7a b\u1EA1n, n\xEAn th\u01B0 vi\u1EC7n n\xE0y hi\u1EC7n \xEDt h\u01A1n {count} \u1EA3nh.",
  "plan.leftOut.reason.data_over_limit": "N\u1ED9i dung n\xE0y d\xE0i h\u01A1n ph\u1EA7n \u0111\xF3 c\xF3 th\u1EC3 hi\u1EC3n th\u1ECB, n\xEAn n\xF3 kh\xF4ng \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB \u1EDF \u0111\xF3.",
  "plan.leftOut.reason.value_over_limit": "N\u1ED9i dung n\xE0y d\xE0i h\u01A1n ph\u1EA7n \u0111\xF3 c\xF3 th\u1EC3 hi\u1EC3n th\u1ECB, n\xEAn n\xF3 kh\xF4ng \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.row_beyond_stored_places": "Ph\u1EA7n hi\u1EC3n th\u1ECB nh\u1EEFng d\xF2ng n\xE0y c\xF3 \xEDt ch\u1ED7 h\u01A1n s\u1ED1 d\xF2ng b\u1EA1n c\xF3.",
  "plan.leftOut.reason.row_over_max": "Ph\u1EA7n hi\u1EC3n th\u1ECB nh\u1EEFng d\xF2ng n\xE0y c\xF3 \xEDt ch\u1ED7 h\u01A1n s\u1ED1 d\xF2ng b\u1EA1n c\xF3.",
  "plan.leftOut.reason.row_field_undeclared": "Ph\u1EA7n \u0111\xF3 ch\u1EC9 hi\u1EC3n th\u1ECB m\u1ED9t ph\u1EA7n c\u1EE7a d\xF2ng n\xE0y.",
  "plan.leftOut.reason.row_parts_over_fields": "D\xF2ng n\xE0y c\xF3 nhi\u1EC1u ph\u1EA7n h\u01A1n s\u1ED1 ch\u1ED7 c\u1EE7a ph\u1EA7n \u0111\xF3, n\xEAn n\xF3 kh\xF4ng \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.row_value_over_limit": "D\xF2ng n\xE0y d\xE0i h\u01A1n ph\u1EA7n \u0111\xF3 c\xF3 th\u1EC3 hi\u1EC3n th\u1ECB, n\xEAn n\xF3 kh\xF4ng \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.row_parts_order": "Gi\u1EDD c\u1EE7a d\xF2ng n\xE0y \u0111\u1EE9ng tr\u01B0\u1EDBc ng\xE0y, n\xEAn n\xF3 kh\xF4ng \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.row_no_list": "Kh\xF4ng ph\u1EA7n n\xE0o c\u1EE7a m\u1EABu hi\u1EC3n th\u1ECB nh\u1EEFng d\xF2ng nh\u01B0 th\u1EBF n\xE0y.",
  "plan.leftOut.reason.social_link_shortened": "\u0110\xE2y l\xE0 li\xEAn k\u1EBFt r\xFAt g\u1ECDn, n\xEAn kh\xF4ng bi\u1EBFt n\xF3 d\u1EABn t\u1EDBi m\u1EA1ng x\xE3 h\u1ED9i n\xE0o.",
  "plan.leftOut.reason.social_network_unknown": "Li\xEAn k\u1EBFt n\xE0y kh\xF4ng thu\u1ED9c m\u1EA1ng x\xE3 h\u1ED9i m\xE0 ph\u1EA7n \u0111\xF3 hi\u1EC3n th\u1ECB \u0111\u01B0\u1EE3c.",
  "plan.leftOut.reason.social_handle_without_network": "T\xEAn t\xE0i kho\u1EA3n n\xE0y kh\xF4ng cho bi\u1EBFt n\xF3 thu\u1ED9c m\u1EA1ng n\xE0o.",
  "plan.leftOut.reason.social_link_not_web": "\u0110\xE2y kh\xF4ng ph\u1EA3i li\xEAn k\u1EBFt web.",
  "plan.leftOut.reason.no_social_link": "Kh\xF4ng c\xF3 li\xEAn k\u1EBFt n\xE0o \u0111\u1EC3 hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.social_network_repeated": "M\u1ED9t li\xEAn k\u1EBFt kh\xE1c t\u1EDBi c\xF9ng m\u1EA1ng \u0111\xF3 \u0111\xE3 \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB.",
  "plan.leftOut.reason.social_link_over_rows": "Ph\u1EA7n hi\u1EC3n th\u1ECB nh\u1EEFng d\xF2ng n\xE0y c\xF3 \xEDt ch\u1ED7 h\u01A1n s\u1ED1 d\xF2ng b\u1EA1n c\xF3.",
  "plan.leftOut.reason.page_removed": "B\u1EA1n \u0111\xE3 y\xEAu c\u1EA7u b\u1ECF trang n\xE0y.",
  "plan.leftOut.reason.no_longer_in_plan": "N\xF3 kh\xF4ng thu\u1ED9c k\u1EBF ho\u1EA1ch c\u1EE7a b\u1EA1n.",
  "plan.leftOut.reason.requested_off": "B\u1EA1n \u0111\xE3 y\xEAu c\u1EA7u b\u1ECF m\u1EE5c n\xE0y kh\u1ECFi k\u1EBF ho\u1EA1ch.",
  "plan.leftOut.reason.removed_page_data": "N\xF3 ch\u1EC9 c\xF3 tr\xEAn m\u1ED9t trang b\u1EA1n \u0111\xE3 y\xEAu c\u1EA7u b\u1ECF."
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
var BUILD_DESCRIPTION = 'tracy_build: the build chat engine. action research {links?, description?, name?, city?} first (an owner with no link: ask the business name and the city it is in, then pass name and city, with their words in description); templates; plan after the owner chose a template; plan {request} once a plan exists, with what the owner wants changed in their own words; plan {restart: true} ONLY when the owner clearly asks to start the plan over; edit {changes:[{field,value}]} for one simple change; build ONLY after the owner pressed Approve on the plan review, to create the site and build it from that plan (call it again only when the owner asks how a build that said building is going); status to keep waiting when a result says running. Pass ask and review to ask_user_question exactly as given. Each next in a result is private guidance: never repeat it to the owner. A colour change is edit with changes:[{field:"look.accent", value:"#RRGGBB"}], the field name exact and the value a hex colour you choose. stopped: say its sentence and stop; when it says rerun, ask no question about it, and call the tool once more with exactly the arguments in its again, never with action status, only after the owner sends "Please try again.". unchanged: say its sentence; the plan did not change. Every call names in language the language the owner writes in, as a two letter code; say every sentence a result gives in that language. Never say the site is built until a build result says built. start-over ONLY when the owner clearly asks to start the whole build over with a new conversation (not only the plan): first without confirm, then with confirm true once the owner agreed.';
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
    city: {
      type: "string",
      description: "For research with no link: the city or town the business is in, as the owner gave it."
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
var stopped = (said = void 0, card = true) => ({
  stopped: true,
  say: ownerSay(said),
  ...card ? { next: CARD_SAYS_WHY } : {}
});
var switchedOff = () => ({ stopped: true, say: BUILD_CHAT_OFF_SAY });
var tooLargeOf = (say = BODY_TOO_LARGE_SAY) => ({
  refused: true,
  say,
  next: "Say the sentence in say, then wait for the owner."
});
var isSwitchedOff = (res) => res?.status === 403 && res.body?.code === "BUILD_CHAT_OFF";
var isPollFault = (res) => res === null || res.status >= 500;
var CARD_SAYS_WHY = 'The chat shows the owner a card under your message that says why it stopped and offers the next step. Do not say why, do not say when to try again and do not repeat the sentence in say: say one short line of at most six words, such as "I had to pause here.", and stop.';
var RERUN_GUIDANCE = `${CARD_SAYS_WHY} Do not ask a question about it. If the owner then sends "${RETRY_MESSAGE}", call tracy_build once more with exactly the arguments in again, never with action status; a result of that call says stopped again only if it failed again.`;
var LINK_GAP_NEXT = "links says what was read from each link the owner gave. In one short sentence, in the language the owner writes in, tell the owner which link could not be read or gave nothing, by its name. Never say a code.";
var linkGapOf = (links) => Array.isArray(links) && links.some(
  (l) => l?.state === "failed" || l?.state === "read" && (!l.facts && !l.pictures || !l.pictures && l.picturesLost > 0)
);
var ANSWERS_ARRIVE_GUIDANCE = "The owner's answers reach tracy_build by themselves. Never call research again to pass an answer, and never put an answer into description.";
var PAUSED_NEXT = `${CARD_SAYS_WHY} Ask no question, and do not call tracy_build again before retryAt. When the owner sends "${RETRY_MESSAGE}" after retryAt, call tracy_build once more with exactly the arguments in again.`;
var PAUSED_AGAIN_NEXT = "Nothing was started: the pause is not over yet. Do not repeat the earlier sentence about the pause. Answer what the owner just wrote in one short sentence, and say once that you can continue after minutesLeft minutes. Do not call tracy_build again before retryAt.";
var NEEDS_NAME_NEXT = "Research needs the business name first. In one short message in the owner's language, ask for the name of their business and the city or town it is in. Then call tracy_build with action research, no links, name and city as the owner gave them, and their words as description. Do not say anything failed.";
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
    const city = text(args.city);
    return {
      action: "research",
      ...links.length ? { links: links.slice(0, LINKS_MAX) } : {},
      ...description !== "" ? { description } : {},
      ...name2 !== "" ? { name: name2 } : {},
      ...city !== "" ? { city } : {}
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
    return (answer?.stopped === true || answer?.paused === true) && answer.rerun === true && startArgsOf(answer.again) ? answer.again : null;
  } catch {
    return null;
  }
}
var stoppedStateOf = (state, events = []) => {
  const reason = typeof state?.reason === "string" ? { reason: state.reason } : {};
  const card = stopCardOf({ engine: { state: "stopped", step: state?.step, rerun: state?.rerun, ...reason } }) !== null;
  if (state?.rerun !== true) return { ...stopped(state?.say, card), ...reason };
  const again = rerunArgsOf(events, state.step);
  const retryAt = typeof state.retryAt === "string" ? state.retryAt : null;
  return {
    ...stopped(state.say, false),
    ...typeof state.step === "string" ? { step: state.step } : {},
    rerun: true,
    ...again ? { again } : {},
    ...retryAt ? { retryAt } : {},
    ...reason,
    next: RERUN_GUIDANCE
  };
};
var pausedWithAgain = (answer, args) => {
  const again = answer?.paused === true ? startArgsOf(args) : null;
  return again ? { ...answer, rerun: true, again } : answer;
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
    if (state?.state === "needs") return { needs: ["name", "city"], next: NEEDS_NAME_NEXT };
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
      const name2 = text(args.name);
      const city = text(args.city);
      if (links.length === 0 && description === "" && name2 === "")
        return {
          refused: true,
          next: "Call tracy_build with action research and the owner's links, or with no link the business name and city the owner gave."
        };
      request = [
        "POST",
        "/research",
        {
          links,
          ...description !== "" ? { description } : {},
          ...name2 !== "" ? { name: name2 } : {},
          ...city !== "" ? { city } : {}
        }
      ];
    } else if (action === "plan") {
      if (typeof args.request === "string" && [...args.request.trim()].length > REQUEST_MAX_LENGTH)
        return {
          refused: true,
          say: REQUEST_TOO_LONG_SAY,
          next: "Say the sentence in say, then wait for the owner to write a shorter request."
        };
      const asked = text(args.request);
      const language = spoken.get(sessionId) ?? chatLanguageFor(sessionId);
      request = [
        "POST",
        "/compose",
        {
          ...asked !== "" ? { request: asked } : {},
          ...args.restart === true ? { restart: true } : {},
          ...language ? { language } : {}
        }
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
      return pausedWithAgain(
        {
          paused: true,
          retryAt: new Date(until).toISOString(),
          minutesLeft: Math.max(1, Math.ceil((until - now()) / 6e4)),
          next: PAUSED_AGAIN_NEXT
        },
        args
      );
    const res = await door(sessionId, assertion, request[0], request[1], request[2]);
    if (res === null) return stopped();
    if (res.status === 429) {
      const at = Date.parse(res.body?.retryAt ?? "");
      if (Number.isFinite(at)) pausedUntil.set(sessionId, at);
    }
    if (action === "start-over") return startOverAnswerOf(res, ownerSay);
    if (res.status < 200 || res.status >= 300) return pausedWithAgain(refusal(res), args);
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
