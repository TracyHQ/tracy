// H7 + H12: the Tracy sign-in door (`/gateway/tracy/*`, L5–L8) and the answer to a request that
// has no session.
//
// The lane plays exactly the role Tracy Desk plays in the `/auth/link/*` protocol: open a link,
// let the person prove who they are in the browser (Google · GitHub · mail code), then exchange
// the link's `clientSecret` for the address. No new protocol — a second client of the seat book's.
//
// TWO SETTINGS OPEN THE DOOR (origin + actor secret); the site key decides whether this lane has
// LOCAL sign-in pages. A host dsh serves every site of a machine, has no site key, and sends a
// visitor with no session to Tracy itself. Half a configuration is a 404, never an error page.
import { createHmac, randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import type { Express, Request, Response } from 'express';
import type { Database } from '../db.js';
import { mintSessionToken } from './auth-token.js';
import { renderTracyCode, renderTracySignIn, renderTracyWaiting, type PageShell } from './door-pages.js';
import { resolveGatewayLang, t, type Lang } from './i18n/index.js';
import { mountOf } from './mount.js';
import { LANG_COOKIE } from './gateway-page.js';
import { BOOK_ROLES, seatFoldersFor, seatRoleOf, toolsetsForRole } from './seat-context.js';
import { seatBookOf } from './seat-book.js';
import { noSessionAnswer, upsertSeatUser } from './seat.js';
import { SESSION_COOKIE, sessionCookie } from './seat-door.js';
import type { TracyDoorConfig } from './config.js';

/** The pages fetch `/gateway/tracy/poll` themselves; upstream's `/gateway` CSP allows no fetch at all. */
const DOOR_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const LINK_TTL_MS = 15 * 60_000;
const PENDING_MAX = 500;
/** Names the link THIS browser started; `/poll` answers no other browser (a login-CSRF guard). */
const LINK_COOKIE = 'dshpw_tracy_link';
/** A seat book that does not answer must not hold a sign-in page open for ever. */
const SEATS_TIMEOUT_MS = 10_000;

export interface TracyDoorDeps {
  db: Database;
  door: TracyDoorConfig | undefined;
  /** Upstream's `pageShell`. */
  shell: PageShell;
  /** Upstream's `safeNext`: a same-origin path, or `/`. */
  safeNext: (next: string | undefined) => string;
  jwtSecret: string;
  tls: boolean;
  /** A seat was minted: forget its cached sessions; drop its access snapshot only when its role moved. */
  seatMinted(userId: number, roleChanged: boolean): void;
  /** Upstream's same-origin check (`originHostMatches`), the one its own login and setup forms use. */
  sameOrigin(req: Request): boolean;
}

function cookieOf(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

/** The page language: `?lang` > cookie > dsh setting > browser > English (I1). */
export function doorLang(req: Request): Lang {
  return resolveGatewayLang({
    queryLang: req.query.lang,
    cookieLang: cookieOf(req.headers.cookie, LANG_COOKIE),
    acceptLanguage: req.headers['accept-language'],
  });
}

/** The door settings trimmed, and which door they open. */
function doorOf(config: TracyDoorConfig | undefined) {
  const door = {
    origin: (config?.origin ?? '').trim().replace(/\/+$/, ''),
    seatsOrigin: (config?.seatsOrigin ?? '').trim().replace(/\/+$/, ''),
    siteKey: (config?.siteKey ?? '').trim(),
    actorSecret: (config?.actorSecret ?? '').trim(),
    siteLabel: (config?.siteLabel ?? '').trim(),
  };
  const doorOpen = door.origin !== '' && door.actorSecret !== '';
  return { door, doorOpen, siteDoor: doorOpen && door.siteKey !== '' };
}

/**
 * The sign-in door OPEN on this lane — where every "no session" is sent. One door at a time (TCH
 * ADR 0001). A host dsh (no site key) answers with Tracy's own origin, ABSOLUTE and without
 * `next`: cowork-web decides which site the visitor is going to.
 * @param mount - the request's mount prefix.
 * @param next - a mount-relative path to come back to, or '' for none.
 */
function signInPathFor(config: TracyDoorConfig | undefined, mount: string, next: string): string {
  const { door, doorOpen, siteDoor } = doorOf(config);
  if (doorOpen && !siteDoor) return door.origin;
  const target = `${mount}${siteDoor ? '/gateway/tracy' : '/gateway/login'}`;
  return next === '' ? target : `${target}?next=${encodeURIComponent(next)}`;
}

/**
 * Logout, after upstream revoked the token and closed the account's sockets (H0 + H12): the session
 * cookie a door set lives at `Path=<mount>` (`sessionCookie`), so that is the path cleared, and the
 * person goes to the door a request with no session goes to — upstream's `/gateway/login` is a 404
 * once a seat secret is set.
 * @returns false, answering nothing, at the root of a lane with no Tracy door: upstream's own answer
 *   (`Path=/`, `/gateway/login`) is already the right one there.
 */
export function answerLogout(req: Request, res: Response, config: TracyDoorConfig | undefined): boolean {
  const mount = mountOf(req);
  if (mount === '' && !doorOf(config).doorOpen) return false;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=${mount || '/'}; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.redirect(302, signInPathFor(config, mount, ''));
  return true;
}

/** Register the Tracy door. Returns how this lane answers a request with no session (H12). */
export function registerTracyDoor(app: Express, deps: TracyDoorDeps) {
  const { door, doorOpen, siteDoor } = doorOf(deps.door);
  const signInPath = (mount: string, next: string): string => signInPathFor(deps.door, mount, next);

  /**
   * H12: answer a request with no session — the ONE place that decides how. A browser is
   * redirected to the open door, at its mount, with a mount-relative `next` (none for the root, as
   * upstream). A proxy or non-browser caller facing a cross-origin door gets 401: a cross-origin
   * `Location` is not something it can act on (`noSessionAnswer` in seat.ts).
   */
  const answerNoSession = (req: Request, res: Response): void => {
    const original = req.url ?? '/';
    const answer = noSessionAnswer({
      signInTarget: signInPath(mountOf(req), original === '/' ? '' : original),
      accept: typeof req.headers.accept === 'string' ? req.headers.accept : null,
      serviceToken: typeof req.headers['cf-access-client-id'] === 'string',
    });
    if (answer.status === 401) {
      res.status(401).json({ ok: false, error: 'no session' });
      return;
    }
    res.redirect(302, answer.location);
  };

  if (!siteDoor) return { answerNoSession };

  const page = (res: Response, html: string, status = 200): void => {
    res.setHeader('Content-Security-Policy', DOOR_CSP);
    res.status(status).type('html').send(html);
  };
  const shell = deps.shell;
  const book = seatBookOf(deps.db);
  const seatsOrigin = door.seatsOrigin === '' ? door.origin : door.seatsOrigin;

  /** "I ask on behalf of this address", signed the way the seat book checks it. */
  const actorAssertion = (email: string): string => {
    const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
    const signature = createHmac('sha256', door.actorSecret).update(payload).digest('base64url');
    return `v1.${payload}.${signature}`;
  };

  const seats = async (
    route: string,
    init: { method?: string; body?: string; email?: string } = {},
  ): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> => {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.email !== undefined) headers['x-tracy-actor'] = actorAssertion(init.email);
    try {
      const response = await fetch(`${seatsOrigin}${route}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body,
        signal: AbortSignal.timeout(SEATS_TIMEOUT_MS),
      });
      let body: Record<string, unknown> | null = null;
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        body = null;
      }
      return { ok: response.ok, status: response.status, body };
    } catch {
      return { ok: false, status: 502, body: null };
    }
  };

  /** nonce → clientSecret, alive for one sign-in; a hard ceiling keeps a loop on `/start` bounded. */
  const pendingLinks = new Map<string, { clientSecret: string; next: string; at: number }>();
  /**
   * ticket → the address a code was asked for (01/09, ADR 0005). The address lives HERE, not in
   * the form: a hidden field is a value the person can edit.
   */
  const pendingCodes = new Map<string, { email: string; next: string; at: number }>();
  const remember = <V extends { at: number }>(map: Map<string, V>, key: string, value: V): void => {
    for (const [k, v] of map) if (value.at - v.at > LINK_TTL_MS) map.delete(k);
    if (map.size >= PENDING_MAX) map.delete(map.keys().next().value as string);
    map.set(key, value);
  };
  const nextOf = (raw: unknown): string => deps.safeNext(typeof raw === 'string' ? raw : undefined);
  const backTo = (req: Request, next: string): string => `${mountOf(req)}${next === '' ? '/' : next}`;
  const linkCookie = (req: Request, nonce: string, maxAgeS: number): string =>
    `${LINK_COOKIE}=${nonce}; Path=${mountOf(req)}/gateway/tracy; HttpOnly; SameSite=Lax; Max-Age=${String(maxAgeS)}${deps.tls ? '; Secure' : ''}`;

  /** The folder a seat holds on this lane: `/site/<label>` after realpath (S10), or the single-site webroot. */
  const seatFolders = (): string[] => seatFoldersFor(door.siteLabel, realpathSync);

  /**
   * A proven address → a lane session. ONE PLACE, for all three providers and the mail path: a
   * second copy of "ask about the seat → upsert → mint" is a second copy of a permission check.
   * @returns `{}` on success, or `{ error }` for the caller to render.
   */
  const grantLaneSession = async (req: Request, res: Response, email: string): Promise<{ error?: string }> => {
    const lang = doorLang(req);
    // Identity is not permission: the seat book is asked about THIS site. The route is `/seats`.
    const listed = await seats(`/sites/${encodeURIComponent(door.siteKey)}/seats`, { email });
    const rows = Array.isArray(listed.body?.seats) ? (listed.body.seats as Record<string, unknown>[]) : [];
    // S15 (TCH #1036): only a LIVE seat signs in. The book answers every row of the site, so an
    // invitation nobody accepted (`invited`, join requests included) and a declined one are on the
    // list too; any status but `active` (or none at all) is no seat. Fail closed.
    const mine = rows.find((row) => String(row.email ?? '').toLowerCase() === email && row.status === 'active');
    const role = seatRoleOf(mine?.role);
    if (!listed.ok || role === null || !(BOOK_ROLES as readonly string[]).includes(role)) {
      return { error: t(lang, 'tracy.noSeat', { email }) };
    }
    // The role's fixed toolsets travel WITH the grant (ADR 0028), so a viewer's session is
    // read-only because the grant says so, not because a default happened to agree.
    const { userId, seatRoleChanged } = upsertSeatUser(
      book,
      { role, email, folders: seatFolders(), toolsets: toolsetsForRole(role) },
      [],
    );
    deps.seatMinted(userId, seatRoleChanged);
    const user = deps.db.getUserById(userId);
    if (!user) return { error: t(lang, 'tracy.startFailed') };
    res.setHeader('Set-Cookie', sessionCookie(mintSessionToken(user, { jwtSecret: deps.jwtSecret }), deps.tls));
    return {};
  };

  // Issue #35's rule for every form this door takes: a cross-site post is refused before anything
  // is asked of the seat book. Without it a page elsewhere could post a ticket and code it holds and
  // sign the victim's browser into the attacker's seat.
  app.use('/gateway/tracy', (req, res, next) => {
    if (req.method === 'POST' && !deps.sameOrigin(req)) {
      res.status(403).type('text/plain').send('403 Forbidden');
      return;
    }
    next();
  });

  app.get(['/gateway/tracy', '/gateway/tracy/'], (req, res) => {
    page(res, renderTracySignIn(shell, { lang: doorLang(req), next: nextOf(req.query.next) }));
  });

  // ── Google / GitHub: the lane waits and ASKS, the way Tracy Desk does ──────────────────────────
  app.post('/gateway/tracy/start', async (req, res) => {
    const lang = doorLang(req);
    const next = nextOf(req.body?.next);
    const provider = req.body?.provider === 'github' ? 'github' : 'google';
    const started = await seats('/auth/link/browser', { method: 'POST', body: '{}' });
    const nonce = typeof started.body?.nonce === 'string' ? started.body.nonce : '';
    const clientSecret = typeof started.body?.clientSecret === 'string' ? started.body.clientSecret : '';
    if (!started.ok || nonce === '' || clientSecret === '') {
      page(res, renderTracySignIn(shell, { lang, next, error: t(lang, 'tracy.startFailed') }), 502);
      return;
    }
    remember(pendingLinks, nonce, { clientSecret, next, at: Date.now() });
    res.setHeader('Set-Cookie', linkCookie(req, nonce, LINK_TTL_MS / 1000));
    // No `r=`: Tracy's return filter refuses a loopback lane, and should.
    const url = `${door.origin}/signin?n=${encodeURIComponent(nonce)}&provider=${provider}`;
    page(res, renderTracyWaiting(shell, { lang, nonce, url }));
  });

  // The same door Tracy Desk asks (`GET /auth/link/:nonce`). Approved → exchange the nonce for the
  // address IN THIS CALL and answer with the session: no redirect leg anyone could step into.
  // Only the browser that started the link may finish it: an attacker who approves a link of their
  // own cannot send a victim's browser here (a top-level GET carries Lax cookies) and sign it into
  // the attacker's seat. Another browser's poll reads as expired and exchanges nothing.
  app.get('/gateway/tracy/poll', async (req, res) => {
    const nonce = typeof req.query.n === 'string' ? req.query.n : '';
    const held = pendingLinks.get(nonce);
    const ownLink = nonce !== '' && cookieOf(req.headers.cookie, LINK_COOKIE) === nonce;
    if (!ownLink || held === undefined || Date.now() - held.at > LINK_TTL_MS) {
      res.json({ state: 'expired' });
      return;
    }
    const polled = await seats(`/auth/link/${encodeURIComponent(nonce)}`);
    const state = typeof polled.body?.status === 'string' ? polled.body.status : 'pending';
    if (state !== 'approved') {
      res.json({ state });
      return;
    }
    const lang = doorLang(req);
    pendingLinks.delete(nonce);
    const exchanged = await seats(`/auth/link/${encodeURIComponent(nonce)}/exchange`, {
      method: 'POST',
      body: JSON.stringify({ clientSecret: held.clientSecret }),
    });
    const email = typeof exchanged.body?.email === 'string' ? exchanged.body.email.trim().toLowerCase() : '';
    if (!exchanged.ok || email === '') {
      res.json({ done: false, error: t(lang, 'tracy.linkInvalid') });
      return;
    }
    const granted = await grantLaneSession(req, res, email);
    if (granted.error === undefined) res.append('Set-Cookie', linkCookie(req, '', 0));
    res.json(granted.error !== undefined ? { done: false, error: granted.error } : { done: true, next: backTo(req, held.next) });
  });

  // ── Mail: ask for a code, then type it (01/09, ADR 0005) ────────────────────────────────────────
  // `/auth/otp/*` (signs in and up at once), not the site's OTP door, which demands an existing seat.
  app.post('/gateway/tracy/email', async (req, res) => {
    const lang = doorLang(req);
    const next = nextOf(req.body?.next);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email === '') {
      page(res, renderTracySignIn(shell, { lang, next, error: t(lang, 'tracy.emailRequired') }), 400);
      return;
    }
    const started = await seats('/auth/otp/start', { method: 'POST', email, body: JSON.stringify({ email }) });
    if (!started.ok) {
      page(res, renderTracySignIn(shell, { lang, next, email, error: t(lang, 'tracy.startFailed') }), started.status === 429 ? 429 : 502);
      return;
    }
    const ticket = randomBytes(32).toString('hex');
    remember(pendingCodes, ticket, { email, next, at: Date.now() });
    page(res, renderTracyCode(shell, { lang, ticket, email }));
  });

  app.post('/gateway/tracy/code', async (req, res) => {
    const lang = doorLang(req);
    const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket : '';
    const held = pendingCodes.get(ticket);
    if (ticket === '' || held === undefined || Date.now() - held.at > LINK_TTL_MS) {
      // Expired goes back to step one, not to a dead end: they still want in.
      page(res, renderTracySignIn(shell, { lang, next: held?.next ?? '', error: t(lang, 'tracy.codeExpired') }), 400);
      return;
    }
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (code === '') {
      page(res, renderTracyCode(shell, { lang, ticket, email: held.email, error: t(lang, 'tracy.codeRequired') }), 400);
      return;
    }
    const checked = await seats('/auth/otp/verify', {
      method: 'POST',
      email: held.email,
      body: JSON.stringify({ email: held.email, code }),
    });
    const proven = checked.ok && typeof checked.body?.email === 'string' ? checked.body.email : '';
    if (proven === '') {
      const error = t(lang, checked.status === 429 ? 'tracy.codeTooMany' : 'tracy.codeWrong');
      page(res, renderTracyCode(shell, { lang, ticket, email: held.email, error }), checked.status === 429 ? 429 : 401);
      return;
    }
    pendingCodes.delete(ticket);
    // From here on, exactly the path Google/GitHub takes.
    const granted = await grantLaneSession(req, res, proven);
    if (granted.error !== undefined) {
      page(res, renderTracyCode(shell, { lang, ticket, email: held.email, error: granted.error }), 403);
      return;
    }
    res.redirect(303, backTo(req, held.next));
  });

  return { answerNoSession };
}
