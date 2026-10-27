/**
 * Self-contained script injected into the page in dev.
 * It stays dormant until the Dev Toolbar app toggles it on/off.
 */

const OVERLAY_ID = "astro-image-inspector-overlay";
const PANEL_ID = "astro-image-inspector-panel";
const INSTRUCTION_PANEL_ID = "astro-image-inspector-instruction";
const TOGGLE_EVENT = "astro-image-inspector:toggle";

function gcd(a: number, b: number): number {
  a = Math.round(Math.abs(a));
  b = Math.round(Math.abs(b));
  if (b === 0) return a;
  return gcd(b, a % b);
}

function aspectRatioLabel(w: number, h: number): string {
  if (h <= 0) return "—";
  const d = gcd(w, h);
  if (d === 0) return "—";
  return `${w / d}:${h / d}`;
}

function formatFromSrc(src: string): string {
  const match = src.match(/\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i);
  return match ? match[1].toLowerCase() : "—";
}

function getCoveredImage(anchor: HTMLAnchorElement): HTMLImageElement | null {
  const parent = anchor.parentElement;
  if (!parent) return null;
  const prev = anchor.previousElementSibling;
  if (prev instanceof HTMLImageElement) return prev;
  const next = anchor.nextElementSibling;
  if (next instanceof HTMLImageElement) return next;
  return null;
}

function getImageInfo(
  img: HTMLImageElement,
  overlayLink?: HTMLAnchorElement | null
) {
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth || 0;
  const nh = img.naturalHeight || 0;
  const rw = Math.round(rect.width);
  const rh = Math.round(rect.height);
  const src = img.currentSrc || img.src || "";
  const link = overlayLink ?? img.closest("a");
  const linkHref = link?.href || "";
  const warnings: string[] = [];
  if (nw > 0 && nh > 0) {
    if (rw > nw || rh > nh) warnings.push("Upscaled");
    if (nw > rw * 2 || nh > rh * 2) warnings.push("Possibly oversized source");
  }
  if (!img.hasAttribute("width") && !img.hasAttribute("height")) {
    warnings.push("No width/height");
  }
  const srcset = img.srcset || "";
  return {
    src,
    naturalWidth: nw,
    naturalHeight: nh,
    renderedWidth: rw,
    renderedHeight: rh,
    loading: img.loading || "auto",
    decoding: img.decoding || "auto",
    warnings,
    aspectIntrinsic: aspectRatioLabel(nw, nh),
    aspectRendered: aspectRatioLabel(rw, rh),
    format: formatFromSrc(src),
    alt: img.alt !== undefined && img.alt !== "" ? img.alt : "(missing)",
    fetchPriority: (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority || "auto",
    sizes: img.sizes?.trim() || "(none)",
    srcsetCount: srcset ? srcset.split(",").length : 0,
    attrWidth: img.getAttribute("width") ?? "—",
    attrHeight: img.getAttribute("height") ?? "—",
    linkHref,
  };
}

function ensureOverlay(): HTMLDivElement {
  let el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.style.cssText = "position:fixed;pointer-events:none;border:2px solid rgba(139,92,246,0.8);box-sizing:border-box;z-index:2147483646;transition:top .05s,left .05s,width .05s,height .05s;";
    document.body.appendChild(el);
  }
  return el;
}

function ensurePanel(): HTMLDivElement {
  let el = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = PANEL_ID;
    el.style.cssText = "position:fixed;bottom:60px;left:12px;max-width:360px;padding:12px;background:#ffffff;color:#0f172a;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;border-radius:10px;border:1px solid #cbd5e1;box-shadow:0 10px 30px rgba(15,23,42,0.18);z-index:2147483646;pointer-events:auto;line-height:1.5;";
    document.body.appendChild(el);
  }
  return el;
}

function hideOverlay(): void {
  const el = document.getElementById(OVERLAY_ID);
  if (el) (el as HTMLElement).style.display = "none";
}

function hidePanel(): void {
  const el = document.getElementById(PANEL_ID);
  if (el) (el as HTMLElement).style.display = "none";
}

function ensureInstructionPanel(): HTMLDivElement {
  let el = document.getElementById(INSTRUCTION_PANEL_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = INSTRUCTION_PANEL_ID;
    el.style.cssText = "position:fixed;bottom:60px;left:12px;max-width:280px;padding:12px;background:#ffffff;color:#0f172a;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;border-radius:10px;border:1px solid #cbd5e1;box-shadow:0 10px 30px rgba(15,23,42,0.16);z-index:2147483645;pointer-events:auto;line-height:1.4;";
    document.body.appendChild(el);
  }
  return el;
}

function showInstructionPanel(): void {
  const el = ensureInstructionPanel();
  el.style.display = "block";
  el.textContent =
    "Hover an image to inspect it. Click an image to pin the info card.";
}

function hideInstructionPanel(): void {
  const el = document.getElementById(INSTRUCTION_PANEL_ID);
  if (el) (el as HTMLElement).style.display = "none";
}

function showOverlay(rect: DOMRect, hasWarnings: boolean): void {
  const el = ensureOverlay();
  el.style.display = "block";
  el.style.top = `${rect.top + window.scrollY}px`;
  el.style.left = `${rect.left + window.scrollX}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.borderColor = hasWarnings ? "rgba(251,191,36,0.9)" : "rgba(34,197,94,0.8)";
}

function showPanel(info: ReturnType<typeof getImageInfo>, options: { pinned?: boolean; onClose?: () => void } = {}): void {
  const { pinned = false, onClose } = options;
  const el = ensurePanel();
  el.style.display = "block";
  const warnText = info.warnings.length > 0 ? `<span style="color:#b45309">${info.warnings.join(", ")}</span>` : "none";
  const altShort = info.alt.length > 40 ? info.alt.slice(0, 37) + "…" : info.alt;
  const sizesShort = info.sizes.length > 36 ? info.sizes.slice(0, 33) + "…" : info.sizes;
  const linkShort = info.linkHref.length > 52 ? info.linkHref.slice(0, 49) + "…" : info.linkHref;
  const buttonStyle = "padding:4px 8px;font-size:11px;cursor:pointer;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a";
  const closeBtn = pinned ? `<button type="button" data-action="close" style="${buttonStyle}">Close</button>` : "";
  el.innerHTML = `<div style="display:grid;gap:6px">${pinned ? '<div style="font-size:11px;color:#64748b;margin-bottom:2px">Pinned — click another image or Close</div>' : ""}${info.linkHref ? `<div><strong>link</strong><br/><span style="word-break:break-all">${linkShort}</span></div>` : ""}<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><strong>natural</strong><br/>${info.naturalWidth}×${info.naturalHeight}</div><div><strong>rendered</strong><br/>${info.renderedWidth}×${info.renderedHeight}</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><strong>aspect (int)</strong><br/>${info.aspectIntrinsic}</div><div><strong>aspect (out)</strong><br/>${info.aspectRendered}</div></div><div><strong>format</strong> ${info.format} · <strong>loading</strong> ${info.loading} · <strong>decoding</strong> ${info.decoding}</div>${info.fetchPriority !== "auto" ? `<div><strong>fetchpriority</strong> ${info.fetchPriority}</div>` : ""}<div><strong>alt</strong><br/><span style="color:${info.alt === "(missing)" ? "#b91c1c" : "inherit"}">${altShort}</span></div>${info.srcsetCount > 0 ? `<div><strong>srcset</strong> ${info.srcsetCount} source(s)</div>` : ""}${info.sizes !== "(none)" ? `<div><strong>sizes</strong><br/>${sizesShort}</div>` : ""}<div><strong>width/height attrs</strong> ${info.attrWidth} × ${info.attrHeight}</div><div><strong>warnings</strong> ${warnText}</div>${closeBtn ? `<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">${closeBtn}</div>` : ""}</div>`;
  el.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e: Event) => {
      e.preventDefault();
      (e as MouseEvent).stopPropagation();
      if ((btn as HTMLElement).dataset.action === "close" && onClose) onClose();
    });
  });
}

function enableInspector(): () => void {
  showInstructionPanel();
  let pinnedImage: HTMLImageElement | null = null;
  const unpin = () => {
    pinnedImage = null;
    hideOverlay();
    hidePanel();
    showInstructionPanel();
  };
  const onMouseOver = (e: Event) => {
    const target = e.target as Node;
    let img: HTMLImageElement | null =
      target instanceof HTMLImageElement ? target : null;
    let overlayLink: HTMLAnchorElement | undefined;
    if (!img && target instanceof HTMLElement) {
      const anchor = target.closest("a");
      if (anchor instanceof HTMLAnchorElement) {
        img = getCoveredImage(anchor);
        if (img) overlayLink = anchor;
      }
    }
    if (!img) {
      if (!pinnedImage) {
        hideOverlay();
        hidePanel();
        showInstructionPanel();
      } else hideOverlay();
      return;
    }
    hideInstructionPanel();
    const info = getImageInfo(img, overlayLink);
    showOverlay(img.getBoundingClientRect(), info.warnings.length > 0);
    if (!pinnedImage) showPanel(info);
  };
  const onMouseOut = (e: Event) => {
    const related = (e as MouseEvent).relatedTarget as Node | null;
    if (pinnedImage) {
      if (related && document.body.contains(related)) return;
      hideOverlay();
      return;
    }
    if (related && document.body.contains(related)) return;
    hideOverlay();
    hidePanel();
    showInstructionPanel();
  };
  const onClick = (e: Event) => {
    const target = e.target as Node;
    let img: HTMLImageElement | null =
      target instanceof HTMLImageElement ? target : null;
    if (!img && target instanceof HTMLElement) {
      const anchor = target.closest("a");
      if (anchor instanceof HTMLAnchorElement) {
        img = getCoveredImage(anchor);
      }
    }
    if (!img) return;
    e.preventDefault();
    (e as MouseEvent).stopPropagation();
    const overlayLink =
      target instanceof HTMLElement &&
      target.closest("a") instanceof HTMLAnchorElement
        ? (target.closest("a") as HTMLAnchorElement)
        : undefined;
    pinnedImage = img;
    const info = getImageInfo(img, overlayLink);
    showOverlay(img.getBoundingClientRect(), info.warnings.length > 0);
    showPanel(info, { pinned: true, onClose: unpin });
  };
  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClick, true);
    hideOverlay();
    hidePanel();
    hideInstructionPanel();
  };
}

function initPageInspector(): void {
  let cleanup: (() => void) | null = null;
  let active = false;

  window.addEventListener(TOGGLE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<{ state?: boolean }>).detail;
    const nextState = Boolean(detail?.state);

    if (nextState === active) return;
    active = nextState;

    if (cleanup) {
      cleanup();
      cleanup = null;
    }

    if (active) {
      cleanup = enableInspector();
    }
  });
}

if (typeof document !== "undefined" && document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPageInspector);
} else {
  initPageInspector();
}
