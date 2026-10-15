import {
  AcademicYear,
  CreateHandshakeInput,
  CreatePulseCardInput,
  HandshakeChannel,
  PulseCategory,
} from '../types/domain';

export const ALLOWED_CATEGORIES: readonly PulseCategory[] = [
  'hackathon',
  'study',
  'sports',
  'cab_pool',
  'project',
];

export const ALLOWED_YEARS: readonly AcademicYear[] = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
  'PG / Research',
];

export const ALLOWED_CHANNELS: readonly HandshakeChannel[] = [
  'WhatsApp',
  'Telegram',
  'In-Person Campus Meet',
];

// Detects 10-digit Indian mobile numbers even when spaced or hyphenated (e.g. "98765 43210", "+91-98765-43210")
const PUBLIC_PII_PHONE_REGEX =
  /(?:\+91[\s.-]?)?[6-9](?:[\s.-]?\d){9}\b/;
const PUBLIC_PII_EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export interface ValidationFailure {
  valid: false;
  code: string;
  message: string;
  field?: string;
}

export interface ValidationSuccess<T> {
  valid: true;
  data: T;
}

export type ValidationOutcome<T> = ValidationSuccess<T> | ValidationFailure;

export function containsPublicContactPii(text: string): boolean {
  return PUBLIC_PII_PHONE_REGEX.test(text) || PUBLIC_PII_EMAIL_REGEX.test(text);
}

export function validateCreateCardPayload(
  raw: unknown
): ValidationOutcome<CreatePulseCardInput> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      code: 'INVALID_JSON',
      message: 'Request body must be a JSON object.',
    };
  }

  const body = raw as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const category = body.category as PulseCategory;
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const authorName =
    typeof body.authorName === 'string' ? body.authorName.trim() : '';
  const authorDepartment =
    typeof body.authorDepartment === 'string'
      ? body.authorDepartment.trim()
      : '';
  const authorYear = body.authorYear as AcademicYear;
  const timeWindow =
    typeof body.timeWindow === 'string' ? body.timeWindow.trim() : '';
  const preferredHandshakeChannel =
    body.preferredHandshakeChannel as HandshakeChannel;
  const coordinationNote =
    typeof body.coordinationNote === 'string'
      ? body.coordinationNote.trim()
      : '';
  const spotsTotal = Number(body.spotsTotal);
  const turnstileToken =
    typeof body.turnstileToken === 'string'
      ? body.turnstileToken.trim()
      : undefined;

  if (title.length < 10 || title.length > 120) {
    return {
      valid: false,
      code: 'INVALID_TITLE',
      field: 'title',
      message: 'Title must be between 10 and 120 characters.',
    };
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return {
      valid: false,
      code: 'INVALID_CATEGORY',
      field: 'category',
      message: 'Select a valid Pulse request category.',
    };
  }

  if (description.length < 15 || description.length > 400) {
    return {
      valid: false,
      code: 'INVALID_DESCRIPTION',
      field: 'description',
      message: 'Description must be between 15 and 400 characters.',
    };
  }

  if (
    containsPublicContactPii(title) ||
    containsPublicContactPii(description) ||
    containsPublicContactPii(authorName) ||
    containsPublicContactPii(timeWindow)
  ) {
    return {
      valid: false,
      code: 'PUBLIC_PII_DETECTED',
      field: 'description',
      message:
        'Privacy boundary: Do not include phone numbers or email addresses in public fields. Put your meeting/contact details in the private Coordination Note instead.',
    };
  }

  if (authorName.length < 2 || authorName.length > 50) {
    return {
      valid: false,
      code: 'INVALID_AUTHOR_NAME',
      field: 'authorName',
      message: 'Author name must be between 2 and 50 characters.',
    };
  }

  if (authorDepartment.length < 2 || authorDepartment.length > 60) {
    return {
      valid: false,
      code: 'INVALID_DEPARTMENT',
      field: 'authorDepartment',
      message: 'Department must be between 2 and 60 characters.',
    };
  }

  if (!ALLOWED_YEARS.includes(authorYear)) {
    return {
      valid: false,
      code: 'INVALID_YEAR',
      field: 'authorYear',
      message: 'Select a valid academic year.',
    };
  }

  if (!Number.isInteger(spotsTotal) || spotsTotal < 1 || spotsTotal > 20) {
    return {
      valid: false,
      code: 'INVALID_SPOTS',
      field: 'spotsTotal',
      message: 'Open spots must be a whole number between 1 and 20.',
    };
  }

  if (timeWindow.length < 3 || timeWindow.length > 80) {
    return {
      valid: false,
      code: 'INVALID_TIME_WINDOW',
      field: 'timeWindow',
      message: 'Time window must be between 3 and 80 characters.',
    };
  }

  if (!ALLOWED_CHANNELS.includes(preferredHandshakeChannel)) {
    return {
      valid: false,
      code: 'INVALID_CHANNEL',
      field: 'preferredHandshakeChannel',
      message: 'Select a valid handshake channel.',
    };
  }

  if (coordinationNote.length < 5 || coordinationNote.length > 200) {
    return {
      valid: false,
      code: 'INVALID_COORDINATION_NOTE',
      field: 'coordinationNote',
      message:
        'Private coordination note must be between 5 and 200 characters (revealed only when you accept a peer request).',
    };
  }

  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  const cleanTags = rawTags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter((t) => t.length >= 2 && t.length <= 28 && !containsPublicContactPii(t))
    .slice(0, 5);

  return {
    valid: true,
    data: {
      title,
      category,
      description,
      authorName,
      authorDepartment,
      authorYear,
      tags: cleanTags,
      spotsTotal,
      timeWindow,
      preferredHandshakeChannel,
      coordinationNote,
      turnstileToken,
    },
  };
}

export function validateCreateHandshakePayload(
  raw: unknown
): ValidationOutcome<CreateHandshakeInput> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      code: 'INVALID_JSON',
      message: 'Request body must be a JSON object.',
    };
  }

  const body = raw as Record<string, unknown>;
  const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
  const fromStudentName =
    typeof body.fromStudentName === 'string' ? body.fromStudentName.trim() : '';
  const fromDepartment =
    typeof body.fromDepartment === 'string' ? body.fromDepartment.trim() : '';
  const fromYear = body.fromYear as AcademicYear;
  const introNote =
    typeof body.introNote === 'string' ? body.introNote.trim() : '';
  const turnstileToken =
    typeof body.turnstileToken === 'string'
      ? body.turnstileToken.trim()
      : undefined;

  if (!cardId || cardId.length > 80) {
    return {
      valid: false,
      code: 'INVALID_CARD_ID',
      field: 'cardId',
      message: 'A valid target card ID is required.',
    };
  }

  if (fromStudentName.length < 2 || fromStudentName.length > 50) {
    return {
      valid: false,
      code: 'INVALID_NAME',
      field: 'fromStudentName',
      message: 'Your name must be between 2 and 50 characters.',
    };
  }

  if (fromDepartment.length < 2 || fromDepartment.length > 60) {
    return {
      valid: false,
      code: 'INVALID_DEPARTMENT',
      field: 'fromDepartment',
      message: 'Department must be between 2 and 60 characters.',
    };
  }

  if (!ALLOWED_YEARS.includes(fromYear)) {
    return {
      valid: false,
      code: 'INVALID_YEAR',
      field: 'fromYear',
      message: 'Select a valid academic year.',
    };
  }

  if (introNote.length < 8 || introNote.length > 280) {
    return {
      valid: false,
      code: 'INVALID_INTRO_NOTE',
      field: 'introNote',
      message: 'Intro note must be between 8 and 280 characters.',
    };
  }

  if (containsPublicContactPii(fromStudentName) || containsPublicContactPii(introNote)) {
    return {
      valid: false,
      code: 'PUBLIC_PII_DETECTED',
      field: 'introNote',
      message:
        'Privacy boundary: Do not include raw phone numbers or email addresses in your intro note. Once the card owner accepts, their private coordination instructions will be revealed to you.',
    };
  }

  return {
    valid: true,
    data: {
      cardId,
      fromStudentName,
      fromDepartment,
      fromYear,
      introNote,
      turnstileToken,
    },
  };
}

export function validateEventBuddyPayload(raw: unknown): ValidationOutcome<{
  direction: 'join' | 'leave';
  participantToken: string;
}> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      code: 'INVALID_JSON',
      message: 'Request body must be a JSON object.',
    };
  }

  const body = raw as Record<string, unknown>;
  const direction = body.direction;
  const participantToken =
    typeof body.participantToken === 'string'
      ? body.participantToken.trim()
      : '';

  if (direction !== 'join' && direction !== 'leave') {
    return {
      valid: false,
      code: 'INVALID_DIRECTION',
      field: 'direction',
      message: 'Direction must be "join" or "leave".',
    };
  }

  if (
    participantToken.length < 16 ||
    participantToken.length > 128 ||
    !/^[a-zA-Z0-9_-]+$/.test(participantToken)
  ) {
    return {
      valid: false,
      code: 'INVALID_PARTICIPANT_TOKEN',
      field: 'participantToken',
      message: 'A valid anonymous participant capability token is required.',
    };
  }

  return {
    valid: true,
    data: {
      direction,
      participantToken,
    },
  };
}
