import { CampusEvent, PulseCard } from '../types/domain';

export function buildCardSharePayload(
  card: PulseCard,
  baseUrl = 'http://localhost:5173'
) {
  const cleanOrigin = baseUrl.replace(/\/$/, '');
  const url = `${cleanOrigin}/cards/${encodeURIComponent(card.id)}`;
  const text = [
    `⚡ [VGU Pulse] ${card.title}`,
    `📍 Category: ${card.category.toUpperCase()} • ${card.spotsRemaining}/${card.spotsTotal} spots open`,
    `🕒 When: ${card.timeWindow}`,
    `👤 Posted by: ${card.authorName} (${card.authorDepartment}, ${card.authorYear})`,
    `🔗 View & request handshake: ${url}`,
  ].join('\n');

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  return { url, text, whatsappUrl };
}

export function buildEventSharePayload(
  event: CampusEvent,
  baseUrl = 'http://localhost:5173'
) {
  const cleanOrigin = baseUrl.replace(/\/$/, '');
  const url = `${cleanOrigin}/events/${encodeURIComponent(event.id)}`;
  const text = [
    `📅 [VGU Campus Event] ${event.title}`,
    `🏛️ Hosted by: ${event.organizer} • Venue: ${event.venue}`,
    `🕒 ${event.dateLabel} at ${event.timeLabel}`,
    `🤝 ${event.lookingForBuddyCount} students open to attending with a peer`,
    `🔗 Event details: ${url}`,
  ].join('\n');

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  return { url, text, whatsappUrl };
}

export function buildGoogleCalendarUrl(event: CampusEvent): string {
  const title = encodeURIComponent(`[VGU] ${event.title}`);
  const details = encodeURIComponent(
    `Organized by ${event.organizer}. Venue: ${event.venue}. Shared via VGU Pulse.`
  );
  const location = encodeURIComponent(
    `${event.venue}, VGU Campus, Jagatpura, Jaipur`
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
}
