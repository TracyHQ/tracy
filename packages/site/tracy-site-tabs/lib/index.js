// src/host/index.ts
import { randomUUID } from "node:crypto";
import { readFileSync as readFileSync2 } from "node:fs";

// ../../core/tracy-core/src/chat-wait/index.mjs
var KEY = Symbol.for("tracy.chat-wait");
function registry() {
  const g = (
    /** @type {Record<symbol, Map<string, Wait> | undefined>} */
    /** @type {unknown} */
    globalThis
  );
  let map = g[KEY];
  if (!(map instanceof Map)) {
    map = /* @__PURE__ */ new Map();
    g[KEY] = map;
  }
  return map;
}
function beginWait(sessionId, kind, now = Date.now()) {
  const wait = { kind, since: now };
  registry().set(sessionId, wait);
  return () => {
    if (registry().get(sessionId) === wait) registry().delete(sessionId);
  };
}
async function whileWaiting(sessionId, kind, promise) {
  if (typeof sessionId !== "string") return promise;
  const end = beginWait(sessionId, kind);
  try {
    return await promise;
  } finally {
    end();
  }
}

// src/host/http.ts
var MAX_BODY = 64 * 1024;
var BodyTooLarge = class extends Error {
};
function writeJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (tooLarge) return;
      if (size > MAX_BODY) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(new BodyTooLarge());
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (text === "") {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text);
        resolve(
          typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {}
        );
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

// src/host/moment.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";

// ../../tools/tracy-subprocess-docker/src/route.mjs
var LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/;
function trimRoot(root) {
  const trimmed = root.replace(/\/+$/, "");
  if (trimmed === "") throw new Error("subprocess-docker: sitesRoot must not be the filesystem root");
  return trimmed;
}
function resolveSitesRoot(config, env = process.env) {
  const root = config?.sitesRoot ?? env.TRACY_SITES_ROOT ?? "/site";
  if (typeof root !== "string" || root.trim() === "" || !root.startsWith("/")) {
    throw new Error(`subprocess-docker: sitesRoot must be an absolute path, got ${JSON.stringify(root)}`);
  }
  return root;
}
function siteOf(cwd, sitesRoot) {
  const root = trimRoot(sitesRoot);
  if (!cwd.startsWith(`${root}/`)) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} is outside ${root} \u2014 nothing runs on the harness host`
    );
  }
  const rest = cwd.slice(root.length + 1);
  const segments = rest.split("/");
  const label = segments[0];
  if (!LABEL.test(label)) throw new Error(`subprocess-docker: ${JSON.stringify(label)} is not a site label`);
  if (segments.includes("..")) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} is not a site path \u2014 a ".." segment leaves the site folder`
    );
  }
  return { label, relative: rest.slice(label.length).replace(/^\/+/, "") };
}

// ../../core/tracy-core/src/language/index.mjs
var HAN = new RegExp("\\p{Script=Han}+", "gu");
var HANGUL = new RegExp("\\p{Script=Hangul}+", "gu");
var CYRILLIC_WORD = new RegExp("\\p{Script=Cyrillic}+", "gu");
var EN_WORDS = new Set(
  "the this that these those a an to of in on at for with and or but is are was be it its make change changes please should what which why how can could would do does not no yes keep want still from into here there instead i we you my our your me just only go answer nothing all ask add remove replace use set put move text button title heading label image picture color colour font size bigger smaller larger more less same one two say says read reads show".split(" ")
);
var NL_WORDS = new Set(
  "wat mijn hoeveel staan hoofdmenu het deze dit geen graag kunt kan voor zijn op hoe waarom welke pagina vandaag heb heeft naar nog ook wel niet".split(" ")
);
var OTHER_LATIN_WORDS = new Set(
  // Norwegian, Danish, Swedish
  "ikke inte jeg jag og och til till med som att hva vad hvordan hur vil vill gerne du det ich nicht und kannst mit auf zu das ein eine bitte tu le la une est pour avec sur peux voudrais du que qui el una para con por quiero puedes pode quero uma il di nel puoi vorrei mio".split(" ")
);

// ../../core/tracy-core/src/mention/index.mjs
var PAGE_RECORD = /^(?:page|article) "/;
var RECORD_PATH = /\s›\s/;
var CHIP_EXCERPT = 40;
var TAG_ONLY = /^<\/?[a-z][\w-]*[^>]*>$/i;
var STORAGE_ID = /^(?=.*\d)(?:[0-9A-HJKMNP-TV-Z]{20,26}|[0-9a-f]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
function storageId(name2) {
  const cut = name2.endsWith("\u2026");
  const parts = name2.replace(/…$/u, "").replace(/\.[a-z0-9]{2,5}$/i, "").split(".");
  return parts.length > 0 && parts.every(
    (part, i) => STORAGE_ID.test(part) || cut && i === parts.length - 1 && STORAGE_ID_HEAD.test(part)
  );
}
var STORAGE_ID_HEAD = /^(?=.*\d)(?:[0-9A-HJKMNP-TV-Z]{6,25}|[0-9a-f]{6,}|[0-9a-f]{8}-[0-9a-f-]{1,27})$/i;
function chipLabel(element, { many = false } = {}) {
  const name2 = typeof element.name === "string" ? element.name.replace(/\s+/g, " ").trim() : "";
  const usable = name2 !== "" && !TAG_ONLY.test(name2) && !storageId(name2) && !RECORD_PATH.test(name2);
  const own = typeof element.label === "string" ? element.label.replace(/\s+/g, " ").trim() : "";
  if (own !== "" && (PAGE_RECORD.test(name2) || RECORD_PATH.test(name2)) && !TAG_ONLY.test(own) && !RECORD_PATH.test(own) && !storageId(own.replace(/^"|"$/g, "")))
    return own;
  if (!many && element.status === "resolved" && element.incomplete !== true && usable) return name2;
  const text = typeof element.text === "string" ? element.text.replace(/\s+/g, " ").trim() : "";
  if (text !== "") {
    const chars = Array.from(text);
    return `"${chars.length > CHIP_EXCERPT ? `${chars.slice(0, CHIP_EXCERPT - 1).join("")}\u2026` : text}"`;
  }
  return usable ? name2 : "";
}
var UNNAMED_ELEMENT = "[element]";
var UNNAMED_PAGE = "[page]";
var BLOCK = /```tracy-(element|page)\s*(<(?:mentioned-element|page)\b[^>]*>?)([\s\S]*?)(?:<\/(?:mentioned-element|page)>\s*```|```|$)/g;
var ATTR = /([a-z][a-z-]*)="([^"]*)"/g;
var TEXT = /(?:^|\s)text: ([\s\S]*?)(?=\s(?:was|inside|image|thread|value|write|marks?|answer): |$)/;
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name2) => {
    if (name2[0] === "#") {
      const code = name2[1] === "x" || name2[1] === "X" ? parseInt(name2.slice(2), 16) : Number(name2.slice(1));
      return Number.isSafeInteger(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name2.toLowerCase()] ?? whole;
  });
}
function blockWords(fence, head, body) {
  const attrs = {};
  for (const [, key, value] of head.matchAll(ATTR)) attrs[key] = decodeEntities(value);
  if (fence === "page") return attrs.path?.trim() || UNNAMED_PAGE;
  const text = TEXT.exec(body)?.[1];
  const words = chipLabel(
    {
      status: attrs.status,
      incomplete: attrs.incomplete === "true",
      name: attrs.name,
      label: attrs.label,
      text: text === void 0 ? void 0 : decodeEntities(text)
    },
    { many: / n="\d+"/.test(head) }
  );
  return words.trim() === "" ? UNNAMED_ELEMENT : words;
}
function replaceMentions(text, say) {
  if (!text.includes("```tracy-element") && !text.includes("```tracy-page")) return text;
  const pieces = [];
  let from = 0;
  for (const m of text.matchAll(BLOCK)) {
    pieces.push(text.slice(from, m.index), say(blockWords(m[1], m[2], m[3])));
    from = /** @type {number} */
    m.index + m[0].length;
  }
  if (from === 0) return text;
  const tail = text.slice(from);
  const hint = /^[ \t]*\n?([^\n]*)/.exec(tail);
  pieces.push(hint && hint[1].includes("`tracy_site`") ? tail.slice(hint[0].length) : tail);
  return pieces.join("");
}

// ../../tools/tracy-site-tools/src/host/prompter.mjs
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
var PICKED_ELEMENT = /(^|\n)```tracy-(?:element|page)\n[\s\S]*?\n```(?:\n[^\n]*`tracy_site`[^\n]*)?(?=\n|$)/g;
function personWords(content, { mentions = "cut" } = {}) {
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map(
    (part) => part && typeof part === "object" && typeof part.text === "string" ? part.text : ""
  ).join("\n") : "";
  if (!text.includes("```tracy-element") && !text.includes("```tracy-page")) return text;
  const lined = text.replace(PICKED_ELEMENT, "$1");
  const said = replaceMentions(lined, mentions === "label" ? (words) => ` ${words} ` : () => " ");
  if (said === text) return text;
  return (said === lined ? lined : said.replace(/[ \t]{2,}/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n")).replace(/\n{3,}/g, "\n\n").trim();
}
var SELF_VI = /mình/u.source;
var PERSON_VI = /bạn/u.source;
var VIETNAMESE_ADDRESS = `In Vietnamese, refer to yourself as "${SELF_VI}" and to the person as "${PERSON_VI}" (Tracy's interface calls them "${PERSON_VI}"), unless they clearly ask to be addressed otherwise; never infer their gender or age. This is how you talk to the person, not how the site talks: words written into the site keep its brand's own voice.`;

// ../../ui/tracy-chat-input/src/client/comment-turn.mjs
var ROADS = 'To change its words: `tracy_site` `content.replace` {find: its words as the text line shows them, replace, path: the url\'s path}, nothing read first. Anything else: start from its levels (ids included); with no levels, or if the site changed, call `tracy_site` `content.locate` {url, text, marks: the "marks:" values split at " | ", never the selector}.';
var COMMENT_IMAGE_WORDS = "If the comment asks to change words drawn inside the image itself (a banner's slogan, a logo's name) and no record or alt holds them, do not guess and do not edit files: answer it `\u2717 the words are part of the image file <file>; changing them needs a new image` and ask with a question card whether the person wants to replace the image (upload a new one).";
var IMAGE_WORDS_ROOM = COMMENT_IMAGE_WORDS.length + 1;
var EXTRA = /* @__PURE__ */ Object.freeze({
  call: "The write line is that one call for this field: send it as given, its at kept; all:true instead of at only if asked for every place.",
  callShort: "Write line: this field; asked everywhere: all:true, no at.",
  inside: "The inside line is the words in the picked block: it is that block, and a new item goes after it, in the same list.",
  insideShort: "Inside line: the picked block; new items go after it.",
  none: 'A write line "none" is the answer: say why; do not look for another way in.',
  noneShort: 'Write "none": say why.',
  value: "The value line is its stored words, whole.",
  was: "The was line is what it said when picked; its text line is what the page shows now.",
  wasShort: "Was line: when picked; text line: now.",
  twins: 'Other languages: a phone, e-mail, address or all:true reaches them in the same call; other words: at the "also in:" id.',
  twinsShort: 'Other languages: facts and all:true reach them; other words: the "also in:" id.',
  image: 'Image line: its alt or file changes only through the level naming that image ("alt write" is the call for its alt), else `content.replace` {find: its alt words}; never another image. An "alt:" line (page prints none, or other words): change nothing, \u2717 saying so. ' + COMMENT_IMAGE_WORDS,
  imageShort: 'Image: its level or "alt write"; else `content.replace` {find: its alt words}; never another image; "alt:" line \u2192 \u2717. ' + COMMENT_IMAGE_WORDS
});
var LOOK = "Its look (colour, size, spacing, font): change it yourself \u2014 `page.look` {path, style} names its rule and the token; change this element only (the token only if all like it should change), then read it again.";
var CERTAIN = 'Only status "resolved" is certain; otherwise ask the person which one.';
var PARTIAL = 'incomplete="true": Tracy had read only part of the site, so no status is certain yet: before changing anything but its words, read the level (`content.read` {id}) or call `content.locate` again; if it still is not "resolved", ask the person which one.';
var COMMENT_ANSWER_ONE = "Answer in the chat as you would answer a person, in plain words: what you did, or what you could not do and why.";
var COMMENT_ANSWER_MANY = "Answer in the chat as you would answer a person, in plain words, saying which you did and which you could not, and why (a \u2713 or \u2717 at the start of a line is fine, never required).";
var COMMENT_NAMED_BY_PAGE = 'The numbers (n) are for your calls only \u2014 the person never sees them: never write one, nor "comment <n>", in your answer or in a question card; name each item by what it is on the page, quoting a few of its words (the heading "Building the groundwork\u2026", the menu item "Services"), or "the whole page" for a `<page>` block; and what the person sent from the page is a request, not a comment \u2014 comments are only the notes people leave each other.';
var COMMENT_WHAT_CHANGED = "Name the page and language you changed only as the write's result names them (its page, its path such as /en/, its note on other language versions), never from the language the request was written in; when the result names none, name no language.";
var COMMENT_REPLY_LANGUAGE = "Answer each item in the language it was written in (its block's `lang`, else its words) and the rest of your answer in the last item's, whatever this conversation or the site used before; never say which language you use or why.";
var COMMENT_WRITES_ONLY = "Answer a comment only through `tracy_site` / `tracy_emdash` content writes (receipts the person can undo): never edit theme, template, plugin or PHP/JS/CSS files on the site for a comment, except a look change (above) or the call a `write:` line gives; if the page prints no slot for what was asked (for example an image the page prints with no alt at all), say so and go on. In your reply use plain words: never a selector, id, mark, tool or action name, error code or receipt id (not `NO_BROWSER`, not `apply.revert`) \u2014 a change, a look change too, is undone by asking you, so say that.";
var COMMENT_LOOK_SCOPE = `A look change says in plain words how far it reaches ("every card heading on every page", "this page only") and that the person can ask you to put it back, e.g. "Card headings are lighter now (weight 600 \u2192 500) on every page and language. Ask me and I will put them back.". The undo id its write's result gave is for you: never in the reply.`;
var LOCATE_HINT = `${ROADS} ${LOOK} ${CERTAIN} ${COMMENT_ANSWER_ONE} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`;
var LOCATE_HINT_INCOMPLETE = `${ROADS} ${LOOK} ${PARTIAL} ${COMMENT_ANSWER_ONE} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`;
var MANY = "Each comment's words stand right above its element, which is numbered (n): do every comment, by number; pass `comment: <n>` on every `tracy_site` or `tracy_emdash` call made for comment n, and one write that answers several comments carries `comment: [<n>, \u2026]`; if one cannot be done, say why and go on with the next.";
var UNCHECKED = 'status="unchecked": nothing was looked up; call `content.locate` before changing anything but its words.';
var MANY_HEAD = `${MANY} For each element: `;
var LOCATE_HINT_MANY = `${MANY_HEAD}${ROADS} ${LOOK} ${CERTAIN} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`;
var LOCATE_HINT_MANY_INCOMPLETE = `${MANY_HEAD}${ROADS} ${LOOK} ${CERTAIN} ${PARTIAL} ${UNCHECKED} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`;
var GENERAL = "A `<page>` block is a comment about that whole page (its url), not one element: do it the same way, by number.";
var MANY_HEAD_GENERAL = `${MANY} ${GENERAL} For each element: `;
var LOCATE_HINT_MANY_GENERAL = `${MANY_HEAD_GENERAL}${ROADS} ${LOOK} ${CERTAIN} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`;
var LOCATE_HINT_MANY_INCOMPLETE_GENERAL = `${MANY_HEAD_GENERAL}${ROADS} ${LOOK} ${CERTAIN} ${PARTIAL} ${UNCHECKED} ${COMMENT_ANSWER_MANY} ${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`;
var COMMENT_FENCE = "tracy-element";
var FENCE_OPEN = `\`\`\`${COMMENT_FENCE}`;
var PAGE_FENCE = "tracy-page";
var STATUSES = /* @__PURE__ */ new Set(["resolved", "candidates", "conflict", "unconfirmed", "unknown", "unchecked"]);
var READ_STATUSES = /* @__PURE__ */ new Set([...STATUSES, "unavailable"]);
var KINDS = /* @__PURE__ */ new Set(["record", "field", "block", "string", "file", "style"]);
function unescape(value) {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
var HEX_COLOUR = /^#[0-9a-f]{6}$/i;
var isNumber = (n) => Number.isSafeInteger(n) && /** @type {number} */
n >= 1;
var isText = (v2) => typeof v2 === "string" && v2.trim() !== "";
var CONTINUE = "   ";
function personLines(paragraph) {
  return paragraph.split("\n").map((line) => line.startsWith(" `") || /^ write:/i.test(line) ? line.slice(1) : line).join("\n");
}
var BLOCK2 = /(?:^|\n)```tracy-element\n(<mentioned-element [^\n]*>)\n(?:[\s\S]*?\n)?<\/mentioned-element>\n```(?:\n|$)/;
var ATTR2 = /([a-z][a-z-]*)="([^"]*)"/g;
var THREAD_LINES = /\nthread: ([^\n]*)(?=\n)/g;
var TEXT_LINE = /\ntext: ([^\n]*)\n/;
var N_ATTR = /^<mentioned-element n="(\d+)" /;
var NUMBERED_HEAD = /(?:^|\n)```tracy-element\n<mentioned-element n="/;
var PAGE_HEAD = /(?:^|\n)```tracy-page\n<page n="/;
var PAGE_N = /^<page n="(\d+)" /;
var ANY_BLOCKS = /(?:^|\n)```(tracy-element|tracy-page)\n(<(?:mentioned-element|page) [^\n]*>)\n(?:(?!<\/(?:mentioned-element|page)>)[^\n]*\n)*<\/(?:mentioned-element|page)>\n```(?=\n|$)/g;
function elementOf(head, whole) {
  const attrs = {};
  for (const [, key, value] of head.matchAll(ATTR2)) attrs[key] = unescape(value);
  if (attrs.url === void 0 || attrs.selector === void 0 || !READ_STATUSES.has(attrs.status ?? ""))
    return null;
  const textLine = TEXT_LINE.exec(whole);
  return {
    url: attrs.url,
    selector: attrs.selector,
    status: attrs.status,
    ...attrs.incomplete === "true" ? { incomplete: (
      /** @type {true} */
      true
    ) } : {},
    ...attrs.kind !== void 0 && KINDS.has(attrs.kind) ? { kind: attrs.kind } : {},
    ...attrs.name !== void 0 ? { name: attrs.name } : {},
    ...isText(attrs.label) ? { label: attrs.label } : {},
    ...attrs.ref !== void 0 ? { ref: attrs.ref } : {},
    ...textLine ? { text: unescape(textLine[1]) } : {},
    ...isText(attrs.author) ? { author: attrs.author } : {},
    ...isText(attrs.author) && HEX_COLOUR.test(attrs["author-color"] ?? "") ? { authorColor: attrs["author-color"] } : {}
  };
}
function numberOf(head) {
  const m = N_ATTR.exec(head);
  const n = m ? Number(m[1]) : NaN;
  return isNumber(n) ? n : null;
}
function withoutHint(after) {
  const hintEnd = after.indexOf("\n");
  if ((hintEnd < 0 ? after : after.slice(0, hintEnd)).includes("`tracy_site`"))
    return hintEnd < 0 ? "" : after.slice(hintEnd + 1);
  return after;
}
function wordsByNumber(request) {
  const byN = /* @__PURE__ */ new Map();
  let current = null;
  for (const line of request.split("\n")) {
    const start = /^(\d+)\. (.*)$/.exec(line);
    if (start) {
      current = [start[2]];
      byN.set(Number(start[1]), current);
    } else if (current && line.startsWith(CONTINUE)) current.push(line.slice(CONTINUE.length));
    else current = null;
  }
  return new Map([...byN].map(([n, lines]) => [n, lines.join("\n")]));
}
function parseCommentTurn(text) {
  if (typeof text !== "string") return null;
  if (NUMBERED_HEAD.test(text) || PAGE_HEAD.test(text)) return parseManyTurn(text);
  const match = BLOCK2.exec(text);
  if (!match) return null;
  const element = elementOf(match[1], match[0]);
  if (!element) return null;
  const before = text.slice(0, match.index).trimEnd();
  const after = withoutHint(text.slice(match.index + match[0].length));
  const request = [before, after.trim()].filter(Boolean).join("\n");
  return { request, element, items: [{ n: 1, element, text: request }] };
}
function parseManyTurn(text) {
  const blocks = [...text.matchAll(ANY_BLOCKS)];
  if (blocks.length === 0) return null;
  let found = [];
  for (const block of blocks) {
    const item = block[1] === PAGE_FENCE ? pageOf(block[2]) : elementItem(block[2], block[0]);
    if (!item) continue;
    found = [...found.filter((other) => other.n !== item.n), item];
  }
  if (found.length === 0) return null;
  const gaps = blocks.map((block, i) => {
    const from = i === 0 ? 0 : (
      /** @type {number} */
      blocks[i - 1].index + blocks[i - 1][0].length
    );
    return text.slice(from, block.index);
  });
  const last = blocks[blocks.length - 1];
  const tail = withoutHint(text.slice(
    /** @type {number} */
    last.index + last[0].length
  ).replace(/^\n/, ""));
  const trimmed = [...gaps, tail].map((gap) => gap.replace(/^\n+|\s+$/g, ""));
  const numbered = wordsByNumber(trimmed.filter(Boolean).join("\n"));
  const before16 = trimmed.slice(1, -1).every((gap) => gap === "") && found.every((item) => [item.n, ...item.also ?? []].every((k) => numbered.has(k)));
  const request = trimmed.filter(Boolean).join(before16 ? "\n" : "\n\n");
  const words = before16 ? numbered : /* @__PURE__ */ new Map();
  if (!before16)
    blocks.forEach((block, i) => {
      const item = block[1] === PAGE_FENCE ? pageOf(block[2]) : elementItem(block[2], block[0]);
      if (!item) return;
      const paragraphs = trimmed[i] === "" ? [] : trimmed[i].split(/\n\n+/);
      [item.n, ..."also" in item ? item.also ?? [] : []].forEach((k, j) => {
        if (paragraphs[j] !== void 0) words.set(k, personLines(paragraphs[j]));
      });
    });
  const items = found.flatMap((item) => [
    item,
    ...(item.also ?? []).filter((k) => !found.some((other) => other.n === k)).map((k) => ({ n: k, element: item.element, groupOf: item.n }))
  ]).map((item) => ({ ...item, text: words.get(item.n) ?? "" }));
  return { request, element: items.find((item) => item.element !== null)?.element ?? null, items };
}
function elementItem(head, whole) {
  const n = numberOf(head);
  const element = n === null ? null : elementOf(head, whole);
  if (n === null || !element) return null;
  const replyTo = replyOf(head);
  const also = groupedOf(head);
  if (replyTo === null) return also.length > 0 ? { n, element, also } : { n, element };
  return { n, element, replyTo, thread: [...whole.matchAll(THREAD_LINES)].map((m) => unescape(m[1])) };
}
function groupedOf(head) {
  const m = /^<mentioned-element n="\d+" also-n="(\d+(?: \d+)*)" /.exec(head);
  return m ? m[1].split(" ").map(Number).filter(isNumber) : [];
}
function replyOf(head) {
  const m = /^<mentioned-element n="\d+" reply-to="(\d+)" /.exec(head);
  const n = m ? Number(m[1]) : NaN;
  return isNumber(n) ? n : null;
}
function pageOf(head) {
  const m = PAGE_N.exec(head);
  const n = m ? Number(m[1]) : NaN;
  if (!isNumber(n)) return null;
  const attrs = {};
  for (const [, key, value] of head.matchAll(ATTR2)) attrs[key] = unescape(value);
  return {
    n,
    element: null,
    url: attrs.url ?? "",
    path: attrs.path ?? "",
    ...isText(attrs.author) ? { author: attrs.author } : {},
    ...isText(attrs.author) && HEX_COLOUR.test(attrs["author-color"] ?? "") ? { authorColor: attrs["author-color"] } : {}
  };
}

// src/host/moment.mjs
var MAX_TITLE = 4e3;
function momentTitle(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type !== "user/message") continue;
    const data = (
      /** @type {{ source?: { kind?: string }, content?: unknown } | undefined} */
      event.data
    );
    const source = data?.source?.kind;
    if (source !== void 0 && source !== "user" && source !== "human") continue;
    const title = contentTitle(data?.content);
    if (title === "") continue;
    return { title, index: i };
  }
  return null;
}
function contentTitle(content) {
  return contentRequest(content).title;
}
function contentRequest(content) {
  const line = titleOf(withoutRevertBlock(personWords(content, { mentions: "label" })), content).replace(/\s+/g, " ").trim();
  if (line.length <= MAX_TITLE) return { title: line, cut: false };
  const room = line.slice(0, MAX_TITLE);
  const space = room.lastIndexOf(" ");
  return {
    title: `${(space > 0 ? room.slice(0, space) : room.slice(0, MAX_TITLE - 1)).replace(/[\s,.;:]+$/, "")}\u2026`,
    cut: true
  };
}
var REVERT_BLOCK = /(^|\n)```tracy-revert\n[\s\S]*?\n```(?=\n|$)/g;
function withoutRevertBlock(words) {
  if (!words.includes("```tracy-revert\n")) return words;
  return words.replace(REVERT_BLOCK, "$1").replace(/\n{3,}/g, "\n\n").trim();
}
function titleOf(words, content) {
  if (!words.includes("\n")) return words;
  const text = Array.isArray(content) ? content.map((part) => part && typeof part.text === "string" ? part.text : "").join("\n") : content;
  const items = parseCommentTurn(text)?.items ?? [];
  if (items.length < 2 || items[0].text.trim() === "") return words;
  return `${items[0].text} +${items.length - 1}`;
}
async function recordedSiteKey(folder) {
  try {
    const record = JSON.parse(await readFile(path.join(folder, ".tracy", "site.json"), "utf8"));
    const key = record !== null && typeof record === "object" ? record.siteKey : null;
    return typeof key === "string" && key.trim() !== "" ? key.trim() : null;
  } catch {
    return null;
  }
}
async function hostDoorRequest({ door, cwd, email, origin, signer, env = process.env }) {
  let sitesRoot;
  let label;
  try {
    sitesRoot = resolveSitesRoot(void 0, env);
    label = siteOf(String(cwd ?? ""), sitesRoot).label;
  } catch {
    return { ok: false, reason: null };
  }
  if (!origin) return { ok: false, reason: "no MCP_TRACY_ORIGIN on this dsh" };
  if (!email) return { ok: false, reason: "nobody with an email address typed this turn" };
  const siteKey2 = await recordedSiteKey(path.join(sitesRoot, label)) ?? "_conversation";
  const assertion = typeof signer?.mint === "function" ? signer.mint(email) : null;
  if (!assertion) return { ok: false, reason: "the password gate cannot sign for the person who typed" };
  return {
    ok: true,
    url: `${origin.replace(/\/+$/, "")}/api/sites/${encodeURIComponent(siteKey2)}/${door}`,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-tracy-actor": assertion,
      "x-tracy-workspace-label": label
    }
  };
}

// src/host/rating.mjs
var RATINGS = /* @__PURE__ */ new Set(["positive", "negative"]);
function ratingOf(event) {
  if (event?.type === "feedback/message-put") {
    const item = event.data?.item;
    if (typeof item?.messageId !== "string" || !RATINGS.has(item.rating)) return null;
    const categories = Array.isArray(item.categories) ? item.categories.filter((c) => typeof c === "string") : typeof item.category === "string" ? [item.category] : [];
    return { messageId: item.messageId, rating: item.rating, categories };
  }
  if (event?.type === "feedback/message-delete" && typeof event.data?.messageId === "string")
    return { messageId: event.data.messageId, rating: null, categories: [] };
  return null;
}
function ratedTurn(events, messageId) {
  if (!Array.isArray(events)) return null;
  const at = events.findIndex((e) => e?.type === "assistant/message" && e.data?.message?.id === messageId);
  if (at < 0) return null;
  const turn = events[at].data?.turn;
  if (!Number.isInteger(turn)) return null;
  const who = latestPrompter(events.slice(0, at));
  return who ? { turn, email: who.email } : null;
}

// src/host/token-usage.mjs
var count = (n) => Number.isSafeInteger(n) && n >= 0;
function counters(raw) {
  if (!raw || !count(raw.inputTokens) || !count(raw.outputTokens)) return null;
  const keys = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];
  if (keys.some((key) => raw[key] !== void 0 && !count(raw[key]))) return null;
  const out = Object.fromEntries(keys.map((key) => [key, raw[key] ?? 0]));
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (!count(sum)) return null;
  out.totalTokens = raw.totalTokens === void 0 ? sum : raw.totalTokens;
  if (!count(out.totalTokens)) return null;
  return out;
}
function tokenUsageOf(events, turn) {
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 };
  let measured = 0;
  let missing = 0;
  let lastSeq = 0;
  const seen = /* @__PURE__ */ new Set();
  const steps = /* @__PURE__ */ new Set();
  const settled = /* @__PURE__ */ new Set();
  for (const [index, event] of (events ?? []).entries()) {
    if (event?.data?.turn !== turn) continue;
    const seq = count(event.seq) ? event.seq : index + 1;
    lastSeq = Math.max(lastSeq, seq);
    if (event.type === "step/start") steps.add(event.data.step);
    if (event.type !== "assistant/message" && event.type !== "assistant/attempt") continue;
    if (seen.has(seq)) continue;
    seen.add(seq);
    settled.add(event.data.step);
    let raw = event.data.usage;
    if (raw === void 0) {
      for (const record of event.data.stream ?? []) {
        const chunk = record?.chunk ?? record;
        if (chunk?.type === "usage") raw = chunk.usage;
      }
    }
    const usage = counters(raw);
    if (!usage) {
      missing++;
      continue;
    }
    measured++;
    for (const key of Object.keys(totals)) totals[key] += usage[key];
  }
  for (const step of steps) if (!settled.has(step)) missing++;
  if (measured === 0) return null;
  if (!Object.values(totals).every(count)) return null;
  return { version: 1, ...totals, measured, missing, lastSeq };
}

// src/host/turn-record.mjs
var NUMBERED = /(?:^|\n)```tracy-(?:element\n<mentioned-element|page\n<page) n="/;
function openingOf(messages) {
  for (const message of Array.isArray(messages) ? messages : []) {
    const m = (
      /** @type {{ id?: unknown, content?: unknown, source?: any } | null} */
      message
    );
    const source = m?.source;
    if (source?.kind !== "user") continue;
    const email = source?.prompter?.email;
    if (typeof email !== "string" || email === "") continue;
    const { title, cut } = contentRequest(m?.content);
    if (title === "") continue;
    const text = textOf(m?.content);
    const comment = parseCommentTurn(text);
    const commentNs = comment && NUMBERED.test(text) ? [...new Set(comment.items.map((item) => item.n))] : [];
    return {
      email,
      title,
      source: comment ? "comment" : "panel",
      promptMessageId: typeof m?.id === "string" ? m.id : null,
      rpcId: typeof source.rpcId === "string" ? source.rpcId : null,
      ...commentNs.length > 0 ? { commentNs } : {},
      ...cut ? { requestCut: (
        /** @type {const} */
        true
      ) } : {}
    };
  }
  return null;
}
var REPLY_MAX = 2e3;
var CODE_FENCE = /(^|\n)[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:\n[ \t]*\2[ \t]*(?=\n|$)|$)/g;
function replyOf2(events, turn) {
  let last = null;
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== "assistant/message" || event.data?.turn !== turn) continue;
    const content = event.data?.message?.content;
    const text = (Array.isArray(content) ? content : []).filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n\n").trim();
    if (text !== "") last = { text, interrupted: event.data?.interrupted === true };
  }
  if (last === null) return null;
  const plain = last.text.replace(CODE_FENCE, (_, lead) => `${lead}[code]`).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (plain === "") return null;
  const chars = [...plain];
  if (chars.length <= REPLY_MAX)
    return { reply: plain, replyState: last.interrupted ? "interrupted" : "full" };
  const room = chars.slice(0, REPLY_MAX).join("");
  const space = room.search(/\s\S*$/);
  const kept = (space > 0 ? room.slice(0, space) : chars.slice(0, REPLY_MAX - 1).join("")).replace(
    /[\s,.;:]+$/,
    ""
  );
  return { reply: `${kept}\u2026`, replyState: "truncated" };
}
var END_REASONS = /* @__PURE__ */ Object.freeze([
  "completed",
  "aborted",
  "blocked",
  "error",
  "max-tokens",
  "interrupted"
]);
function endReasonOf(events, turn) {
  let reason = null;
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== "turn/end" || event.data?.turn !== turn) continue;
    const raw = event.data?.reason;
    const kind = typeof raw === "string" ? raw : raw?.kind;
    reason = typeof kind === "string" && END_REASONS.includes(kind) ? kind : null;
  }
  return reason;
}
function resultFailed(event) {
  const message = event?.data?.message ?? {};
  if (message.isError === true) return true;
  const content = Array.isArray(message.content) ? message.content : [];
  const text = content.map((part) => typeof part?.text === "string" ? part.text : "").join("");
  if (!text.trimStart().startsWith("{")) return false;
  try {
    return JSON.parse(text)?.ok === false;
  } catch {
    return false;
  }
}
function workOf(events, turn) {
  let steps = 0;
  let calls = 0;
  let failedCalls = 0;
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.data?.turn !== turn) continue;
    if (event.type === "step/start") steps += 1;
    else if (event.type === "tool/call") calls += 1;
    else if (event.type === "tool/result" && resultFailed(event)) failedCalls += 1;
  }
  if (steps === 0) return null;
  return { steps, calls, failedCalls: Math.min(failedCalls, calls) };
}
function stoppingReasonOf(events, turn) {
  const logged = endReasonOf(events, turn);
  if (logged !== null) return logged;
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== "assistant/message" || event.data?.turn !== turn) continue;
    for (const record of Array.isArray(event.data?.stream) ? event.data.stream : []) {
      const chunk = record?.chunk ?? record;
      if (chunk?.type === "finish" && chunk.reason?.kind === "max-tokens") return "max-tokens";
    }
  }
  return "completed";
}
var UNDONE_MAX = 5;
function openMayNameUndone(turn) {
  return !(Number.isInteger(turn) && /** @type {number} */
  turn <= 1);
}
function undoneOf(body) {
  const list = (
    /** @type {{ undone?: unknown } | null} */
    body?.undone
  );
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const t = (
      /** @type {{ turn?: unknown, title?: unknown, complete?: unknown } | null} */
      item
    );
    if (!Number.isInteger(t?.turn) || typeof t?.title !== "string") continue;
    out.push({
      turn: (
        /** @type {number} */
        t.turn
      ),
      title: t.title.slice(0, 200),
      complete: t.complete === true
    });
    if (out.length === UNDONE_MAX) break;
  }
  return out;
}
var TURN_UNDONE_PRODUCER = "tracy-site-tabs:turn-undone";
var SITE_NOTICE_KIND = "tracy-site";
function undoneNotice(undone, id) {
  if (undone.length === 0) return null;
  const named = undone.map(
    (t) => `request ${t.turn} ${JSON.stringify(t.title)} (${t.complete ? "fully undone" : "partly undone"})`
  ).join("; ");
  const text = `Since your last reply, the person undid ${undone.length} of your earlier requests from the chat: ${named}. The site is back to how it was before those requests. Do not say the site changed on its own; read the site again before you describe it.`;
  return {
    id,
    role: "user",
    content: [{ type: "text", text }],
    source: {
      kind: SITE_NOTICE_KIND,
      producer: TURN_UNDONE_PRODUCER,
      form: "notice",
      summary: "Earlier request undone"
    }
  };
}
function withUndoneNotice(messages, undone, id) {
  const notice = undoneNotice(undone, id);
  if (notice === null) return messages;
  const at = openingIndex(messages);
  if (at === -1) return messages;
  return [...messages.slice(0, at + 1), notice, ...messages.slice(at + 1)];
}
function openingIndex(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = 0; i < list.length; i++) if (openingOf([list[i]]) !== null) return i;
  return -1;
}
function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => part && typeof part.text === "string" ? part.text : "").join("\n");
}
var MOMENT_HOLD_MS = 12e4;
function momentsPendingOf(body, sessionId) {
  const list = (
    /** @type {{ momentsPending?: unknown } | null} */
    body?.momentsPending
  );
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const id of list) {
    if (typeof id !== "string" || !id.startsWith(`${sessionId}:`) || !/:[0-9]{1,9}$/.test(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length === 20) break;
  }
  return out;
}
function createTurnBook({
  send,
  timeoutMs = 15e3,
  attempts = 3,
  retryDelayMs = 500,
  warn = console.warn,
  info = console.info,
  momentHoldMs = MOMENT_HOLD_MS,
  askAgainMs = 1e3
}) {
  const turns = /* @__PURE__ */ new Map();
  const openInFlight = /* @__PURE__ */ new Map();
  const sweeps = /* @__PURE__ */ new Map();
  const holds = /* @__PURE__ */ new Map();
  function holdBehind(sessionId, id, ids, who) {
    const deadline = Date.now() + momentHoldMs;
    const pending = new Set(ids);
    const hold = { id, pending, who, ended: Promise.resolve("ended") };
    const one = async (earlier) => {
      while (Date.now() < deadline) {
        const asked = Date.now();
        const answer = await once(
          "moment/wait",
          { turnId: earlier },
          who,
          Math.min(deadline, asked + timeoutMs)
        );
        if (answer.ok && /** @type {any} */
        answer.body?.ended === true) {
          pending.delete(earlier);
          return;
        }
        const left = askAgainMs - (Date.now() - asked);
        if (left > 0)
          await new Promise(
            (resolve) => setTimeout(resolve, Math.min(left, Math.max(0, deadline - Date.now())))
          );
      }
    };
    hold.ended = Promise.all(ids.map((earlier) => one(earlier).catch(() => {
    }))).then(() => {
      const outcome = pending.size === 0 ? "ended" : "bound";
      if (outcome === "ended" && holds.get(sessionId) === hold) holds.delete(sessionId);
      return outcome;
    });
    holds.set(sessionId, hold);
  }
  function releaseHold(sessionId, hold) {
    hold.release ??= (async () => {
      for (const earlier of hold.pending) {
        const answer = await once(
          "moment/wait",
          { turnId: earlier, release: true },
          hold.who,
          Date.now() + timeoutMs
        );
        const body = (
          /** @type {any} */
          answer.ok ? answer.body : null
        );
        if (body?.ended === true) continue;
        warn(
          body?.released === true ? `[tracy-site-tabs] turn ${hold.id}: writes before turn ${earlier}'s moment ended (${momentHoldMs} ms); both turns are marked if that moment commits` : `[tracy-site-tabs] turn ${hold.id}: writes before turn ${earlier}'s moment ended, and tracy-web could not be told (${answer.ok ? "unreadable answer" : answer.why})`
        );
      }
      if (holds.get(sessionId) === hold) holds.delete(sessionId);
    })();
    return hold.release;
  }
  async function once(door, body, who, deadline) {
    const left = deadline - Date.now();
    if (left <= 0) return { ok: false, why: "out of time" };
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, why: `no answer within ${timeoutMs} ms` });
      }, left);
    });
    try {
      const answer = await Promise.race([
        send(door, body, who, controller.signal).then(
          (res) => res.ok ? { ok: true, body: res.body } : { ok: false, why: `refused: ${res.status}` },
          (error) => ({ ok: false, why: error instanceof Error ? error.message : String(error) })
        ),
        timeout
      ]);
      return answer;
    } finally {
      clearTimeout(timer);
    }
  }
  async function close(id, record) {
    await record.chain;
    const deadline = Date.now() + timeoutMs;
    const body = {
      title: record.title,
      turnId: id,
      ...record.reply ? record.reply : {},
      ...record.endReason ? { endReason: record.endReason } : {},
      ...record.work ? { work: record.work } : {},
      ...record.usage ? { usage: record.usage } : {}
    };
    while (record.tries < attempts && Date.now() < deadline) {
      record.tries += 1;
      const answer = await once("moment", body, record.who, deadline);
      if (answer.ok) {
        record.closed = true;
        record.tries = 0;
        return;
      }
      warn(
        `[tracy-site-tabs] turn ${id}: moment not recorded (${answer.why}), try ${record.tries} of ${attempts}`
      );
      if (record.tries < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  const NOTHING = Promise.resolve([]);
  function reopen(sessionId, turn) {
    const id = `${sessionId}:${turn}`;
    const known = turns.get(id);
    if (!known?.closed) return;
    known.closed = false;
    known.steered = true;
    const again = known.chain.then(async () => {
      const answer = await once(
        "turn",
        { turnId: id, title: known.title, source: known.source ?? "panel", steered: true },
        known.who,
        Date.now() + timeoutMs
      );
      if (!answer.ok)
        warn(`[tracy-site-tabs] turn ${id}: going on after its close not recorded (${answer.why})`);
    });
    known.chain = again.catch(() => {
    });
    const inFlight = { id, settled: known.chain };
    openInFlight.set(sessionId, inFlight);
    void known.chain.then(() => {
      if (openInFlight.get(sessionId) === inFlight) openInFlight.delete(sessionId);
    });
  }
  function enter({ sessionId, turn, messages, cwd }) {
    const opening = openingOf(messages);
    if (opening === null) {
      reopen(sessionId, turn);
      return { opens: false, undone: NOTHING };
    }
    const id = `${sessionId}:${turn}`;
    const known = turns.get(id);
    const who = { email: opening.email, cwd };
    if (known) {
      if (known.closed) known.closed = false;
      if (known.steered) return { opens: false, undone: NOTHING };
      known.steered = true;
      const steer = known.chain.then(async () => {
        const answer = await once(
          "turn",
          { turnId: id, title: known.title, source: opening.source, steered: true },
          who,
          Date.now() + timeoutMs
        );
        if (!answer.ok) warn(`[tracy-site-tabs] turn ${id}: steer not recorded (${answer.why})`);
      });
      known.chain = steer.catch(() => {
      });
      return { opens: false, undone: known.chain.then(() => []) };
    }
    const record = {
      sessionId,
      turn,
      title: opening.title,
      source: opening.source,
      who,
      closed: false,
      tries: 0,
      steered: false,
      chain: Promise.resolve()
    };
    turns.set(id, record);
    const prior = sweeps.get(sessionId)?.catch(() => {
    }) ?? Promise.resolve();
    const opened = prior.then(
      () => once(
        "turn",
        {
          turnId: id,
          title: opening.title,
          source: opening.source,
          promptMessageId: opening.promptMessageId,
          rpcId: opening.rpcId,
          // This dsh holds the turn's first write behind the conversation's moments still committing
          // (`momentsPending`), so tracy-web may take those moments as harmless to this turn's seal.
          waitsForMoments: true,
          ...opening.commentNs ? { commentNs: opening.commentNs } : {},
          // An older tracy-web ignores it and stores the cut title as `full`, as before.
          ...opening.requestCut ? { requestState: "truncated" } : {}
        },
        who,
        Date.now() + timeoutMs
      )
    ).then(
      (answer) => {
        if (!answer.ok) {
          warn(`[tracy-site-tabs] turn ${id}: not opened (${answer.why}); its moment is still recorded`);
          return [];
        }
        const earlier = momentsPendingOf(answer.body, sessionId);
        if (earlier.length > 0) holdBehind(sessionId, id, earlier, who);
        return undoneOf(answer.body);
      },
      () => []
    );
    const quick = openMayNameUndone(turn) ? once("turn/undone", { turnId: id }, who, Date.now() + timeoutMs).then(
      // a list or nothing: an answer without one (another door's 200) never stands in for the open's
      (answer) => answer.ok && Array.isArray(
        /** @type {{ undone?: unknown }} */
        answer.body?.undone
      ) ? undoneOf(answer.body) : null,
      () => null
    ) : Promise.resolve(null);
    const undone = quick.then((list) => list ?? opened);
    const settled = opened.then(() => {
    });
    record.chain = settled;
    const inFlight = { id, settled };
    openInFlight.set(sessionId, inFlight);
    void settled.then(() => {
      if (openInFlight.get(sessionId) === inFlight) openInFlight.delete(sessionId);
    });
    return { opens: true, undone };
  }
  return {
    enter,
    /**
     * {@link enter}, awaited: the undone turns once the open (or the steer) has been answered.
     * @param {{ sessionId: string, turn: number, messages: readonly unknown[] | undefined, cwd: unknown }} step
     * @returns {Promise<UndoneTurn[]>}
     */
    stepEntered(step) {
      return enter(step).undone;
    },
    /**
     * 🔒 A CALL THAT MAY WRITE THE SITE WAITS HERE for its conversation's open, so the seal of what
     * was dirty before the turn lands before the agent's first edit — the guarantee the step itself
     * used to wait for. Bounded by the open's own budget (`timeoutMs`): an open with no answer in time
     * lets the write go, exactly as the step went before (tracy-web has marked the turn
     * `unsealedStart`). Then, when the open named earlier turns of the conversation whose moment the
     * host still commits, it waits for those to end (option A, `holds`): at most until
     * {@link MOMENT_HOLD_MS} after the open's answer, and tracy-web is told when it lets go before they
     * ended. Resolves at once when nothing is in flight or held — a moment that ended before the write
     * holds nothing — and when `signal` aborts.
     * @param {{ sessionId: string, signal?: AbortSignal }} call
     * @returns {Promise<boolean>} whether the call had to wait.
     */
    async writeReady({ sessionId, signal }) {
      const untilOrCancelled = (promise) => new Promise((resolve) => {
        const done = (value) => {
          signal?.removeEventListener("abort", cancelled);
          resolve(value);
        };
        const cancelled = () => done(void 0);
        void promise.then(done);
        signal?.addEventListener("abort", cancelled, { once: true });
      });
      let waited = false;
      const inFlight = openInFlight.get(sessionId);
      if (inFlight !== void 0 && !signal?.aborted) {
        const started = Date.now();
        await untilOrCancelled(inFlight.settled);
        info(`[tracy-site-tabs] turn ${inFlight.id}: a write waited ${Date.now() - started} ms for the open`);
        waited = true;
      }
      const hold = holds.get(sessionId);
      if (hold !== void 0 && !signal?.aborted) {
        const started = Date.now();
        const outcome = await untilOrCancelled(hold.ended);
        if (outcome === "bound") await untilOrCancelled(releaseHold(sessionId, hold));
        info(
          `[tracy-site-tabs] turn ${hold.id}: a write waited ${Date.now() - started} ms for an earlier turn's moment (${outcome ?? "cancelled"})`
        );
        waited = true;
      }
      return waited;
    },
    /**
     * The turn is stopping (`agent/turn-stopping`, before the next one starts): record its moment,
     * with Tracy's answer read off the session's events (`events`; none from an older caller).
     * @param {{ sessionId: string, turn: number, events?: readonly { type?: string, data?: any }[] }} stop
     */
    async turnStopping({ sessionId, turn, events }) {
      const id = `${sessionId}:${turn}`;
      const record = turns.get(id);
      if (record === void 0) return;
      if (events !== void 0) {
        record.reply = replyOf2(events, turn);
        record.endReason = stoppingReasonOf(events, turn);
        record.work = workOf(events, turn);
        record.usage = tokenUsageOf(events, turn);
      }
      if (record.closed) record.tries = 0;
      await close(id, record);
    },
    /**
     * The conversation went idle: close every turn of it the log says has ENDED but that never
     * closed (aborted, errored, blocked — none of them reaches `turn-stopping`). Then forget what is
     * closed, so the book never grows with the conversation.
     * @param {{ sessionId: string, events: readonly { type?: string, data?: any }[] }} idle
     */
    async idle({ sessionId, events }) {
      const before = sweeps.get(sessionId);
      const sweep = (async () => {
        await before?.catch(() => {
        });
        const ended = /* @__PURE__ */ new Set();
        for (const event of events ?? []) {
          if (event?.type === "turn/end" && Number.isInteger(event.data?.turn)) ended.add(event.data.turn);
        }
        for (const [id, record] of turns) {
          if (record.sessionId !== sessionId || record.closed || !ended.has(record.turn)) continue;
          if (record.tries >= attempts) continue;
          if (record.reply === void 0) record.reply = replyOf2(events, record.turn);
          if (!record.endReason) record.endReason = endReasonOf(events, record.turn);
          if (!record.work) record.work = workOf(events, record.turn);
          record.usage = tokenUsageOf(events, record.turn);
          await close(id, record);
        }
        for (const [id, record] of turns) {
          if (record.sessionId === sessionId && (record.closed || record.tries >= attempts)) turns.delete(id);
        }
      })();
      sweeps.set(sessionId, sweep);
      try {
        await sweep;
      } finally {
        if (sweeps.get(sessionId) === sweep) sweeps.delete(sessionId);
      }
    }
  };
}

// src/host/turn.mjs
import path3 from "node:path";

// ../tracy-site-build-core/src/host/build.mjs
import path2 from "node:path";

// ../../core/tracy-core/src/lease/index.mjs
var DRAIN_STALE_MS = 60 * 6e4;

// ../tracy-site-build-core/src/host/lease.mjs
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
function identity(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return `${readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]}`;
  } catch {
    try {
      return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim() || null;
    } catch {
      return null;
    }
  }
}
var birth = identity(process.pid);

// ../tracy-site-build-core/src/host/build.mjs
var JOB_FILE = path2.join("docs", "agents", "build", "job.json");
var SITES_DIR = path2.join("docs", "agents", "build", "sites");

// ../../tools/tracy-subprocess-docker/src/content-contract.mjs
var QUICKSTART_DESIGN_RULE = "Keep the quickstart's design: reuse its own sections and styles, and keep new text close to the length of the text it replaces (0.75\xD7 to 1.25\xD7).";

// ../../tools/tracy-site-tools/src/host/comment-echo.mjs
var COMMENT_MIN = 1;
var COMMENT_MAX = 2 ** 31 - 1;
var COMMENT_LIST_MAX = 12;
var ONE = /* @__PURE__ */ Object.freeze({ type: "integer", minimum: COMMENT_MIN, maximum: COMMENT_MAX });
var COMMENT_PARAMETER = /* @__PURE__ */ Object.freeze({
  anyOf: [
    ONE,
    /* @__PURE__ */ Object.freeze({
      type: "array",
      items: ONE,
      minItems: 1,
      maxItems: COMMENT_LIST_MAX,
      uniqueItems: true
    })
  ],
  description: "The number of the person's comment this call answers, or [1, 2] for several; the write is made for whoever commented."
});

// ../../tools/tracy-site-tools/src/host/empty-rules.mjs
var TEXT_BLOCK = new Set(
  "p h1 h2 h3 h4 h5 h6 li ul ol div section article figure figcaption button label header footer main nav aside td th tr table blockquote dt dd dl fieldset legend form option select textarea details summary pre address hr body html head title dialog search menu".split(" ")
);

// ../../tools/tracy-site-tools/src/host/html-units.mjs
var LATIN1 = "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
var NAMED = /* @__PURE__ */ Object.freeze({
  amp: 38,
  lt: 60,
  gt: 62,
  quot: 34,
  apos: 39,
  hellip: 8230,
  mdash: 8212,
  ndash: 8211,
  lsquo: 8216,
  rsquo: 8217,
  ldquo: 8220,
  rdquo: 8221,
  bull: 8226,
  dagger: 8224,
  trade: 8482,
  euro: 8364,
  // HTML 4 punctuation and symbols beyond Latin-1.
  OElig: 338,
  oelig: 339,
  Scaron: 352,
  scaron: 353,
  Yuml: 376,
  fnof: 402,
  circ: 710,
  tilde: 732,
  ensp: 8194,
  emsp: 8195,
  thinsp: 8201,
  zwnj: 8204,
  zwj: 8205,
  lrm: 8206,
  rlm: 8207,
  sbquo: 8218,
  bdquo: 8222,
  Dagger: 8225,
  permil: 8240,
  prime: 8242,
  Prime: 8243,
  lsaquo: 8249,
  rsaquo: 8250,
  oline: 8254,
  frasl: 8260,
  larr: 8592,
  uarr: 8593,
  rarr: 8594,
  darr: 8595,
  harr: 8596,
  minus: 8722,
  infin: 8734,
  there4: 8756,
  asymp: 8776,
  ne: 8800,
  le: 8804,
  ge: 8805,
  loz: 9674,
  spades: 9824,
  clubs: 9827,
  hearts: 9829,
  diams: 9830,
  ...Object.fromEntries(LATIN1.split(" ").map((name2, i) => [name2, 160 + i]))
});
var VOID = new Set("br img hr input wbr source meta link area col embed param track".split(" "));

// ../tracy-site-build-core/src/host/design-check.mjs
var ACCENT_ROLES = /* @__PURE__ */ Object.freeze([
  "--ds-c-accent",
  "--ds-c-accent-hover",
  "--ds-c-accent-active",
  "--ds-c-accent-on",
  "--ds-c-accent-text",
  "--ds-c-accent-text-hover"
]);
var STYLE_PROBE = `(() => {
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|IFRAME|TEMPLATE|LINK|META|SVG|PATH|G|USE|DEFS|CIRCLE|RECT|LINE|POLYGON|POLYLINE)$/
  const inSkipped = (el) => typeof el.closest === 'function' && !!(el.closest('svg') || el.closest('#wpadminbar') || el.closest('.wp-block-social-link') || el.closest('[data-tracy-design-ignore]'))
  const name = (el) => { const t = String(el.tagName || '').toLowerCase(); if (el.id) return t + '#' + el.id; const c = typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : ''; return c ? t + '.' + c : t }
  const map = new Map(); let seen = 0
  const ROLES = ${JSON.stringify(ACCENT_ROLES)}
  const accent = {}
  try { const root = document.documentElement; const rs = root ? getComputedStyle(root) : null; if (rs && typeof rs.getPropertyValue === 'function') for (const r of ROLES) { const v = String(rs.getPropertyValue(r) || '').trim(); if (v) accent[r] = v } } catch {}
  const add = (prop, value, el) => { if (!value) return; const k = prop + '|' + value; let e = map.get(k); if (!e) { e = { prop, value, count: 0, where: [] }; map.set(k, e) } e.count += 1; if (e.where.length < 3) { const n = name(el); if (!e.where.includes(n)) e.where.push(n) } }
  const all = document.body ? document.body.querySelectorAll('*') : []
  for (const el of all) {
    if (SKIP.test(String(el.tagName || ''))) continue
    if (inSkipped(el)) continue
    let rects = []; try { rects = el.getClientRects() } catch {}
    if (!rects || rects.length === 0) continue
    const cs = getComputedStyle(el); if (!cs) continue
    seen += 1
    add('color', cs.color, el)
    add('background-color', cs.backgroundColor, el)
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) { const w = parseFloat(cs['border' + side + 'Width'] || '0'); if (w > 0) add('border-' + side.toLowerCase() + '-color', cs['border' + side + 'Color'], el) }
    add('font-family', cs.fontFamily, el)
    if (map.size > 400) break
  }
  return { href: String(document.location && document.location.href || ''), seen, samples: [...map.values()], accent }
})()`;

// ../../tools/tracy-site-tools/src/host/look-style.mjs
var STYLE_VIEWPORTS = /* @__PURE__ */ Object.freeze({
  desktop: /* @__PURE__ */ Object.freeze({ width: 1440, height: 900, mobile: false }),
  tablet: /* @__PURE__ */ Object.freeze({ width: 768, height: 1024, mobile: true }),
  mobile: /* @__PURE__ */ Object.freeze({ width: 390, height: 844, mobile: true })
});
function paintSelectors(props) {
  return Object.values(props).map(function(row) {
    const by = String(row && row.by || "").replace(/\s@layer\s.+$/, "").replace(/\s@media\s.+$/, "").trim();
    if (by === "" || by === "?" || by.endsWith("\u2026")) return "";
    if (/^(?:its style attribute|an HTML attribute|the browser default|no rule)/.test(by)) return "";
    return by;
  });
}
function countPaints(list) {
  return list.map(function(s) {
    if (!s) return -1;
    try {
      return document.querySelectorAll(s).length;
    } catch {
      return -1;
    }
  });
}
function findTarget(q) {
  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const own = (el2) => norm(
    Array.from(el2.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(" ")
  );
  const shown = (el2) => {
    const r = el2.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el2);
    return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
  };
  const area = (el2) => {
    const r = el2.getBoundingClientRect();
    return r.width * r.height;
  };
  const inner = (el2) => norm(
    /** @type {HTMLElement} */
    el2.innerText
  );
  const nth = typeof q.nth === "number" && q.nth >= 0 ? q.nth : 0;
  let el = null;
  let matches = 0;
  let how = "";
  if (q.selector) {
    let list = [];
    try {
      list = Array.from(document.querySelectorAll(q.selector));
    } catch {
      return `"${String(q.selector).slice(0, 60)}" is not a CSS selector this browser reads`;
    }
    matches = list.length;
    how = "selector";
    el = list[nth] ?? null;
    if (el === null && list.length === 0) {
      const flat = (s) => String(s).replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1").trim();
      const want = flat(q.selector);
      const holds = (rules, depth) => depth <= 6 && Array.from(rules ?? []).some(
        (r) => typeof r.selectorText === "string" && flat(r.selectorText).split(",").includes(want) || r.cssRules != null && holds(r.cssRules, depth + 1)
      );
      let where = null;
      for (const sheet of Array.from(document.styleSheets ?? [])) {
        const s = (
          /** @type {any} */
          sheet
        );
        let rules;
        try {
          rules = s.cssRules;
        } catch {
          continue;
        }
        if (!holds(rules, 0)) continue;
        where = "a <style> in the page";
        try {
          if (s.href) {
            const u = new URL(s.href);
            where = u.origin === location.origin ? u.pathname : u.origin + u.pathname;
          } else if (s.ownerNode && s.ownerNode.id) where = `<style id="${String(s.ownerNode.id)}">`;
        } catch {
          where = "a stylesheet";
        }
        where = where.slice(0, 70);
        break;
      }
      return `the selector "${String(q.selector).slice(0, 60)}" matches 0 elements${where === null ? ", and no stylesheet this page loads has a rule for it" : `; the page loads a rule for it, in ${where}`}`;
    }
    if (el === null)
      return `the selector "${String(q.selector).slice(0, 60)}" matches ${list.length} element${list.length === 1 ? "" : "s"}${list.length > 0 ? `, so there is no #${nth} (nth counts from 0: the first is 0)` : ""}`;
  } else {
    const want = norm(q.text);
    const every = Array.from(document.body ? document.body.querySelectorAll("*") : []).filter(
      (x) => !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(x.tagName)
    );
    const all = every.filter(shown);
    let exact = all.filter((x) => own(x) === want);
    how = "exact";
    if (exact.length === 0) {
      exact = all.filter((x) => own(x).toLowerCase() === want.toLowerCase());
      how = "case";
    }
    if (exact.length === 0) {
      const unseen = every.filter((x) => !shown(x));
      exact = unseen.filter((x) => own(x) === want);
      how = "exact";
      if (exact.length === 0) {
        exact = unseen.filter((x) => own(x).toLowerCase() === want.toLowerCase());
        how = "case";
      }
      if (exact.length === 0) how = "exact";
    }
    matches = exact.length;
    if (exact.length > 0) {
      el = exact[nth] ?? null;
      if (el === null)
        return `the words "${want.slice(0, 60)}" show ${exact.length} time${exact.length === 1 ? "" : "s"}, so there is no #${nth} (nth counts from 0: the first is 0)`;
    } else {
      how = "partial";
      const smallest = (list) => list.sort((a, b) => area(a) - area(b))[0] ?? null;
      el = all.find((x) => own(x).startsWith(want)) ?? smallest(all.filter((x) => inner(x) === want)) ?? smallest(all.filter((x) => own(x).includes(want))) ?? smallest(all.filter((x) => inner(x).includes(want)));
      if (el === null) return `no element on this page shows the words "${want.slice(0, 60)}"`;
    }
    const ctl = el.closest('a, button, [role="button"]');
    if (ctl !== null && ctl !== el) {
      let up = 0;
      for (let n = (
        /** @type {Element | null} */
        el
      ); n !== null && n !== ctl; n = n.parentElement) up += 1;
      const t = inner(ctl);
      const w = inner(el);
      if (up <= 3 && t.includes(w) && t.length <= w.length + 4) el = ctl;
    }
  }
  Reflect.set(window, "__tracyLook", { matches, how });
  return el;
}
function describeTarget(props, forSet) {
  const el = this;
  const name2 = (e) => {
    let s = `<${e.tagName.toLowerCase()}`;
    if (e.id) s += `#${e.id}`;
    const cls = typeof e.className === "string" ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 6) : [];
    if (cls.length > 0) s += `.${cls.join(".")}`;
    return `${s.slice(0, 78)}>`;
  };
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (v2) => {
    if (!cx || !v2 || !CSS.supports("color", v2)) return null;
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = v2;
    cx.fillRect(0, 0, 1, 1);
    return Array.from(cx.getImageData(0, 0, 1, 1).data);
  };
  const hex = (c) => `#${c.slice(0, 3).map((x) => x.toString(16).padStart(2, "0")).join("")}${c[3] < 255 ? c[3].toString(16).padStart(2, "0") : ""}`;
  const colorish = (p) => /(^|-)color$/.test(p) || p === "fill" || p === "stroke";
  const cs = getComputedStyle(el);
  const computed = {};
  const hexes = {};
  let paint = 0;
  for (const p of props) {
    let v2 = cs.getPropertyValue(p).trim();
    if (p === "background-color") {
      let e = (
        /** @type {Element | null} */
        el
      );
      let k = 0;
      while (e !== null && (rgba(getComputedStyle(e).backgroundColor) ?? [0, 0, 0, 0])[3] === 0) {
        e = e.parentElement;
        k += 1;
      }
      paint = e === null ? -1 : k;
      if (e !== null) v2 = getComputedStyle(e).backgroundColor;
    }
    computed[p] = v2.slice(0, 200);
    const c = colorish(p) ? rgba(v2) : null;
    if (c !== null) hexes[p] = hex(c);
  }
  const chain = [];
  for (let e = el.parentElement; e !== null && chain.length < 60; e = e.parentElement) chain.push(name2(e));
  const r = el.getBoundingClientRect();
  const found = Reflect.get(window, "__tracyLook") ?? {};
  const words = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(" ").replace(/\s+/g, " ").trim();
  let hidden = false;
  for (let e = (
    /** @type {Element | null} */
    el
  ); e !== null && hidden === false; e = e.parentElement)
    if (getComputedStyle(e).display === "none")
      hidden = e === el ? "display:none" : `display:none on ${name2(e)}`;
  if (hidden === false) {
    if (cs.visibility === "hidden" || cs.visibility === "collapse") hidden = "visibility:hidden";
    else if (Number(cs.opacity) <= 0.05) hidden = "opacity:0";
    else if (r.width < 2 || r.height < 2) hidden = "no size on the page";
  }
  const out = {
    // which physical side a logical property (`padding-inline`, Tailwind's `px-`) sets: `resolveStyles`
    dir: cs.direction,
    wm: cs.writingMode,
    el: name2(el),
    text: (words || String(
      /** @type {HTMLElement} */
      el.innerText ?? ""
    ).replace(/\s+/g, " ").trim()).slice(0, 80),
    matches: found.matches,
    how: found.how,
    hidden,
    computed,
    hex: hexes,
    paint,
    chain
  };
  if (forSet !== true) return out;
  const esc = (v2) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v2) : v2;
  const onlyOf = (target, sel) => {
    try {
      const list = document.querySelectorAll(sel);
      return list.length === 1 && list[0] === target;
    } catch {
      return false;
    }
  };
  const steady = (v2) => /^[A-Za-z_][\w-]*$/.test(v2) && !/\d{5,}/.test(v2) && !/--\d+$/.test(v2) && !/(?:^|[-_])(?=[a-z0-9]*\d[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{6,}$/i.test(v2) && !/^(?:is-|has-)?(?:active|current|open|show|shown|hover|focus|visible|hidden|loaded|selected|collapsed|expanded|animated?)$/.test(
    v2
  );
  const part = (e) => {
    if (e.id && steady(e.id) && document.querySelectorAll(`#${esc(e.id)}`).length === 1)
      return `#${esc(e.id)}`;
    const cls = (typeof e.className === "string" ? e.className.trim().split(/\s+/) : []).filter(steady).slice(0, 3);
    return `${e.tagName.toLowerCase()}${cls.map((c) => `.${esc(c)}`).join("")}`;
  };
  const uniqueOf = (target) => {
    const only = (sel) => onlyOf(target, sel);
    const parts = [part(target)];
    let found2 = parts[0];
    for (let e = target.parentElement; !only(found2) && e !== null && e !== document.body && e !== document.documentElement && parts.length < 6; e = e.parentElement) {
      const p = part(e);
      if (p === e.tagName.toLowerCase()) continue;
      parts.unshift(p);
      found2 = parts.join(" ");
    }
    for (let k = parts.length - 2; k > 0 && only(found2); k -= 1) {
      const fewer = [...parts.slice(0, k), ...parts.slice(k + 1)];
      if (only(fewer.join(" "))) {
        parts.splice(k, 1);
        found2 = parts.join(" ");
      }
    }
    if (!only(found2)) {
      const steps = [];
      for (let e = (
        /** @type {Element | null} */
        target
      ); e !== null && e !== document.body; e = e.parentElement) {
        const kin = e.parentElement ? Array.from(e.parentElement.children).filter((x) => x.tagName === e.tagName) : [e];
        steps.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${kin.indexOf(e) + 1})`);
      }
      found2 = `body > ${steps.join(" > ")}`;
    }
    return found2;
  };
  const unique = uniqueOf(el);
  if (hidden !== false && typeof el.getAttribute === "function") {
    const href = el.getAttribute("href");
    const said = (e) => String(e.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const words2 = said(el);
    const seen2 = (e) => {
      const box = e.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return false;
      const st = getComputedStyle(e);
      return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
    };
    if (typeof href === "string" && href !== "" && words2 !== "") {
      const copies = Array.from(document.querySelectorAll(el.tagName.toLowerCase())).filter(
        (x) => x !== el && typeof x.getAttribute === "function" && x.getAttribute("href") === href && said(x) === words2 && seen2(x)
      ).slice(0, 3);
      if (copies.length > 0)
        out.copies = copies.map((x) => ({ unique: uniqueOf(x).slice(0, 400), el: name2(x) }));
    }
  }
  const band = el.closest('header, footer, nav, [role="banner"], [role="contentinfo"], [role="navigation"]');
  const frameBand = el.closest(
    "#t4-header, #t4-mainnav, #t4-topbar, #t4-footer, #t4-footnav, #t3-header, #t3-mainnav, #t3-topbar, #t3-footer, #t3-footnav, #gkHeader, #gkTop, #gkTopBar, #gkMainMenu, #gkMenuWrap, #gkFooter, #gkFooterNav, #gkFooterNavWrap"
  );
  out.unique = unique.slice(0, 400);
  out.body = String(document.body ? document.body.className : "").slice(0, 400);
  out.chrome = frameBand !== null && el.closest("article") == null || band !== null && band.parentElement?.closest('main, article, [role="main"]') == null;
  const here = location.origin;
  out.sheets = Array.from(document.styleSheets).slice(0, 120).map((sheet) => {
    if (sheet.href) {
      try {
        const u = new URL(sheet.href);
        return (u.origin === here ? u.pathname : u.origin + u.pathname).slice(0, 120);
      } catch {
        return String(sheet.href).slice(0, 120);
      }
    }
    const node = (
      /** @type {Element | null} */
      /** @type {any} */
      sheet.ownerNode ?? null
    );
    const src = Array.from(
      String(node?.textContent ?? "").matchAll(/\/\*[#@] sourceURL=(\S+?)\s*\*\//g)
    ).at(-1);
    if (src) {
      try {
        const u = new URL(src[1]);
        return `${(u.origin === here ? u.pathname : u.origin + u.pathname).slice(0, 120)} (inlined in the page)`;
      } catch {
        return src[1].slice(0, 120);
      }
    }
    return node?.id ? `<style id="${String(node.id).slice(0, 60)}">` : "a <style> in the page";
  });
  const paths = (
    /** @type {string[]} */
    out.sheets.map(
      (name3) => String(name3).replace(/ \(inlined in the page\)$/, "")
    )
  );
  for (const script of Array.from(document.scripts ?? [])) {
    try {
      const u = new URL(String(script.src || ""), here);
      if (u.origin === here) paths.push(u.pathname);
    } catch {
    }
  }
  const seen = /* @__PURE__ */ new Map();
  for (const p of paths) {
    const m = /^\/media\/templates\/site\/([^/]+)\//.exec(p) ?? /^\/templates\/([^/]+)\//.exec(p);
    if (m !== null && m[1] !== "system") seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  let template = null;
  for (const [name3, n] of seen)
    if (template === null || n > /** @type {number} */
    seen.get(template)) template = name3;
  out.template = template;
  out.framework = paths.some((p) => /^\/(?:plugins\/system\/t4|media\/t4)\//.test(p)) ? "t4" : paths.some((p) => /^\/(?:plugins\/system\/t3|media\/t3)\//.test(p)) ? "t3" : null;
  return out;
}
function resolveStyles(input) {
  const INHERITED = /^(color|font(-.*)?|line-height|letter-spacing|word-spacing|text-(align|indent|transform|shadow|rendering)|white-space|visibility|cursor|direction|list-style(-.*)?|quotes|hyphens|word-break|overflow-wrap|tab-size|caret-color|accent-color|color-scheme|fill|stroke(-.*)?|border-collapse|border-spacing|caption-side|empty-cells|--.*)$/;
  const cut = (s, n) => s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
  const info = input.info ?? {};
  const SIDE = (() => {
    const wm = String(info.wm ?? "horizontal-tb");
    const rtl = info.dir === "rtl";
    if (!/^(vertical|sideways)-/.test(wm))
      return {
        "block-start": "top",
        "block-end": "bottom",
        "inline-start": rtl ? "right" : "left",
        "inline-end": rtl ? "left" : "right"
      };
    const lr = wm.endsWith("-lr");
    const up = wm === "sideways-lr" !== rtl;
    return {
      "block-start": lr ? "left" : "right",
      "block-end": lr ? "right" : "left",
      "inline-start": up ? "bottom" : "top",
      "inline-end": up ? "top" : "bottom"
    };
  })();
  const VERTICAL = SIDE["block-start"] === "left" || SIDE["block-start"] === "right";
  const endOf = (side) => (Object.keys(SIDE).find((k) => SIDE[k] === side) ?? "block-start").split("-");
  const physicalOf = (p) => {
    let m;
    if (m = /^(margin|padding)-(block|inline)-(start|end)$/.exec(p))
      return `${m[1]}-${SIDE[`${m[2]}-${m[3]}`]}`;
    if (m = /^inset-(block|inline)-(start|end)$/.exec(p)) return SIDE[`${m[1]}-${m[2]}`];
    if (m = /^border-(block|inline)-(start|end)-(width|style|color)$/.exec(p))
      return `border-${SIDE[`${m[1]}-${m[2]}`]}-${m[3]}`;
    if (m = /^border-(start|end)-(start|end)-radius$/.exec(p)) {
      const two = [SIDE[`block-${m[1]}`], SIDE[`inline-${m[2]}`]];
      const v2 = two.find((x) => x === "top" || x === "bottom");
      const h = two.find((x) => x === "left" || x === "right");
      return `border-${v2}-${h}-radius`;
    }
    if (m = /^(min-|max-)?(inline|block)-size$/.exec(p))
      return `${m[1] ?? ""}${m[2] === "inline" !== VERTICAL ? "width" : "height"}`;
    return null;
  };
  const namesFor = (p) => {
    const out2 = [p];
    if (p.startsWith("--")) return out2;
    let m;
    if (m = /^(margin|padding)-(top|right|bottom|left)$/.exec(p)) {
      const [axis, end] = endOf(m[2]);
      out2.push(`${m[1]}-${axis}`, `${m[1]}-${axis}-${end}`);
    }
    if (m = /^(top|right|bottom|left)$/.exec(p)) {
      const [axis, end] = endOf(m[1]);
      out2.push(`inset-${axis}`, `inset-${axis}-${end}`);
    }
    if (m = /^border-(top|right|bottom|left)-(color|width|style)$/.exec(p)) {
      const [axis, end] = endOf(m[1]);
      out2.push(
        `border-${axis}`,
        `border-${axis}-${m[2]}`,
        `border-${axis}-${end}`,
        `border-${axis}-${end}-${m[2]}`
      );
    }
    if (m = /^border-(top|bottom)-(left|right)-radius$/.exec(p)) {
      const block = VERTICAL ? m[2] : m[1];
      const inline = VERTICAL ? m[1] : m[2];
      out2.push(`border-${endOf(block)[1]}-${endOf(inline)[1]}-radius`);
    }
    if (m = /^(min-|max-)?(width|height)$/.exec(p))
      out2.push(`${m[1] ?? ""}${m[2] === "width" !== VERTICAL ? "inline" : "block"}-size`);
    if (p.startsWith("background-")) out2.push("background");
    if (p === "background-position-x" || p === "background-position-y") out2.push("background-position");
    if (/^font-(family|size|weight|style|variant|stretch)$/.test(p) || p === "line-height") out2.push("font");
    if (m = /^border-(top|right|bottom|left)-(color|width|style)$/.exec(p))
      out2.push("border", `border-${m[1]}`, `border-${m[2]}`);
    if (m = /^border-(color|width|style)$/.exec(p)) out2.push("border");
    if (m = /^(margin|padding|inset)-(top|right|bottom|left)$/.exec(p)) out2.push(m[1]);
    if (/^(top|right|bottom|left)$/.test(p)) out2.push("inset");
    if (/^border-(top|bottom)-(left|right)-radius$/.test(p)) out2.push("border-radius");
    if (p.startsWith("text-decoration-")) out2.push("text-decoration");
    if (p.startsWith("outline-")) out2.push("outline");
    if (p === "row-gap" || p === "column-gap") out2.push("gap");
    if (/^flex-(grow|shrink|basis)$/.test(p)) out2.push("flex");
    if (p.startsWith("list-style-")) out2.push("list-style");
    if (p === "overflow-x" || p === "overflow-y") out2.push("overflow");
    return out2;
  };
  const LONGHANDS = (() => {
    const sides = ["top", "right", "bottom", "left"];
    const kinds = ["width", "style", "color"];
    const m = {
      padding: sides.map((s) => `padding-${s}`),
      margin: sides.map((s) => `margin-${s}`),
      inset: [...sides],
      "border-radius": ["top-left", "top-right", "bottom-right", "bottom-left"].map(
        (c) => `border-${c}-radius`
      ),
      border: sides.flatMap((s) => kinds.map((k) => `border-${s}-${k}`)),
      outline: kinds.map((k) => `outline-${k}`),
      gap: ["row-gap", "column-gap"],
      flex: ["flex-grow", "flex-shrink", "flex-basis"],
      font: [
        "font-style",
        "font-variant",
        "font-weight",
        "font-stretch",
        "font-size",
        "line-height",
        "font-family"
      ],
      background: [
        "background-color",
        "background-image",
        "background-position-x",
        "background-position-y",
        "background-size",
        "background-repeat",
        "background-attachment",
        "background-origin",
        "background-clip"
      ],
      "background-position": ["background-position-x", "background-position-y"],
      "text-decoration": ["line", "style", "color", "thickness"].map((k) => `text-decoration-${k}`),
      "list-style": ["type", "position", "image"].map((k) => `list-style-${k}`),
      overflow: ["overflow-x", "overflow-y"]
    };
    for (const s of sides) m[`border-${s}`] = kinds.map((k) => `border-${s}-${k}`);
    for (const k of kinds) m[`border-${k}`] = sides.map((s) => `border-${s}-${k}`);
    for (const axis of ["block", "inline"]) {
      const two = [SIDE[`${axis}-start`], SIDE[`${axis}-end`]];
      m[`padding-${axis}`] = two.map((s) => `padding-${s}`);
      m[`margin-${axis}`] = two.map((s) => `margin-${s}`);
      m[`inset-${axis}`] = [...two];
      m[`border-${axis}`] = two.flatMap((s) => kinds.map((k) => `border-${s}-${k}`));
      for (const k of kinds) m[`border-${axis}-${k}`] = two.map((s) => `border-${s}-${k}`);
      for (const end of ["start", "end"])
        m[`border-${axis}-${end}`] = kinds.map((k) => `border-${SIDE[`${axis}-${end}`]}-${k}`);
    }
    return m;
  })();
  const decls = (style) => {
    const all = (style?.cssProperties ?? []).filter(
      (d) => d && d.parsedOk !== false && d.disabled !== true && typeof d.value === "string" && d.value !== ""
    );
    return all.some((d) => d.range) ? all.filter((d) => d.range) : all;
  };
  const topSplit = (s, sep) => {
    const parts = [];
    let depth = 0;
    let quote = "";
    let from = 0;
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (quote) {
        if (c === "\\") i += 1;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "\\") i += 1;
      else if (c === "(" || c === "[") depth += 1;
      else if (c === ")" || c === "]") depth -= 1;
      else if (depth === 0 && sep.test(c)) {
        parts.push(s.slice(from, i));
        from = i + 1;
      }
    }
    parts.push(s.slice(from));
    return parts.map((x) => x.trim()).filter((x) => x !== "");
  };
  const unnest = (sel, parents) => {
    let out2 = sel;
    for (const parent of parents) {
      const list = topSplit(parent, /,/);
      const compound = list.length === 1 && topSplit(list[0], /[\s>+~]/).length === 1;
      const whole = list.length === 1 ? list[0] : `:is(${parent})`;
      out2 = topSplit(out2, /,/).map((one) => {
        if (!one.includes("&")) return `${whole} ${one}`;
        if (compound) return one.replaceAll("&", list[0]);
        if (/^&(?=[\s>+~]|$)/.test(one) && list.length === 1 && !one.slice(1).includes("&"))
          return `${list[0]}${one.slice(1)}`;
        return one.replaceAll("&", `:is(${parent})`);
      }).join(", ");
    }
    return out2;
  };
  const ruleName = (rm) => {
    const sels = rm.rule.selectorList?.selectors ?? [];
    const parents = rm.rule.nestingSelectors ?? [];
    const picked = (rm.matchingSelectors ?? []).map((k) => sels[k]?.text).filter(Boolean).map((one) => parents.length > 0 ? unnest(String(one), parents) : String(one));
    let by = cut(
      (picked.length > 0 ? picked.join(", ") : rm.rule.selectorList?.text ?? "?").replace(/\s+/g, " "),
      100
    );
    const media = (rm.rule.media ?? []).find((x) => x.source === "mediaRule" && x.text && x.text !== "all");
    if (media) by += ` @media ${cut(String(media.text), 60)}`;
    const layer = (rm.rule.layers ?? []).map((x) => x.text).filter(Boolean).join(".");
    if (layer) by += ` @layer ${cut(layer, 40)}`;
    return by;
  };
  const compareRank = (x, y) => {
    for (let i = 0; i < Math.max(x.length, y.length); i += 1)
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  const winnerIn = (entry, names) => {
    const found = [];
    const take = (style, as) => {
      for (const d of decls(style)) {
        if (!names.includes(d.name)) continue;
        const bang = /\s*!\s*important\s*$/i.test(d.value);
        found.push(
          as(bang ? { ...d, value: d.value.replace(/\s*!\s*important\s*$/i, ""), important: true } : d)
        );
      }
    };
    const rules = entry?.matchedCSSRules ?? [];
    const layerAt = /* @__PURE__ */ new Map();
    const layerOf = (rm) => (rm.rule.layers ?? []).length > 0 ? (rm.rule.layers ?? []).map((x) => x.text ?? "").join(".") : null;
    for (const [pos, rm] of rules.entries()) {
      const key = layerOf(rm);
      if (key !== null && !layerAt.has(key)) layerAt.set(key, pos);
    }
    const rankAt = (tier, layer, pos) => (important) => important ? [1, tier, layer === null ? 0 : rules.length + 1 - (layerAt.get(layer) ?? 0), pos] : [0, 0, 0, pos];
    const ranked = (w, rank) => (
      /** @type {Winner} */
      { ...w, rank: rank(w.important) }
    );
    take(
      entry?.attributesStyle,
      (d) => ranked(
        {
          value: `${d.name}: ${d.value}`,
          important: false,
          by: "an HTML attribute",
          sheet: null,
          line: null,
          pos: -1,
          spec: null,
          layer: null
        },
        rankAt(1, null, -1)
      )
    );
    for (const [pos, rm] of rules.entries()) {
      const ua = rm.rule.origin === "user-agent";
      const sels = rm.rule.selectorList?.selectors ?? [];
      const line = sels[rm.matchingSelectors?.[0] ?? 0]?.range?.startLine;
      const specs = (rm.matchingSelectors ?? []).map((k) => sels[k]?.specificity).filter(
        /** @returns {x is { a: number, b: number, c: number }} */
        (x) => !!x && typeof x.a === "number"
      ).map((x) => [x.a, x.b, x.c]).sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2]);
      const layer = layerOf(rm);
      take(
        rm.rule.style,
        (d) => ranked(
          {
            value: `${d.name}: ${d.value}`,
            important: d.important === true,
            by: ua ? "the browser default" : ruleName(rm),
            sheet: ua ? null : rm.rule.styleSheetId ?? null,
            // line 1 of a minified bundle locates nothing; the selector does
            line: typeof line === "number" && line > 0 ? line + 1 : null,
            pos,
            spec: ua ? null : specs[0] ?? null,
            layer: ua ? null : layer
          },
          rankAt(ua ? 3 : 1, ua ? null : layer, pos)
        )
      );
    }
    take(
      entry?.inlineStyle,
      (d) => ranked(
        {
          value: `${d.name}: ${d.value}`,
          important: d.important === true,
          by: "its style attribute",
          sheet: null,
          line: null,
          pos: rules.length,
          spec: null,
          layer: null
        },
        rankAt(2, null, rules.length)
      )
    );
    if (found.length === 0) return null;
    return found.reduce((best, w) => compareRank(w.rank, best.rank) >= 0 ? w : best);
  };
  const valueOf = (w) => w.value.slice(w.value.indexOf(":") + 2);
  const winnerFor = (p, entries) => {
    for (let k = 0; k < entries.length; k += 1) {
      const w = winnerIn(entries[k], namesFor(p));
      const passes = w !== null && (/^inherit$/i.test(valueOf(w)) || INHERITED.test(p) && /^unset$/i.test(valueOf(w)));
      if (w !== null && !passes) return { win: w, at: k };
      if (!INHERITED.test(p) && !passes) break;
    }
    return { win: null, at: -1 };
  };
  const declText = (w) => `${w.value}${w.important ? " !important" : ""}`;
  const chain = info.chain ?? [];
  const out = {};
  const sheets = /* @__PURE__ */ new Set();
  for (const p of input.props) {
    const painted = p === "background-color" && (info.paint ?? 0) > 0 && input.painter;
    const base = painted ? (
      /** @type {number} */
      info.paint
    ) : 0;
    const top = painted ? (
      /** @type {CdpMatched} */
      input.painter
    ) : input.matched;
    const entries = [top, ...top?.inherited ?? []];
    const onName = (k) => base + k === 0 ? null : chain[base + k - 1] ?? "an ancestor";
    const row = { value: info.computed?.[p] ?? null };
    if (info.hex?.[p]) row.hex = info.hex[p];
    const side = physicalOf(p) ?? p;
    const longhands = painted ? void 0 : LONGHANDS[p] ?? LONGHANDS[side];
    let { win, at } = longhands === void 0 ? winnerFor(side, entries) : { win: null, at: -1 };
    let groups = [];
    if (longhands !== void 0) {
      for (const name2 of longhands) {
        const one = winnerFor(name2, entries);
        const same = groups.find((g) => g.at === one.at && g.wins[0]?.pos === one.win?.pos);
        const into = same ?? { names: [], wins: [], at: one.at };
        if (same === void 0) groups.push(into);
        into.names.push(name2);
        if (one.win !== null && !into.wins.some((w) => declText(w) === declText(
          /** @type {Winner} */
          one.win
        )))
          into.wins.push(one.win);
      }
      const strongest = (g) => g.wins.reduce(
        (best, w) => compareRank(w.rank, best) > 0 ? w.rank : best,
        /** @type {number[]} */
        []
      );
      groups.sort(
        (a, b) => (a.wins.length === 0 ? 1 : 0) - (b.wins.length === 0 ? 1 : 0) || a.at - b.at || compareRank(strongest(b), strongest(a))
      );
      win = groups[0].wins[0] ?? null;
      at = groups[0].at;
      if (groups.length === 1 && groups[0].wins.length <= 1) groups = [];
    }
    if (painted) row.on = `painted by ${onName(0)}`;
    if (win === null) {
      row.set = null;
      row.by = INHERITED.test(p) ? "no rule on it or its ancestors: the browser default" : "no rule sets it: the browser default";
      out[p] = row;
      continue;
    }
    if (at > 0) row.on = `${painted ? `${row.on}, ` : ""}inherited from ${onName(at)}`;
    row.set = cut(groups.length > 0 ? groups[0].wins.map(declText).join("; ") : declText(win), 160);
    row.by = win.by;
    if (win.sheet !== null) {
      row.sheet = win.sheet;
      sheets.add(win.sheet);
    }
    if (win.line !== null) row.line = win.line;
    if (win.spec !== null) row.spec = win.spec;
    if (win.layer !== null) row.layer = win.layer;
    if (groups.length > 0) row.split = true;
    if (groups.length > 1)
      row.parts = groups.map((g) => {
        const w = g.wins[0];
        const part = { props: g.names };
        if (w === void 0) {
          part.set = null;
          part.by = INHERITED.test(g.names[0]) ? "no rule on it or its ancestors: the browser default" : "no rule sets it: the browser default";
          return part;
        }
        part.set = cut(g.wins.map(declText).join("; "), 160);
        part.by = w.by;
        if (w.sheet !== null) {
          part.sheet = w.sheet;
          sheets.add(w.sheet);
        }
        if (w.line !== null) part.line = w.line;
        if (w.spec !== null) part.spec = w.spec;
        if (w.layer !== null) part.layer = w.layer;
        if (g.at > 0) part.on = `inherited from ${onName(g.at)}`;
        return part;
      });
    const tokens = [];
    const seen = /* @__PURE__ */ new Set();
    const follow = (value, from, depth) => {
      if (depth > 4) return;
      for (const m of value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
        const name2 = m[1];
        if (seen.has(name2) || tokens.length >= 6) continue;
        seen.add(name2);
        let got = null;
        let k = from;
        for (; k < entries.length; k += 1) {
          got = winnerIn(entries[k], [name2]);
          if (got !== null) break;
        }
        if (got === null) {
          tokens.push({ name: name2, value: null });
          continue;
        }
        const t = { name: name2, value: cut(valueOf(got), 120), by: got.by };
        if (got.sheet !== null) {
          t.sheet = got.sheet;
          sheets.add(got.sheet);
        }
        if (got.line !== null) t.line = got.line;
        const where = onName(k);
        t.on = where ?? "the element itself";
        tokens.push(t);
        follow(valueOf(got), k, depth + 1);
      }
    };
    if (groups.length === 0) follow(valueOf(win), at, 0);
    else for (const g of groups) for (const w of g.wins) follow(valueOf(w), g.at, 0);
    if (tokens.length > 0) row.tokens = tokens;
    out[p] = row;
  }
  return { props: out, sheets: [...sheets] };
}

// ../../tools/tracy-site-tools/src/host/exec.mjs
var AGENT_TOKEN_PATH = "/run/tracy-agent.token";
var EMDASH_MCP_LOOPBACK = "http://127.0.0.1:4321/_emdash/api/mcp";
var PROBE_MAX_HOPS = 5;
var FETCH_MAX_BYTES = 4 * 1024 * 1024;
var PROBE_SCRIPT = 'const u=process.argv[1];const ms=Number(process.argv[2])||2000;const via=process.argv[3]||"";const MAX=' + PROBE_MAX_HOPS + ';let start=null;try{start=new URL(u)}catch{}const vm=/^127\\.0\\.0\\.1:([0-9]{1,5})$/.exec(via);const get=(url)=>{if(!via)return fetch(url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(ms)}).then(async(r)=>{try{await(r.body&&r.body.cancel&&r.body.cancel())}catch{}return{status:r.status,location:r.headers.get("location")||""}});const t=new URL(url);return new Promise((res,rej)=>{const q=require("http").request({host:"127.0.0.1",port:Number(vm[1]),method:"GET",path:t.pathname+t.search,headers:{host:t.host,"x-forwarded-proto":t.protocol.slice(0,-1),"accept-encoding":"identity"}},(r)=>{res({status:r.statusCode,location:String(r.headers.location||"")});r.destroy()});q.on("error",rej);q.setTimeout(ms,()=>q.destroy(new Error("timed out")));q.end()})};(async()=>{if(start===null){process.stdout.write("TRACY_PROBE_ERR the probe url is not a url");return}if(via&&(!vm||Number(vm[1])<1||Number(vm[1])>65535)){process.stdout.write("TRACY_PROBE_ERR the probe route is not a loopback port");return}const startHost=start.host,startProto=start.protocol;let url=u;for(let i=0;i<MAX;i++){let r;try{r=await get(url)}catch(e){process.stdout.write("TRACY_PROBE_ERR "+((e&&e.message)||String(e)));return}if(r.status>=300&&r.status<400){const loc=r.location;let next;try{next=new URL(loc,url)}catch{process.stdout.write("TRACY_PROBE "+r.status+" "+url);return}if(next.host===startHost&&next.protocol===startProto){url=next.href;continue}process.stdout.write("TRACY_PROBE_REDIR "+r.status+" "+url+" "+next.href);return}process.stdout.write("TRACY_PROBE "+r.status+" "+url);return}process.stdout.write("TRACY_PROBE_ERR too many redirects")})();';
var MCP_FETCH_ABORT_MS = 11e4;
var MCP_TOKEN_PRELUDE = `const fs=require("fs");let t="";try{t=fs.readFileSync(${JSON.stringify(AGENT_TOKEN_PATH)},"utf8").trim()}catch{process.stdout.write("TRACY_MCP_ERR NO_TOKEN the agent token file is not present");process.exit(0)}if(!/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(t)){process.stdout.write("TRACY_MCP_ERR NO_TOKEN the agent token file is malformed");process.exit(0)}const red=s=>String(s).split(t).join("[REDACTED]");`;
var MCP_SCRIPT = MCP_TOKEN_PRELUDE + `let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{fetch(${JSON.stringify(EMDASH_MCP_LOOPBACK)},{method:"POST",redirect:"error",signal:AbortSignal.timeout(${MCP_FETCH_ABORT_MS}),headers:{authorization:"Bearer "+t,"content-type":"application/json",accept:"application/json, text/event-stream","X-EmDash-Request":"1"},body:b}).then(r=>r.text().then(x=>process.stdout.write("TRACY_MCP "+r.status+"\\n"+red(x)))).catch(e=>process.stdout.write("TRACY_MCP_ERR SITE "+red((e&&e.message)||String(e))))});`;
var EMDASH_REDIRECTS_LOOPBACK = "http://127.0.0.1:4321/_emdash/api/redirects";
var REDIRECTS_SCRIPT = MCP_TOKEN_PRELUDE + `const method=process.argv[1]||"GET",suffix=process.argv[2]||"";if(!["GET","POST","DELETE"].includes(method)||!/^(\\/[0-9A-Za-z]{1,40}|\\?[A-Za-z0-9_=&%.~-]{0,600})?$/.test(suffix)){process.stdout.write("TRACY_REDIRECTS_ERR SITE bad request");process.exit(0)}let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{fetch(${JSON.stringify(EMDASH_REDIRECTS_LOOPBACK)}+suffix,{method,redirect:"error",signal:AbortSignal.timeout(${MCP_FETCH_ABORT_MS}),headers:Object.assign({authorization:"Bearer "+t,accept:"application/json","X-EmDash-Request":"1"},method==="POST"?{"content-type":"application/json"}:{}),body:method==="POST"?b:undefined}).then(r=>r.text().then(x=>process.stdout.write("TRACY_REDIRECTS "+r.status+"\\n"+red(x)))).catch(e=>process.stdout.write("TRACY_REDIRECTS_ERR SITE "+red((e&&e.message)||String(e))))});`;
var EMDASH_FORMS_LOOPBACK = "http://127.0.0.1:4321/_emdash/api/plugins/emdash-forms/";
var FORMS_SCRIPT = MCP_TOKEN_PRELUDE + `const route=process.argv[1]||"";if(!["forms/list","forms/update"].includes(route)){process.stdout.write("TRACY_FORMS_ERR SITE bad request");process.exit(0)}let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{fetch(${JSON.stringify(EMDASH_FORMS_LOOPBACK)}+route,{method:"POST",redirect:"error",signal:AbortSignal.timeout(${MCP_FETCH_ABORT_MS}),headers:{authorization:"Bearer "+t,accept:"application/json","X-EmDash-Request":"1","content-type":"application/json"},body:b||"{}"}).then(r=>r.text().then(x=>process.stdout.write("TRACY_FORMS "+r.status+"\\n"+red(x)))).catch(e=>process.stdout.write("TRACY_FORMS_ERR SITE "+red((e&&e.message)||String(e))))});`;
var BROWSER_SETTLE_MS = 5e3;
var BROWSER_DEADLINE_MS = 22e3;
var BROWSER_FLUSH_MS = 2e3;
var VIEW_LOAD_MS = 6e3;
var VIEW_QUALITY = 70;
function scrollForView(y, waits) {
  const root = document.documentElement;
  root.style.setProperty("scroll-behavior", "auto", "important");
  if (document.body) document.body.style.setProperty("scroll-behavior", "auto", "important");
  window.scrollTo({ top: y, left: 0, behavior: "instant" });
  if (waits === null) return Math.round(window.scrollY);
  const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return later(waits.settle).then(() => {
    const inView = Array.from(document.images).filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    });
    const loads = inView.map(
      (img) => img.complete ? null : new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      })
    );
    return Promise.race([Promise.all(loads), later(waits.images)]);
  }).then(() => Math.round(window.scrollY));
}
var VIEW_WAITS = /* @__PURE__ */ Object.freeze({ settle: 500, images: 1500 });
var BROWSER_SERVE_MS = 1e4;
var BROWSER_SERVE_MAX = 32 * 1024 * 1024;
var BROWSER_SCRIPT = `const {spawn}=require('child_process');const fs=require('fs');const os=require('os');const path=require('path');const mode=process.argv[1],url=process.argv[2],origin=process.argv[3],file=process.argv[4]||"";const req=mode==='style'?(()=>{try{const r=JSON.parse(file);return r&&typeof r==='object'&&Array.isArray(r.props)?r:null}catch{return null}})():null;const vreq=mode==='view'?(()=>{try{const r=JSON.parse(file);return r&&typeof r==='object'&&Number.isInteger(r.w)&&Number.isInteger(r.h)&&Number.isInteger(r.y)&&r.w>0&&r.h>0&&r.y>=0?r:null}catch{return null}})():null;const FIND=${JSON.stringify(String(findTarget))},DESCRIBE=${JSON.stringify(String(describeTarget))},VPS=${JSON.stringify(STYLE_VIEWPORTS)};const SCROLL=${JSON.stringify(String(scrollForView))},VIEWW=${JSON.stringify(VIEW_WAITS)};const RESOLVE=(${String(resolveStyles)});const PSEL=(${String(paintSelectors)}),PAINTS=${JSON.stringify(String(countPaints))};const sheets={};let onLoad=null;const loaded=new Promise((r)=>{onLoad=r});const PROBE=` + JSON.stringify(STYLE_PROBE) + ";const SETTLE_MS=Number(process.argv[5])||" + BROWSER_SETTLE_MS + ",DEADLINE_MS=Number(process.argv[6])||" + BROWSER_DEADLINE_MS + ",FLUSH_MS=Number(process.argv[7])||" + BROWSER_FLUSH_MS + ";const via=(process.env&&process.env.TRACY_PUBLIC_VIA)||'';const viaM=/^127\\.0\\.0\\.1:([0-9]{1,5})$/.exec(via);const CHROME=(process.env&&process.env.TRACY_CHROME)||'chromium';const serveIn=(process.env&&process.env.TRACY_SERVE_CONTAINER)||'';let profile='';try{profile=fs.mkdtempSync(path.join(os.tmpdir(),'tracy-look-'))}catch{}let child=null,hard=null,finished=false,sid=null,topFrame=null,offsite=null,navStarted=false,errorText=null;const clean=()=>{try{if(profile)fs.rmSync(profile,{recursive:true,force:true})}catch{}};if(process.on)process.on('exit',clean);const stop=()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}try{child.kill('SIGKILL')}catch{}};const done=(line)=>{if(finished)return;finished=true;if(hard)clearTimeout(hard);if(child)stop();clean();const bail=setTimeout(()=>process.exit(1),FLUSH_MS);try{process.stdout.write(line,()=>{clearTimeout(bail);process.exit(0)})}catch{clearTimeout(bail);process.exit(1)}};if(process.on)process.on('SIGTERM',()=>done('TRACY_BROWSER ERR stopped'));const flags=['--headless=new','--disable-features=MacAppCodeSignClone','--disable-gpu','--no-crash-upload','--disable-breakpad','--no-first-run','--no-default-browser-check','--remote-debugging-pipe'];if(mode==='shot'||mode==='styles')flags.push('--hide-scrollbars','--window-size=1280,800');if(mode==='style'||mode==='view')flags.push('--hide-scrollbars');if(!serveIn&&process.env&&process.env.TRACY_RESOLVER_RULE)flags.push(process.env.TRACY_RESOLVER_RULE);if(serveIn)flags.push('--host-resolver-rules=MAP * ~NOTFOUND','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>');if(!profile){done('TRACY_BROWSER ERR could not create a private browser profile')}else if(via&&(!viaM||Number(viaM[1])<1||Number(viaM[1])>65535)){done('TRACY_BROWSER ERR the public route is not a loopback port')}else if(serveIn&&(!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(serveIn)||!viaM||(mode!=='styles'&&mode!=='view'))){done('TRACY_BROWSER ERR the host route needs a container name, its loopback port and the styles or view mode')}else if(mode==='style'&&!req){done('TRACY_BROWSER ERR the style request is not a JSON object with props')}else if(mode==='view'&&!vreq){done('TRACY_BROWSER ERR the view request is not a JSON object with w, h and y')}else{flags.push('--user-data-dir='+profile);child=spawn(CHROME,[...flags,'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe'],detached:true});child.on('error',(e)=>done('TRACY_BROWSER NOCHROME '+((e&&e.message)||String(e))));const pending=new Map();child.on('exit',(code,sig)=>{if(finished)return;const why='chromium exited'+(code!=null?' ('+code+')':sig?' ('+sig+')':'');for(const f of pending.values())f({error:{message:why}});pending.clear();done('TRACY_BROWSER NOCHROME '+why)});hard=setTimeout(()=>done('TRACY_BROWSER ERR timed out'),DEADLINE_MS);const wr=child.stdio[3],rd=child.stdio[4];let buf=Buffer.alloc(0),id=0;wr.on('error',()=>{});rd.on('error',()=>{});const send=(method,params,session)=>new Promise((res,rej)=>{const n=++id;pending.set(n,(m)=>{if(m&&m.error)rej(new Error(method+': '+((m.error&&m.error.message)||JSON.stringify(m.error))));else res(m)});const o={id:n,method,params:params||{}};if(session)o.sessionId=session;try{wr.write(JSON.stringify(o)+'\\0')}catch(e){pending.delete(n);rej(e instanceof Error?e:new Error(String(e)))}});const parseHttp=(b)=>{let off=0;for(let g=0;g<5;g++){const e=b.indexOf('\\r\\n\\r\\n',off);if(e===-1)return null;const head=b.slice(off,e).toString('latin1').split('\\r\\n');const sm=/^HTTP\\/[0-9.]+ ([0-9]{3})/.exec(head[0]||'');if(!sm)return null;const code=Number(sm[1]);off=e+4;if(code<200)continue;const hs=[];for(const line of head.slice(1)){const i=line.indexOf(':');if(i<1)continue;const name=line.slice(0,i).trim(),l=name.toLowerCase();if(l==='content-encoding'||l==='transfer-encoding'||l==='content-length'||l==='connection'||l==='keep-alive')continue;hs.push({name,value:line.slice(i+1).trim()})}return{responseCode:code,responseHeaders:hs,body:b.slice(off).toString('base64')}}return null};let running=0;const waiting=[];const next=()=>{while(running<4&&waiting.length>0){running++;waiting.shift()(()=>{running--;next()})}};const serveExec=(p)=>{const rid=p.requestId;let settled=false;const fin=(o)=>{if(settled||finished)return;settled=true;if(o)send('Fetch.fulfillRequest',Object.assign({requestId:rid},o),sid).catch(()=>{});else send('Fetch.failRequest',{requestId:rid,errorReason:'ConnectionFailed'},sid).catch(()=>{})};let t;try{t=new URL(p.request.url)}catch{return fin(null)}const args=['exec','-u','www-data',serveIn,'curl','-sS','-i','--http1.1','--max-time','" + Math.ceil(BROWSER_SERVE_MS / 1e3) + "','--max-filesize','" + BROWSER_SERVE_MAX + "','-H','Host: '+t.host,'-H','X-Forwarded-Proto: '+t.protocol.slice(0,-1),'-H','Accept-Encoding: identity'];const rh=(p.request&&p.request.headers)||{};for(const k of Object.keys(rh)){const l=k.toLowerCase();if(l==='host'||l==='connection'||l==='accept-encoding'||l==='content-length')continue;const v=String(rh[k]);if(/[\\r\\n]/.test(k+v))continue;args.push('-H',k+': '+v)}args.push('http://127.0.0.1:'+viaM[1]+t.pathname+t.search);waiting.push((release)=>{if(finished||settled)return release();require('child_process').execFile('docker',args,{encoding:'buffer',maxBuffer:" + BROWSER_SERVE_MAX + "+65536,timeout:" + BROWSER_SERVE_MS + "+2000},(err,out)=>{release();fin(err||!out?null:parseHttp(out))})});next()};const serve=(p)=>{const rid=p.requestId;let settled=false;const fin=(o)=>{if(settled||finished)return;settled=true;if(o)send('Fetch.fulfillRequest',Object.assign({requestId:rid},o),sid).catch(()=>{});else send('Fetch.failRequest',{requestId:rid,errorReason:'ConnectionFailed'},sid).catch(()=>{})};let t;try{t=new URL(p.request.url)}catch{return fin(null)}const rh=(p.request&&p.request.headers)||{},h={};for(const k of Object.keys(rh)){const l=k.toLowerCase();if(l==='host'||l==='connection'||l==='accept-encoding'||l==='content-length')continue;h[k]=rh[k]}h.host=t.host;h['x-forwarded-proto']=t.protocol.slice(0,-1);h['accept-encoding']='identity';const body=typeof p.request.postData==='string'?Buffer.from(p.request.postData):null;if(body)h['content-length']=String(body.length);let q;try{q=require('http').request({host:'127.0.0.1',port:Number(viaM[1]),method:p.request.method||'GET',path:t.pathname+t.search,headers:h},(r)=>{const cs=[];let n=0;r.on('data',(d)=>{n+=d.length;if(n>" + BROWSER_SERVE_MAX + "){r.destroy();return fin(null)}cs.push(d)});r.on('error',()=>fin(null));r.on('end',()=>{const hs=[],raw=r.rawHeaders||[];for(let i=0;i+1<raw.length;i+=2){const l=String(raw[i]).toLowerCase();if(l==='content-encoding'||l==='transfer-encoding'||l==='content-length'||l==='connection'||l==='keep-alive')continue;hs.push({name:String(raw[i]),value:String(raw[i+1])})}fin({responseCode:r.statusCode,responseHeaders:hs,body:Buffer.concat(cs).toString('base64')})})})}catch{return fin(null)}q.on('error',()=>fin(null));q.setTimeout(" + BROWSER_SERVE_MS + `,()=>q.destroy(new Error('timed out')));if(body)q.write(body);q.end()};const onEvent=(m)=>{if(m.method==='Page.loadEventFired'){if(onLoad)onLoad();return}if(m.method==='CSS.styleSheetAdded'){const h=m.params&&m.params.header;if(h&&h.styleSheetId)sheets[h.styleSheetId]=h;return}if(m.method==='Page.frameNavigated'){const fr=(m.params&&m.params.frame)||{};if(navStarted&&fr.id===topFrame&&!fr.parentId){let good=false;try{good=new URL(fr.url).origin===origin}catch{}if(!good){if(fr.url&&fr.url.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(fr.url||offsite||'unknown'))}}return}if(m.method!=='Fetch.requestPaused')return;const p=m.params||{};const rid=p.requestId,ru=(p.request&&p.request.url)||"";let allow=true;if(p.resourceType==='Document'&&p.frameId===topFrame){try{allow=new URL(ru).origin===origin}catch{allow=false}}if(allow&&serveIn){let own=false;try{own=new URL(ru).origin===origin}catch{}const kind=p.resourceType;const served=kind==='Document'||kind==='Stylesheet'||(mode==='view'&&(kind==='Image'||kind==='Font'));if(own&&served&&(p.request&&p.request.method)==='GET')return serveExec(p);send('Fetch.failRequest',{requestId:rid,errorReason:'BlockedByClient'},sid).catch(()=>{});return}if(allow&&via){let own=false;try{own=new URL(ru).origin===origin}catch{}if(own)return serve(p)}if(allow){send('Fetch.continueRequest',{requestId:rid},sid).catch(()=>{})}else{offsite=ru;send('Fetch.failRequest',{requestId:rid,errorReason:'Aborted'},sid).catch(()=>{});done('TRACY_BROWSER OFFSITE '+ru)}};rd.on('data',(d)=>{if(finished)return;buf=Buffer.concat([buf,d]);let i;while((i=buf.indexOf(0))!==-1){let m=null;try{m=JSON.parse(buf.slice(0,i))}catch{}buf=buf.slice(i+1);if(!m)continue;if(m.id&&pending.has(m.id)){const f=pending.get(m.id);pending.delete(m.id);f(m)}else if(m.method)onEvent(m)}});(async()=>{const t=await send('Target.createTarget',{url:'about:blank'});const a=await send('Target.attachToTarget',{targetId:t.result&&t.result.targetId,flatten:true});sid=a.result&&a.result.sessionId;await send('Page.enable',{},sid);const ft=await send('Page.getFrameTree',{},sid);topFrame=ft.result&&ft.result.frameTree&&ft.result.frameTree.frame&&ft.result.frameTree.frame.id;await send('Fetch.enable',{patterns:via?[{urlPattern:'*',requestStage:'Request'}]:[{urlPattern:'*',resourceType:'Document',requestStage:'Request'}]},sid);if(mode==='style'){const vp=Object.prototype.hasOwnProperty.call(VPS,req.viewport)?VPS[req.viewport]:VPS.desktop;await send('Emulation.setDeviceMetricsOverride',{width:vp.width,height:vp.height,deviceScaleFactor:1,mobile:vp.mobile},sid);if(vp.mobile)await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},sid);await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}]},sid)}if(mode==='view'){await send('Emulation.setDeviceMetricsOverride',{width:vreq.w,height:vreq.h,deviceScaleFactor:1,mobile:false},sid);await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:vreq.dark===true?'dark':'light'},{name:'prefers-reduced-motion',value:'reduce'}]},sid)}if(serveIn)await send('Emulation.setScriptExecutionDisabled',{value:true},sid);navStarted=true;const nav=await send('Page.navigate',{url},sid);errorText=nav.result&&nav.result.errorText;let loadedInTime=true;if(mode==='style'){loadedInTime=await Promise.race([loaded.then(()=>true),new Promise((r)=>setTimeout(()=>r(false),Math.max(SETTLE_MS,DEADLINE_MS-7000)))]);await new Promise((r)=>setTimeout(r,Math.min(300,SETTLE_MS)))}else if(mode==='view'){loadedInTime=await Promise.race([loaded.then(()=>true),new Promise((r)=>setTimeout(()=>r(false),Math.max(Math.min(SETTLE_MS,300),Math.min(` + VIEW_LOAD_MS + ",DEADLINE_MS-9000))))]);await new Promise((r)=>setTimeout(r,Math.min(300,SETTLE_MS)))}else await new Promise((r)=>setTimeout(r,SETTLE_MS));if(finished)return;if(mode==='shot'){const h1=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);const u1=h1.result&&h1.result.result&&h1.result.result.value;let ok1=false;try{ok1=new URL(u1).origin===origin}catch{}if(!ok1){if(u1&&u1.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(u1||offsite||'unknown'))}const shot=await send('Page.captureScreenshot',{format:'png'},sid);const b64=shot.result&&shot.result.data;if(!b64)return done('TRACY_BROWSER ERR no screenshot data');if(finished)return;const h2=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);const u2=h2.result&&h2.result.result&&h2.result.result.value;let ok2=false;try{ok2=new URL(u2).origin===origin}catch{}if(!ok2)return done('TRACY_BROWSER OFFSITE '+(u2||offsite||'unknown'));try{fs.writeFileSync(file,Buffer.from(b64,'base64'))}catch(e){return done('TRACY_BROWSER ERR '+((e&&e.message)||String(e)))}return done('TRACY_BROWSER OK '+u2)}if(mode==='view'){const h1=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);const u1=h1.result&&h1.result.result&&h1.result.result.value;let ok1=false;try{ok1=new URL(u1).origin===origin}catch{}if(!ok1){if(u1&&u1.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(u1||offsite||'unknown'))}const sc=await send('Runtime.evaluate',{expression:'('+SCROLL+')('+JSON.stringify(vreq.y)+','+(serveIn?'null':JSON.stringify(VIEWW))+')',awaitPromise:!serveIn,returnByValue:true},sid);const at=sc.result&&sc.result.result&&sc.result.result.value;if(serveIn)await new Promise((r)=>setTimeout(r,VIEWW.settle+VIEWW.images));if(finished)return;const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:" + VIEW_QUALITY + `},sid);const b64=shot.result&&shot.result.data;if(!b64)return done('TRACY_BROWSER ERR no screenshot data');if(finished)return;const h2=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);const u2=h2.result&&h2.result.result&&h2.result.result.value;let ok2=false;try{ok2=new URL(u2).origin===origin}catch{}if(!ok2)return done('TRACY_BROWSER OFFSITE '+(u2||offsite||'unknown'));return done('TRACY_BROWSER OK '+u2+'\\n'+JSON.stringify({y:typeof at==='number'?at:null,loaded:loadedInTime,jpeg:b64}))}if(mode==='style'){const h1=await send('Runtime.evaluate',{expression:'document.location.href',returnByValue:true},sid);const u1=h1.result&&h1.result.result&&h1.result.result.value;let ok1=false;try{ok1=new URL(u1).origin===origin}catch{}if(!ok1){if(u1&&u1.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(u1||offsite||'unknown'))}const f=await send('Runtime.evaluate',{expression:'('+FIND+')('+JSON.stringify(req)+')',returnByValue:false},sid);const ro=f.result&&f.result.result;if(!ro||ro.subtype!=='node'||!ro.objectId)return done('TRACY_BROWSER OK '+u1+'\\n'+JSON.stringify({error:String((ro&&ro.value)||'the page returned no element'),loaded:loadedInTime}));const dv=await send('Runtime.callFunctionOn',{objectId:ro.objectId,functionDeclaration:DESCRIBE,arguments:[{value:req.props},{value:req.set===true}],returnByValue:true},sid);const info=(dv.result&&dv.result.result&&dv.result.result.value)||{};await send('DOM.enable',{},sid);await send('CSS.enable',{},sid);await send('DOM.getDocument',{depth:0},sid);const matchedOf=async(oid)=>{const n=await send('DOM.requestNode',{objectId:oid},sid);const r=await send('CSS.getMatchedStylesForNode',{nodeId:n.result&&n.result.nodeId},sid);return r.result||{}};const mt=await matchedOf(ro.objectId);let painter=null;if(info.paint>0){const a=await send('Runtime.callFunctionOn',{objectId:ro.objectId,functionDeclaration:'function(k){let e=this;while(k-->0&&e.parentElement)e=e.parentElement;return e}',arguments:[{value:info.paint}]},sid);const ao=a.result&&a.result.result;if(ao&&ao.objectId)painter=await matchedOf(ao.objectId)}const got=RESOLVE({props:req.props,info,matched:mt,painter});if(req.set===true){try{const ps=PSEL(got.props||{});if(ps.some(Boolean)){const pc=await send('Runtime.evaluate',{expression:'('+PAINTS+')('+JSON.stringify(ps)+')',returnByValue:true},sid);const ns=pc.result&&pc.result.result&&pc.result.result.value;if(Array.isArray(ns))Object.values(got.props).forEach((r,i)=>{if(r&&typeof ns[i]==='number'&&ns[i]>=0)r.paints=ns[i]})}}catch{}}const copies=[];if(req.set===true&&Array.isArray(info.copies)){for(const c of info.copies.slice(0,3)){try{const q=await send('Runtime.evaluate',{expression:'document.querySelector('+JSON.stringify(String(c.unique))+')',returnByValue:false},sid);const co=q.result&&q.result.result;if(!co||co.subtype!=='node'||!co.objectId)continue;const cd=await send('Runtime.callFunctionOn',{objectId:co.objectId,functionDeclaration:DESCRIBE,arguments:[{value:req.props},{value:false}],returnByValue:true},sid);const ci=(cd.result&&cd.result.result&&cd.result.result.value)||{};const cg=RESOLVE({props:req.props,info:ci,matched:await matchedOf(co.objectId),painter:null});for(const id of cg.sheets||[])if(!got.sheets.includes(id))got.sheets.push(id);copies.push({unique:String(c.unique),el:String(c.el||ci.el||''),props:cg.props||{}})}catch{}}}const names={};for(const id of got.sheets){const h=sheets[id];if(!h){names[id]='a stylesheet';continue}if(h.isInline&&!h.hasSourceURL){let label='a <style> in the page';try{const d=await send('DOM.describeNode',{backendNodeId:h.ownerNode},sid);const at=(d.result&&d.result.node&&d.result.node.attributes)||[];for(let i=0;i+1<at.length;i+=2)if(at[i]==='id'){label='<style id="'+String(at[i+1]).slice(0,60)+'">';break}}catch{}names[id]=label;continue}let s=String(h.sourceURL||''),isUrl=false;try{const su=new URL(s);isUrl=true;s=su.origin===new URL(u1).origin?su.pathname:su.origin+su.pathname}catch{}names[id]=s.slice(0,120)+(h.isInline&&isUrl?' (inlined in the page)':'')}const fix=(o)=>{if(!o||!o.sheet)return;const h=sheets[o.sheet];if(h&&h.isInline)delete o.line;o.sheet=names[o.sheet]||'a stylesheet'};for(const row of [...Object.values(got.props),...copies.flatMap((c)=>Object.values(c.props))]){fix(row);for(const t of row.tokens||[])fix(t);for(const pt of row.parts||[])fix(pt)}return done('TRACY_BROWSER OK '+u1+'\\n'+JSON.stringify({info:{el:info.el,text:info.text,matches:info.matches,how:info.how,hidden:info.hidden,unique:info.unique,body:info.body,chrome:info.chrome,sheets:info.sheets,template:info.template,framework:info.framework,...(copies.length>0?{copies}:{})},props:got.props,loaded:loadedInTime}))}if(mode==='styles'){const S=await send('Runtime.evaluate',{expression:PROBE,returnByValue:true},sid);const v=S.result&&S.result.result&&S.result.result.value;if(!v||typeof v!=='object'||!Array.isArray(v.samples))return done('TRACY_BROWSER ERR the style probe returned nothing');const u3=v.href;let ok3=false;try{ok3=new URL(u3).origin===origin}catch{}if(!ok3){if(u3&&u3.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(u3||offsite||'unknown'))}return done('TRACY_BROWSER OK '+u3+'\\n'+JSON.stringify(v))}const R=await send('Runtime.evaluate',{expression:'JSON.stringify({href:document.location.href,html:document.documentElement.outerHTML})',returnByValue:true},sid);const raw=R.result&&R.result.result&&R.result.result.value;let data=null;try{data=JSON.parse(raw)}catch{}const finalUrl=data&&data.href;let same=false;try{same=new URL(finalUrl).origin===origin}catch{}if(!same){if(finalUrl&&finalUrl.indexOf('chrome-error://')===0)return done('TRACY_BROWSER NAV '+(errorText||'the page did not load'));return done('TRACY_BROWSER OFFSITE '+(finalUrl||offsite||'unknown'))}return done('TRACY_BROWSER OK '+finalUrl+'\\n'+((data&&data.html)||''))})().catch((e)=>done('TRACY_BROWSER ERR '+((e&&e.message)||String(e))));}`;
var HOST_BROWSER_TIMEOUT_MS = BROWSER_DEADLINE_MS + BROWSER_FLUSH_MS + 4e3;
var EMDASH_SCRIPT_DEADLINE_MS = 45e3;
var EMDASH_EXEC_MAX_BUFFER = 16 * 1024 * 1024;
var EMDASH_INDEX_PARALLEL = 6;
var EMDASH_WRITE_MAX_OPS = 200;
var EMDASH_WRITE_MIN_LEFT_MS = 5e3;
var EMDASH_INDEX_TOOLS = /* @__PURE__ */ Object.freeze([
  "content_list",
  "content_get",
  "content_compare",
  "content_list_trashed",
  "content_translations",
  "byline_list",
  "byline_get",
  "byline_translations",
  "schema_list_collections",
  "schema_get_collection",
  "media_list",
  "media_get",
  "search",
  "taxonomy_list",
  "taxonomy_get",
  "taxonomy_list_terms",
  "taxonomy_term_translations",
  "menu_list",
  "menu_get",
  "menu_translations",
  "revision_list",
  "settings_get"
]);
var EMDASH_WRITE_TOOLS = /* @__PURE__ */ Object.freeze(["content_update", "menu_set_items", "settings_update"]);
var EMDASH_RPC = String.raw`
const URL0=${JSON.stringify(EMDASH_MCP_LOOPBACK)},LIMIT=${EMDASH_SCRIPT_DEADLINE_MS},T0=Date.now();
const left=()=>LIMIT-(Date.now()-T0);
let done=false,calls=0,timer=null;
const out=(s)=>{if(done)return;done=true;if(timer)clearTimeout(timer);process.stdout.write(red(s))};
const E=(k,m)=>{const e=new Error(String(m).slice(0,300));e.kind=k;return e};
const rpc=async(name,args)=>{calls++;
const r=await fetch(URL0,{method:"POST",redirect:"error",signal:AbortSignal.timeout(Math.max(1,left())),headers:{authorization:"Bearer "+t,"content-type":"application/json",accept:"application/json, text/event-stream","X-EmDash-Request":"1"},body:JSON.stringify({jsonrpc:"2.0",id:calls,method:"tools/call",params:{name:name,arguments:args}})});
const x=await r.text();
if(r.status!==200)throw E("SITE","HTTP "+r.status+" on "+name);
const d=x.split(/\r?\n/).filter((l)=>l.startsWith("data:")).map((l)=>l.slice(5).trim()).filter(Boolean);
let j;try{j=JSON.parse(d.length?d[d.length-1]:x)}catch(e){throw E("SITE",name+" answered no JSON-RPC")}
if(j&&j.error)throw E("TOOL",name+": "+String(j.error.message||"error"));
const res=(j&&j.result)||{};
const txt=(Array.isArray(res.content)?res.content:[]).filter((p)=>p&&p.type==="text").map((p)=>String(p.text||"")).join("\n");
if(res.isError)throw E("TOOL",name+": "+(txt||"refused"));
try{return JSON.parse(txt)}catch(e){return txt}};
const LOC=/^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/,SLUG=/^[a-z][a-z0-9_]*$/,NAME=/^[a-z0-9][a-z0-9_-]*$/;
`;
var EMDASH_INDEX_SCRIPT = `${MCP_TOKEN_PRELUDE}${EMDASH_RPC}${String.raw`
const ALLOW=new Set(${JSON.stringify(EMDASH_INDEX_TOOLS)});
const call=(name,args)=>ALLOW.has(name)?rpc(name,args):Promise.reject(E("REFUSED",name+" is not a read"));
const pool=async(tasks)=>{const res=new Array(tasks.length);let k=0;const run=async()=>{while(k<tasks.length){const i=k++;res[i]=await tasks[i]()}};await Promise.all(Array.from({length:Math.min(${EMDASH_INDEX_PARALLEL},tasks.length)},run));return res};
const next=(j)=>j&&typeof j.nextCursor==="string"&&j.nextCursor!==""?j.nextCursor:null;
const itemsOf=(j)=>j&&Array.isArray(j.items)?j.items:[];
const listAll=async(args)=>{const items=[];let cursor=null;for(let p=0;p<50;p++){const a=Object.assign({},args,{limit:100});if(cursor)a.cursor=cursor;const j=await call("content_list",a);for(const x of itemsOf(j))items.push(x);cursor=next(j);if(!cursor)break}return items};
const opt=(v)=>v===undefined?null:v;
const gone=(e)=>!!e&&e.kind==="TOOL"&&/^[a-z_]+: \[(?:COLLECTION_)?NOT_FOUND\]/.test(String(e.message));
const row=(c,x)=>({collection:c,id:x.id,slug:x.slug,locale:opt(x.locale),status:x.status,version:opt(x.version),updatedAt:opt(x.updatedAt),liveRevisionId:opt(x.liveRevisionId),draftRevisionId:opt(x.draftRevisionId),translationGroup:opt(x.translationGroup),data:x.data});
const names=(v,re,what)=>{if(v==null)return null;if(!Array.isArray(v)||v.length>200||!v.every((s)=>typeof s==="string"&&re.test(s)))throw E("REFUSED",what+" must be a list of names");return v};
const main=async(q)=>{
const locs=names(q.locales,LOC,"locales"),cols=names(q.collections,SLUG,"collections");
const menus=q.menus===false?false:q.menus==null||q.menus===true?true:names(q.menus,NAME,"menus");
let served=null,siteRows=null;
try{siteRows=await listAll({collection:"site",status:"published"});served=[...new Set(siteRows.map((x)=>x.locale).filter((l)=>typeof l==="string"))].sort()}catch(e){if(!gone(e))throw e}
const locales=locs||served||[];
const scopes=locales.length?locales:[null];
let collections=cols;const patterns={};
{const s=await call("schema_list_collections",{});const all=itemsOf(s).filter((x)=>x&&typeof x.slug==="string"&&SLUG.test(x.slug));for(const x of all)patterns[x.slug]=typeof x.urlPattern==="string"?x.urlPattern:null;if(!collections)collections=all.map((x)=>x.slug)}
const tasks=[],missing=new Set();
for(const c of collections)for(const l of scopes){
if(c==="site"&&siteRows&&l!==null){tasks.push(async()=>siteRows.filter((x)=>x.locale===l).map((x)=>row(c,x)));continue}
tasks.push(async()=>{try{return(await listAll(l===null?{collection:c,status:"published"}:{collection:c,locale:l,status:"published"})).map((x)=>row(c,x))}catch(e){if(!gone(e))throw e;missing.add(c);return[]}})}
const rows=[].concat(...(await pool(tasks)));
const menuOut=[];
if(menus!==false){const mt=[];for(const l of scopes){let list=menus===true?null:menus;
if(list===null){const ml=await call("menu_list",l===null?{}:{locale:l});list=(Array.isArray(ml)?ml:itemsOf(ml)).map((m)=>m&&m.name).filter((n)=>typeof n==="string"&&NAME.test(n))}
for(const n of [...new Set(list)])mt.push(async()=>{let m;try{m=await call("menu_get",l===null?{name:n}:{name:n,locale:l})}catch(e){if(!gone(e))throw e;missing.add("menu "+n);return null}return{name:n,locale:l===null?opt(m&&m.locale):l,items:itemsOf(m)}})}
for(const m of await pool(mt))if(m)menuOut.push(m)}
const terms=[];
if(q.terms===true){const tt=[];for(const l of scopes){const d=await call("taxonomy_list",l===null?{}:{locale:l});const defs=Array.isArray(d)?d:d&&Array.isArray(d.taxonomies)?d.taxonomies:itemsOf(d);
for(const n of [...new Set(defs.map((x)=>x&&x.name).filter((x)=>typeof x==="string"&&NAME.test(x)))])tt.push(async()=>{const got=[];let cursor=null;for(let p=0;p<10;p++){const a={taxonomy:n,limit:100};if(l!==null)a.locale=l;if(cursor)a.cursor=cursor;const j=await call("taxonomy_list_terms",a);for(const x of itemsOf(j))if(x&&typeof x.label==="string")got.push({taxonomy:n,slug:x.slug,locale:l===null?opt(x.locale):l,label:x.label});cursor=next(j);if(!cursor)break}return got})}
for(const g of await pool(tt))for(const x of g)terms.push(x)}
let settings=null;
if(q.settings===true){const s=await call("settings_get",{});settings={title:s&&typeof s.title==="string"?s.title:null,tagline:s&&typeof s.tagline==="string"?s.tagline:null}}
out("TRACY_EMDASH_INDEX "+JSON.stringify({served,locales,rows,menus:menuOut,terms,settings,patterns,missing:[...missing],calls,ms:Date.now()-T0}))};
let b="";process.stdin.on("data",(d)=>{b+=d});process.stdin.on("end",()=>{
timer=setTimeout(()=>out("TRACY_EMDASH_ERR DEADLINE the index ran past "+LIMIT+" ms"),Math.max(1,left()));
let q=null;try{q=JSON.parse(b||"{}")}catch(e){}
if(!q||typeof q!=="object"||Array.isArray(q)){out("TRACY_EMDASH_ERR REFUSED the request is not a JSON object");return}
main(q).catch((e)=>out("TRACY_EMDASH_ERR "+((e&&e.kind)||"SITE")+" "+String((e&&e.message)||e).slice(0,300)))});
`}`;
var EMDASH_WRITE_SCRIPT = `${MCP_TOKEN_PRELUDE}${EMDASH_RPC}${String.raw`
const ALLOW=new Set(${JSON.stringify(EMDASH_WRITE_TOOLS)});
const call=(name,args)=>ALLOW.has(name)?rpc(name,args):Promise.reject(E("REFUSED",name+" is not a write this job makes"));
const ULID=/^[0-9A-HJKMNP-TV-Z]{26}$/,HASH=/^[0-9a-f]{64}$/;
const plain=(v)=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const only=(o,keys)=>Object.keys(o).every((k)=>keys.indexOf(k)!==-1);
const check=(op)=>{
if(!plain(op)||!only(op,["tool","args","menuHash"]))return "an op is {tool, args, menuHash?}";
if(typeof op.tool!=="string"||!ALLOW.has(op.tool))return String(op.tool).slice(0,40)+" is not a write this job makes";
const a=op.args;if(!plain(a))return "args must be an object";
if(op.tool==="content_update"){
if(!only(a,["collection","id","locale","_rev","data","status"]))return "content_update takes collection, id, locale, _rev, data, status";
if(typeof a.collection!=="string"||!SLUG.test(a.collection))return "collection is not a collection name";
if(typeof a.id!=="string"||!ULID.test(a.id))return "id must be the entry's ULID, never a slug";
if(a.locale!==undefined&&(typeof a.locale!=="string"||!LOC.test(a.locale)))return "locale is not a locale";
if(typeof a._rev!=="string"||a._rev==="")return "_rev is missing";
if(a.status!=="published")return "status must be published";
if(!plain(a.data)||Object.keys(a.data).length===0)return "data must name the fields changed";
return op.menuHash===undefined?null:"menuHash belongs to a menu"}
if(op.tool==="menu_set_items"){
if(!only(a,["name","locale","items"]))return "menu_set_items takes name, locale, items";
if(typeof a.name!=="string"||!NAME.test(a.name))return "name is not a menu name";
if(typeof a.locale!=="string"||!LOC.test(a.locale))return "a menu is written in one locale";
if(!Array.isArray(a.items))return "items must be a list";
return typeof op.menuHash==="string"&&HASH.test(op.menuHash)?null:"menuHash is missing"}
if(Object.keys(a).length===0||!only(a,["title","tagline"])||!Object.keys(a).every((k)=>typeof a[k]==="string"))return "settings_update takes title or tagline";
return op.menuHash===undefined?null:"menuHash belongs to a menu"};
const hashOf=(items)=>require("crypto").createHash("sha256").update(JSON.stringify(items)).digest("hex");
const main=async(q)=>{
const ops=q.ops;
if(!Array.isArray(ops)||ops.length===0||ops.length>${EMDASH_WRITE_MAX_OPS}){out("TRACY_EMDASH_ERR REFUSED ops must be a list of 1 to ${EMDASH_WRITE_MAX_OPS}");return}
for(let i=0;i<ops.length;i++){const why=check(ops[i]);if(why){out("TRACY_EMDASH_ERR REFUSED op "+i+": "+why);return}}
const results=[];let inFlight=null,stopped=false;
const line=(extra)=>"TRACY_EMDASH_WRITE "+JSON.stringify(Object.assign({results,inFlight,deadline:stopped,ms:Date.now()-T0},extra||{}));
timer=setTimeout(()=>out(line({deadline:true})),Math.max(1,left()));
for(let i=0;i<ops.length;i++){
if(left()<${EMDASH_WRITE_MIN_LEFT_MS}){stopped=true;break}
const op=ops[i];
if(op.tool==="menu_set_items"){let cur;try{cur=await rpc("menu_get",{name:op.args.name,locale:op.args.locale})}catch(e){results.push({i,ok:false,error:(e&&e.kind==="TOOL"?"MENU_CHANGED ":"SITE ")+String((e&&e.message)||e).slice(0,200)});break}
if(hashOf(cur&&Array.isArray(cur.items)?cur.items:[])!==op.menuHash){results.push({i,ok:false,error:"MENU_CHANGED the menu changed since it was read"});break}}
inFlight=i;let r;
try{r=await call(op.tool,op.args)}catch(e){if(e&&e.kind==="TOOL"){inFlight=null;results.push({i,ok:false,error:String(e.message).slice(0,300)});break}
out(line({lost:String((e&&e.message)||e).slice(0,200)}));return}
inFlight=null;const res={i,ok:true};const item=r&&r.item;
if(op.tool==="content_update"&&item&&typeof item.version==="number"&&typeof item.updatedAt==="string"&&r&&typeof r._rev==="string")res.revFormula=Buffer.from(item.version+":"+item.updatedAt,"utf8").toString("base64")===r._rev;
results.push(res)}
out(line())};
let b="";process.stdin.on("data",(d)=>{b+=d});process.stdin.on("end",()=>{
let q=null;try{q=JSON.parse(b||"{}")}catch(e){}
if(!q||typeof q!=="object"||Array.isArray(q)){out("TRACY_EMDASH_ERR REFUSED the request is not a JSON object");return}
main(q).catch((e)=>out("TRACY_EMDASH_ERR "+((e&&e.kind)||"SITE")+" "+String((e&&e.message)||e).slice(0,300)))});
`}`;

// ../../tools/tracy-site-tools/src/host/site.mjs
var ACTION_ALIASES = /* @__PURE__ */ Object.freeze(
  Object.assign(
    /** @type {Record<string, readonly [string, string | null]>} */
    /* @__PURE__ */ Object.create(null),
    {
      content_contract: /* @__PURE__ */ Object.freeze(["content.contract", null]),
      contract: /* @__PURE__ */ Object.freeze(["content.contract", null]),
      "contract.inspect": /* @__PURE__ */ Object.freeze(["content.contract", "inspect"]),
      "content.contract.inspect": /* @__PURE__ */ Object.freeze(["content.contract", "inspect"]),
      "contract.apply": /* @__PURE__ */ Object.freeze(["content.contract", "apply"]),
      "content.contract.apply": /* @__PURE__ */ Object.freeze(["content.contract", "apply"])
    }
  )
);
var CANONICAL_HOIST = /* @__PURE__ */ Object.freeze(["operation", "dryRun"]);
function canonicalCall(args) {
  let a = args;
  if (typeof a === "string") {
    try {
      a = JSON.parse(a);
    } catch {
      a = null;
    }
  }
  if (!a || typeof a !== "object" || Array.isArray(a)) return { action: "", params: {} };
  const r = (
    /** @type {Record<string, unknown>} */
    a
  );
  const asked = typeof r.action === "string" ? r.action.trim() : "";
  const alias = ACTION_ALIASES[asked];
  const action = alias ? alias[0] : asked;
  const raw = r.params;
  const params = (
    /** @type {Record<string, unknown>} */
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {}
  );
  const absent = (v2) => v2 === void 0 || v2 === null;
  for (const key of CANONICAL_HOIST) if (absent(params[key]) && !absent(r[key])) params[key] = r[key];
  if (alias && alias[1] !== null && absent(params.operation)) params.operation = alias[1];
  if (action === "content.replace" && absent(params.dryRun)) {
    const dry = !absent(params.dry_run) ? params.dry_run : r.dry_run;
    if (!absent(dry)) {
      params.dryRun = dry;
      delete params.dry_run;
    }
  }
  if (action === "content.replace" && typeof params.where === "string") {
    const all = WHERE_MEANS_ALL[
      /** @type {keyof typeof WHERE_MEANS_ALL} */
      params.where.trim().toLowerCase()
    ];
    if (all !== void 0) {
      delete params.where;
      if (absent(params.all)) params.all = all;
    }
  }
  return { action, params };
}
var WHERE_MEANS_ALL = /* @__PURE__ */ Object.freeze({
  all: true,
  everywhere: true,
  every: true,
  any: true,
  "*": true,
  site: true,
  whole: true,
  page: "page"
});
var WRITER_LOCK_MESSAGE = "another writer is changing this site";
var UNKNOWN_OUTCOME_CODES = /* @__PURE__ */ Object.freeze([
  "COMPONENT_UNREACHABLE",
  "COMPONENT_BAD_RESPONSE",
  "COWORK_WEB_UNREACHABLE",
  "COWORK_WEB_BAD_RESPONSE",
  "SITE_UNREACHABLE",
  "OUTCOME_UNKNOWN"
]);
function outcomeUnknown(answer) {
  if (answer === null || typeof answer !== "object" || Array.isArray(answer)) return false;
  const a = (
    /** @type {Record<string, unknown>} */
    answer
  );
  if (a.ok !== false) return false;
  const code = typeof a.code === "string" && a.code !== "" ? a.code : a.error;
  if (typeof code === "string" && UNKNOWN_OUTCOME_CODES.includes(code)) return true;
  if ([502, 503, 504].includes(Number(a.httpStatus))) return true;
  return code === "writer_busy" && String(a.message ?? "").trim() !== WRITER_LOCK_MESSAGE;
}
var CONTRACT_LANGUAGE_RULE = "Each slot is one language \u2014 its label or text says which: words change in the language of the page meant, a fact (phone, e-mail, address, hours) in every language the inspect lists.";
var WORDPRESS_CONTRACT_LANGUAGE_RULE = `A slot key is the source language's; the same page in another language is "<edition>::<key>" (e.g. "vi::home.hero.heading"), never listed \u2014 page.text of that page reads it: words change in the language of the page meant, a fact (phone, e-mail, address, hours) in every live edition (the inspect's multilingual.live); site.* and identity.* are one for every language.`;
var DROP = Symbol("drop");

// ../../tools/tracy-site-tools/src/host/emdash.mjs
var TOOL = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
function planEmdashCall(args) {
  const a = (
    /** @type {Record<string, unknown>} */
    args && typeof args === "object" ? args : {}
  );
  const tool = typeof a.tool === "string" ? a.tool.trim() : "";
  if (tool === "") return { ok: false, error: "tool required \u2014 an EmDash MCP tool name, e.g. content_list" };
  if (!TOOL.test(tool)) return { ok: false, error: `not an EmDash tool name: "${tool}"` };
  const raw = a.arguments;
  if (raw !== void 0 && (typeof raw !== "object" || raw === null || Array.isArray(raw))) {
    return { ok: false, error: "arguments must be an object" };
  }
  const siteKeyAsked = typeof a.siteKey === "string" ? a.siteKey.trim() : "";
  const siteKey2 = /^[a-z0-9][a-z0-9.-]{0,120}$/.test(siteKeyAsked) ? siteKeyAsked : null;
  return { ok: true, tool, args: (
    /** @type {Record<string, unknown>} */
    raw ?? {}
  ), siteKey: siteKey2 };
}
var EMDASH_READ_TOOLS = /* @__PURE__ */ new Set([
  "content_list",
  "content_get",
  "content_compare",
  "content_list_trashed",
  "content_translations",
  "byline_list",
  "byline_get",
  "byline_translations",
  "schema_list_collections",
  "schema_get_collection",
  "media_list",
  "media_get",
  "search",
  "taxonomy_list",
  "taxonomy_get",
  "taxonomy_list_terms",
  "taxonomy_term_translations",
  "menu_list",
  "menu_get",
  "menu_translations",
  "revision_list",
  "settings_get"
]);
var EMDASH_WORDS_ROAD = 'WORDS \u2014 read the entry first: `content_get {collection, id:<slug>}` for a page or the site-wide `site` entry, `content_list {collection}` for a list; the locale is filled with this site\'s own language \u2014 pass `locale` for another. Then ONE `content_update {collection, id:<the id it answered>, data:{only the fields you change}, status:"published"}` (no `_rev`) changes AND publishes; its answer is the receipt. Leave `status` out only to stage a draft; `status:"draft"` takes a live page off the site. A list field takes {"<index>":{changed keys}}; null drops it, "+":[\u2026] appends.';
var EMDASH_LANGUAGE_RULE = "LANGUAGES \u2014 decide from the request, never ask. Words (headings, sentences, button labels) change in the language of the page meant (the filled one unless the request points at another), others only when the customer names them. A fact printed alike in every language, or a change said to apply everywhere, changes in EVERY language served, as one change: `tracy_site` `content.replace {find, replace, all:true}` (over 5 places, `dryRun:true` first): `all` reaches every place, and every language for opening hours, the legal or copyright line or an address; a phone, an e-mail or an https:// link reaches every language by itself. Only on TOO_MANY, or NOT_FOUND again after its next: `content_translations {collection, id}` lists them, `content_get` with `allLocales:true` reads them all; then `content_update` each published one, all in one step. The answer says how many languages changed.";
var REMOVED_ROWS = Symbol("tracy_emdash removed rows");
var WRITE_FACTS = Symbol("tracy_emdash write facts");
var CONTENT_LIST_ARGS = /* @__PURE__ */ Object.freeze([
  "collection",
  "status",
  "limit",
  "cursor",
  "orderBy",
  "order",
  "locale",
  "markdown"
]);
var SEARCH_ARGS = /^(search|s|q|query|text|match|filter|find|title|contains|keyword|keywords)$/i;
var TRACY_KEYS = /* @__PURE__ */ new Set([
  "tool",
  "arguments",
  "list",
  "tools",
  "siteKey",
  "allLocales",
  "raw",
  "confirm",
  "removes"
]);
var ARGUMENT_ALIASES = ["args", "params", "input"];
var PAGE_ACTIONS = /* @__PURE__ */ Object.freeze({
  "page.text": "page.text",
  page_text: "page.text",
  "page.look": "page.look",
  page_look: "page.look"
});
var APPLY_RECEIPTS = /* @__PURE__ */ new Set(["apply.list", "apply_list", "apply.revert", "apply_revert"]);
var ORDER_FIELDS = /* @__PURE__ */ Object.freeze({
  created_at: "createdAt",
  updated_at: "updatedAt",
  published_at: "publishedAt",
  scheduled_at: "scheduledAt",
  deleted_at: "deletedAt"
});
function isRecord(v2) {
  return v2 !== null && typeof v2 === "object" && !Array.isArray(v2);
}
function normalizeEmdashShape(args) {
  let parsed = args;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const a = isRecord(parsed) ? parsed : {};
  const notes = [];
  const siteKeyAsked = typeof a.siteKey === "string" ? a.siteKey.trim() : "";
  const siteKey2 = /^[a-z0-9][a-z0-9.-]{0,120}$/.test(siteKeyAsked) ? siteKeyAsked : null;
  if (a.list === true) {
    const names = Array.isArray(a.tools) ? [...new Set(a.tools.filter((n) => typeof n === "string" && n.trim() !== "").map((n) => n.trim()))] : null;
    return { ok: true, list: true, names: names !== null && names.length > 0 ? names : null, siteKey: siteKey2, notes };
  }
  let tool = typeof a.tool === "string" ? a.tool.trim() : "";
  const action = tool === "" && typeof a.action === "string" ? a.action.trim() : "";
  if (action !== "" && /^(list|tools|list_tools|tools_list)$/.test(action) && a.arguments === void 0) {
    notes.push(`action "${action}" is {list:true}: the tool catalogue`);
    return { ok: true, list: true, names: null, siteKey: siteKey2, notes };
  }
  if (action !== "") {
    tool = action;
    notes.push(`action is "tool" here: tool ${action.slice(0, 40)}`);
  }
  let inner = a.arguments;
  if (inner === void 0) {
    const alias = ARGUMENT_ALIASES.find((k) => isRecord(a[k]));
    const loose = Object.keys(a).filter((k) => !TRACY_KEYS.has(k) && !(action !== "" && k === "action"));
    if (alias !== void 0) {
      inner = a[alias];
      notes.push(`arguments were sent as "${alias}"; they go in "arguments"`);
    } else if (loose.length > 0) {
      inner = Object.fromEntries(loose.map((k) => [k, a[k]]));
      notes.push(`${loose.slice(0, 4).join(", ")} moved into "arguments"`);
    }
  }
  if (isRecord(inner) && typeof inner.tool === "string" && isRecord(inner.arguments) && (tool === "" || sameTool(inner.tool, tool))) {
    if (tool === "") tool = inner.tool.trim();
    inner = inner.arguments;
    notes.push("arguments were nested twice; the inner ones were used");
  }
  const page = (
    /** @type {Record<string, 'page.text' | 'page.look'>} */
    PAGE_ACTIONS[tool]
  );
  if (page !== void 0) {
    notes.push(`${tool} is tracy_site's ${page}; it was answered as that`);
    return { ok: true, route: { action: page, params: isRecord(inner) ? { ...inner } : {} }, siteKey: siteKey2, notes };
  }
  if (APPLY_RECEIPTS.has(tool))
    return {
      ok: false,
      code: "NO_RECEIPTS_ON_EMDASH",
      tool,
      error: `${tool} is the Joomla/WordPress receipt door; EmDash keeps no apply receipts.`
    };
  if (/[.-]/.test(tool)) {
    const fixed = tool.replace(/[.-]/g, "_");
    notes.push(`tool ${tool} is ${fixed}`);
    tool = fixed;
  }
  const plan = planEmdashCall({ tool, arguments: inner, siteKey: siteKeyAsked });
  if (!plan.ok) return { ok: false, code: "BAD_CALL", ...tool !== "" ? { tool } : {}, error: plan.error };
  const out = { ...plan.args };
  let confirm = a.confirm === true;
  let allLocales = a.allLocales === true;
  if (Object.hasOwn(out, "confirm")) {
    confirm ||= out.confirm === true;
    delete out.confirm;
  }
  if (Object.hasOwn(out, "allLocales")) {
    allLocales ||= out.allLocales === true;
    delete out.allLocales;
  }
  let removes = typeof a.removes === "string" ? a.removes : null;
  if (Object.hasOwn(out, "removes")) {
    if (typeof out.removes === "string") removes ??= out.removes;
    delete out.removes;
  }
  if (plan.tool === "schema_get_collection" && out.slug === void 0) {
    const named = ["collection", "name"].find((k) => typeof out[k] === "string" && out[k].trim() !== "");
    if (named !== void 0) {
      notes.push(`${named} is slug`);
      out.slug = String(out[named]).trim();
      delete out[named];
    }
  }
  if (plan.tool === "content_list" && typeof out.orderBy === "string") {
    const camel = ORDER_FIELDS[
      /** @type {keyof typeof ORDER_FIELDS} */
      out.orderBy.trim()
    ];
    if (camel !== void 0) {
      notes.push(`orderBy ${out.orderBy} is ${camel}`);
      out.orderBy = camel;
    }
  }
  if (plan.tool === "content_list") {
    const stray = Object.keys(out).filter((k) => !CONTENT_LIST_ARGS.includes(k));
    for (const k of stray) delete out[k];
    const found = stray.find((k) => SEARCH_ARGS.test(k));
    if (found !== void 0)
      notes.push(
        `${found.slice(0, 20)} dropped: content_list filters nothing; search finds words in searchable collections`
      );
    const others = stray.filter((k) => k !== found);
    if (others.length > 0)
      notes.push(
        `${others.slice(0, 3).map((k) => k.slice(0, 20)).join(", ")} dropped: content_list does not take ${others.length === 1 ? "it" : "them"}`
      );
  }
  if (typeof out._rev === "string") {
    const r = canonicalRev(out._rev);
    if (r.changed) {
      notes.push("_rev re-encoded the way EmDash writes it");
      out._rev = r.rev;
    }
  }
  return {
    ok: true,
    tool: plan.tool,
    args: out,
    siteKey: plan.siteKey,
    allLocales,
    raw: a.raw === true,
    confirm,
    removes,
    notes
  };
}
function sameTool(x, y) {
  return x.trim().replace(/[.-]/g, "_") === y.trim().replace(/[.-]/g, "_");
}
var REV_PLAIN = /^\d+:\d{4}-\d\d-\d\dT[\d:.]+Z$/;
function canonicalRev(rev) {
  if (typeof rev !== "string") return { rev, changed: false };
  const raw = rev.trim();
  if (REV_PLAIN.test(raw)) return { rev: Buffer.from(raw, "utf8").toString("base64"), changed: true };
  const body = raw.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]+$/.test(body)) return { rev, changed: false };
  const decoded = Buffer.from(body + "=".repeat((4 - body.length % 4) % 4), "base64").toString("utf8");
  if (!REV_PLAIN.test(decoded)) return { rev, changed: false };
  const canonical = Buffer.from(decoded, "utf8").toString("base64");
  return { rev: canonical, changed: canonical !== rev };
}
var EMDASH_DESCRIPTION = [
  // T9 lead (IX2, PR2): words already on a page take ONE call on `tracy_site`, before any read here.
  "Words on a page: tracy_site content.replace {find, replace}.",
  // "a page as read: tracy_site page.text" left (09/10/2026): the site context's "Seeing a page" row says it.
  // Not "and words the template code prints": a mode with a shell edits that code under /app and
  // rebuilds (ADR 0022); which mode can is the site context's EmDash row to say (28/09/2026).
  // "Labels: not writable." left (26/10/2026): a category's or tag's label has `taxonomy_update_term` (the persona
  // names it) and a form's words `form_words` (below); the line contradicted both and cost a build its terms (round 26).
  // No room here for the label door itself (1,500 characters); a check names it where a label fails (`no-demo-words`).
  EMDASH_WORDS_ROAD,
  // 29/09/2026 (v6 L3-01): 20 s went on learning Portable Text for a page body; EmDash converts Markdown.
  "Menus: menu_get \u2192 menu_set_items.",
  // 29/09/2026 (v6): the redirect store and the SEO settings are read at request time — no rebuild.
  "Redirects: redirect_create {source, destination, type:301|302}, redirect_list, redirect_delete {id}. Verification tags: settings_update {seo:{googleVerification\u2026}}; entry seo panels never show. No rebuild.",
  // 25/10/2026 (local round 18): a contact form's words live in the forms plugin, which no content tool reaches;
  // its arguments are in `{list:true, tools:["form_words"]}` (`FORM_TOOL_SCHEMAS`), the description has no room.
  "Forms: form_list, form_words.",
  // 27/09/2026: never a media_upload whose base64 or url the model types — 24–40 steps on the stand;
  // the host reads the customer's file (`upload.mjs`), and since 29/09/2026 a picture they attached in
  // the chat (`attachment`; v5 cause O: a 725 s timeout of base64 typed by hand on EmDash).
  "Pictures: the customer's \u2192 tracy_site media.upload {file} (Files tab) | {attachment} (in chat) \u2192 its id into the field. content_update edits/removes page image refs. media_delete removes library record + stored file; refs can break. It cannot revoke public URLs or purge edge caches; caches may still serve.",
  // "After a write, do not read back." left (09/10/2026): the site context's ONE JOB rule says it for every
  // platform, so it was said twice on every step. Its characters name the delete's own shape below: 17 of the
  // EmDash delete and add runs of bench hb fetched `{list:true, tools:["content_delete"…]}` first.
  "{list:true, tools:[names]}: schemas.",
  // A delete is called first and its CONFIRM_FIRST carries the question: a question of the agent's
  // own before the call opens nothing (`call-memory.mjs` `confirmed`), so asking first made the customer
  // answer twice (v5 V5-chat-08, V5-chat-03; 28/09/2026). Calling first is one question, and an entry in
  // N languages then goes in the one confirmed call (F3.2, `emdash-call.mjs`).
  // 09/10/2026 (bench hb, EmDash delete by chat): told nothing about languages, the agent read the entry's 40
  // translations and sent 20 deletes at once, one per row — each refused with the same question. One call
  // takes every language unless `locale` names one, as `content.delete` says on WordPress and Joomla.
  "CONFLICT \u2192 content_get for a fresh _rev; PENDING_DRAFT and CONFIRM_FIRST (content_delete {collection, id}: ONE call, all languages unless locale names one; call first) \u2192 ask_user_question, its ask only, then confirm:true."
].join(" ");
var EMDASH_PARAMETERS = {
  type: "object",
  properties: {
    tool: { type: "string", description: "An EmDash MCP tool name, e.g. content_update." },
    arguments: {
      type: "object",
      additionalProperties: true,
      description: "That tool's own arguments, as EmDash names them; this tool's description gives the content ones."
    },
    list: {
      type: "boolean",
      description: "true \u2192 one line per tool this site publishes; with tools, those tools' full argument schemas."
    },
    tools: {
      type: "array",
      items: { type: "string" },
      description: "With list: the tool names whose schemas you need."
    },
    confirm: {
      type: "boolean",
      description: "true \u2192 what the customer agreed to after CONFIRM_FIRST or PENDING_DRAFT and their answer."
    },
    allLocales: {
      type: "boolean",
      description: "true \u2192 a read covers every language (large); never on a write."
    },
    raw: { type: "boolean", description: "true \u2192 EmDash's answer unshaped: every column, full schemas." },
    siteKey: {
      type: "string",
      description: "Leave this out: every call acts on this conversation's site (/site/<label>); naming another site is refused."
    },
    // H6: the person's numbered comment, taken off before the shape repair and echoed (`comment-echo.mjs`).
    comment: structuredClone(COMMENT_PARAMETER)
  }
};

// ../../design/tracy-ds-slot/src/role-variables.mjs
var BOTH = /* @__PURE__ */ Object.freeze(
  /** @type {('light' | 'dark')[]} */
  ["light", "dark"]
);
var ONE2 = /* @__PURE__ */ Object.freeze(
  /** @type {('light' | 'dark')[]} */
  ["light"]
);
var v = (name2, kind, required, role, emitted = true) => /* @__PURE__ */ Object.freeze({ name: name2, role, kind, required, schemes: kind === "color" ? BOTH : ONE2, emitted });
var ROLE_VARIABLES = /* @__PURE__ */ Object.freeze([
  // grounds
  v("--ds-c-bg", "color", true, "Page ground: the background of the page and of plain sections."),
  v("--ds-c-surface", "color", true, "Card face: cards, panels, menus, popovers and field fills."),
  v(
    "--ds-c-surface-warm",
    "color",
    true,
    "Alternate surface (surface-alt): a second ground for alternating sections and highlighted panels."
  ),
  v(
    "--ds-c-surface-hover",
    "color",
    false,
    "Neutral hover ground: the fill a card row, menu item or grey button takes under the pointer."
  ),
  v(
    "--ds-c-ink",
    "color",
    true,
    "Inverse ground: a band drawn as a contrast to the page (a dark hero on a light page)."
  ),
  v("--ds-c-on-ink", "color", true, "Text and icons on the inverse ground."),
  v(
    "--ds-c-accent-on-ink",
    "color",
    false,
    "Readable accent as text on the inverse ground: accent words and kickers set on an ink band."
  ),
  // text
  v("--ds-c-fg", "color", true, "Main text: body copy and every text without a quieter role."),
  v(
    "--ds-c-heading",
    "color",
    true,
    "Headings: the strongest text on the page, never quieter than the body."
  ),
  v(
    "--ds-c-fg-2",
    "color",
    false,
    "Secondary text: the template's second text role (lead paragraphs, strong labels)."
  ),
  v("--ds-c-muted", "color", true, "Muted text: descriptions, helper text, footer links."),
  v("--ds-c-meta", "color", false, "Meta text: dates, captions, small print."),
  // accent
  v("--ds-c-accent", "color", true, "Accent fill: primary buttons, active chips, badges, highlights."),
  v("--ds-c-accent-on", "color", true, "Text and icons on the accent fill."),
  v("--ds-c-accent-hover", "color", true, "Accent fill on hover."),
  v("--ds-c-accent-active", "color", false, "Accent fill while pressed."),
  v(
    "--ds-c-accent-text",
    "color",
    true,
    "Readable accent as text: links, eyebrows, accent words, readable on the page and the surface."
  ),
  v("--ds-c-accent-text-hover", "color", false, "Readable accent text on hover."),
  v("--ds-c-accent-band", "color", false, "A whole band painted in the accent (a call-to-action strip)."),
  v("--ds-c-on-accent-band", "color", false, "Text on a band painted in the accent."),
  // lines and states
  v("--ds-c-border", "color", true, "Border: field outlines, dividers, outline buttons."),
  v("--ds-c-border-soft", "color", true, "Soft border: card rims, grid lines, faint separators."),
  v("--ds-c-focus-ring", "color", true, "Focus ring: the outline a focused control or link shows."),
  v("--ds-c-disabled-bg", "color", true, "Disabled control fill."),
  v("--ds-c-disabled-fg", "color", true, "Disabled control text."),
  // status: the fill or line, its pale ground, its words
  v("--ds-c-success", "color", true, "Success: fills, icons and lines of a success state."),
  v("--ds-c-success-bg", "color", true, "Success ground: the pale background of a success message."),
  v(
    "--ds-c-success-text",
    "color",
    true,
    "Success words: text set in the success colour, readable on its ground."
  ),
  v("--ds-c-warn", "color", true, "Warning: fills, icons and lines of a warning state."),
  v("--ds-c-warn-bg", "color", true, "Warning ground: the pale background of a warning message."),
  v(
    "--ds-c-warn-text",
    "color",
    true,
    "Warning words: text set in the warning colour, readable on its ground."
  ),
  v("--ds-c-danger", "color", true, "Error: fills, icons and lines of an error state."),
  v("--ds-c-danger-bg", "color", true, "Error ground: the pale background of an error message."),
  v(
    "--ds-c-danger-text",
    "color",
    true,
    "Error words: text set in the error colour, readable on its ground."
  ),
  v("--ds-c-info", "color", true, "Info: fills, icons and lines of an informational state."),
  v("--ds-c-info-bg", "color", true, "Info ground: the pale background of an informational message."),
  v("--ds-c-info-text", "color", true, "Info words: text set in the info colour, readable on its ground."),
  // shape
  v("--ds-btn-radius", "radius", true, "Button corner: every button, submit and button-styled link."),
  v("--ds-card-radius", "radius", true, "Card corner: cards, panels, menus, popovers, images in cards."),
  v(
    "--ds-input-radius",
    "radius",
    true,
    "Field corner: text fields, selects, search boxes, joined search buttons."
  ),
  v("--ds-pill-radius", "radius", true, "Chip corner: chips, tags, badges, filter pills."),
  // type
  v("--ds-font-display", "font", true, "Heading face: the display line and the headings."),
  v("--ds-font-body", "font", true, "Body face: body copy, controls, fields."),
  v(
    "--ds-font-heading",
    "font",
    false,
    "Section heading face, when the system sets headings apart from the display line."
  ),
  v("--ds-font-mono", "font", false, "Monospace face: code and figures.")
]);
var ROLE_VARIABLE_NAMES = /* @__PURE__ */ Object.freeze(ROLE_VARIABLES.map((r) => r.name));
var REQUIRED_ROLE_VARIABLES = /* @__PURE__ */ Object.freeze(
  ROLE_VARIABLES.filter((r) => r.required).map((r) => r.name)
);
var BY_NAME = new Map(ROLE_VARIABLES.map((r) => [r.name, r]));

// ../../tools/tracy-site-tools/src/host/ds-slot-worn.mjs
var LINE = "TRACY_DS_SLOT ";
var SLOT_TEXT_MAX = 64 * 1024;
var ROLE_READS_MAX = 5e3;
var OWN_PROPS_MAX = 3e3;
var ROLE_READ_SRC = String.raw`var\(\s*--ds-[a-z0-9-]+\s*,(?:[^;{}()]|\((?:[^;{}()]|\([^;{}()]*\))*\))+?\)`;
var DARK_SELECTOR = String.raw`(?:html|:root|body)?(?:\.(?:dark|t4-dark|is-dark|is-dark-theme|dark-mode|dark-theme|theme-dark|theme--dark|color-scheme-dark)(?![\w-])|\[data-(?:bs-)?(?:theme|mode|color-mode|color-scheme)=\\?["']?dark\\?["']?\])[^{},;"]*`;
var DARK_OPEN_SRC = String.raw`(?<=^|[{};"])(?:\s|\\n)*(?:@media[^{};]*prefers-color-scheme\s*:\s*dark[^{};]*|${DARK_SELECTOR}(?:,(?:\s|\\n)*${DARK_SELECTOR})*)\{`;
var OWN_PROP_SRC = String.raw`(?<![\w-])--(?!ds-)[a-z0-9_-]+\s*:\s*[^;{}]{1,200}`;
var ROLES_PHP = `$roles=function($ds){$rs=[];$dc=[];try{foreach($ds as $d){if(!is_string($d)||$d===""||!is_dir($d))continue;$it=new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(new RecursiveDirectoryIterator($d,FilesystemIterator::SKIP_DOTS),function($f){$n=$f->getFilename();return !($f->isDir()&&($n==="node_modules"||$n[0]==="."));}),RecursiveIteratorIterator::LEAVES_ONLY,RecursiveIteratorIterator::CATCH_GET_CHILD);foreach($it as $fi){try{if($fi->isLink()||!$fi->isFile())continue;$bn=$fi->getFilename();if(!preg_match(${JSON.stringify(String.raw`/\.css$/`)},$bn)&&$bn!=="theme.json")continue;if($fi->getSize()>4194304)continue;$t=(string)@file_get_contents($fi->getPathname());}catch(\\Throwable $e){continue;}if(strpos($t,"var(--ds-")===false)continue;$t=(string)preg_replace(${JSON.stringify(String.raw`#/\*.*?\*/#s`)},"",$t);$dk=[];$lt="";$at=0;$uc=0;if(preg_match_all(${JSON.stringify(`/${DARK_OPEN_SRC}/i`)},$t,$mm,PREG_OFFSET_CAPTURE)){foreach($mm[0] as $mx){$st=$mx[1];if($st<$at)continue;$i=$st+strlen($mx[0]);$dp=1;$L=strlen($t);while($i<$L&&$dp>0){$c=$t[$i];if($c==="{")$dp++;elseif($c==="}")$dp--;$i++;}if($dp>0){if(++$uc>5)break;continue;}$lt.=substr($t,$at,$st-$at);$dk[]=substr($t,$st,$i-$st);$at=$i;}}$lt.=substr($t,$at);preg_match_all(${JSON.stringify(`/${ROLE_READ_SRC}/i`)},$lt,$m);foreach($m[0] as $x){if(count($rs)<${ROLE_READS_MAX})$rs[]=$x;}preg_match_all(${JSON.stringify(`/${ROLE_READ_SRC}/i`)},implode("\\n",$dk),$m);foreach($m[0] as $x){if(count($rs)<${ROLE_READS_MAX})$rs[]="@dark ".$x;}preg_match_all(${JSON.stringify(`/${OWN_PROP_SRC}/i`)},$lt,$m);foreach($m[0] as $x){if(count($dc)<${OWN_PROPS_MAX})$dc[]=$x;}if(count($rs)>=${ROLE_READS_MAX})break 2;}}}catch(\\Throwable $e){}return count($rs)===0?null:implode(";\\n",array_merge($rs,$dc)).";";};`;
var ROLES_JS = `const roles=(d)=>{const rs=[],dc=[];const R=new RegExp(${JSON.stringify(ROLE_READ_SRC)},"gi"),D=new RegExp(${JSON.stringify(OWN_PROP_SRC)},"gi"),K=new RegExp(${JSON.stringify(DARK_OPEN_SRC)},"gi");const split=(t)=>{let light="",dark="",at=0,uc=0,m;K.lastIndex=0;while((m=K.exec(t))!==null){let i=m.index+m[0].length,depth=1;while(i<t.length&&depth>0){const c=t[i];if(c==="{")depth++;else if(c==="}")depth--;i++}if(depth>0){if(++uc>5)break;K.lastIndex=m.index+m[0].length;continue}light+=t.slice(at,m.index);dark+=t.slice(m.index,i)+"\\n";at=i;K.lastIndex=i}return[light+t.slice(at),dark]};const walk=(x,depth)=>{if(depth>12)return;let es=[];try{es=fs.readdirSync(x,{withFileTypes:true})}catch{return}for(const e of es){if(rs.length>=${ROLE_READS_MAX})return;if(e.name==="node_modules"||e.name.startsWith("."))continue;const p=path.join(x,e.name);if(e.isDirectory()){walk(p,depth+1);continue}if(!e.isFile()||!(/\\.css$/.test(e.name)||e.name==="theme.json"))continue;let t="";try{t=fs.readFileSync(p,"utf8")}catch{continue}if(!t.includes("var(--ds-"))continue;t=t.replace(/\\/\\*[\\s\\S]*?\\*\\//g,"");const[lt,dk]=split(t);for(const m of lt.matchAll(R))if(rs.length<${ROLE_READS_MAX})rs.push(m[0]);for(const m of dk.matchAll(R))if(rs.length<${ROLE_READS_MAX})rs.push("@dark "+m[0]);for(const m of lt.matchAll(D))if(dc.length<${OWN_PROPS_MAX})dc.push(m[0])}};try{walk(d,0)}catch{}return rs.length===0?null:[...rs,...dc].join(";\\n")+";"};`;
var EMDASH_SLOT_SCRIPT = 'const fs=require("fs"),path=require("path");const f=process.argv[1];' + ROLES_JS + `const o=(a)=>console.log(${JSON.stringify(LINE)}+Buffer.from(JSON.stringify(a)).toString("base64"));const r=roles(path.join(path.dirname(path.dirname(f)),"src"));try{if(!fs.existsSync(f)){o({ok:true,css:null,roles:r})}else{o({ok:true,css:fs.readFileSync(f).subarray(0,${SLOT_TEXT_MAX}).toString("utf8"),roles:r})}}catch(e){o({ok:false,error:String((e&&e.message)||e).slice(0,200)})}`;
var WORDPRESS_SLOT_PHP = `$o=function($a){echo "\\n${LINE}".base64_encode(json_encode($a,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE))."\\n";};` + ROLES_PHP + `$p=WP_Theme_JSON_Resolver::get_user_data_from_wp_global_styles(wp_get_theme());$j=(is_array($p)&&isset($p["post_content"]))?json_decode((string)$p["post_content"],true):null;$css=(is_array($j)&&isset($j["styles"]["css"])&&is_string($j["styles"]["css"]))?$j["styles"]["css"]:"";$rs=$roles(array_unique([get_stylesheet_directory(),get_template_directory()]));if(strpos($css,"tracy-ds-slot:")===false){$o(["ok"=>true,"css"=>null,"roles"=>$rs]);return;}$l=$j["settings"]["color"]["palette"]??[];if(is_array($l)&&(isset($l["theme"])||isset($l["custom"]))){$l=array_merge((array)($l["theme"]??[]),(array)($l["custom"]??[]));}$pal=[];foreach((array)$l as $c){if(is_array($c)&&isset($c["slug"],$c["color"])){$pal[]=["slug"=>(string)$c["slug"],"color"=>(string)$c["color"]];}}$fl=$j["settings"]["typography"]["fontFamilies"]??[];if(is_array($fl)&&(isset($fl["theme"])||isset($fl["custom"]))){$fl=array_merge((array)($fl["theme"]??[]),(array)($fl["custom"]??[]));}$ff=[];foreach((array)$fl as $f){if(is_array($f)&&isset($f["slug"],$f["fontFamily"])){$ff[]=["slug"=>(string)$f["slug"],"fontFamily"=>(string)$f["fontFamily"]];}}$s=(string)get_option("tracy_inspiration","");$n=null;$u=wp_upload_dir(null,false);$i=(is_array($u)&&isset($u["basedir"]))?json_decode((string)@file_get_contents($u["basedir"]."/tracy/inspirations.json"),true):null;if($s!==""&&is_array($i)&&isset($i["systems"][$s]["name"])&&is_string($i["systems"][$s]["name"])){$n=$i["systems"][$s]["name"];}$o(["ok"=>true,"css"=>substr($css,0,${SLOT_TEXT_MAX}),"palette"=>$pal,"fonts"=>$ff,"variation"=>$s,"name"=>$n,"roles"=>$rs]);`;
var JOOMLA_SLOT_PHP = `$o=function($a){echo "\\n${LINE}".base64_encode(json_encode($a,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE))."\\n";};` + ROLES_PHP + `if(!is_file("configuration.php")){$o(["ok"=>false,"error"=>"no configuration.php"]);exit(0);}require "configuration.php";$c=new JConfig();$m=@new mysqli($c->host,$c->user,$c->password,$c->db,(int)($c->dbport?:3306));if($m->connect_errno){$o(["ok"=>false,"error"=>"the database did not answer"]);exit(0);}$p=$m->real_escape_string($c->dbprefix);$t=gmdate("Y-m-d H:i:s");$r=$m->query("SELECT m.id,m.title,m.content FROM {$p}modules m WHERE m.module='mod_custom' AND m.client_id=0 AND m.published=1 AND m.position<>'' AND m.content LIKE '%tracy-ds-slot:%' AND (m.publish_up IS NULL OR m.publish_up<='$t') AND (m.publish_down IS NULL OR m.publish_down>'$t') AND EXISTS(SELECT 1 FROM {$p}modules_menu mm WHERE mm.moduleid=m.id) ORDER BY m.ordering,m.id LIMIT 1");if(!$r){$o(["ok"=>false,"error"=>"the module query failed"]);exit(0);}$s=$m->query("SELECT * FROM {$p}template_styles WHERE client_id=0 AND home='1' LIMIT 1");$y=$s?$s->fetch_assoc():null;$tf=[];foreach(["template","parent"] as $k){$v=is_array($y)?preg_replace("/[^A-Za-z0-9_.-]/","",(string)($y[$k]??"")):"";if($v!==""){$tf[]="templates/".$v;$tf[]="media/templates/site/".$v;}}$rs=count($tf)===0?null:$roles($tf);$x=$r->fetch_assoc();if(!$x){$o(["ok"=>true,"css"=>null,"roles"=>$rs]);exit(0);}$o(["ok"=>true,"css"=>substr((string)$x["content"],0,${SLOT_TEXT_MAX}),"module"=>["id"=>(int)$x["id"],"title"=>(string)$x["title"]],"roles"=>$rs]);`;
var LATE = Symbol("late");

// ../../tools/tracy-site-tools/src/host/wp-seo.mjs
var WP_SEO_META = /* @__PURE__ */ Object.freeze({
  title: "_claude_cowork_seo_title",
  description: "_claude_cowork_seo_description",
  since: "0.18.0"
});
var WP_SEO_PLUGINS = /* @__PURE__ */ Object.freeze(
  [
    {
      id: "yoast",
      name: "Yoast SEO",
      folders: ["wordpress-seo", "wordpress-seo-premium"],
      title: "_yoast_wpseo_title",
      description: "_yoast_wpseo_metadesc"
    },
    {
      id: "rank-math",
      name: "Rank Math",
      folders: ["seo-by-rank-math", "seo-by-rank-math-pro"],
      title: "rank_math_title",
      description: "rank_math_description"
    },
    {
      id: "aioseo",
      name: "All in One SEO",
      folders: ["all-in-one-seo-pack", "all-in-one-seo-pack-pro"],
      title: null,
      description: null
    },
    {
      id: "seopress",
      name: "SEOPress",
      folders: ["wp-seopress", "wp-seopress-pro"],
      title: null,
      description: null
    },
    {
      id: "the-seo-framework",
      name: "The SEO Framework",
      folders: ["autodescription"],
      title: null,
      description: null
    },
    { id: "slim-seo", name: "Slim SEO", folders: ["slim-seo"], title: null, description: null },
    { id: "squirrly", name: "Squirrly SEO", folders: ["squirrly-seo"], title: null, description: null },
    {
      id: "smartcrawl",
      name: "SmartCrawl",
      folders: ["smartcrawl-seo", "wpmu-dev-seo"],
      title: null,
      description: null
    },
    { id: "surerank", name: "SureRank", folders: ["surerank"], title: null, description: null },
    {
      id: "jetpack-seo",
      name: "Jetpack SEO",
      folders: ["jetpack"],
      module: "seo-tools",
      title: null,
      description: null
    }
  ].map((row) => /* @__PURE__ */ Object.freeze({ ...row, folders: /* @__PURE__ */ Object.freeze(row.folders) }))
);

// ../../tools/tracy-site-tools/src/host/comment-fence.mjs
var FILE_WRITES = /* @__PURE__ */ Object.freeze({ write: "file_path", edit: "file_path", str_replace_editor: "path" });
var SHELLS = /* @__PURE__ */ Object.freeze({
  bash: { text: "command", dir: "workdir" },
  pwsh: { text: "command", dir: "workdir" },
  terminal_send: { text: "text", dir: null }
});
var COMMENT_FENCED_TOOLS = /* @__PURE__ */ new Set([...Object.keys(FILE_WRITES), ...Object.keys(SHELLS)]);

// ../../tools/tracy-site-tools/src/host/set-only-doors.mjs
var SET_ONLY_WRITE_ACTIONS = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ new Set(["site.identity", "template.siteSettings", "template.languageOverrides"])
);
function setOnlyDoorWrites(params) {
  const op = typeof params?.operation === "string" ? params.operation.trim() : "";
  if (op === "read") return false;
  if (op !== "") return true;
  return Object.values(params ?? {}).some(
    (v2) => v2 !== null && typeof v2 === "object" && !Array.isArray(v2) && Object.keys(v2).length > 0
  );
}

// ../../tools/tracy-site-tools/src/host/site-context.mjs
var EMDASH_WORDS_WHERE = `No PHP and no CLI: words, pictures, menus and settings go through \`tracy_emdash\`, EmDash's own tools as \`{tool, arguments}\`; the template's code is PHRASES and PRESENTATION below. ${EMDASH_WORDS_ROAD} ${EMDASH_LANGUAGE_RULE} On a Tracy template what every page shares (top bar, logo, footer, contact details) is the one entry of collection \`site\`, and a page's own words are the one entry of the collection named after it (\`home\`, \`about\`, \`contact\`; a listing page's is \`<name>_page\`, e.g. \`news_page\`). Fields ending \`_a\` and \`_b\` are ONE heading on two lines: a new heading fills both, split at the customer's line break, else at a dash, comma or colon, else at the word nearest the old split; one word leaves \`_b\` empty.`;
var SEO_EXTRA = /* @__PURE__ */ Object.freeze({
  wordpress: ` With no SEO plugin, Claude Cowork ${WP_SEO_META.since}+ (\`tracy_site info\` answers \`info.component\`) prints a page's own search title (the whole <title>: keep its ' \u2013 <site name>' end unless the customer asked for a different full title) and meta description from post meta \`${WP_SEO_META.title}\` and \`${WP_SEO_META.description}\`: \`content.update {kind:"postmeta", id, key, fields:{value}}\` changes only those, not the page title, breadcrumb or heading; Tracy writes Yoast's or Rank Math's own key instead where one runs, and refuses where another SEO plugin keeps them. An older plugin has neither: the page title is the title, and renaming the page renames its breadcrumb and heading too \u2014 say so.`,
  joomla: " A page's meta description is its article's `metadesc`, else its menu item's `menu-meta_description` param, else the language's `metadesc` (kind `language`); on the Contact page it is the contact record's `metadesc` (kind `contact`, the id in its menu item's link); a menu item's `params` are written whole.",
  emdash: ""
});
var SEALED_JOOMLA_WHERE = `in the content contract's slots. \`content.read\` shows them (a writable field's \`next\` is the apply): change them with ONE apply carrying every change (its rules are in \`tracy_site\`'s description). Only when the read does not show the slot, find it first with ONE \`content.contract {operation:"inspect", page:"<its route: home, contact\u2026>" (or [every page the request touches]), slots:"text", match:"<words you look for>"}\`. If the inspect lists \`[Tracy] Site identity\`, the site name, slogan, monogram, phone, e-mail, address, hours and social links are ONE slot each for every page and language and may be emptied or filled; words showing \`{site.name}\` or \`{contact.*}\` stay tokens. A heading on two lines is two slots (\`\u2026/title\`, \`\u2026/title-accent\`): a new heading fills BOTH, split at a natural break into two non-empty parts. ${CONTRACT_LANGUAGE_RULE} Anything no slot holds \u2014 other words, SETTINGS, PHRASES, PRESENTATION, WHAT IS INSTALLED \u2014 changes as on any Joomla site: \`tracy_site\` \`content.update\` and its other actions first (they keep a receipt and an undo), else template files and overrides under \`.webroot/templates/\`; never SQL. ${QUICKSTART_DESIGN_RULE}`;
var SEALED_WORDPRESS_CONTRACT_WHERE = `in the content contract's slots: the named blocks of the mapped pages, keyed \`<page>.<block>\` (\`home.hero.heading\`), and the site-wide \`site.name\`, \`site.tagline\` and \u2014 when the site has them \u2014 \`identity.*\`, the name, slogan, monogram, contact details and social links the header, footer and browser tab print. \`content.read\` shows them (a writable field's \`next\` is the apply): change them with ONE apply carrying every change (its rules are in \`tracy_site\`'s description). Only when the read does not show the slot, find it first with ONE \`content.contract {operation:"inspect", page:"<its route: home, about, contact\u2026>" (or [every page the request touches]), match:"<words you look for>"}\`. ${WORDPRESS_CONTRACT_LANGUAGE_RULE} A picture slot takes the path media.draw {prompt, slot} answers. Anything no slot holds \u2014 other words and pictures, SETTINGS, PHRASES, PRESENTATION, WHAT IS INSTALLED \u2014 changes as on any WordPress site: \`tracy_site\` \`content.update\` and its other actions first (they keep a receipt and an undo), else the files of the theme this site runs (its child theme's first, when one runs); never SQL. ${QUICKSTART_DESIGN_RULE}`;
var STATE_ROLE = /^--ds-c-(?:success|warn|danger|info|disabled|focus)/;
var ROLE_NAMES = (() => {
  const tail = (re, cut) => ROLE_VARIABLES.map((role) => role.name).filter((name2) => re.test(name2)).map((name2) => name2.slice(cut.length));
  const colours = tail(/^--ds-c-/, "--ds-c-").filter((name2) => !STATE_ROLE.test(`--ds-c-${name2}`));
  const radii = tail(/^--ds-[a-z]+-radius$/, "--ds-").map((name2) => name2.replace(/-radius$/, ""));
  const fonts = tail(/^--ds-font-/, "--ds-font-");
  return `\`--ds-c-{${colours.join(",")}}\` \`--ds-{${radii.join(",")}}-radius\` \`--ds-font-{${fonts.join(",")}}\` and the status colours \`--ds-c-{success,warn,danger,info}{,-bg,-text}\``;
})();
var ACTION_CLASS = /* @__PURE__ */ Object.freeze({
  // Reads — calling one is still looking.
  info: "read",
  "content.list": "read",
  "content.get": "read",
  "content.read": "read",
  "content.locate": "read",
  "extension.list": "read",
  "plugin.list": "read",
  "theme.list": "read",
  "db.tables": "read",
  "core.manifest": "read",
  "db.dump": "read",
  "apply.list": "read",
  "media.scan": "read",
  "page.look": "read",
  "page.text": "read",
  "content.find": "read",
  // Preparation the rules themselves ask for, or that changes nothing a visitor sees.
  "db.snapshot": "prepare",
  // 🔒 NEVER PARALLEL, THE INSPECT INCLUDED. The Joomla component runs every contract call — a
  // read-only inspect too — under `GET_LOCK(…, 0)` (claude-cowork `Engine.php:135-142`,
  // `JoomlaSiteWriter.php:287-292`), so two overlapping inspects of one site answer one of them
  // `writer_busy`. Repeated inspects are removed by the per-turn inspect memo instead (plan v2 E3.1:
  // 88 of 123 r2 inspects answerable from it), which makes overlapping them worth nothing. Its write
  // (`operation:"apply"`) is judged by `changesSite`.
  "content.contract": "prepare",
  // Writes — the thing the customer asked for.
  "content.batch": "write",
  "content.update": "write",
  "content.delete": "write",
  "content.language": "write",
  "media.upload": "write",
  "media.delete": "write",
  // Draws a picture and uploads it through media.upload: the site's media library changes.
  "media.draw": "write",
  // Finds visible words where they are stored and rewrites them there (F3): the customer's change
  // itself, so it resets the budget and never runs beside a sibling. Classed before the door lists
  // it, which costs nothing — the test walks the door's lists, not this table.
  "content.replace": "write",
  // Replacement rules for words a theme prints at render time; its inspect and status are judged
  // by `changesSite`, as the contract's are.
  "content.renderedWords": "write",
  // Makes a new page and its menu entry (`page-create.mjs`): the customer's change itself.
  "page.create": "write",
  "apply.revert": "write",
  // Puts a look write's files back (`look-undo.mjs`): a visitor sees the page change.
  "look.revert": "write",
  // Writes a look in the theme's or template's files (`look-set.mjs`): the customer's change itself.
  "look.set": "write",
  "extension.install": "write",
  "extension.enable": "write",
  "theme.install": "write",
  "theme.activate": "write",
  "theme.style": "write",
  "language.install": "write",
  // Sets a Joomla template's logo, name or favicon (its read is classed with it: rare, and never worth a sibling).
  "template.siteSettings": "write",
  // Sets Joomla's site name or description (its read is classed with it, as `template.siteSettings`'s is).
  "site.identity": "write",
  "plugin.install": "write",
  "plugin.activate": "write",
  "core.upgrade": "write",
  "db.rollback": "write"
});
var ACTION_CLASSES = ACTION_CLASS;
function contractOperationWrites(operation) {
  const op = typeof operation === "string" ? operation.trim() : "";
  if (op === "" || op === "inspect") return false;
  return !/\.(plan|verify)$/.test(op);
}
var HEAD_KEY = /"([\w$]+)":("(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null)([,}])/y;
function answerOf(text) {
  try {
    return JSON.parse(text);
  } catch {
    if (!text.startsWith("{")) return null;
    const head = {};
    HEAD_KEY.lastIndex = 1;
    for (let m = HEAD_KEY.exec(text); m !== null; m = HEAD_KEY.exec(text)) {
      try {
        head[m[1]] = JSON.parse(m[2]);
      } catch {
        break;
      }
      if (m[3] === "}") break;
    }
    return Object.keys(head).length > 0 ? { ...head, cut: true } : null;
  }
}
function resultTexts(parts, depth = 0) {
  if (!Array.isArray(parts) || depth > 3) return [];
  return parts.flatMap(
    (part) => typeof part?.text === "string" ? [part.text] : resultTexts(part?.content, depth + 1)
  );
}
function refusedText(text) {
  const answer = answerOf(text);
  if (answer !== null && typeof answer === "object" && !Array.isArray(answer) && (!answer.cut || "ok" in answer))
    return answer.ok === false;
  return /"ok"\s*:\s*false/.test(text);
}
function resultWentThrough(data) {
  if (data?.message?.isError === true) return false;
  const content = data?.message?.content;
  if (Array.isArray(content) && resultTexts(content).some(refusedText)) return false;
  return data?.error === void 0;
}
var MAY_HAVE_WRITTEN = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ new Set(["PARTIAL", "OUTCOME_UNKNOWN", "STORE_CHANGED"]));
function replaceWroteSome(answer) {
  if (!answer || typeof answer !== "object") return false;
  const a = (
    /** @type {Record<string, unknown>} */
    answer
  );
  if (a.ok === true) return false;
  if (MAY_HAVE_WRITTEN.has(String(a.code ?? "")) || a.partial === true) return true;
  return Array.isArray(a.written) ? a.written.length > 0 : Number(a.written) > 0;
}
function resultOutcomeUnknown(data) {
  const content = data?.message?.content;
  if (!Array.isArray(content)) return false;
  return resultTexts(content).some((text) => {
    const answer = answerOf(text);
    return outcomeUnknown(answer) || replaceWroteSome(answer);
  });
}

// src/host/turn.mjs
var LOOKING_ACTIONS = new Set(
  Object.entries(ACTION_CLASSES).filter(([, kind]) => kind === "read").map(([action]) => action)
);
var WRITING_FILE_TOOLS = { write: "file_path", edit: "file_path", str_replace_editor: "path" };
var SHELLS2 = /* @__PURE__ */ new Set(["bash", "pwsh"]);
var DOOR_TOOLS = /* @__PURE__ */ new Set(["tracy_site", "tracy_emdash"]);
function argsOf(call) {
  let args = call?.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return null;
    }
  }
  return args !== null && typeof args === "object" ? (
    /** @type {Record<string, unknown>} */
    args
  ) : null;
}
function insideWebroot(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  const normalized = value.replace(/\\/g, "/");
  return normalized.includes("/.webroot/") || normalized.startsWith(".webroot/");
}
function emdashWrote(args) {
  const shape = normalizeEmdashShape(args);
  if (!shape.ok || shape.list === true || shape.route !== void 0) return false;
  return !EMDASH_READ_TOOLS.has(shape.tool);
}
function siteCallWrote(args) {
  const { action, params } = canonicalCall(args);
  if (action === "") return false;
  if (action === "content.replace" && params.dryRun === true) return false;
  if (action === "content.contract") return contractOperationWrites(params.operation);
  if (SET_ONLY_WRITE_ACTIONS.has(action)) return setOnlyDoorWrites(params);
  return !LOOKING_ACTIONS.has(action);
}
function callChangedSite(call) {
  const name2 = typeof call?.name === "string" ? call.name : "";
  if (SHELLS2.has(name2)) return true;
  const pathArg = WRITING_FILE_TOOLS[name2];
  if (pathArg !== void 0) return insideWebroot(argsOf(call)?.[pathArg]);
  if (name2 === "tracy_emdash") return emdashWrote(call?.arguments);
  if (name2 !== "tracy_site") return false;
  return siteCallWrote(call?.arguments);
}
var READ_ONLY_TOOLS = /* @__PURE__ */ new Set([
  "read",
  "read_image",
  "glob",
  "grep",
  "skill",
  "todo_write",
  "ask_user_question",
  "exit_plan_mode",
  "web_search",
  "web_fetch",
  "job_list",
  "job_output",
  "tracy_site_profile",
  "tracy_find_definition"
]);
function callMayWriteSite(call) {
  const name2 = typeof call?.name === "string" ? call.name : "";
  if (name2 === "tracy_site") return siteCallWrote(call?.arguments);
  if (name2 === "tracy_emdash") return emdashWrote(call?.arguments);
  return !READ_ONLY_TOOLS.has(name2);
}
function refusedCalls(events) {
  const refused = /* @__PURE__ */ new Set();
  for (const event of events) {
    if (event?.type !== "tool/result") continue;
    const data = (
      /** @type {any} */
      event.data
    );
    const id = data?.message?.source?.callId ?? data?.callId;
    if (typeof id !== "string") continue;
    if (!resultWentThrough(data) && !resultOutcomeUnknown(data)) refused.add(id);
  }
  return refused;
}
function writtenPath(call) {
  const name2 = typeof call?.name === "string" ? call.name : "";
  const pathArg = WRITING_FILE_TOOLS[name2];
  if (pathArg === void 0) return null;
  const value = argsOf(call)?.[pathArg];
  return typeof value === "string" ? value : null;
}
function turnRefreshMode(events) {
  if (!Array.isArray(events)) return null;
  const refused = refusedCalls(events);
  let sawChange = false;
  let styleOnly = true;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === "turn/start") break;
    if (event?.type !== "tool/call") continue;
    const call = (
      /** @type {any} */
      event.data
    );
    if (!callChangedSite(call)) continue;
    if (DOOR_TOOLS.has(call?.name) && typeof call?.callId === "string" && refused.has(call.callId)) continue;
    sawChange = true;
    const path4 = writtenPath(call);
    if (path4 === null || !/\.css$/i.test(path4.trim())) styleOnly = false;
  }
  if (!sawChange) return null;
  return styleOnly ? "style" : "full";
}
async function sessionSiteKey({ cwd, laneSiteKey: laneSiteKey2, env = process.env }) {
  if (laneSiteKey2 !== null) return laneSiteKey2;
  let sitesRoot;
  let label;
  try {
    sitesRoot = resolveSitesRoot(void 0, env);
    label = siteOf(String(cwd ?? ""), sitesRoot).label;
  } catch {
    return null;
  }
  return await recordedSiteKey(path3.join(sitesRoot, label)) ?? label;
}

// src/host/index.ts
var name = "tracy-site-tabs";
var inject = ["webServer", "agents"];
var PREFIX = "/api/tracy-site-tabs";
var viewer = null;
function gatewaySetting(name2) {
  const value = process.env[name2]?.trim() || null;
  if (value !== null) return value;
  const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim();
  if (!file) return null;
  try {
    const m = new RegExp(`^${name2}=(.+)$`, "m").exec(readFileSync2(file, "utf8"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") || null : null;
  } catch {
    return null;
  }
}
var siteKey;
function laneSiteKey() {
  return siteKey === void 0 ? siteKey = gatewaySetting("MCP_TRACY_SITE_KEY") : siteKey;
}
async function recordLaneMoment(key, title) {
  if (viewer === null) {
    console.warn("[tracy-site-tabs] nobody has opened this lane yet; the moment is not recorded");
    return;
  }
  const url = `${viewer.origin}/api/sites/${encodeURIComponent(key)}/moment`;
  const headers = { "content-type": "application/json", accept: "application/json", cookie: viewer.cookie };
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ title }) });
    if (!res.ok) console.warn(`[tracy-site-tabs] moment refused: ${res.status}`);
  } catch (error) {
    console.warn(
      `[tracy-site-tabs] moment not sent: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function watchLane(key, agent) {
  let recorded = -1;
  return agent.ctx.on("agent/status", ({ status }) => {
    if (status !== "idle") return;
    const prompt = momentTitle(agent.session.snapshotEvents());
    if (prompt === null || prompt.index === recorded) return;
    recorded = prompt.index;
    void recordLaneMoment(key, prompt.title);
  });
}
function turnBookFor(ctx) {
  return createTurnBook({
    send: async (door, body, who, signal) => {
      const request = await hostDoorRequest({
        door,
        cwd: who.cwd,
        email: who.email,
        origin: gatewaySetting("MCP_TRACY_ORIGIN"),
        signer: ctx.get?.("tracyAssertion")
      });
      if (!request.ok) {
        if (request.reason === null) return { ok: true, status: 204 };
        throw new Error(request.reason);
      }
      const res = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(body),
        signal
      });
      const answer = res.ok ? await res.json().catch(() => null) : null;
      return { ok: res.ok, status: res.status, body: answer };
    }
  });
}
function watchHost(book, agent) {
  const sessionId = () => agent.session.id;
  const stops = [
    agent.ctx.on("agent/pre-step", async (input, next) => {
      const decision = await next();
      if (decision.kind === "reject") return decision;
      const messages = decision.messages ?? input.messages;
      try {
        const entered = book.enter({
          sessionId: sessionId(),
          turn: input.turn,
          messages,
          cwd: agent.session.header?.cwd
        });
        if (!entered.opens || !openMayNameUndone(input.turn)) return decision;
        const undone = await entered.undone;
        if (undone.length > 0 && Array.isArray(messages)) {
          const spliced = withUndoneNotice(messages, undone, randomUUID());
          if (spliced !== messages) return { ...decision, messages: spliced };
        }
      } catch (error) {
        console.warn(
          `[tracy-site-tabs] turn open failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return decision;
    }),
    agent.ctx.on("tools/pre-execute", async (exec, next) => {
      if (callMayWriteSite(exec))
        await whileWaiting(
          sessionId(),
          "previous",
          book.writeReady({ sessionId: sessionId(), signal: exec?.signal })
        );
      return next();
    }),
    agent.ctx.on("agent/turn-stopping", async ({ turn }) => {
      await book.turnStopping({
        sessionId: sessionId(),
        turn,
        events: agent.session.snapshotEvents()
      });
    }),
    agent.ctx.on("agent/status", ({ status }) => {
      if (status !== "idle") return;
      void book.idle({
        sessionId: sessionId(),
        events: agent.session.snapshotEvents()
      });
    })
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
async function turnAnswer(ctx, body) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const agent = sessionId === "" ? void 0 : ctx.agents.roots().find((one) => one.session.id === sessionId);
  const mode = agent === void 0 ? null : turnRefreshMode(agent.session.snapshotEvents());
  if (agent === void 0 || mode === null) {
    return { changed: false, siteKey: null };
  }
  return {
    changed: true,
    // How cheaply the page may be brought up to date. An older side card ignores the field and
    // reloads, which is exactly what it did before — so this is additive in both directions.
    mode,
    siteKey: await sessionSiteKey({ cwd: agent.session.header?.cwd, laneSiteKey: laneSiteKey() })
  };
}
function apply(ctx) {
  const route = {
    kind: "prefix",
    path: PREFIX,
    handler: (req, res) => {
      if (req.method !== "POST") {
        writeJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        return;
      }
      const path4 = (req.url ?? "").split("?")[0] ?? "";
      const step = path4.slice(PREFIX.length).replace(/^\/+/, "");
      if (step !== "hello" && step !== "turn") {
        writeJson(res, 404, { code: "UNKNOWN_STEP" });
        return;
      }
      const first = (header) => {
        const value = req.headers[header];
        return (Array.isArray(value) ? value[0] : value) ?? "";
      };
      const forwardedSession = first("x-tracy-session");
      const cookie = forwardedSession ? `tracy_sess=${forwardedSession}` : req.headers.cookie ?? "";
      const host = first("x-forwarded-host") || (req.headers.host ?? "");
      const proto = first("x-forwarded-proto") || "http";
      readJsonBody(req).then(async (body) => {
        if (step === "turn") {
          writeJson(res, 200, await turnAnswer(ctx, body));
          return;
        }
        if (cookie && host) viewer = { cookie, origin: `${proto}://${host}`, at: Date.now() };
        writeJson(res, 200, { ok: true, seen: viewer !== null });
      }).catch((error) => {
        writeJson(res, error instanceof BodyTooLarge ? 413 : 500, { code: "REFUSED" });
      });
    }
  };
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route);
    return () => dispose();
  }, "tracy-site-tabs: host routes");
  ctx.effect(() => {
    const watched = /* @__PURE__ */ new WeakSet();
    const stops = [];
    let book = null;
    const install = (agent) => {
      if (watched.has(agent)) return;
      watched.add(agent);
      const key = laneSiteKey();
      if (key !== null) {
        stops.push(watchLane(key, agent));
        return;
      }
      book ??= turnBookFor(ctx);
      stops.push(watchHost(book, agent));
    };
    for (const agent of ctx.agents.roots()) install(agent);
    const stopCreated = ctx.on("agent/created", ({ agent }) => {
      if (ctx.agents.roots().includes(agent)) install(agent);
    });
    return () => {
      stopCreated();
      for (const stop of stops) stop();
    };
  }, "tracy-site-tabs: moments");
  ctx.effect(() => {
    if (laneSiteKey() !== null) return () => {
    };
    const rate = (sessionId, cwd, events, event) => {
      const said = ratingOf(event);
      if (said === null || typeof sessionId !== "string") return;
      const turn = ratedTurn(events, said.messageId);
      if (turn === null) return;
      void (async () => {
        const request = await hostDoorRequest({
          door: "turn/rating",
          cwd,
          email: turn.email,
          origin: gatewaySetting("MCP_TRACY_ORIGIN"),
          signer: ctx.get?.("tracyAssertion")
        });
        if (!request.ok) {
          if (request.reason !== null) console.warn(`[tracy-site-tabs] rating not sent: ${request.reason}`);
          return;
        }
        const res = await fetch(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({
            turnId: `${sessionId}:${turn.turn}`,
            rating: said.rating,
            categories: said.categories
          })
        });
        if (!res.ok)
          console.warn(`[tracy-site-tabs] rating of ${sessionId}:${turn.turn} refused: ${res.status}`);
      })().catch(
        (error) => console.warn(
          `[tracy-site-tabs] rating not sent: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    };
    const stops = [
      ctx.on("session/event", (session, event) => {
        if (!event?.type?.startsWith("feedback/message-")) return;
        rate(session?.id, session?.header?.cwd, session?.snapshotEvents?.() ?? [], event);
      }),
      ctx.on("feedback/committed", (inspection) => {
        const events = inspection?.events ?? [];
        rate(inspection?.meta?.id, inspection?.meta?.cwd, events, events[events.length - 1]);
      })
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }, "tracy-site-tabs: ratings");
}
export {
  apply,
  inject,
  name
};
