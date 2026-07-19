import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const communityTemplate = syntheticTemplate({
  familyId: "owned-community-feed-v1",
  name: "Owned Community Feed",
  description:
    "A Riven-authored community application with paginated posts, reactions, moderation, profile privacy, and user-generated content safety.",
  split: "public_test",
  files: {
    "app/community/page.tsx": `import { listPosts } from "../../lib/posts";
export default async function CommunityPage() { const posts = await listPosts(); return <main><h1>Community</h1><section aria-label="Recent posts">{posts.map((post) => <article key={post.id}><h2>{post.title}</h2><p>{post.body}</p></article>)}</section></main>; }
`,
    "components/reaction-button.tsx": `"use client";
import { useState } from "react"; export function ReactionButton() { const [count, setCount] = useState(0); return <button type="button" aria-label="Like post" aria-pressed={count > 0} onClick={() => setCount((value) => value + 1)}>Like {count}</button>; }
`,
    "app/posts/actions.ts": `"use server";
import { revalidatePath } from "next/cache"; import { requireMember } from "../../lib/session";
export async function createPost(title: string, body: string) { const member = await requireMember(); if (!member) throw new Error("unauthorized"); if (title.trim().length < 3 || body.length > 10000) throw new Error("invalid post"); revalidatePath("/community"); }
`,
    "app/api/moderation/[postId]/route.ts": `import { NextResponse } from "next/server"; import { requireModerator } from "../../../../../lib/session";
export async function DELETE(_request: Request, { params }: { params: Promise<{ postId: string }> }) { const moderator = await requireModerator(); if (!moderator) return NextResponse.json({ error: "forbidden" }, { status: 403 }); const { postId } = await params; return NextResponse.json({ postId, removed: true }); }
`,
    "lib/posts.ts": `export async function listPosts() { const response = await fetch("https://fixture.invalid/posts", { next: { revalidate: 30 } }); if (!response.ok) throw new Error("feed unavailable"); return [{ id: "post-1", title: "Hello", body: "Welcome" }]; }
`,
    "lib/content.ts": `export const safePostBody = (body: string) => body.replaceAll(/<[^>]+>/g, "").slice(0, 10000);
`,
    "lib/session.ts": `export async function requireMember() { return { id: "member-1" }; } export async function requireModerator() { return { id: "moderator-1" }; }
`,
  },
});

export const communityMutations = replacementMutations([
  {
    mutationId: "community-section-label",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The recent posts region has lost its label.",
    changedPath: "app/community/page.tsx",
    before: ' aria-label="Recent posts"',
    after: "",
  },
  {
    mutationId: "community-post-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Posts use mutable titles as list identity.",
    changedPath: "app/community/page.tsx",
    before: "key={post.id}",
    after: "key={post.title}",
  },
  {
    mutationId: "community-reaction-name",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The reaction control has lost its accessible name.",
    changedPath: "components/reaction-button.tsx",
    before: ' aria-label="Like post"',
    after: "",
  },
  {
    mutationId: "community-reaction-state",
    category: "accessibility",
    difficulty: "medium",
    issueStatement:
      "Reaction state is no longer exposed to assistive technology.",
    changedPath: "components/reaction-button.tsx",
    before: " aria-pressed={count > 0}",
    after: "",
  },
  {
    mutationId: "community-create-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Anonymous callers can create community posts.",
    changedPath: "app/posts/actions.ts",
    before: ' if (!member) throw new Error("unauthorized");',
    after: "",
  },
  {
    mutationId: "community-post-bounds",
    category: "security",
    difficulty: "medium",
    issueStatement: "Post content is accepted without size validation.",
    changedPath: "app/posts/actions.ts",
    before:
      ' if (title.trim().length < 3 || body.length > 10000) throw new Error("invalid post");',
    after: "",
  },
  {
    mutationId: "community-stale-feed",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "New posts do not refresh the community feed.",
    changedPath: "app/posts/actions.ts",
    before: ' revalidatePath("/community");',
    after: "",
  },
  {
    mutationId: "community-moderator-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Posts can be removed without moderator access.",
    changedPath: "app/api/moderation/[postId]/route.ts",
    before:
      ' if (!moderator) return NextResponse.json({ error: "forbidden" }, { status: 403 });',
    after: "",
  },
  {
    mutationId: "community-route-params",
    category: "nextjs",
    difficulty: "medium",
    issueStatement: "Moderation reads unresolved post params.",
    changedPath: "app/api/moderation/[postId]/route.ts",
    before: "const { postId } = await params",
    after: "const { postId } = params",
  },
  {
    mutationId: "community-content-sanitize",
    category: "security",
    difficulty: "hard",
    issueStatement: "User post markup is returned without sanitization.",
    changedPath: "lib/content.ts",
    before: 'body.replaceAll(/<[^>]+>/g, "").slice(0, 10000)',
    after: "body",
  },
]);
