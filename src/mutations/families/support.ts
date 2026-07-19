import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const supportTemplate = syntheticTemplate({
  familyId: "owned-support-console-v1",
  name: "Owned Support Console",
  description:
    "A Riven-authored support console with ticket queues, assignment actions, tenant-scoped APIs, reply forms, status transitions, and SLA calculations.",
  split: "train",
  files: {
    "app/tickets/page.tsx": `import { listTickets } from "../../lib/tickets";
export default async function TicketQueue() {
  const tickets = await listTickets();
  return <main><h1>Support queue</h1><table><thead><tr><th scope="col">Subject</th><th scope="col">Status</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td>{ticket.subject}</td><td>{ticket.status}</td></tr>)}</tbody></table></main>;
}
`,
    "components/reply-form.tsx": `"use client";
import { useState } from "react";
export function ReplyForm() {
  const [reply, setReply] = useState("");
  return <form><label htmlFor="ticket-reply">Reply</label><textarea id="ticket-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={4000} /><button type="submit" disabled={reply.trim().length === 0}>Send reply</button></form>;
}
`,
    "app/tickets/actions.ts": `"use server";
import { revalidatePath } from "next/cache";
import { requireAgent } from "../../lib/session";
export async function assignTicket(ticketId: string) {
  const agent = await requireAgent();
  if (!agent) throw new Error("unauthorized");
  if (!/^ticket-[a-z0-9]+$/.test(ticketId)) throw new Error("invalid ticket");
  revalidatePath("/tickets");
}
`,
    "app/api/tickets/[id]/route.ts": `import { NextResponse } from "next/server";
import { requireTenant } from "../../../../../lib/session";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ id, tenantId: tenant.id });
}
`,
    "lib/tickets.ts": `export async function listTickets() {
  const response = await fetch("https://fixture.invalid/tickets", { cache: "no-store" });
  if (!response.ok) throw new Error("ticket service unavailable");
  return [{ id: "ticket-a1", subject: "Cannot sign in", status: "open" }];
}
export function transitionStatus(current: string, next: string) {
  const allowed = current === "open" && (next === "pending" || next === "closed");
  if (!allowed) throw new Error("invalid transition");
  return next;
}
`,
    "lib/sla.ts": `export const remainingMinutes = (deadline: string, now: string) => Math.max(0, Math.floor((Date.parse(deadline) - Date.parse(now)) / 60000));
`,
    "lib/session.ts": `export async function requireAgent() { return { id: "agent-1" }; }
export async function requireTenant() { return { id: "tenant-1" }; }
`,
  },
});

export const supportMutations = replacementMutations([
  {
    mutationId: "support-table-header",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "Ticket table headers have lost column semantics.",
    changedPath: "app/tickets/page.tsx",
    before: '<th scope="col">Subject</th>',
    after: '<th scope="row">Subject</th>',
  },
  {
    mutationId: "support-ticket-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Ticket rows no longer use stable ticket identity.",
    changedPath: "app/tickets/page.tsx",
    before: "key={ticket.id}",
    after: "key={ticket.subject}",
  },
  {
    mutationId: "support-reply-label",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The reply label is disconnected from its textarea.",
    changedPath: "components/reply-form.tsx",
    before: 'htmlFor="ticket-reply"',
    after: 'htmlFor="missing-reply"',
  },
  {
    mutationId: "support-reply-bound",
    category: "security",
    difficulty: "medium",
    issueStatement: "Ticket replies are no longer length limited.",
    changedPath: "components/reply-form.tsx",
    before: " maxLength={4000}",
    after: "",
  },
  {
    mutationId: "support-empty-reply",
    category: "correctness",
    difficulty: "easy",
    issueStatement: "Empty ticket replies can now be submitted.",
    changedPath: "components/reply-form.tsx",
    before: " disabled={reply.trim().length === 0}",
    after: "",
  },
  {
    mutationId: "support-assignment-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Ticket assignment no longer requires a support agent.",
    changedPath: "app/tickets/actions.ts",
    before: '  if (!agent) throw new Error("unauthorized");\n',
    after: "",
  },
  {
    mutationId: "support-ticket-id-validation",
    category: "security",
    difficulty: "hard",
    issueStatement: "Assignment accepts unvalidated ticket identifiers.",
    changedPath: "app/tickets/actions.ts",
    before:
      '  if (!/^ticket-[a-z0-9]+$/.test(ticketId)) throw new Error("invalid ticket");\n',
    after: "",
  },
  {
    mutationId: "support-route-params",
    category: "nextjs",
    difficulty: "medium",
    issueStatement: "The ticket route reads asynchronous params synchronously.",
    changedPath: "app/api/tickets/[id]/route.ts",
    before: "const { id } = await params",
    after: "const { id } = params",
  },
  {
    mutationId: "support-ticket-fetch-error",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "Ticket service failures are ignored.",
    changedPath: "lib/tickets.ts",
    before:
      '  if (!response.ok) throw new Error("ticket service unavailable");\n',
    after: "",
  },
  {
    mutationId: "support-invalid-transition",
    category: "correctness",
    difficulty: "hard",
    issueStatement: "Tickets can transition through invalid workflow states.",
    changedPath: "lib/tickets.ts",
    before: '  if (!allowed) throw new Error("invalid transition");',
    after: "  return next;",
  },
]);
