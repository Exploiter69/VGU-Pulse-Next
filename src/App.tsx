import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  RefreshCw,
  Database,
  KeyRound,
} from 'lucide-react';
import {
  AcademicYear,
  CampusEvent,
  CapabilityVault,
  CourseGradeRow,
  DataSourceMode,
  HandshakeChannel,
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
  loadCapabilityVault,
  loadLocalState,
  saveCardOwnerToken,
  saveHandshakeSenderToken,
  saveLocalState,
} from './services/storage';
import {
  ApiClientError,
  createSharedCard,
  createSharedHandshake,
  decideSharedHandshake,
  fetchSharedCards,
  fetchSharedEvents,
  fetchSynchronizedHandshakes,
  reportSharedCard,
  toggleSharedEventBuddy,
} from './services/apiClient';
import { containsPublicContactPii } from './domain/validation';

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

  const [dataMode, setDataMode] = useState<DataSourceMode>(() =>
    loadLocalState<DataSourceMode>('data_mode', 'shared_api')
  );
  const [apiLoading, setApiLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);

  // --- Toolkit State (Always 100% Local-First & Offline Capable) ---
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

  // --- Shared D1 State vs Local Demo State ---
  const [sharedCards, setSharedCards] = useState<PulseCard[]>([]);
  const [sharedEvents, setSharedEvents] = useState<CampusEvent[]>([]);
  const [sharedHandshakes, setSharedHandshakes] = useState<HandshakeRequest[]>([]);

  const [demoCards, setDemoCards] = useState<PulseCard[]>(() =>
    loadLocalState('demo_pulse_cards', DEMO_PULSE_CARDS)
  );
  const [demoEvents, setDemoEvents] = useState<CampusEvent[]>(() =>
    loadLocalState('demo_campus_events', DEMO_CAMPUS_EVENTS)
  );
  const [demoHandshakes, setDemoHandshakes] = useState<HandshakeRequest[]>(() =>
    loadLocalState('demo_handshakes', DEMO_HANDSHAKE_REQUESTS)
  );

  const [vault, setVault] = useState<CapabilityVault>(() => loadCapabilityVault());

  const [selectedCategory, setSelectedCategory] = useState<PulseCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [exploreSubTab, setExploreSubTab] = useState<'requests' | 'events'>('requests');
  const [buddyRsvpIds, setBuddyRsvpIds] = useState<string[]>(() =>
    loadLocalState('buddy_rsvps', [])
  );
  const [reportedIds, setReportedIds] = useState<string[]>(() =>
    loadLocalState('reported_ids', [])
  );

  // --- Connect / Handshake Modal State ---
  const [activeJoinCard, setActiveJoinCard] = useState<PulseCard | null>(null);
  const [joinName, setJoinName] = useState('');
  const [joinDept, setJoinDept] = useState('B.Tech CSE');
  const [joinYear, setJoinYear] = useState<AcademicYear>('2nd Year');
  const [joinNote, setJoinNote] = useState('');

  // --- Create Request Form State ---
  const [createTitle, setCreateTitle] = useState('');
  const [createCategory, setCreateCategory] = useState<PulseCategory>('hackathon');
  const [createDesc, setCreateDesc] = useState('');
  const [createAuthor, setCreateAuthor] = useState('');
  const [createDept, setCreateDept] = useState('B.Tech CSE');
  const [createYear, setCreateYear] = useState<AcademicYear>('2nd Year');
  const [createTags, setCreateTags] = useState('React, TypeScript, SIH');
  const [createSpots, setCreateSpots] = useState(2);
  const [createWindow, setCreateWindow] = useState('This Weekend');
  const [createChannel, setCreateChannel] = useState<HandshakeChannel>('WhatsApp');
  const [createCoordinationNote, setCreateCoordinationNote] = useState(
    'Meet at Central Library 2nd floor reading table at 3:15 PM'
  );
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => saveLocalState('data_mode', dataMode), [dataMode]);
  useEffect(() => saveLocalState('att_attended', attended), [attended]);
  useEffect(() => saveLocalState('att_total', totalHeld), [totalHeld]);
  useEffect(() => saveLocalState('att_threshold', targetThreshold), [targetThreshold]);
  useEffect(() => saveLocalState('sgpa_courses', courses), [courses]);
  useEffect(() => saveLocalState('prior_cgpa', priorCgpa), [priorCgpa]);
  useEffect(() => saveLocalState('prior_credits', priorCredits), [priorCredits]);
  useEffect(() => saveLocalState('planner_tasks', tasks), [tasks]);
  useEffect(() => saveLocalState('demo_pulse_cards', demoCards), [demoCards]);
  useEffect(() => saveLocalState('demo_campus_events', demoEvents), [demoEvents]);
  useEffect(() => saveLocalState('demo_handshakes', demoHandshakes), [demoHandshakes]);
  useEffect(() => saveLocalState('buddy_rsvps', buddyRsvpIds), [buddyRsvpIds]);
  useEffect(() => saveLocalState('reported_ids', reportedIds), [reportedIds]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  const refreshSharedData = useCallback(async () => {
    if (dataMode !== 'shared_api') return;
    setApiLoading(true);
    setApiError(null);
    try {
      const currentVault = loadCapabilityVault();
      const [cardsRes, eventsRes, handshakesRes] = await Promise.all([
        fetchSharedCards(),
        fetchSharedEvents(),
        fetchSynchronizedHandshakes(currentVault),
      ]);
      setSharedCards(cardsRes);
      setSharedEvents(eventsRes);
      setSharedHandshakes(handshakesRes);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not reach the local/shared Worker API.';
      setApiError(msg);
    } finally {
      setApiLoading(false);
    }
  }, [dataMode]);

  useEffect(() => {
    refreshSharedData();
  }, [refreshSharedData]);

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const cardMatch = path.match(/^\/cards\/([^/]+)/);
    const eventMatch = path.match(/^\/events\/([^/]+)/);
    const targetCard = cardMatch ? decodeURIComponent(cardMatch[1]) : params.get('card');
    const targetEvent = eventMatch ? decodeURIComponent(eventMatch[1]) : params.get('event');

    if (targetCard) {
      setActiveTab('explore');
      setExploreSubTab('requests');
      setDeepLinkNotice(`Opened shared link for Pulse Card ID: ${targetCard}`);
    } else if (targetEvent) {
      setActiveTab('explore');
      setExploreSubTab('events');
      setDeepLinkNotice(`Opened shared link for Campus Event ID: ${targetEvent}`);
    }
  }, []);

  const activeCards = dataMode === 'shared_api' ? sharedCards : demoCards;
  const activeEvents = dataMode === 'shared_api' ? sharedEvents : demoEvents;
  const activeHandshakes =
    dataMode === 'shared_api' ? sharedHandshakes : demoHandshakes;

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
    return activeCards
      .filter((c) => !reportedIds.includes(c.id))
      .filter((c) =>
        selectedCategory === 'all' ? true : c.category === selectedCategory
      )
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
  }, [activeCards, reportedIds, selectedCategory, searchQuery]);

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
      triggerToast('Share text & /cards/:id link copied! Ready to paste in WhatsApp.');
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
      triggerToast('Event /events/:id invite copied to clipboard!');
    } catch {
      window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCreateCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const parsedTags = createTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (dataMode === 'shared_api') {
      setIsSubmitting(true);
      try {
        const res = await createSharedCard({
          title: createTitle,
          category: createCategory,
          description: createDesc,
          authorName: createAuthor,
          authorDepartment: createDept,
          authorYear: createYear,
          tags: parsedTags,
          spotsTotal: Number(createSpots) || 2,
          timeWindow: createWindow,
          preferredHandshakeChannel: createChannel,
          coordinationNote: createCoordinationNote,
          turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
        });

        const updatedVault = saveCardOwnerToken(
          res.card.id,
          res.ownerCapabilityToken
        );
        setVault(updatedVault);
        setSharedCards((prev) => [res.card, ...prev]);
        setCreateTitle('');
        setCreateDesc('');
        setActiveTab('explore');
        setExploreSubTab('requests');
        triggerToast(
          'Published to shared D1 with AES-GCM encrypted coordination note!'
        );
      } catch (err) {
        if (err instanceof ApiClientError) {
          setCreateError(err.message);
        } else {
          setCreateError('Failed to publish card to server. Check connection.');
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (
      containsPublicContactPii(createTitle) ||
      containsPublicContactPii(createDesc)
    ) {
      setCreateError(
        'Privacy Protection: Do not paste your phone number or email in public cards. Put meeting/contact instructions in the private Coordination Note.'
      );
      return;
    }
    if (createTitle.trim().length < 10 || createDesc.trim().length < 15) {
      setCreateError('Please enter a title (10+ chars) and description (15+ chars).');
      return;
    }

    const newDemoCard: PulseCard = {
      id: `demo-local-${Date.now()}`,
      title: createTitle.trim(),
      category: createCategory,
      description: createDesc.trim(),
      authorName: createAuthor.trim() || 'Demo Student',
      authorDepartment: createDept,
      authorYear: createYear,
      tags: parsedTags,
      spotsTotal: Math.max(1, Math.min(20, Number(createSpots) || 2)),
      spotsRemaining: Math.max(1, Math.min(20, Number(createSpots) || 2)),
      timeWindow: createWindow.trim() || 'Flexible this week',
      createdAt: 'Just now (Local Demo Sandbox)',
      isDemoFixture: true,
      preferredHandshakeChannel: createChannel,
    };

    setDemoCards((prev) => [newDemoCard, ...prev]);
    setCreateTitle('');
    setCreateDesc('');
    setActiveTab('explore');
    setExploreSubTab('requests');
    triggerToast('Created in Local Demo Sandbox.');
  };

  const handleSendHandshake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJoinCard) return;

    if (dataMode === 'shared_api') {
      setIsSubmitting(true);
      try {
        const res = await createSharedHandshake({
          cardId: activeJoinCard.id,
          fromStudentName: joinName,
          fromDepartment: joinDept,
          fromYear: joinYear,
          introNote: joinNote,
          turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
        });

        const updatedVault = saveHandshakeSenderToken(
          res.handshake.id,
          res.senderCapabilityToken
        );
        setVault(updatedVault);
        setSharedHandshakes((prev) => [res.handshake, ...prev]);
        setActiveJoinCard(null);
        setJoinNote('');
        setActiveTab('connect');
        triggerToast(
          'Handshake stored in D1! Check your Connect tab when the card owner responds.'
        );
      } catch (err) {
        triggerToast(
          err instanceof ApiClientError
            ? err.message
            : 'Could not submit handshake request.'
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!joinName.trim() || joinNote.trim().length < 8) {
      triggerToast('Please enter your name and an intro note (8+ chars).');
      return;
    }

    const req: HandshakeRequest = {
      id: `hs-demo-${Date.now()}`,
      cardId: activeJoinCard.id,
      cardTitle: activeJoinCard.title,
      fromStudentName: joinName.trim(),
      fromDepartment: joinDept,
      fromYear: joinYear,
      introNote: joinNote.trim(),
      direction: 'outgoing',
      status: 'pending',
      createdAtLabel: 'Just now (Demo)',
      isDemoFixture: true,
      revealedContactNote: `Demo Mode: Waiting for ${activeJoinCard.authorName} to accept.`,
    };

    setDemoHandshakes((prev) => [req, ...prev]);
    setActiveJoinCard(null);
    setJoinNote('');
    setActiveTab('connect');
    triggerToast('Demo handshake queued in Connect tab.');
  };

  const handleHandshakeDecision = async (
    hs: HandshakeRequest,
    decision: 'accepted' | 'declined'
  ) => {
    if (dataMode === 'shared_api') {
      const ownerToken = vault.ownedCards[hs.cardId];
      if (!ownerToken) {
        triggerToast(
          'Missing card-owner capability token in this browser for this card.'
        );
        return;
      }
      setIsSubmitting(true);
      try {
        const updated = await decideSharedHandshake(hs.id, decision, ownerToken);
        setSharedHandshakes((prev) =>
          prev.map((item) => (item.id === hs.id ? updated : item))
        );
        await refreshSharedData();
        triggerToast(
          decision === 'accepted'
            ? 'Handshake accepted! Your encrypted coordination note is now unlocked for this requester.'
            : 'Handshake declined and capacity synchronized.'
        );
      } catch (err) {
        triggerToast(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to update handshake status.'
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setDemoHandshakes((prev) =>
      prev.map((item) =>
        item.id === hs.id
          ? {
              ...item,
              status: decision,
              revealedContactNote:
                decision === 'accepted'
                  ? '✓ Demo Accepted: In Shared Mode, the owner coordination note is decrypted and revealed here.'
                  : 'Request declined.',
            }
          : item
      )
    );
    triggerToast(`Demo handshake ${decision}.`);
  };

  const handleToggleEventBuddy = async (eventId: string) => {
    const alreadyIn = buddyRsvpIds.includes(eventId);
    const direction = alreadyIn ? 'leave' : 'join';

    if (dataMode === 'shared_api') {
      try {
        const res = await toggleSharedEventBuddy(
          eventId,
          direction,
          vault.participantToken
        );
        setSharedEvents((prev) =>
          prev.map((ev) => (ev.id === eventId ? res.event : ev))
        );
        setBuddyRsvpIds((prev) =>
          alreadyIn ? prev.filter((id) => id !== eventId) : [...prev, eventId]
        );
        triggerToast(
          alreadyIn
            ? 'Removed your participation from event buddy list.'
            : 'Recorded your participation on this event!'
        );
      } catch (err) {
        triggerToast(
          err instanceof ApiClientError
            ? err.message
            : 'Could not update event buddy participation.'
        );
      }
      return;
    }

    setBuddyRsvpIds((prev) =>
      alreadyIn ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
    setDemoEvents((prev) =>
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
    triggerToast('Updated demo event buddy count.');
  };

  const handleReportCard = async (card: PulseCard) => {
    setReportedIds((prev) => [...prev, card.id]);
    if (dataMode === 'shared_api' && !card.isDemoFixture) {
      try {
        const out = await reportSharedCard(card.id);
        triggerToast(
          out.alreadyReported
            ? 'Card hidden (already reported from your connection).'
            : 'Card reported to server & hidden from your view.'
        );
        return;
      } catch {
        // Still hidden locally
      }
    }
    triggerToast('Card hidden from your view.');
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
                  label: 'Handshakes & Keys',
                  icon: Users,
                  badge: activeHandshakes.filter((h) => h.status === 'pending')
                    .length,
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

        {/* Explicit Data Mode Switcher */}
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E6E2DC] text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold text-slate-800">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#E04F33]" />
                Data Source Mode
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-stone-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setDataMode('shared_api')}
                className={`py-1 px-2 rounded text-[11px] font-semibold transition cursor-pointer ${
                  dataMode === 'shared_api'
                    ? 'bg-[#0F172A] text-white'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Shared D1 API
              </button>
              <button
                type="button"
                onClick={() => setDataMode('local_demo')}
                className={`py-1 px-2 rounded text-[11px] font-semibold transition cursor-pointer ${
                  dataMode === 'local_demo'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Demo Sandbox
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {dataMode === 'shared_api'
                ? 'Showing live records from Cloudflare Worker + D1. Demo fixtures are hidden.'
                : 'Showing offline sample fixtures. Calculators always stay local.'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-100/80 border border-[#E6E2DC] text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>AES-GCM & Capability Keys</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              Coordination notes are encrypted at rest with AES-256-GCM. Ownership uses hashed capability tokens.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="flex-1 md:pl-64 pb-24 md:pb-12">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#E6E2DC] px-4 py-3 flex flex-wrap items-center justify-between gap-2 md:px-8">
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
                {activeTab === 'connect' && 'Connection Handshakes & Keys'}
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Independent student utility for VGU Jaipur • Browser-first & local-first
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dataMode === 'shared_api' ? (
              <button
                type="button"
                onClick={refreshSharedData}
                disabled={apiLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${apiLoading ? 'animate-spin' : ''}`}
                />
                {apiLoading ? 'Syncing D1...' : 'Shared D1 Live'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                <Sparkles className="w-3 h-3 text-amber-700" />
                Local Demo Fixtures
              </span>
            )}

            <button
              type="button"
              onClick={() =>
                setDataMode((m) =>
                  m === 'shared_api' ? 'local_demo' : 'shared_api'
                )
              }
              className="md:hidden text-[11px] underline text-slate-600 font-medium"
            >
              Switch to {dataMode === 'shared_api' ? 'Demo' : 'Live D1'}
            </button>
          </div>
        </header>

        {/* Deep-Link Banner */}
        {deepLinkNotice && (
          <div className="max-w-4xl mx-auto px-4 pt-3 md:px-8">
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 flex items-center justify-between">
              <span>🔗 {deepLinkNotice}</span>
              <button
                onClick={() => {
                  setDeepLinkNotice(null);
                  window.history.replaceState({}, '', '/');
                }}
                className="font-semibold underline ml-3"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* API Connection Error Banner */}
        {dataMode === 'shared_api' && apiError && (
          <div className="max-w-4xl mx-auto px-4 pt-3 md:px-8">
            <div
              role="alert"
              className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <strong className="font-semibold block">
                  Shared D1 API Unreachable or Unmigrated ({apiError})
                </strong>
                <span>
                  Run <code className="font-mono-num bg-amber-100 px-1 rounded">npm run db:migrate:local</code> in your terminal, or switch to Demo Sandbox to inspect sample fixtures.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={refreshSharedData}
                  className="px-3 py-1.5 rounded-lg bg-[#0F172A] text-white font-semibold cursor-pointer"
                >
                  Retry API
                </button>
                <button
                  type="button"
                  onClick={() => setDataMode('local_demo')}
                  className="px-3 py-1.5 rounded-lg bg-amber-200 text-amber-950 font-semibold cursor-pointer"
                >
                  Use Demo Sandbox
                </button>
              </div>
            </div>
          </div>
        )}

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
                    <span className="text-[11px] text-slate-500 block">
                      {dataMode === 'shared_api' ? 'Shared D1 Cards' : 'Demo Cards'}
                    </span>
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
                      {dataMode === 'shared_api'
                        ? 'Shared Campus Collaboration Cards (D1)'
                        : 'Sample Collaboration Cards (Demo Sandbox)'}
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

                {filteredCards.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-[#E6E2DC] p-6 text-center space-y-2">
                    <p className="font-display font-bold text-sm text-slate-800">
                      {dataMode === 'shared_api'
                        ? 'No shared student request cards in D1 yet'
                        : 'No matching demo cards'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Production D1 starts clean with zero fabricated student requests. Post the first real request card or switch to Demo Sandbox to preview fixtures.
                    </p>
                    <div className="pt-2 flex justify-center gap-2">
                      <button
                        onClick={() => setActiveTab('create')}
                        className="px-3.5 py-2 rounded-xl bg-[#E04F33] text-white text-xs font-semibold cursor-pointer"
                      >
                        + Post First Request Card
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredCards.slice(0, 2).map((card) => (
                      <div
                        key={card.id}
                        className="bg-white rounded-2xl border border-[#E6E2DC] p-4 flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                                CATEGORY_META[card.category].badgeClass
                              }`}
                            >
                              {CATEGORY_META[card.category].label}
                            </span>
                            {card.isDemoFixture ? (
                              <span className="text-[10px] font-mono-num uppercase bg-stone-100 text-slate-600 px-2 py-0.5 rounded">
                                Demo Fixture
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono-num uppercase bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded">
                                Shared D1
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
                )}
              </section>

              {/* Verified Quick Portals Directory */}
              <section className="space-y-3">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">
                    Verified Academic & Public Portals
                  </h2>
                  <p className="text-xs text-slate-500">
                    Curated external links clearly distinguishing VGU domains from national government portals
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
              TAB 2: STUDENT TOOLKIT (100% LOCAL-FIRST)
             ========================================================= */}
          {activeTab === 'toolkit' && (
            <div className="space-y-6">
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
                      <option value={65}>65% (Custom Buffer)</option>
                    </select>
                  </label>
                </div>

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

              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-4">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">
                    3. Personal Semester Deadline & Exam Tracker
                  </h2>
                  <p className="text-xs text-slate-500">
                    Saved privately in your browser storage—never depends on the backend being online.
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
                    Campus Events & Milestones ({activeEvents.length})
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
                          { id: 'project', label: 'Semester Projects' },
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

                  {filteredCards.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-[#E6E2DC] p-8 text-center space-y-3">
                      <p className="font-display font-bold text-base text-slate-800">
                        {dataMode === 'shared_api'
                          ? 'No shared cards match your filter in D1'
                          : 'No demo cards match your filter'}
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Create a structured request card to get a crawler-readable{' '}
                        <code className="font-mono-num">/cards/:id</code> share link for your WhatsApp group.
                      </p>
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setActiveTab('create')}
                          className="px-3.5 py-2 rounded-xl bg-[#E04F33] text-white text-xs font-semibold cursor-pointer"
                        >
                          + Create Request Card
                        </button>
                        {(selectedCategory !== 'all' || searchQuery) && (
                          <button
                            onClick={() => {
                              setSelectedCategory('all');
                              setSearchQuery('');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-stone-100 text-xs font-semibold text-slate-800 cursor-pointer"
                          >
                            Reset Filters
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {filteredCards.map((card) => {
                        const isOwnedByBrowser = Boolean(vault.ownedCards[card.id]);
                        return (
                          <article
                            key={card.id}
                            className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-3.5 transition hover:border-slate-300"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                                    CATEGORY_META[card.category].badgeClass
                                  }`}
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
                                {isOwnedByBrowser && (
                                  <span className="text-[11px] font-mono-num bg-indigo-50 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded">
                                    Your Card (Key Saved)
                                  </span>
                                )}
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
                                <strong className="text-slate-900">
                                  {card.authorName}
                                </strong>{' '}
                                ({card.authorDepartment} • {card.authorYear})
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleReportCard(card)}
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
                                  Share URL
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
                                  disabled={card.spotsRemaining <= 0}
                                  onClick={() => setActiveJoinCard(card)}
                                  className="px-3.5 py-1.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 disabled:bg-stone-300 text-white text-xs font-semibold cursor-pointer"
                                >
                                  {card.spotsRemaining <= 0
                                    ? 'Filled'
                                    : 'Request Handshake'}
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                /* Events & Milestones Sub-Tab */
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-stone-100 border border-[#E6E2DC] text-xs text-slate-700">
                    {dataMode === 'shared_api'
                      ? 'Showing verified portal milestones from D1. External national portals are explicitly distinguished from official VGU sources.'
                      : 'Showing labelled Demo Sandbox events.'}
                  </div>

                  {activeEvents.map((evt) => {
                    const isBuddyJoined = buddyRsvpIds.includes(evt.id);
                    const isOfficialOrGovt =
                      evt.verificationSource === 'Official VGU Link' ||
                      evt.verificationSource === 'External Govt / Public Portal';
                    return (
                      <article
                        key={evt.id}
                        className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-900 border border-indigo-200">
                            {evt.category} • {evt.organizer}
                          </span>
                          <span
                            className={`text-[11px] font-mono-num px-2 py-0.5 rounded border ${
                              isOfficialOrGovt
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                : 'bg-amber-50 text-amber-900 border-amber-200'
                            }`}
                          >
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
                              {evt.lookingForBuddyCount} open to attending with a peer
                            </strong>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {evt.registrationUrl && (
                              <a
                                href={evt.registrationUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-slate-800 text-xs font-semibold"
                              >
                                Portal Link
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
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
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-200 pb-3">
                <div>
                  <h2 className="font-display font-bold text-lg text-slate-900">
                    Post a Structured Campus Request Card
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Public cards never expose phone numbers or emails. Your private coordination note is encrypted at rest (AES-256-GCM) and revealed only when you accept a handshake.
                  </p>
                </div>
                <span className="text-xs font-mono-num px-2.5 py-1 rounded-md bg-stone-100 text-slate-800">
                  Target: {dataMode === 'shared_api' ? 'Shared D1 Database' : 'Local Demo'}
                </span>
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
                      required
                      maxLength={80}
                      value={createWindow}
                      onChange={(e) => setCreateWindow(e.target.value)}
                      placeholder="e.g., Friday 4:15 PM or This Weekend"
                      className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">
                    Headline (10–120 characters, no phone numbers)
                  </span>
                  <input
                    type="text"
                    required
                    minLength={10}
                    maxLength={120}
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g., Need 1 UI Designer for SIH Internal Round"
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">
                    Public Description (15–400 characters, no phone numbers/emails)
                  </span>
                  <textarea
                    rows={3}
                    required
                    minLength={15}
                    maxLength={400}
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="Describe skills needed, study topic, or cab route..."
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
                      required
                      minLength={2}
                      maxLength={50}
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
                      required
                      minLength={2}
                      maxLength={60}
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
                        onChange={(e) =>
                          setCreateYear(e.target.value as AcademicYear)
                        }
                        className="flex-1 px-2.5 py-2 rounded-xl border border-stone-300 text-sm bg-white"
                      >
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                        <option value="PG / Research">PG / Research</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={20}
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
                      Preferred Coordination Channel
                    </span>
                    <select
                      value={createChannel}
                      onChange={(e) =>
                        setCreateChannel(e.target.value as HandshakeChannel)
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

                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-emerald-950 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-800" />
                      Private Coordination Note (AES-256-GCM Encrypted at Rest)
                    </span>
                    <input
                      type="text"
                      required
                      minLength={5}
                      maxLength={200}
                      value={createCoordinationNote}
                      onChange={(e) => setCreateCoordinationNote(e.target.value)}
                      placeholder="e.g., Meet at Central Library 2nd floor at 3:15 PM, or ping Telegram @myhandle"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 text-sm"
                    />
                  </label>
                  <p className="text-[11px] text-emerald-900">
                    Encrypted with AES-256-GCM before storage in D1. Decrypted and shown only to a student after you explicitly click <strong>Accept</strong> on their handshake request.
                  </p>
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
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-[#E04F33] hover:bg-[#c94127] disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    {isSubmitting
                      ? 'Encrypting & Publishing...'
                      : 'Publish Card & Save Owner Key'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* =========================================================
              TAB 5: CONNECT (SAFE HANDSHAKES & CAPABILITY KEYS)
             ========================================================= */}
          {activeTab === 'connect' && (
            <div className="space-y-6">
              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-stone-200 pb-3">
                  <div>
                    <h2 className="font-display font-bold text-base text-slate-900">
                      Authorized Connection Handshakes ({dataMode === 'shared_api' ? 'Shared D1' : 'Demo Sandbox'})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Authenticated via your browser's capability-token vault. Accepting an incoming request atomically claims 1 spot and reveals your decrypted coordination note.
                    </p>
                  </div>
                  <KeyRound className="w-5 h-5 text-emerald-700 shrink-0" />
                </div>

                {activeHandshakes.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-[#FAF8F5] border border-[#E6E2DC] space-y-2">
                    <p className="font-display font-bold text-sm text-slate-800">
                      No handshake requests for your browser keys yet
                    </p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      When you publish a card or request to join someone else's card, your browser saves an unguessable capability token so you can check responses here without creating an account.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeHandshakes.map((hs) => (
                      <div
                        key={hs.id}
                        className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E6E2DC] space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">
                            {hs.direction === 'incoming'
                              ? 'Incoming Request (On Your Card)'
                              : 'Sent Request (Your Application)'}{' '}
                            • <span className="text-slate-500">{hs.createdAtLabel}</span>
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

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-emerald-900 font-medium">
                            {hs.revealedContactNote}
                          </span>
                          {hs.direction === 'incoming' && (
                            <div className="flex items-center gap-2">
                              {hs.status !== 'declined' && (
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() =>
                                    handleHandshakeDecision(hs, 'declined')
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-stone-200 text-slate-700 text-xs font-semibold cursor-pointer"
                                >
                                  {hs.status === 'accepted'
                                    ? 'Cancel & Restore Spot'
                                    : 'Decline'}
                                </button>
                              )}
                              {hs.status !== 'accepted' && (
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() =>
                                    handleHandshakeDecision(hs, 'accepted')
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                                >
                                  Accept & Reveal Note
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-white rounded-2xl border border-[#E6E2DC] p-5 space-y-3">
                <h3 className="font-display font-bold text-sm text-slate-900">
                  Browser Capability Vault & Local Storage
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed font-mono-num">
                  Owned Card Keys: {Object.keys(vault.ownedCards).length} • Sent Handshake Keys:{' '}
                  {Object.keys(vault.sentHandshakes).length}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Security note: Clearing local data removes your browser's capability keys for previously published anonymous cards as well as local calculator/planner state.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    clearAllLocalPulseData();
                    window.location.reload();
                  }}
                  className="px-4 py-2 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold cursor-pointer"
                >
                  Clear Browser Vault & Reset Local State
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
                  minLength={2}
                  maxLength={50}
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="e.g., Vikram R."
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={joinDept}
                  onChange={(e) => setJoinDept(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
                <select
                  value={joinYear}
                  onChange={(e) => setJoinYear(e.target.value as AcademicYear)}
                  className="px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white"
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                  <option value="PG / Research">PG / Research</option>
                </select>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Short Intro Note (8–280 chars, no phone numbers/emails)
                </span>
                <textarea
                  rows={2}
                  required
                  minLength={8}
                  maxLength={280}
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
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-semibold cursor-pointer"
                >
                  {isSubmitting ? 'Sending...' : 'Send Handshake Request'}
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
