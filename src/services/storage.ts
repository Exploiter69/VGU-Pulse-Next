import { CapabilityVault } from '../types/domain';

const STORAGE_PREFIX = 'vgu_pulse_next_v1_';
const VAULT_KEY = 'capability_vault';

function generateBrowserParticipantToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadLocalState<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLocalState<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Graceful no-op if storage quota or private mode blocks write
  }
}

export function loadCapabilityVault(): CapabilityVault {
  const loaded = loadLocalState<CapabilityVault>(VAULT_KEY, {
    ownedCards: {},
    sentHandshakes: {},
  });

  if (!loaded.participantToken || loaded.participantToken.length < 16) {
    const updated: CapabilityVault = {
      ownedCards: loaded.ownedCards || {},
      sentHandshakes: loaded.sentHandshakes || {},
      participantToken: generateBrowserParticipantToken(),
    };
    saveLocalState(VAULT_KEY, updated);
    return updated;
  }

  return loaded;
}

export function getOrCreateParticipantToken(): string {
  const vault = loadCapabilityVault();
  return vault.participantToken!;
}

export function saveCardOwnerToken(cardId: string, rawToken: string): CapabilityVault {
  const vault = loadCapabilityVault();
  const updated: CapabilityVault = {
    ...vault,
    ownedCards: { ...vault.ownedCards, [cardId]: rawToken },
  };
  saveLocalState(VAULT_KEY, updated);
  return updated;
}

export function saveHandshakeSenderToken(
  handshakeId: string,
  rawToken: string
): CapabilityVault {
  const vault = loadCapabilityVault();
  const updated: CapabilityVault = {
    ...vault,
    sentHandshakes: { ...vault.sentHandshakes, [handshakeId]: rawToken },
  };
  saveLocalState(VAULT_KEY, updated);
  return updated;
}

export function clearAllLocalPulseData(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Ignore
  }
}
