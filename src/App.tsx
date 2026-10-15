import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  Compass,
  PlusCircle,
  Users,
  Home,
  Share2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  Calendar,
  Clock,
  Sparkles,
  Trash2,
  Lock,
  Search,
  Flag,
  BookOpen,
} from 'lucide-react';
import {
  CampusEvent,
  CourseGradeRow,
  HandshakeRequest,
  NavigationTab,
  PlannerTask,
  PulseCard,
  PulseCategory,
} from './types/domain';
import { calculateAttendance } from './domain/attendance';
import { calculateSgpaAndCgpa, DEFAULT_GRADE_SCALE } from './domain/grades';
import {
  buildCardSharePayload,
  buildEventSharePayload,
  buildGoogleCalendarUrl,
} from './domain/share';
import {
  DEMO_CAMPUS_EVENTS,
  DEMO_HANDSHAKE_REQUESTS,
  DEMO_PULSE_CARDS,
  INITIAL_DEMO_TASKS,
  VERIFIED_RESOURCE_LINKS,
} from './data/demoFixtures';
import {
  clearAllLocalPulseData,
  loadLocalState,
  saveLocalState,
} from './services/storage';

const CATEGORY_META: Record<
  PulseCategory,
  { label: string; badgeClass: string }
> = {
  hackathon: {
    label: 'Hackathon / Build',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  study: {
    label: 'Study Partner',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  sports: {
    label: 'Sports / Court',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  cab_pool: {
    label: 'Cab / Station Split',
    badgeClass: 'bg-sky-50 text-sky-900 border-sky-200',
  },
  project: {
    label: 'Semester Project',
    badgeClass: 'bg-purple-50 text-purple-900 border-purple-200',
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- Toolkit State (Local-First Persistence) ---
  const [attended, setAttended] = useState<number>(() =>
    loadLocalState('att_attended', 29)
  );
  const [totalHeld, setTotalHeld] = useState<number>(() =>
    loadLocalState('att_total', 38)
  );
  const [targetThreshold, setTargetThreshold] = useState<number>(() =>
    loadLocalState('att_threshold', 75)
  );
  const [simAttend, setSimAttend] = useState<number>(0);
  const [simMiss, setSimMiss] = useState<number>(0);

  const [courses, setCourses] = useState<CourseGradeRow[]>(() =>
    loadLocalState('sgpa_courses', [
      { id: 'c1', name: 'Data Structures & Algorithms', credits: 4, gradeLetter: 'A+' },
      { id: 'c2', name: 'Operating Systems', credits: 4, gradeLetter: 'A' },
      { id: 'c3', name: 'Discrete Mathematics', credits: 3, gradeLetter: 'O' },
      { id: 'c4', name: 'Software Engineering Lab', credits: 2, gradeLetter: 'O' },
    ])
  );
  const [priorCgpa, setPriorCgpa] = useState<string>(() =>
    loadLocalState('prior_cgpa', '8.20')
  );
  const [priorCredits, setPriorCredits] = useState<string>(() =>
    loadLocalState('prior_credits', '42')
  );

  const [tasks, setTasks] = useState<PlannerTask[]>(() =>
    loadLocalState('planner_tasks', INITIAL_DEMO_TASKS)
  );
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCourse, setNewTaskCourse] = useState('');
  const [newTaskDate, setNewTaskDate] = useState('2026-10-28');

  // --- Explore & Pulse Board State ---
  const [pulseCards, setPulseCards] = useState<PulseCard[]>(() =>
    loadLocalState('pulse_cards', DEMO_PULSE_CARDS)
  );
  const [events, setEvents] = useState<CampusEvent[]>(() =>
    loadLocalState('campus_events', DEMO_CAMPUS_EVENTS)
  );
  const [selectedCategory, setSelectedCategory] = useState<PulseCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [exploreSubTab, setExploreSubTab] = useState<'requests' | 'events'>('requests');
  const [buddyRsvpIds, setBuddyRsvpIds] = useState<string[]>(() =>
    loadLocalState('buddy_rsvps', [])
  );
  const [reportedIds, setReportedIds] = useState<string[]>(() =>
    loadLocalState('reported_ids', [])
  );

  // --- Connect / Handshake State ---
  const [handshakes, setHandshakes] = useState<HandshakeRequest[]>(() =>
    loadLocalState('handshakes', DEMO_HANDSHAKE_REQUESTS)
  );
  const [activeJoinCard, setActiveJoinCard] = useState<PulseCard | null>(null);
  const [joinName, setJoinName] = useState('');
  const [joinDept, setJoinDept] = useState('B.Tech CSE');
  const [joinYear, setJoinYear] = useState('2nd Year');
  const [joinNote, setJoinNote] = useState('');

  // --- Create Request Form State ---
  const [createTitle, setCreateTitle] = useState('');
  const [createCategory, setCreateCategory] = useState<PulseCategory>('hackathon');
  const [createDesc, setCreateDesc] = useState('');
  const [createAuthor, setCreateAuthor] = useState('');
  const [createDept, setCreateDept] = useState('B.Tech CSE');
  const [createYear, setCreateYear] = useState('2nd Year');
  const [createTags, setCreateTags] = useState('React, TypeScript, SIH');
  const [createSpots, setCreateSpots] = useState(2);
  const [createWindow, setCreateWindow] = useState('This Weekend');
  const [createChannel, setCreateChannel] =
    useState<PulseCard['preferredHandshakeChannel']>('WhatsApp');
  const [createError, setCreateError] = useState<string | null>(null);

  // Sync to localStorage
  useEffect(() => saveLocalState('att_attended', attended), [attended]);
  useEffect(() => saveLocalState('att_total', totalHeld), [totalHeld]);
  useEffect(() => saveLocalState('att_threshold', targetThreshold), [targetThreshold]);
  useEffect(() => saveLocalState('sgpa_courses', courses), [courses]);
  useEffect(() => saveLocalState('prior_cgpa', priorCgpa), [priorCgpa]);
  useEffect(() => saveLocalState('prior_credits', priorCredits), [priorCredits]);
  useEffect(() => saveLocalState('planner_tasks', tasks), [tasks]);
  useEffect(() => saveLocalState('pulse_cards', pulseCards), [pulseCards]);
  useEffect(() => saveLocalState('campus_events', events), [events]);
  useEffect(() => saveLocalState('buddy_rsvps', buddyRsvpIds), [buddyRsvpIds]);
  useEffect(() => saveLocalState('reported_ids', reportedIds), [reportedIds]);
  useEffect(() => saveLocalState('handshakes', handshakes), [handshakes]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3500);
  };

  // Calculations
  const attendanceResult = useMemo(
    () =>
      calculateAttendance({
        attended,
        totalHeld,
        targetPercentage: targetThreshold,
        simulateAttendNext: simAttend,
        simulateMissNext: simMiss,
      }),
    [attended, totalHeld, targetThreshold, simAttend, simMiss]
  );

  const sgpaResult = useMemo(
    () =>
      calculateSgpaAndCgpa(
        courses,
        DEFAULT_GRADE_SCALE,
        priorCgpa ? Number(priorCgpa) : undefined,
        priorCredits ? Number(priorCredits) : undefined
      ),
    [courses, priorCgpa, priorCredits]
  );

  const filteredCards = useMemo(() => {
    return pulseCards
      .filter((c) => !reportedIds.includes(c.id))
      .filter((c) => (selectedCategory === 'all' ? true : c.category === selectedCategory))
      .filter((c) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.authorDepartment.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
  }, [pulseCards, reportedIds, selectedCategory, searchQuery]);

  // Share Handler with Web Share API + Clipboard + WhatsApp Fallback
  const handleShareCard = async (card: PulseCard, directWhatsApp = false) => {
    const payload = buildCardSharePayload(card, window.location.origin);
    if (directWhatsApp) {
      window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: card.title,
          text: payload.text,
          url: payload.url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(payload.text);
      triggerToast('Share text & link copied! Ready to paste in WhatsApp.');
    } catch {
      window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShareEvent = async (evt: CampusEvent, directWhatsApp = false) => {
    const payload = buildEventSharePayload(evt, window.location.origin);
    if (directWhatsApp) {
      window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await navigator.clipboard.writeText(payload.text);
      triggerToast('Event invite copied to clipboard!');
    } catch {
      window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCreateCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const cleanTitle = createTitle.trim();
    const cleanDesc = createDesc.trim();
    const cleanAuthor = createAuthor.trim();

    if (cleanTitle.length < 10) {
      setCreateError('Give your request a specific title (at least 10 characters).');
      return;
    }
    if (cleanDesc.length < 15) {
      setCreateError('Add a short description (at least 15 characters) so peers know what you need.');
      return;
    }
    if (!cleanAuthor) {
      setCreateError('Please enter your first name or display name.');
      return;
    }
    // Safety guard: reject raw 10-digit Indian mobile numbers in public card text
    const phoneRegex = /\b[6-9]\d{9}\b/;
    if (phoneRegex.test(cleanTitle) || phoneRegex.test(cleanDesc)) {
      setCreateError(
        'Privacy Protection: Do not paste your phone number in public cards. Contacts are shared only after you accept a request.'
      );
      return;
    }

    const newCard: PulseCard = {
      id: `local-card-${Date.now()}`,
      title: cleanTitle,
      category: createCategory,
      description: cleanDesc,
      authorName: cleanAuthor,
      authorDepartment: createDept,
      authorYear: createYear,
      tags: createTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 4),
      spotsTotal: Math.max(1, Math.min(10, Number(createSpots) || 2)),
      spotsRemaining: Math.max(1, Math.min(10, Number(createSpots) || 2)),
      timeWindow: createWindow.trim() || 'Flexible this week',
      createdAt: 'Just now (Your Local Card)',
      isDemoFixture: false,
      preferredHandshakeChannel: createChannel,
    };

    setPulseCards((prev) => [newCard, ...prev]);
    setCreateTitle('');
    setCreateDesc('');
    setActiveTab('explore');
    setExploreSubTab('requests');
    triggerToast('Pulse Request created! Tap "WhatsApp" on your card to share it.');
  };

  const handleSendHandshake = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJoinCard) return;
    if (!joinName.trim() || joinNote.trim().length < 8) {
      triggerToast('Please enter your name and a short intro note.');
      return;
    }

    const req: HandshakeRequest = {
      id: `hs-${Date.now()}`,
      cardId: activeJoinCard.id,
      cardTitle: activeJoinCard.title,
      fromStudentName: joinName.trim(),
      fromDepartment: joinDept,
      fromYear: joinYear,
      introNote: joinNote.trim(),
      direction: 'outgoing',
      status: 'pending',
      createdAtLabel: 'Just now',
      isDemoFixture: false,
      revealedContactNote: `Waiting for ${activeJoinCard.authorName} to accept via ${activeJoinCard.preferredHandshakeChannel}.`,
    };

    setHandshakes((prev) => [req, ...prev]);
    setActiveJoinCard(null);
    setJoinNote('');
    setActiveTab('connect');
    triggerToast('Connection request queued in your Connect tab!');
  };

  const handleToggleEventBuddy = (eventId: string) => {
    const alreadyIn = buddyRsvpIds.includes(eventId);
    setBuddyRsvpIds((prev) =>
      alreadyIn ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === eventId
          ? {
              ...ev,
              goingCount: alreadyIn ? ev.goingCount - 1 : ev.goingCount + 1,
              lookingForBuddyCount: alreadyIn
                ? ev.lookingForBuddyCount - 1
                : ev.lookingForBuddyCount + 1,
            }
          : ev
      )
    );
    triggerToast(
      alreadyIn
        ? 'Removed from event buddy list.'
        : 'Marked as "Going & open to attending with a peer"!'
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF8F5] text-[#0F172A]">
      {/* Desktop Left Rail Navigation */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-[#E6E2DC] px-4 py-6 justify-between">
        <div>
          <div className="flex items-center gap-2.5 px-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-[#0F172A] text-white flex items-center justify-center font-display font-bold text-lg shadow-xs">
              VP
            </div>
            <div>
              <span className="font-display font-bold text-lg tracking-tight block leading-none">
                VGU Pulse
              </span>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Jaipur Campus Utility
              </span>
            </div>
          </div>

          <nav className="space-y-1.5" aria-label="Main Navigation">
            {(
              [
                { id: 'home', label: 'Home Snapshot', icon: Home },
                { id: 'toolkit', label: 'Student Toolkit', icon: Calculator },
                { id: 'explore', label: 'Pulse & Events', icon: Compass },
                { id: 'create', label: 'Post a Request', icon: PlusCircle },
                {
                  id: 'connect',
                  label: 'Handshakes & Privacy',
                  icon: Users,
                  badge: handshakes.filter((h) => h.status === 'pending').length,
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#0F172A] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-stone-100'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {'badge' in item && item.badge ? (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-mono-num ${
                        isActive
                          ? 'bg-[#E04F33] text-white'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3.5 rounded-xl bg-stone-100/80 border border-[#E6E2DC] text-xs text-slate-600 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Zero-Login Privacy</span>
          </div>
          <p className="leading-relaxed">
            Your calculator & planner data lives locally on your device. Demo cards are clearly badged.
          </p>
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="flex-1 md:pl-64 pb-24 md:pb-12">
        {/* Top Mobile Header */}
        <header className="sticky top-0 z-20 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#E6E2DC] px-4 py-3 flex items-center justify-between md:px-8">
          <div className="flex items-center gap-2.5">
            <div className="md:hidden w-8 h-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center font-display font-bold text-sm">
              VP
            </div>
            <div>
              <h1 className="font-display font-bold text-base md:text-lg text-slate-900 leading-tight">
                {activeTab === 'home' && 'Campus Overview'}
                {activeTab === 'toolkit' && 'Academic Survival Toolkit'}
                {activeTab === 'explore' && 'Pulse Board & Campus Events'}
                {activeTab === 'create' && 'Create a Structured Request'}
                {activeTab === 'connect' && 'Connection Handshakes & Data'}
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Independent student utility for VGU Jaipur • Local-first & browser-ready
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-100/90 text-amber-900 border border-amber-300/80">
              <Sparkles className="w-3 h-3 text-amber-700" />
              Stage 1 Prototype (Demo Data Labelled)
            </span>
          </div>
        </header>

        {/* Toast Notification */}
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-50 bg-[#0F172A] text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center justify-between text-sm"
          >
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-xs text-slate-300 hover:text-white ml-3 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        <main className="max-w-4xl mx-auto px-4 pt-5 md:px-8 space-y-6">
          {/* =========================================================
              TAB 1: HOME SNAPSHOT
             ========================================================= */}
          {activeTab === 'home' && (
            <div className="space-y-6">
              {/* Hero Attendance + Quick Action Strip */}
              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Your Local Attendance Pulse
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-slate-600 font-mono-num">
                        Target: {targetThreshold}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-3">
                      <span className="text-3xl font-extrabold font-mono-num text-slate-900">
                        {attendanceResult.currentPercentage}%
                      </span>
                      <span className="text-xs text-slate-500 font-mono-num">
                        ({attended} / {totalHeld} classes)
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700 font-medium">
                      {attendanceResult.summaryText}
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAttended((a) => a + 1);
                          setTotalHeld((t) => t + 1);
                          triggerToast('Logged +1 attended lecture.');
                        }}
                        className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        +1 Attended Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTotalHeld((t) => t + 1);
                          triggerToast('Logged +1 missed lecture.');
                        }}
                        className="px-3 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-slate-800 text-xs font-semibold transition cursor-pointer"
                      >
                        +1 Missed
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('toolkit')}
                      className="text-xs font-semibold text-[#E04F33] hover:underline text-left sm:text-right cursor-pointer"
                    >
                      Open full simulator & SGPA tool →
                    </button>
                  </div>
                </div>

                {/* Quick Metric Bar */}
                <div className="grid grid-cols-3 gap-3 pt-4 text-center sm:text-left">
                  <button
                    onClick={() => setActiveTab('toolkit')}
                    className="p-3 rounded-xl bg-[#FAF8F5] hover:bg-stone-100 border border-[#E6E2DC] transition text-left cursor-pointer"
                  >
                    <span className="text-[11px] text-slate-500 block">Est. SGPA</span>
                    <span className="text-lg font-bold font-mono-num text-slate-900">
                      {sgpaResult.isValid ? sgpaResult.sgpa : '--'}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('toolkit')}
                    className="p-3 rounded-xl bg-[#FAF8F5] hover:bg-stone-100 border border-[#E6E2DC] transition text-left cursor-pointer"
                  >
                    <span className="text-[11px] text-slate-500 block">Open Tasks</span>
                    <span className="text-lg font-bold font-mono-num text-slate-900">
                      {tasks.filter((t) => !t.completed).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('explore')}
                    className="p-3 rounded-xl bg-[#FAF8F5] hover:bg-stone-100 border border-[#E6E2DC] transition text-left cursor-pointer"
                  >
                    <span className="text-[11px] text-slate-500 block">Active Cards</span>
                    <span className="text-lg font-bold font-mono-num text-[#E04F33]">
                      {filteredCards.length}
                    </span>
                  </button>
                </div>
              </section>

              {/* Active Pulse Board Highlights */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display font-bold text-base text-slate-900">
                      Live Student Collaboration Cards
                    </h2>
                    <p className="text-xs text-slate-500">
                      Find teammates, study partners, or split a cab to Jaipur Junction
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('explore')}
                    className="text-xs font-semibold text-[#0F172A] hover:underline cursor-pointer"
                  >
                    View all ({filteredCards.length}) →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredCards.slice(0, 2).map((card) => (
                    <div
                      key={card.id}
                      className="bg-white rounded-2xl border border-[#E6E2DC] p-4 flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${CATEGORY_META[card.category].badgeClass}`}
                          >
                            {CATEGORY_META[card.category].label}
                          </span>
                          {card.isDemoFixture && (
                            <span className="text-[10px] font-mono-num uppercase bg-stone-100 text-slate-600 px-2 py-0.5 rounded">
                              Demo Fixture
                            </span>
                          )}
                        </div>
                        <h3 className="font-display font-bold text-sm text-slate-900 leading-snug">
                          {card.title}
                        </h3>
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {card.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          {card.authorName} •{' '}
                          <strong className="text-slate-800 font-mono-num">
                            {card.spotsRemaining} spot left
                          </strong>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleShareCard(card, true)}
                            className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-slate-700 font-medium cursor-pointer"
                          >
                            WhatsApp
                          </button>
                          <button
                            onClick={() => setActiveJoinCard(card)}
                            className="px-2.5 py-1 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white font-medium cursor-pointer"
                          >
                            Connect
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Verified Quick Portals Directory */}
              <section className="space-y-3">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">
                    Verified Academic & Official Portals
                  </h2>
                  <p className="text-xs text-slate-500">
                    Curated official external links (clearly separated from student posts)
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {VERIFIED_RESOURCE_LINKS.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-white rounded-xl border border-[#E6E2DC] p-3.5 hover:border-slate-400 transition flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-bold text-sm text-slate-900 group-hover:text-[#E04F33] transition-colors">
                            {link.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {link.description}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                          <ShieldCheck className="w-3 h-3" />
                          {link.sourceLabel}
                        </span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-800 shrink-0 mt-1" />
                    </a>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* =========================================================
              TAB 2: STUDENT TOOLKIT
             ========================================================= */}
          {activeTab === 'toolkit' && (
            <div className="space-y-6">
              {/* 1. Attendance Calculator & Simulator */}
              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3">
                  <div>
                    <h2 className="font-display font-bold text-base text-slate-900">
                      1. Configurable Attendance Calculator
                    </h2>
                    <p className="text-xs text-slate-500">
                      Threshold is configurable because rules can vary by department, lab, or clinical program.
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono-num ${
                      attendanceResult.status === 'safe'
                        ? 'bg-emerald-100 text-emerald-900'
                        : attendanceResult.status === 'warning'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-red-100 text-red-900'
                    }`}
                  >
                    {attendanceResult.isValid
                      ? `${attendanceResult.projectedPercentage}% Projected`
                      : 'Check Input'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Classes Attended
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={attended}
                      onChange={(e) => setAttended(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 font-mono-num text-sm focus:outline-2 focus:outline-[#0F172A]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Total Classes Held
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={totalHeld}
                      onChange={(e) => setTotalHeld(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 font-mono-num text-sm focus:outline-2 focus:outline-[#0F172A]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Target Requirement (%)
                    </span>
                    <select
                      value={targetThreshold}
                      onChange={(e) => setTargetThreshold(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 font-mono-num text-sm bg-white focus:outline-2 focus:outline-[#0F172A]"
                    >
                      <option value={75}>75% (Standard UGC / B.Tech)</option>
                      <option value={80}>80% (Strict / Law / Clinical)</option>
                      <option value={70}>70% (With Medical Relaxation)</option>
                      <option value={65}>65% (Custom Scholarship Buffer)</option>
                    </select>
                  </label>
                </div>

                {/* What-if Simulator */}
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E6E2DC] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      "What-If" Upcoming Week Simulator
                    </span>
                    {(simAttend > 0 || simMiss > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSimAttend(0);
                          setSimMiss(0);
                        }}
                        className="text-xs text-[#E04F33] font-semibold hover:underline cursor-pointer"
                      >
                        Reset simulation
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-600 flex justify-between">
                        <span>If I attend next N lectures:</span>
                        <strong className="font-mono-num">+{simAttend}</strong>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={15}
                        value={simAttend}
                        onChange={(e) => setSimAttend(Number(e.target.value))}
                        className="w-full accent-[#0F172A]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-600 flex justify-between">
                        <span>If I skip next N lectures:</span>
                        <strong className="font-mono-num">+{simMiss}</strong>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={15}
                        value={simMiss}
                        onChange={(e) => setSimMiss(Number(e.target.value))}
                        className="w-full accent-[#E04F33]"
                      />
                    </label>
                  </div>

                  {attendanceResult.isValid ? (
                    <div className="flex items-start gap-2.5 pt-2 text-sm text-slate-800">
                      {attendanceResult.status === 'deficit' ? (
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-semibold">{attendanceResult.summaryText}</p>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono-num">
                          Formula: (Attended {attended} + Sim {simAttend}) / (Held{' '}
                          {totalHeld} + Sim {simAttend + simMiss}) ={' '}
                          {attendanceResult.projectedPercentage}%
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-red-600">
                      {attendanceResult.error}
                    </p>
                  )}
                </div>
              </section>

              {/* 2. SGPA / CGPA Estimator */}
              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3">
                  <div>
                    <h2 className="font-display font-bold text-base text-slate-900">
                      2. SGPA & Cumulative CGPA Calculator
                    </h2>
                    <p className="text-xs text-slate-500">
                      Uses standard 10-point CBCS credit weighting: O=10, A+=9, A=8, B+=7, B=6, C=5, P=4, F=0.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-[#0F172A] text-white text-xs font-mono-num font-bold">
                      SGPA: {sgpaResult.isValid ? sgpaResult.sgpa : '--'}
                    </span>
                    {sgpaResult.projectedCgpa !== null && (
                      <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-mono-num font-bold">
                        Est. CGPA: {sgpaResult.projectedCgpa}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {courses.map((course, idx) => (
                    <div
                      key={course.id}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <input
                        type="text"
                        aria-label={`Subject ${idx + 1} name`}
                        value={course.name}
                        onChange={(e) =>
                          setCourses((prev) =>
                            prev.map((c) =>
                              c.id === course.id ? { ...c, name: e.target.value } : c
                            )
                          )
                        }
                        placeholder="Course name"
                        className="col-span-6 sm:col-span-7 px-3 py-2 rounded-xl border border-stone-300 text-xs sm:text-sm"
                      />
                      <input
                        type="number"
                        aria-label={`Subject ${idx + 1} credits`}
                        min={1}
                        max={10}
                        value={course.credits}
                        onChange={(e) =>
                          setCourses((prev) =>
                            prev.map((c) =>
                              c.id === course.id
                                ? { ...c, credits: Number(e.target.value) }
                                : c
                            )
                          )
                        }
                        className="col-span-2 px-2.5 py-2 rounded-xl border border-stone-300 font-mono-num text-xs sm:text-sm text-center"
                      />
                      <select
                        aria-label={`Subject ${idx + 1} expected grade`}
                        value={course.gradeLetter}
                        onChange={(e) =>
                          setCourses((prev) =>
                            prev.map((c) =>
                              c.id === course.id
                                ? { ...c, gradeLetter: e.target.value }
                                : c
                            )
                          )
                        }
                        className="col-span-3 sm:col-span-2 px-2 py-2 rounded-xl border border-stone-300 font-mono-num text-xs sm:text-sm bg-white"
                      >
                        {Object.entries(DEFAULT_GRADE_SCALE).map(([letter, pts]) => (
                          <option key={letter} value={letter}>
                            {letter} ({pts})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${course.name}`}
                        onClick={() =>
                          setCourses((prev) => prev.filter((c) => c.id !== course.id))
                        }
                        className="col-span-1 flex justify-center text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCourses((prev) => [
                        ...prev,
                        {
                          id: `course-${Date.now()}`,
                          name: `Subject ${prev.length + 1}`,
                          credits: 3,
                          gradeLetter: 'A',
                        },
                      ])
                    }
                    className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    + Add Subject Row
                  </button>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Prior CGPA & Credits:</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="CGPA"
                      value={priorCgpa}
                      onChange={(e) => setPriorCgpa(e.target.value)}
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-stone-300 font-mono-num"
                    />
                    <input
                      type="number"
                      placeholder="Credits"
                      value={priorCredits}
                      onChange={(e) => setPriorCredits(e.target.value)}
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-stone-300 font-mono-num"
                    />
                  </div>
                </div>
              </section>

              {/* 3. Local Semester Planner & Deadlines */}
              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-4">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">
                    3. Personal Semester Deadline & Exam Tracker
                  </h2>
                  <p className="text-xs text-slate-500">
                    Saved privately in your browser storage—works offline without an account.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newTaskTitle.trim()) return;
                    setTasks((prev) => [
                      ...prev,
                      {
                        id: `task-${Date.now()}`,
                        title: newTaskTitle.trim(),
                        courseOrTag: newTaskCourse.trim() || 'General',
                        dueDate: newTaskDate,
                        kind: 'Assignment',
                        completed: false,
                      },
                    ]);
                    setNewTaskTitle('');
                    setNewTaskCourse('');
                    triggerToast('Task saved to your local planner.');
                  }}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2"
                >
                  <input
                    type="text"
                    placeholder="Add exam, viva, or assignment deadline..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="sm:col-span-6 px-3 py-2 rounded-xl border border-stone-300 text-xs sm:text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Course code (e.g. CSE-204)"
                    value={newTaskCourse}
                    onChange={(e) => setNewTaskCourse(e.target.value)}
                    className="sm:col-span-3 px-3 py-2 rounded-xl border border-stone-300 text-xs sm:text-sm"
                  />
                  <input
                    type="date"
                    value={newTaskDate}
                    onChange={(e) => setNewTaskDate(e.target.value)}
                    className="sm:col-span-2 px-2.5 py-2 rounded-xl border border-stone-300 text-xs font-mono-num"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-1 px-3 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-semibold cursor-pointer"
                  >
                    Add
                  </button>
                </form>

                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        task.completed
                          ? 'bg-stone-50 border-stone-200 opacity-60'
                          : 'bg-[#FAF8F5] border-[#E6E2DC]'
                      }`}
                    >
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() =>
                            setTasks((prev) =>
                              prev.map((t) =>
                                t.id === task.id ? { ...t, completed: !t.completed } : t
                              )
                            )
                          }
                          className="w-4 h-4 accent-[#0F172A] rounded"
                        />
                        <div>
                          <span
                            className={`text-sm font-medium block ${
                              task.completed ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {task.title}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono-num">
                            {task.courseOrTag} • Due {task.dueDate}
                          </span>
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setTasks((prev) => prev.filter((t) => t.id !== task.id))
                        }
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* =========================================================
              TAB 3: EXPLORE (STRUCTURED PULSE BOARD & EVENTS)
             ========================================================= */}
          {activeTab === 'explore' && (
            <div className="space-y-5">
              {/* Sub-navigation switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="inline-flex p-1 rounded-xl bg-stone-200/80 w-fit">
                  <button
                    onClick={() => setExploreSubTab('requests')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      exploreSubTab === 'requests'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pulse Request Cards ({filteredCards.length})
                  </button>
                  <button
                    onClick={() => setExploreSubTab('events')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      exploreSubTab === 'events'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Campus Events & Clubs ({events.length})
                  </button>
                </div>

                {exploreSubTab === 'requests' && (
                  <button
                    onClick={() => setActiveTab('create')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E04F33] hover:bg-[#c94127] text-white text-xs font-semibold shadow-xs cursor-pointer w-fit"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Post New Request Card
                  </button>
                )}
              </div>

              {exploreSubTab === 'requests' ? (
                <>
                  {/* Search & Category Filter Pills */}
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by skill (React, DSA), branch (CSE, BBA), or station cab..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#E6E2DC] text-sm focus:outline-2 focus:outline-[#0F172A]"
                      />
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {(
                        [
                          { id: 'all', label: 'All Requests' },
                          { id: 'hackathon', label: 'Hackathons & Builds' },
                          { id: 'study', label: 'Study Partners' },
                          { id: 'cab_pool', label: 'Cab / Station Split' },
                          { id: 'sports', label: 'Sports & Court' },
                        ] as const
                      ).map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                            selectedCategory === cat.id
                              ? 'bg-[#0F172A] text-white'
                              : 'bg-white border border-[#E6E2DC] text-slate-700 hover:bg-stone-100'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cards List */}
                  {filteredCards.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-[#E6E2DC] p-8 text-center space-y-3">
                      <p className="font-display font-bold text-base text-slate-800">
                        No matching Pulse cards right now
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Be the first to create a structured card and share its link in your class WhatsApp group.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedCategory('all');
                          setSearchQuery('');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-stone-100 text-xs font-semibold text-slate-800 cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {filteredCards.map((card) => (
                        <article
                          key={card.id}
                          className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-3.5 transition hover:border-slate-300"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${CATEGORY_META[card.category].badgeClass}`}
                              >
                                {CATEGORY_META[card.category].label}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-mono-num">
                                <Clock className="w-3.5 h-3.5" />
                                {card.timeWindow}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono-num font-semibold px-2.5 py-0.5 rounded-md bg-stone-100 text-slate-800">
                                {card.spotsRemaining} of {card.spotsTotal} spots left
                              </span>
                              {card.isDemoFixture && (
                                <span className="text-[11px] font-mono-num bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded">
                                  Demo Fixture
                                </span>
                              )}
                            </div>
                          </div>

                          <div>
                            <h3 className="font-display font-bold text-base text-slate-900">
                              {card.title}
                            </h3>
                            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                              {card.description}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {card.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[11px] px-2.5 py-0.5 rounded-md bg-[#FAF8F5] border border-stone-200 text-slate-700 font-medium"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>

                          <div className="pt-3 border-t border-stone-200/80 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-slate-600">
                              Posted by{' '}
                              <strong className="text-slate-900">{card.authorName}</strong>{' '}
                              ({card.authorDepartment} • {card.authorYear})
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setReportedIds((prev) => [...prev, card.id]);
                                  triggerToast('Card hidden from your feed and flagged.');
                                }}
                                title="Hide or Report Card"
                                className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-stone-100 cursor-pointer"
                              >
                                <Flag className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareCard(card, false)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-slate-800 text-xs font-semibold cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                Share
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareCard(card, true)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold cursor-pointer"
                              >
                                WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveJoinCard(card)}
                                className="px-3.5 py-1.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                              >
                                Request Handshake
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Events & Clubs Sub-Tab */
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-stone-100 border border-[#E6E2DC] text-xs text-slate-700 flex items-center justify-between">
                    <span>
                      Events below are labelled demo fixtures showing how verified club schedules and buddy-matching work without scraping stale website news.
                    </span>
                  </div>

                  {events.map((evt) => {
                    const isBuddyJoined = buddyRsvpIds.includes(evt.id);
                    return (
                      <article
                        key={evt.id}
                        className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-900 border border-indigo-200">
                            {evt.category} • {evt.organizer}
                          </span>
                          <span className="text-[11px] font-mono-num bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded">
                            {evt.verificationSource}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-display font-bold text-base text-slate-900">
                            {evt.title}
                          </h3>
                          <p className="text-xs text-slate-600 mt-1 font-mono-num">
                            📅 {evt.dateLabel} • 🕒 {evt.timeLabel} • 📍 {evt.venue}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-slate-600 font-mono-num">
                            <strong>{evt.goingCount}</strong> interested •{' '}
                            <strong className="text-[#E04F33]">
                              {evt.lookingForBuddyCount} looking for an event buddy
                            </strong>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={buildGoogleCalendarUrl(evt)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-slate-800 text-xs font-semibold"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              + Calendar
                            </a>
                            <button
                              type="button"
                              onClick={() => handleShareEvent(evt, true)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold cursor-pointer"
                            >
                              WhatsApp Invite
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleEventBuddy(evt.id)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                                isBuddyJoined
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-[#0F172A] text-white hover:bg-slate-800'
                              }`}
                            >
                              {isBuddyJoined
                                ? '✓ Open to Event Buddy'
                                : 'Find Someone to Attend With'}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              TAB 4: CREATE PULSE REQUEST CARD
             ========================================================= */}
          {activeTab === 'create' && (
            <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 md:p-6 space-y-5">
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900">
                  Post a Structured Campus Request Card
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Designed to be shared directly into your class or club WhatsApp group. Your phone number is never shown publicly.
                </p>
              </div>

              {createError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800"
                >
                  {createError}
                </div>
              )}

              <form onSubmit={handleCreateCardSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Category
                    </span>
                    <select
                      value={createCategory}
                      onChange={(e) =>
                        setCreateCategory(e.target.value as PulseCategory)
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm bg-white"
                    >
                      <option value="hackathon">Hackathon / Build Teammate</option>
                      <option value="study">Study / Exam Prep Partner</option>
                      <option value="cab_pool">Cab / Station Split (Jaipur)</option>
                      <option value="sports">Sports / Court Partner</option>
                      <option value="project">Semester Project Collaborator</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Time Window / When
                    </span>
                    <input
                      type="text"
                      value={createWindow}
                      onChange={(e) => setCreateWindow(e.target.value)}
                      placeholder="e.g., Friday 4:15 PM or This Weekend"
                      className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">
                    Headline (What do you need?)
                  </span>
                  <input
                    type="text"
                    maxLength={100}
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g., Need 1 UI Designer for SIH Internal Round"
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">
                    Details & Expectations (No phone numbers in public text)
                  </span>
                  <textarea
                    rows={3}
                    maxLength={280}
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="Describe skills needed, meeting spot (e.g., Central Library), or fare split details..."
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Your Name
                    </span>
                    <input
                      type="text"
                      value={createAuthor}
                      onChange={(e) => setCreateAuthor(e.target.value)}
                      placeholder="e.g., Alok T."
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Department / Branch
                    </span>
                    <input
                      type="text"
                      value={createDept}
                      onChange={(e) => setCreateDept(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Year & Open Spots
                    </span>
                    <div className="flex gap-2">
                      <select
                        value={createYear}
                        onChange={(e) => setCreateYear(e.target.value)}
                        className="flex-1 px-2.5 py-2 rounded-xl border border-stone-300 text-sm bg-white"
                      >
                        <option>1st Year</option>
                        <option>2nd Year</option>
                        <option>3rd Year</option>
                        <option>4th Year</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={createSpots}
                        onChange={(e) => setCreateSpots(Number(e.target.value))}
                        className="w-16 px-2.5 py-2 rounded-xl border border-stone-300 font-mono-num text-sm text-center"
                      />
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Skill / Topic Tags (comma-separated)
                    </span>
                    <input
                      type="text"
                      value={createTags}
                      onChange={(e) => setCreateTags(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Preferred Handshake Method (After Approval)
                    </span>
                    <select
                      value={createChannel}
                      onChange={(e) =>
                        setCreateChannel(
                          e.target.value as PulseCard['preferredHandshakeChannel']
                        )
                      }
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm bg-white"
                    >
                      <option value="WhatsApp">WhatsApp Handoff (After Accept)</option>
                      <option value="Telegram">Telegram Handle (After Accept)</option>
                      <option value="In-Person Campus Meet">
                        Meet on Campus (Library / Canteen)
                      </option>
                    </select>
                  </label>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('explore')}
                    className="px-4 py-2.5 rounded-xl bg-stone-100 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#E04F33] hover:bg-[#c94127] text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Publish Card & Get Share Link
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* =========================================================
              TAB 5: CONNECT (SAFE HANDSHAKES & DATA CONTROLS)
             ========================================================= */}
          {activeTab === 'connect' && (
            <div className="space-y-6">
              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-stone-200 pb-3">
                  <div>
                    <h2 className="font-display font-bold text-base text-slate-900">
                      Structured Connection Handshakes (Not Random Chat)
                    </h2>
                    <p className="text-xs text-slate-500">
                      VGU Pulse does not expose your phone number publicly. You review a peer's intro note first, then accept to coordinate.
                    </p>
                  </div>
                  <Lock className="w-5 h-5 text-emerald-700 shrink-0" />
                </div>

                <div className="space-y-3">
                  {handshakes.map((hs) => (
                    <div
                      key={hs.id}
                      className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E6E2DC] space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800">
                          {hs.direction === 'incoming' ? 'Incoming Request' : 'Sent Request'} •{' '}
                          <span className="text-slate-500">{hs.createdAtLabel}</span>
                        </span>
                        <span
                          className={`text-[11px] font-mono-num font-semibold px-2.5 py-0.5 rounded-full ${
                            hs.status === 'accepted'
                              ? 'bg-emerald-100 text-emerald-900'
                              : hs.status === 'declined'
                              ? 'bg-stone-200 text-slate-600'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {hs.status.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-600">
                        Card: "{hs.cardTitle}"
                      </p>
                      <p className="text-sm text-slate-900 bg-white p-3 rounded-lg border border-stone-200">
                        <strong>
                          {hs.fromStudentName} ({hs.fromDepartment}, {hs.fromYear}):
                        </strong>{' '}
                        {hs.introNote}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-emerald-800 font-medium">
                          {hs.revealedContactNote}
                        </span>
                        {hs.direction === 'incoming' && hs.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setHandshakes((prev) =>
                                  prev.map((item) =>
                                    item.id === hs.id
                                      ? {
                                          ...item,
                                          status: 'declined',
                                          revealedContactNote: 'Request declined.',
                                        }
                                      : item
                                  )
                                )
                              }
                              className="px-3 py-1.5 rounded-lg bg-stone-200 text-slate-700 text-xs font-semibold cursor-pointer"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHandshakes((prev) =>
                                  prev.map((item) =>
                                    item.id === hs.id
                                      ? {
                                          ...item,
                                          status: 'accepted',
                                          revealedContactNote:
                                            '✓ Handshake Accepted! Coordinate at Central Library / via your chosen channel.',
                                        }
                                      : item
                                  )
                                );
                                triggerToast('Handshake accepted!');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              Accept & Reveal Handshake
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Local Data & Privacy Reset */}
              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-3">
                <h3 className="font-display font-bold text-sm text-slate-900">
                  Local Device Storage & Demo Reset
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  All attendance counts, SGPA rows, planner tasks, and custom cards created in Stage 1 are stored in your browser's local storage (`vgu_pulse_next_v1_*`).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    clearAllLocalPulseData();
                    window.location.reload();
                  }}
                  className="px-4 py-2 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold cursor-pointer"
                >
                  Reset Local Data to Default Demo Fixtures
                </button>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Modal for Requesting a Handshake on a Pulse Card */}
      {activeJoinCard && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-4"
        >
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#E6E2DC] p-5 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#E04F33]">
                  Safe Peer Handshake
                </span>
                <h3 className="font-display font-bold text-base text-slate-900 mt-0.5">
                  Connect with {activeJoinCard.authorName}
                </h3>
              </div>
              <button
                onClick={() => setActiveJoinCard(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 bg-[#FAF8F5] p-3 rounded-xl border border-stone-200">
              For: <strong>{activeJoinCard.title}</strong> ({activeJoinCard.timeWindow})
            </p>

            <form onSubmit={handleSendHandshake} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">Your Name</span>
                <input
                  type="text"
                  required
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="e.g.,Vikram R."
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={joinDept}
                  onChange={(e) => setJoinDept(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
                <select
                  value={joinYear}
                  onChange={(e) => setJoinYear(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white"
                >
                  <option>1st Year</option>
                  <option>2nd Year</option>
                  <option>3rd Year</option>
                  <option>4th Year</option>
                </select>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Short Intro Note (Why you're joining / relevant skill)
                </span>
                <textarea
                  rows={2}
                  required
                  value={joinNote}
                  onChange={(e) => setJoinNote(e.target.value)}
                  placeholder="e.g., I'm free at 4:15 PM at Main Gate to split the cab to Jaipur Junction!"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveJoinCard(null)}
                  className="px-4 py-2 rounded-xl bg-stone-100 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-semibold cursor-pointer"
                >
                  Send Handshake Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E6E2DC] px-2 py-1.5 flex items-center justify-around"
      >
        {(
          [
            { id: 'home', label: 'Home', icon: Home },
            { id: 'toolkit', label: 'Toolkit', icon: BookOpen },
            { id: 'explore', label: 'Explore', icon: Compass },
            { id: 'create', label: 'Post', icon: PlusCircle },
            { id: 'connect', label: 'Connect', icon: Users },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[11px] font-semibold transition cursor-pointer ${
                isActive ? 'text-[#E04F33]' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
