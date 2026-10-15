export type NavigationTab = 'home' | 'toolkit' | 'explore' | 'create' | 'connect';

export type DataSourceMode = 'shared_api' | 'local_demo';

export type PulseCategory =
  | 'hackathon'
  | 'study'
  | 'sports'
  | 'cab_pool'
  | 'project';

export type AcademicYear =
  | '1st Year'
  | '2nd Year'
  | '3rd Year'
  | '4th Year'
  | 'PG / Research';

export type HandshakeChannel =
  | 'WhatsApp'
  | 'Telegram'
  | 'In-Person Campus Meet';

export type EventVerificationSource =
  | 'Official VGU Link'
  | 'External Govt / Public Portal'
  | 'Verified Club Submission'
  | 'Student Submitted (Unverified)'
  | 'Club Submitted (Demo)';

export interface PulseCard {
  id: string;
  title: string;
  category: PulseCategory;
  description: string;
  authorName: string;
  authorDepartment: string;
  authorYear: AcademicYear;
  tags: string[];
  spotsTotal: number;
  spotsRemaining: number;
  timeWindow: string;
  createdAt: string;
  expiresAt?: string;
  status?: 'open' | 'filled' | 'expired' | 'removed';
  isDemoFixture: boolean;
  preferredHandshakeChannel: HandshakeChannel;
}

export interface CreatePulseCardInput {
  title: string;
  category: PulseCategory;
  description: string;
  authorName: string;
  authorDepartment: string;
  authorYear: AcademicYear;
  tags: string[];
  spotsTotal: number;
  timeWindow: string;
  preferredHandshakeChannel: HandshakeChannel;
  coordinationNote: string;
  turnstileToken?: string;
}

export interface CreatePulseCardResponse {
  ok: true;
  card: PulseCard;
  ownerCapabilityToken: string;
}

export interface CampusEvent {
  id: string;
  title: string;
  organizer: string;
  category: 'Workshop' | 'Hackathon' | 'Cultural' | 'Sports' | 'Seminar';
  dateLabel: string;
  timeLabel: string;
  venue: string;
  registrationUrl?: string;
  verificationSource: EventVerificationSource;
  isDemoFixture: boolean;
  goingCount: number;
  lookingForBuddyCount: number;
}

export interface VerifiedResourceLink {
  id: string;
  title: string;
  category: 'Official Portal' | 'Academic Reference' | 'Campus Utility';
  url: string;
  sourceLabel: string;
  description: string;
  lastVerifiedLabel: string;
  isOfficialDomain: boolean;
}

export interface PlannerTask {
  id: string;
  title: string;
  courseOrTag: string;
  dueDate: string; // YYYY-MM-DD
  kind: 'Exam' | 'Assignment' | 'Lab Viva' | 'Personal';
  completed: boolean;
}

export interface HandshakeRequest {
  id: string;
  cardId: string;
  cardTitle: string;
  fromStudentName: string;
  fromDepartment: string;
  fromYear: AcademicYear;
  introNote: string;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined';
  createdAtLabel: string;
  isDemoFixture: boolean;
  revealedContactNote?: string;
}

export interface CreateHandshakeInput {
  cardId: string;
  fromStudentName: string;
  fromDepartment: string;
  fromYear: AcademicYear;
  introNote: string;
  turnstileToken?: string;
}

export interface CreateHandshakeResponse {
  ok: true;
  handshake: HandshakeRequest;
  senderCapabilityToken: string;
}

export interface CapabilityVault {
  /** Maps cardId -> raw ownerCapabilityToken */
  ownedCards: Record<string, string>;
  /** Maps handshakeId -> raw senderCapabilityToken */
  sentHandshakes: Record<string, string>;
  /** Persistent anonymous capability token for idempotent event buddy participation */
  participantToken?: string;
}

export interface CourseGradeRow {
  id: string;
  name: string;
  credits: number;
  gradeLetter: string;
}

export interface ApiErrorPayload {
  ok: false;
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
