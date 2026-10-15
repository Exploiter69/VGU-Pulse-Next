export type NavigationTab = 'home' | 'toolkit' | 'explore' | 'create' | 'connect';

export type PulseCategory =
  | 'hackathon'
  | 'study'
  | 'sports'
  | 'cab_pool'
  | 'project';

export interface PulseCard {
  id: string;
  title: string;
  category: PulseCategory;
  description: string;
  authorName: string;
  authorDepartment: string;
  authorYear: string;
  tags: string[];
  spotsTotal: number;
  spotsRemaining: number;
  timeWindow: string;
  createdAt: string;
  isDemoFixture: boolean;
  preferredHandshakeChannel: 'WhatsApp' | 'Telegram' | 'In-Person Campus Meet';
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
  verificationSource: 'Official VGU Link' | 'Club Submitted (Demo)';
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
  fromYear: string;
  introNote: string;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined';
  createdAtLabel: string;
  isDemoFixture: boolean;
  revealedContactNote?: string;
}

export interface CourseGradeRow {
  id: string;
  name: string;
  credits: number;
  gradeLetter: string;
}
