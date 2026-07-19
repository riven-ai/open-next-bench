import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const eventsTemplate = syntheticTemplate({
  familyId: "owned-event-booking-v1",
  name: "Owned Event Booking",
  description:
    "A Riven-authored event booking application with schedules, capacity-safe reservations, attendee forms, timezone formatting, and organizer-only cancellation.",
  split: "train",
  files: {
    "app/events/page.tsx": `import { listEvents } from "../../lib/events";
export default async function EventsPage() {
  const events = await listEvents();
  return <main><h1>Upcoming events</h1><ol>{events.map((event) => <li key={event.id}><h2>{event.title}</h2><time dateTime={event.startsAt}>{event.displayTime}</time></li>)}</ol></main>;
}
`,
    "components/booking-form.tsx": `"use client";
import { useState } from "react";
export function BookingForm() {
  const [email, setEmail] = useState("");
  return <form><label htmlFor="attendee-email">Attendee email</label><input id="attendee-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /><button type="submit" disabled={!email.includes("@")}>Reserve seat</button></form>;
}
`,
    "app/events/actions.ts": `"use server";
import { revalidatePath } from "next/cache";
import { reserveSeat } from "../../lib/events";
export async function bookEvent(eventId: string, email: string) {
  if (!/^[^@]+@[^@]+$/.test(email)) throw new Error("invalid email");
  await reserveSeat(eventId, email);
  revalidatePath("/events");
}
`,
    "app/api/events/[id]/cancel/route.ts": `import { NextResponse } from "next/server";
import { requireOrganizer } from "../../../../../../lib/session";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const organizer = await requireOrganizer();
  if (!organizer) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json({ id, cancelled: true });
}
`,
    "lib/events.ts": `let remainingSeats = 8;
export async function listEvents() {
  const response = await fetch("https://fixture.invalid/events", { cache: "no-store" });
  if (!response.ok) throw new Error("events unavailable");
  return [{ id: "event-1", title: "Riven workshop", startsAt: "2026-08-01T10:00:00Z", displayTime: "10:00 UTC" }];
}
export async function reserveSeat(_eventId: string, _email: string) {
  if (remainingSeats <= 0) throw new Error("sold out");
  remainingSeats -= 1;
}
`,
    "lib/time.ts": `export const displayEventTime = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
`,
    "lib/session.ts": `export async function requireOrganizer() { return { id: "organizer-1" }; }
`,
  },
});

export const eventsMutations = replacementMutations([
  {
    mutationId: "events-list-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Event list identity is based on a mutable title.",
    changedPath: "app/events/page.tsx",
    before: "key={event.id}",
    after: "key={event.title}",
  },
  {
    mutationId: "events-time-machine-value",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "Event times no longer expose a machine-readable datetime.",
    changedPath: "app/events/page.tsx",
    before: " dateTime={event.startsAt}",
    after: "",
  },
  {
    mutationId: "events-email-label",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The attendee email label is disconnected.",
    changedPath: "components/booking-form.tsx",
    before: 'htmlFor="attendee-email"',
    after: 'htmlFor="missing-email"',
  },
  {
    mutationId: "events-email-required",
    category: "correctness",
    difficulty: "easy",
    issueStatement: "The booking form accepts a missing attendee email.",
    changedPath: "components/booking-form.tsx",
    before: " required",
    after: "",
  },
  {
    mutationId: "events-email-server-validation",
    category: "security",
    difficulty: "medium",
    issueStatement: "Booking actions trust unvalidated email input.",
    changedPath: "app/events/actions.ts",
    before:
      '  if (!/^[^@]+@[^@]+$/.test(email)) throw new Error("invalid email");\n',
    after: "",
  },
  {
    mutationId: "events-stale-booking",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "New reservations do not refresh event availability.",
    changedPath: "app/events/actions.ts",
    before: '  revalidatePath("/events");',
    after: "  // availability cache remains stale",
  },
  {
    mutationId: "events-cancel-auth",
    category: "security",
    difficulty: "hard",
    issueStatement:
      "Anyone can cancel an event without organizer authorization.",
    changedPath: "app/api/events/[id]/cancel/route.ts",
    before:
      '  if (!organizer) return NextResponse.json({ error: "forbidden" }, { status: 403 });\n',
    after: "",
  },
  {
    mutationId: "events-cancel-params",
    category: "nextjs",
    difficulty: "medium",
    issueStatement:
      "Cancellation reads asynchronous route params synchronously.",
    changedPath: "app/api/events/[id]/cancel/route.ts",
    before: "const { id } = await params",
    after: "const { id } = params",
  },
  {
    mutationId: "events-fetch-error",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "Event service failures are ignored.",
    changedPath: "lib/events.ts",
    before: '  if (!response.ok) throw new Error("events unavailable");\n',
    after: "",
  },
  {
    mutationId: "events-capacity-check",
    category: "correctness",
    difficulty: "hard",
    issueStatement: "Reservations can overbook sold-out events.",
    changedPath: "lib/events.ts",
    before: '  if (remainingSeats <= 0) throw new Error("sold out");\n',
    after: "",
  },
]);
