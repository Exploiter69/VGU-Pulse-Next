import {
  CampusEvent,
  HandshakeRequest,
  PlannerTask,
  PulseCard,
  VerifiedResourceLink,
} from '../types/domain';

export const VERIFIED_RESOURCE_LINKS: VerifiedResourceLink[] = [
  {
    id: 'res-vgu-home',
    title: 'VGU Official University Website',
    category: 'Official Portal',
    url: 'https://vgu.ac.in',
    sourceLabel: 'vgu.ac.in (Verified Official Domain)',
    description:
      'Primary university portal for official notices, admissions, and department pages.',
    lastVerifiedLabel: 'Verified Official Domain',
    isOfficialDomain: true,
  },
  {
    id: 'res-ugc-nad',
    title: 'Academic Bank of Credits (ABC / DigiLocker)',
    category: 'Academic Reference',
    url: 'https://www.abc.gov.in',
    sourceLabel: 'abc.gov.in (Govt of India)',
    description:
      'Mandatory UGC Academic Bank of Credits portal required for semester exam forms.',
    lastVerifiedLabel: 'Official National Portal',
    isOfficialDomain: true,
  },
  {
    id: 'res-aicte-internship',
    title: 'AICTE National Internship Portal',
    category: 'Academic Reference',
    url: 'https://internship.aicte-india.org',
    sourceLabel: 'aicte-india.org',
    description:
      'Verified government and corporate summer/winter internship listings for degree students.',
    lastVerifiedLabel: 'Official National Portal',
    isOfficialDomain: true,
  },
  {
    id: 'res-swayam-nptel',
    title: 'SWAYAM / NPTEL Credit Courses',
    category: 'Academic Reference',
    url: 'https://swayam.gov.in',
    sourceLabel: 'swayam.gov.in',
    description:
      'MOOC courses frequently used for credit transfer and honors specialization requirements.',
    lastVerifiedLabel: 'Official National Portal',
    isOfficialDomain: true,
  },
];

export const DEMO_PULSE_CARDS: PulseCard[] = [
  {
    id: 'demo-card-1',
    title: 'Need 1 Frontend React/Tailwind builder for Internal Hackathon prototype',
    category: 'hackathon',
    description:
      '[DEMO FIXTURE] Building an offline-first campus logistics tool. Backend & pitch deck ready; need someone comfortable with responsive UI components.',
    authorName: 'Aarav S. (Demo Profile)',
    authorDepartment: 'B.Tech CSE',
    authorYear: '3rd Year',
    tags: ['React', 'Tailwind', 'UI/UX', 'Weekend Sprint'],
    spotsTotal: 3,
    spotsRemaining: 1,
    timeWindow: 'This Saturday, 10:00 AM – 6:00 PM',
    createdAt: 'Sample Fixture',
    isDemoFixture: true,
    preferredHandshakeChannel: 'WhatsApp',
  },
  {
    id: 'demo-card-2',
    title: 'DSA & Operating Systems mid-sem problem solving in Central Library',
    category: 'study',
    description:
      '[DEMO FIXTURE] Going through trees, graphs, and CPU scheduling numericals. Bring your own notes—quiet 90-minute focused session.',
    authorName: 'Priya M. (Demo Profile)',
    authorDepartment: 'B.Tech CSE',
    authorYear: '2nd Year',
    tags: ['DSA', 'Operating Systems', 'Library Reading Room'],
    spotsTotal: 4,
    spotsRemaining: 2,
    timeWindow: 'Tomorrow, 3:15 PM – 4:45 PM',
    createdAt: 'Sample Fixture',
    isDemoFixture: true,
    preferredHandshakeChannel: 'In-Person Campus Meet',
  },
  {
    id: 'demo-card-3',
    title: 'Splitting auto/cab from VGU Main Gate to Jaipur Junction Railway Station',
    category: 'cab_pool',
    description:
      '[DEMO FIXTURE] Leaving right after Friday 4 PM lecture for evening train. Looking for 2 students to split Uber/Auto fare equally.',
    authorName: 'Rohan K. (Demo Profile)',
    authorDepartment: 'BBA',
    authorYear: '2nd Year',
    tags: ['Jaipur Junction', 'Friday 4:15 PM', 'Fare Split'],
    spotsTotal: 3,
    spotsRemaining: 2,
    timeWindow: 'Friday, 4:15 PM sharp at Main Gate',
    createdAt: 'Sample Fixture',
    isDemoFixture: true,
    preferredHandshakeChannel: 'Telegram',
  },
  {
    id: 'demo-card-4',
    title: 'Evening 3v3 Half-Court Basketball run after lab hours',
    category: 'sports',
    description:
      '[DEMO FIXTURE] Casual half-court games on the outdoor court before sunset. All branches welcome, bring water.',
    authorName: 'Kabir T. (Demo Profile)',
    authorDepartment: 'BCA',
    authorYear: '1st Year',
    tags: ['Basketball', 'Outdoor Court', '5:00 PM'],
    spotsTotal: 6,
    spotsRemaining: 2,
    timeWindow: 'Today, 5:00 PM – 6:30 PM',
    createdAt: 'Sample Fixture',
    isDemoFixture: true,
    preferredHandshakeChannel: 'In-Person Campus Meet',
  },
];

export const DEMO_CAMPUS_EVENTS: CampusEvent[] = [
  {
    id: 'demo-evt-1',
    title: '[DEMO] Open Source & Linux Workflow Workshop (Neovim, Git & CLI)',
    organizer: 'Tech Club Sample Fixture',
    category: 'Workshop',
    dateLabel: 'Sat, Oct 24',
    timeLabel: '11:00 AM – 1:30 PM',
    venue: 'Tech Block Lab 3 (Demo Venue)',
    verificationSource: 'Club Submitted (Demo)',
    isDemoFixture: true,
    goingCount: 34,
    lookingForBuddyCount: 9,
  },
  {
    id: 'demo-evt-2',
    title: '[DEMO] Inter-Department Case Study & Product Pitch Challenge',
    organizer: 'Entrepreneurship Cell Sample Fixture',
    category: 'Hackathon',
    dateLabel: 'Wed, Oct 28',
    timeLabel: '2:00 PM – 5:00 PM',
    venue: 'Main Auditorium Seminar Hall (Demo)',
    verificationSource: 'Club Submitted (Demo)',
    isDemoFixture: true,
    goingCount: 52,
    lookingForBuddyCount: 14,
  },
];

export const INITIAL_DEMO_TASKS: PlannerTask[] = [
  {
    id: 'task-1',
    title: 'Verify ABC ID & Semester Exam Form submission',
    courseOrTag: 'Academic Admin',
    dueDate: '2026-10-22',
    kind: 'Assignment',
    completed: false,
  },
  {
    id: 'task-2',
    title: 'Data Structures — Trees & Graph Traversal Lab Viva',
    courseOrTag: 'CSE-204',
    dueDate: '2026-10-25',
    kind: 'Lab Viva',
    completed: false,
  },
];

export const DEMO_HANDSHAKE_REQUESTS: HandshakeRequest[] = [
  {
    id: 'hs-demo-1',
    cardId: 'demo-card-1',
    cardTitle: 'Need 1 Frontend React/Tailwind builder for Internal Hackathon prototype',
    fromStudentName: 'Neha V. (Demo Student)',
    fromDepartment: 'B.Tech CSE',
    fromYear: '2nd Year',
    introNote:
      '[DEMO] Hey! I built two Vite + Tailwind projects last semester and can help with the mobile views this Saturday.',
    direction: 'incoming',
    status: 'pending',
    createdAtLabel: '20m ago (Demo)',
    isDemoFixture: true,
    revealedContactNote:
      'Demo mode: Accept to preview how your private coordination note is revealed.',
  },
];
