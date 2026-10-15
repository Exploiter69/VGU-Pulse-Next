import {
  validateCreateCardPayload,
  validateCreateHandshakePayload,
  validateEventBuddyPayload,
} from '../domain/validation';
import { resolveEncryptionSecret, sha256Hex } from './crypto';
import {
  buildCardOgMetadata,
  buildEventOgMetadata,
  rewriteHtmlWithOgMetadata,
} from './ogRewriter';
import {
  checkAndIncrementRateLimit,
  resolveRateLimitSalt,
} from './rateLimit';
import {
  createCardRecord,
  createHandshakeRecord,
  getPublicCardById,
  getPublicEventById,
  listAuthorizedHandshakes,
  listPublicCards,
  listPublicEvents,
  reportCardWithDeduplication,
  updateEventBuddyParticipation,
  updateHandshakeDecision,
} from './repository';
import { verifyTurnstileToken } from './turnstile';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  APP_ENV?: string;
  PUBLIC_ORIGIN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  RATE_LIMIT_SALT?: string;
  COORDINATION_ENCRYPTION_KEY?: string;
}

const MAX_BODY_BYTES = 16_384; // 16 KB strict payload ceiling

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status = 400,
  field?: string
): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code,
        message,
        ...(field ? { field } : {}),
      },
    },
    status
  );
}

function validateMutationOrigin(request: Request, env: Env): boolean {
  const originHeader = request.headers.get('Origin');
  if (!originHeader) {
    // Allow non-browser or same-origin requests without Origin header
    return true;
  }
  const reqOrigin = new URL(request.url).origin;
  if (originHeader === reqOrigin) return true;
  if (env.PUBLIC_ORIGIN && originHeader === env.PUBLIC_ORIGIN.replace(/\/$/, '')) {
    return true;
  }
  return false;
}

async function readBoundedJson(
  request: Request
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: Response }
> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse(
        'PAYLOAD_TOO_LARGE',
        'Request payload exceeds the 16 KB size limit.',
        413
      ),
    };
  }

  const rawText = await request.text();
  if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse(
        'PAYLOAD_TOO_LARGE',
        'Request payload exceeds the 16 KB size limit.',
        413
      ),
    };
  }

  try {
    return { ok: true, data: JSON.parse(rawText) };
  } catch {
    return {
      ok: false,
      response: errorResponse(
        'MALFORMED_JSON',
        'Request body contains malformed JSON.',
        400
      ),
    };
  }
}

function extractBearerOrCapabilityToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const customHeader = request.headers.get('X-Pulse-Capability-Token');
  return customHeader ? customHeader.trim() : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const method = request.method.toUpperCase();
    const appEnv = env.APP_ENV || 'development';
    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      '127.0.0.1';

    try {
      // Reject cross-origin state-changing requests
      if (
        (method === 'POST' || method === 'PATCH' || method === 'DELETE') &&
        !validateMutationOrigin(request, env)
      ) {
        return errorResponse(
          'FORBIDDEN_ORIGIN',
          'Cross-origin mutation requests are not permitted.',
          403
        );
      }

      // =========================================================
      // 1. API ROUTES (/api/*)
      // =========================================================
      if (pathname === '/api/health' && method === 'GET') {
        const dbCheck = await env.DB.prepare('SELECT 1 AS alive').first<{
          alive: number;
        }>();
        const healthy = dbCheck?.alive === 1;
        return jsonResponse(
          {
            ok: healthy,
            service: 'vgu-pulse-next',
            environment: appEnv,
            db: healthy ? 'connected' : 'unreachable',
          },
          healthy ? 200 : 503
        );
      }

      // GET /api/cards
      if (pathname === '/api/cards' && method === 'GET') {
        const category = searchParams.get('category') || undefined;
        const q = searchParams.get('q') || undefined;
        const cards = await listPublicCards(env.DB, { category, q });
        return jsonResponse({ ok: true, cards });
      }

      // POST /api/cards
      if (pathname === '/api/cards' && method === 'POST') {
        const encConfig = resolveEncryptionSecret(
          appEnv,
          env.COORDINATION_ENCRYPTION_KEY
        );
        if (!encConfig.ok) {
          return errorResponse(encConfig.code, encConfig.message, 503);
        }

        const saltConfig = resolveRateLimitSalt(appEnv, env.RATE_LIMIT_SALT);
        if (!saltConfig.ok) {
          return errorResponse(saltConfig.code, saltConfig.message, 503);
        }

        const parsed = await readBoundedJson(request);
        if (!parsed.ok) return parsed.response;

        const validation = validateCreateCardPayload(parsed.data);
        if (!validation.valid) {
          return errorResponse(
            validation.code,
            validation.message,
            400,
            validation.field
          );
        }

        const turnstile = await verifyTurnstileToken(
          validation.data.turnstileToken,
          clientIp,
          { appEnv, secretKey: env.TURNSTILE_SECRET_KEY }
        );
        if (!turnstile.ok) {
          return errorResponse(
            turnstile.code || 'VERIFICATION_FAILED',
            turnstile.message || 'Verification failed.',
            turnstile.code === 'VERIFICATION_MISCONFIGURED' ? 503 : 403
          );
        }

        const rate = await checkAndIncrementRateLimit(
          env.DB,
          clientIp,
          saltConfig.salt,
          'create_card',
          5
        );
        if (!rate.allowed) {
          return errorResponse(
            'RATE_LIMITED',
            'Rate limit reached: You can publish at most 5 request cards per rolling 60-minute window.',
            429
          );
        }

        const created = await createCardRecord(
          env.DB,
          validation.data,
          encConfig.secret
        );
        return jsonResponse(
          {
            ok: true,
            card: created.card,
            ownerCapabilityToken: created.ownerCapabilityToken,
          },
          201
        );
      }

      // GET /api/cards/:id or POST /api/cards/:id/report
      const cardMatch = pathname.match(/^\/api\/cards\/([^/]+)(\/report)?$/);
      if (cardMatch) {
        const cardId = decodeURIComponent(cardMatch[1]);
        const isReport = cardMatch[2] === '/report';

        if (!isReport && method === 'GET') {
          const card = await getPublicCardById(env.DB, cardId);
          if (!card) {
            return errorResponse(
              'CARD_NOT_FOUND',
              'Pulse request card not found.',
              404
            );
          }
          return jsonResponse({ ok: true, card });
        }

        if (isReport && method === 'POST') {
          const saltConfig = resolveRateLimitSalt(appEnv, env.RATE_LIMIT_SALT);
          if (!saltConfig.ok) {
            return errorResponse(saltConfig.code, saltConfig.message, 503);
          }

          const rate = await checkAndIncrementRateLimit(
            env.DB,
            clientIp,
            saltConfig.salt,
            'report_card',
            10
          );
          if (!rate.allowed) {
            return errorResponse(
              'RATE_LIMITED',
              'Too many report actions from this connection.',
              429
            );
          }

          const reporterHash = await sha256Hex(
            `report:${clientIp}:${saltConfig.salt}:${cardId}`
          );
          const reportOutcome = await reportCardWithDeduplication(
            env.DB,
            cardId,
            reporterHash
          );
          if (!reportOutcome.found) {
            return errorResponse('CARD_NOT_FOUND', 'Card not found.', 404);
          }
          return jsonResponse({
            ok: true,
            alreadyReported: reportOutcome.alreadyReported,
          });
        }
      }

      // GET /api/events
      if (pathname === '/api/events' && method === 'GET') {
        const events = await listPublicEvents(env.DB);
        return jsonResponse({ ok: true, events });
      }

      // GET /api/events/:id or POST /api/events/:id/buddy
      const eventMatch = pathname.match(/^\/api\/events\/([^/]+)(\/buddy)?$/);
      if (eventMatch) {
        const eventId = decodeURIComponent(eventMatch[1]);
        const isBuddyAction = eventMatch[2] === '/buddy';

        if (!isBuddyAction && method === 'GET') {
          const event = await getPublicEventById(env.DB, eventId);
          if (!event) {
            return errorResponse(
              'EVENT_NOT_FOUND',
              'Campus event not found.',
              404
            );
          }
          return jsonResponse({ ok: true, event });
        }

        if (isBuddyAction && method === 'POST') {
          const saltConfig = resolveRateLimitSalt(appEnv, env.RATE_LIMIT_SALT);
          if (!saltConfig.ok) {
            return errorResponse(saltConfig.code, saltConfig.message, 503);
          }

          const rate = await checkAndIncrementRateLimit(
            env.DB,
            clientIp,
            saltConfig.salt,
            'event_buddy',
            30
          );
          if (!rate.allowed) {
            return errorResponse(
              'RATE_LIMITED',
              'Too many event participation updates from this connection.',
              429
            );
          }

          const parsed = await readBoundedJson(request);
          if (!parsed.ok) return parsed.response;

          const headerToken = request.headers
            .get('X-Pulse-Participant-Token')
            ?.trim();
          const rawBody =
            parsed.data && typeof parsed.data === 'object'
              ? (parsed.data as Record<string, unknown>)
              : {};
          const mergedPayload = {
            ...rawBody,
            participantToken: rawBody.participantToken || headerToken,
          };

          const validation = validateEventBuddyPayload(mergedPayload);
          if (!validation.valid) {
            return errorResponse(
              validation.code,
              validation.message,
              400,
              validation.field
            );
          }

          const updated = await updateEventBuddyParticipation(
            env.DB,
            eventId,
            validation.data.participantToken,
            validation.data.direction
          );
          if (!updated.event) {
            return errorResponse(
              'EVENT_NOT_FOUND',
              'Campus event not found.',
              404
            );
          }
          return jsonResponse({
            ok: true,
            event: updated.event,
            changed: updated.changed,
          });
        }
      }

      // POST /api/handshakes
      if (pathname === '/api/handshakes' && method === 'POST') {
        const encConfig = resolveEncryptionSecret(
          appEnv,
          env.COORDINATION_ENCRYPTION_KEY
        );
        if (!encConfig.ok) {
          return errorResponse(encConfig.code, encConfig.message, 503);
        }

        const saltConfig = resolveRateLimitSalt(appEnv, env.RATE_LIMIT_SALT);
        if (!saltConfig.ok) {
          return errorResponse(saltConfig.code, saltConfig.message, 503);
        }

        const parsed = await readBoundedJson(request);
        if (!parsed.ok) return parsed.response;

        const validation = validateCreateHandshakePayload(parsed.data);
        if (!validation.valid) {
          return errorResponse(
            validation.code,
            validation.message,
            400,
            validation.field
          );
        }

        const turnstile = await verifyTurnstileToken(
          validation.data.turnstileToken,
          clientIp,
          { appEnv, secretKey: env.TURNSTILE_SECRET_KEY }
        );
        if (!turnstile.ok) {
          return errorResponse(
            turnstile.code || 'VERIFICATION_FAILED',
            turnstile.message || 'Verification failed.',
            turnstile.code === 'VERIFICATION_MISCONFIGURED' ? 503 : 403
          );
        }

        const rate = await checkAndIncrementRateLimit(
          env.DB,
          clientIp,
          saltConfig.salt,
          'create_handshake',
          15
        );
        if (!rate.allowed) {
          return errorResponse(
            'RATE_LIMITED',
            'Rate limit reached: Maximum 15 handshake requests per rolling 60-minute window.',
            429
          );
        }

        const created = await createHandshakeRecord(
          env.DB,
          validation.data,
          encConfig.secret
        );
        if (!created.ok) {
          return errorResponse(created.code, created.message, created.status);
        }

        return jsonResponse(
          {
            ok: true,
            handshake: created.handshake,
            senderCapabilityToken: created.senderCapabilityToken,
          },
          201
        );
      }

      // POST /api/handshakes/sync (Protected by capability tokens in body)
      if (pathname === '/api/handshakes/sync' && method === 'POST') {
        const encConfig = resolveEncryptionSecret(
          appEnv,
          env.COORDINATION_ENCRYPTION_KEY
        );
        if (!encConfig.ok) {
          return errorResponse(encConfig.code, encConfig.message, 503);
        }

        const parsed = await readBoundedJson(request);
        if (!parsed.ok) return parsed.response;

        const body = (parsed.data || {}) as Record<string, unknown>;
        const ownerTokens = Array.isArray(body.ownerTokens)
          ? body.ownerTokens.filter((t): t is string => typeof t === 'string')
          : [];
        const senderTokens = Array.isArray(body.senderTokens)
          ? body.senderTokens.filter((t): t is string => typeof t === 'string')
          : [];

        const handshakes = await listAuthorizedHandshakes(
          env.DB,
          ownerTokens,
          senderTokens,
          encConfig.secret
        );
        return jsonResponse({ ok: true, handshakes });
      }

      // PATCH /api/handshakes/:id (Accept / Decline protected by owner capability token)
      const handshakePatchMatch = pathname.match(/^\/api\/handshakes\/([^/]+)$/);
      if (handshakePatchMatch && method === 'PATCH') {
        const encConfig = resolveEncryptionSecret(
          appEnv,
          env.COORDINATION_ENCRYPTION_KEY
        );
        if (!encConfig.ok) {
          return errorResponse(encConfig.code, encConfig.message, 503);
        }

        const handshakeId = decodeURIComponent(handshakePatchMatch[1]);
        const token = extractBearerOrCapabilityToken(request);
        if (!token || token.length < 32) {
          return errorResponse(
            'UNAUTHORIZED',
            'Missing or invalid card-owner capability token.',
            401
          );
        }

        const parsed = await readBoundedJson(request);
        if (!parsed.ok) return parsed.response;
        const body = (parsed.data || {}) as Record<string, unknown>;
        const status = body.status;

        if (status !== 'accepted' && status !== 'declined') {
          return errorResponse(
            'INVALID_STATUS',
            'Handshake decision must be "accepted" or "declined".',
            400,
            'status'
          );
        }

        const outcome = await updateHandshakeDecision(
          env.DB,
          handshakeId,
          token,
          status,
          encConfig.secret
        );
        if (!outcome.ok) {
          return errorResponse(outcome.code, outcome.message, outcome.status);
        }

        return jsonResponse({ ok: true, handshake: outcome.handshake });
      }

      if (pathname.startsWith('/api/')) {
        return errorResponse('NOT_FOUND', 'API endpoint not found.', 404);
      }

      // =========================================================
      // 2. SHAREABLE PUBLIC URLs WITH CRAWLER-READABLE OPENGRAPH
      // =========================================================
      const shareCardRoute = pathname.match(/^\/cards\/([^/]+)\/?$/);
      const shareEventRoute = pathname.match(/^\/events\/([^/]+)\/?$/);
      const queryCardId = searchParams.get('card');
      const queryEventId = searchParams.get('event');

      const targetCardId = shareCardRoute
        ? decodeURIComponent(shareCardRoute[1])
        : queryCardId;
      const targetEventId = shareEventRoute
        ? decodeURIComponent(shareEventRoute[1])
        : queryEventId;

      if (method === 'GET' && (targetCardId || targetEventId)) {
        const publicOrigin = env.PUBLIC_ORIGIN || url.origin;
        const indexReq = new Request(new URL('/index.html', url.origin), request);
        const baseHtmlRes = env.ASSETS
          ? await env.ASSETS.fetch(indexReq)
          : new Response(
              `<!DOCTYPE html><html><head><title>VGU Pulse</title><meta name="description" content=""/><meta property="og:title" content=""/><meta property="og:description" content=""/><meta property="og:url" content=""/><meta property="og:image" content=""/><meta name="twitter:title" content=""/><meta name="twitter:description" content=""/><meta name="twitter:image" content=""/><link rel="canonical" href=""/></head><body><div id="root"></div></body></html>`,
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );

        if (targetCardId) {
          const card = await getPublicCardById(env.DB, targetCardId);
          const meta = buildCardOgMetadata(card, publicOrigin, targetCardId);
          return rewriteHtmlWithOgMetadata(baseHtmlRes, meta);
        }

        if (targetEventId) {
          const event = await getPublicEventById(env.DB, targetEventId);
          const meta = buildEventOgMetadata(event, publicOrigin, targetEventId);
          return rewriteHtmlWithOgMetadata(baseHtmlRes, meta);
        }
      }

      // Fallback to static SPA assets
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response('VGU Pulse Worker running.', { status: 200 });
    } catch {
      return errorResponse(
        'INTERNAL_SERVER_ERROR',
        'An unexpected server error occurred.',
        500
      );
    }
  },
};
