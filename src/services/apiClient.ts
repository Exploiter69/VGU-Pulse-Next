import {
  CampusEvent,
  CapabilityVault,
  CreateHandshakeInput,
  CreateHandshakeResponse,
  CreatePulseCardInput,
  CreatePulseCardResponse,
  HandshakeRequest,
  PulseCard,
  PulseCategory,
} from '../types/domain';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly field?: string;

  constructor(message: string, code = 'API_ERROR', status = 500, field?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const errObj = (data?.error as Record<string, unknown>) || {};
    throw new ApiClientError(
      typeof errObj.message === 'string'
        ? errObj.message
        : `Request failed with status ${res.status}`,
      typeof errObj.code === 'string' ? errObj.code : 'HTTP_ERROR',
      res.status,
      typeof errObj.field === 'string' ? errObj.field : undefined
    );
  }
  return data as T;
}

export async function fetchApiHealth(): Promise<{
  ok: boolean;
  environment: string;
}> {
  const res = await fetch('/api/health');
  return parseJsonResponse(res);
}

export async function fetchSharedCards(params?: {
  category?: PulseCategory | 'all';
  q?: string;
}): Promise<PulseCard[]> {
  const url = new URL('/api/cards', window.location.origin);
  if (params?.category && params.category !== 'all') {
    url.searchParams.set('category', params.category);
  }
  if (params?.q?.trim()) {
    url.searchParams.set('q', params.q.trim());
  }
  const res = await fetch(url.toString());
  const data = await parseJsonResponse<{ ok: true; cards: PulseCard[] }>(res);
  return data.cards;
}

export async function fetchSharedCardById(id: string): Promise<PulseCard> {
  const res = await fetch(`/api/cards/${encodeURIComponent(id)}`);
  const data = await parseJsonResponse<{ ok: true; card: PulseCard }>(res);
  return data.card;
}

export async function createSharedCard(
  input: CreatePulseCardInput
): Promise<CreatePulseCardResponse> {
  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<CreatePulseCardResponse>(res);
}

export async function reportSharedCard(cardId: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}/report`, {
    method: 'POST',
  });
  return parseJsonResponse<{ ok: true }>(res);
}

export async function fetchSharedEvents(): Promise<CampusEvent[]> {
  const res = await fetch('/api/events');
  const data = await parseJsonResponse<{ ok: true; events: CampusEvent[] }>(res);
  return data.events;
}

export async function toggleSharedEventBuddy(
  eventId: string,
  direction: 'join' | 'leave'
): Promise<CampusEvent> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/buddy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
  const data = await parseJsonResponse<{ ok: true; event: CampusEvent }>(res);
  return data.event;
}

export async function createSharedHandshake(
  input: CreateHandshakeInput
): Promise<CreateHandshakeResponse> {
  const res = await fetch('/api/handshakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<CreateHandshakeResponse>(res);
}

export async function fetchSynchronizedHandshakes(
  vault: CapabilityVault
): Promise<HandshakeRequest[]> {
  const ownerTokens = Object.values(vault.ownedCards).filter(Boolean);
  const senderTokens = Object.values(vault.sentHandshakes).filter(Boolean);

  if (ownerTokens.length === 0 && senderTokens.length === 0) {
    return [];
  }

  const res = await fetch('/api/handshakes/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerTokens, senderTokens }),
  });
  const data = await parseJsonResponse<{
    ok: true;
    handshakes: HandshakeRequest[];
  }>(res);
  return data.handshakes;
}

export async function decideSharedHandshake(
  handshakeId: string,
  decision: 'accepted' | 'declined',
  ownerCapabilityToken: string
): Promise<HandshakeRequest> {
  const res = await fetch(
    `/api/handshakes/${encodeURIComponent(handshakeId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerCapabilityToken}`,
      },
      body: JSON.stringify({ status: decision }),
    }
  );
  const data = await parseJsonResponse<{
    ok: true;
    handshake: HandshakeRequest;
  }>(res);
  return data.handshake;
}
