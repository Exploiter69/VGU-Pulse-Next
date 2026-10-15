import { CampusEvent, PulseCard } from '../types/domain';

export interface OgMetadataSpec {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  httpStatus?: number;
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildCardOgMetadata(
  card: PulseCard | null,
  origin: string,
  requestedId: string
): OgMetadataSpec {
  const cleanOrigin = origin.replace(/\/$/, '');
  const imageUrl = `${cleanOrigin}/og-default.svg`;
  const canonicalUrl = `${cleanOrigin}/cards/${encodeURIComponent(requestedId)}`;

  if (!card || card.status === 'removed' || card.status === 'expired') {
    return {
      title: 'Request Unavailable — VGU Pulse',
      description:
        'This student collaboration request has expired or is no longer available on VGU Pulse.',
      canonicalUrl,
      imageUrl,
      httpStatus: 404,
    };
  }

  return {
    title: `${card.title} — VGU Pulse (${card.spotsRemaining}/${card.spotsTotal} spots open)`,
    description: `${card.category.toUpperCase()} • ${card.timeWindow} • Posted by ${card.authorName} (${card.authorDepartment}, ${card.authorYear}). ${card.description}`,
    canonicalUrl,
    imageUrl,
    httpStatus: 200,
  };
}

export function buildEventOgMetadata(
  event: CampusEvent | null,
  origin: string,
  requestedId: string
): OgMetadataSpec {
  const cleanOrigin = origin.replace(/\/$/, '');
  const imageUrl = `${cleanOrigin}/og-default.svg`;
  const canonicalUrl = `${cleanOrigin}/events/${encodeURIComponent(requestedId)}`;

  if (!event) {
    return {
      title: 'Event Not Found — VGU Pulse',
      description:
        'This campus event is unavailable or has ended on VGU Pulse.',
      canonicalUrl,
      imageUrl,
      httpStatus: 404,
    };
  }

  return {
    title: `${event.title} — VGU Campus Event`,
    description: `${event.dateLabel} at ${event.timeLabel} • Venue: ${event.venue} • Hosted by ${event.organizer}. ${event.lookingForBuddyCount} students open to attending with a peer.`,
    canonicalUrl,
    imageUrl,
    httpStatus: 200,
  };
}

export function rewriteHtmlWithOgMetadata(
  baseHtmlResponse: Response,
  meta: OgMetadataSpec
): Response {
  const safeTitle = escapeHtmlAttribute(meta.title);
  const safeDesc = escapeHtmlAttribute(meta.description);
  const safeUrl = escapeHtmlAttribute(meta.canonicalUrl);
  const safeImage = escapeHtmlAttribute(meta.imageUrl);

  const transformed = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', safeDesc);
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute('content', safeTitle);
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute('content', safeDesc);
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute('content', safeUrl);
      },
    })
    .on('meta[property="og:image"]', {
      element(el) {
        el.setAttribute('content', safeImage);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute('content', safeTitle);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(el) {
        el.setAttribute('content', safeDesc);
      },
    })
    .on('meta[name="twitter:image"]', {
      element(el) {
        el.setAttribute('content', safeImage);
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute('href', safeUrl);
      },
    })
    .transform(baseHtmlResponse);

  const headers = new Headers(transformed.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');

  return new Response(transformed.body, {
    status: meta.httpStatus ?? 200,
    headers,
  });
}
