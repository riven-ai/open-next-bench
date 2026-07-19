import type {
  MutationOperator,
  MutationOracleResult,
  TemplateFamily,
  Workspace,
} from "./contracts.js";
import { replaceExactlyOnce } from "./factory.js";

const contains = (
  workspace: Workspace,
  path: string,
  expected: string,
): MutationOracleResult => {
  const content = workspace[path];
  return content?.includes(expected) === true
    ? { passed: true, message: `${path} contains the required behavior` }
    : { passed: false, message: `${path} is missing the required behavior` };
};

const excludes = (
  workspace: Workspace,
  path: string,
  forbidden: string,
): MutationOracleResult => {
  const content = workspace[path];
  return content?.includes(forbidden) === false
    ? { passed: true, message: `${path} excludes the unsafe behavior` }
    : { passed: false, message: `${path} contains the unsafe behavior` };
};

export const ownedDashboardTemplate: TemplateFamily = {
  familyId: "owned-dashboard-app-router-v1",
  name: "Owned Dashboard App Router",
  licenseSpdx: "Apache-2.0",
  description:
    "A Riven-authored Next.js App Router dashboard fixture with auth, data, forms, images, and route handlers.",
  split: "train",
  files: {
    "package.json": JSON.stringify(
      {
        name: "owned-dashboard-app-router-v1",
        private: true,
        scripts: { test: "node tests/public-smoke.mjs" },
        dependencies: {
          next: "16.2.4",
          react: "19.2.0",
          "react-dom": "19.2.0",
        },
      },
      null,
      2,
    ),
    "app/page.tsx": `import Image from "next/image";
import { getProjects } from "../lib/projects";

export default async function DashboardPage() {
  const projects = await getProjects();
  return (
    <main>
      <h1>Riven projects</h1>
      <Image src="/riven-mark.svg" alt="Riven project workspace" width={64} height={64} />
      <button type="button" aria-label="Create project">+</button>
      <ul>{projects.map((project) => <li key={project.id}>{project.name}</li>)}</ul>
    </main>
  );
}
`,
    "app/projects/page.tsx": `import { getProjects } from "../../lib/projects";

export default async function ProjectsPage() {
  const projects = await getProjects();
  return <main>{projects.map((project) => <article key={project.id}>{project.name}</article>)}</main>;
}
`,
    "app/login/actions.ts": `"use server";
import { redirect } from "next/navigation";

export async function completeLogin() {
  redirect("/dashboard");
}
`,
    "app/api/profile/route.ts": `import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ userId: session.userId });
}
`,
    "components/project-form.tsx": `"use client";
import { useState } from "react";

export function ProjectForm() {
  const [name, setName] = useState("");
  return <form><label htmlFor="project-name">Project name</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} /></form>;
}
`,
    "components/stable-clock.tsx": `export function StableClock({ timestamp }: { timestamp: string }) {
  return <time dateTime={timestamp}>{timestamp}</time>;
}
`,
    "lib/auth.ts": `export async function requireSession(): Promise<{ userId: string } | null> {
  return { userId: "fixture-user" };
}
`,
    "lib/projects.ts": `export async function getProjects() {
  const response = await fetch("https://fixture.invalid/projects", { cache: "no-store" });
  if (!response.ok) throw new Error("projects request failed");
  return [{ id: "project-1", name: "Open Next Bench" }];
}
`,
    "lib/params.ts": `export async function projectSlug(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return slug;
}
`,
    "tests/public-smoke.mjs": `import assert from "node:assert/strict";
assert.equal(1 + 1, 2);
console.log("public smoke passed");
`,
  },
};

const mutation = (
  input: Omit<MutationOperator, "version">,
): MutationOperator => ({ ...input, version: "1.0.0" });

export const ownedDashboardMutations: readonly MutationOperator[] = [
  mutation({
    mutationId: "missing-image-alt",
    category: "accessibility",
    difficulty: "easy",
    issueStatement:
      "The dashboard brand image is no longer announced meaningfully to assistive technology.",
    changedPath: "app/page.tsx",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "app/page.tsx",
        'alt="Riven project workspace"',
        'alt=""',
      ),
    oracle: (workspace) =>
      contains(workspace, "app/page.tsx", 'alt="Riven project workspace"'),
  }),
  mutation({
    mutationId: "missing-button-name",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The icon-only create button has lost its accessible name.",
    changedPath: "app/page.tsx",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "app/page.tsx",
        ' aria-label="Create project"',
        "",
      ),
    oracle: (workspace) =>
      contains(workspace, "app/page.tsx", 'aria-label="Create project"'),
  }),
  mutation({
    mutationId: "unsafe-login-redirect",
    category: "security",
    difficulty: "medium",
    issueStatement:
      "Login completion can redirect to an attacker-controlled destination.",
    changedPath: "app/login/actions.ts",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "app/login/actions.ts",
        'redirect("/dashboard");',
        'redirect(formData.get("next") as string);',
      ),
    oracle: (workspace) =>
      excludes(workspace, "app/login/actions.ts", 'formData.get("next")'),
  }),
  mutation({
    mutationId: "profile-auth-bypass",
    category: "security",
    difficulty: "hard",
    issueStatement:
      "The profile route returns user data without enforcing an authenticated session.",
    changedPath: "app/api/profile/route.ts",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "app/api/profile/route.ts",
        '  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });\n',
        "",
      ),
    oracle: (workspace) =>
      contains(workspace, "app/api/profile/route.ts", "if (!session)"),
  }),
  mutation({
    mutationId: "stale-project-cache",
    category: "correctness",
    difficulty: "medium",
    issueStatement:
      "Project data remains stale after mutations because the fetch cache policy changed.",
    changedPath: "lib/projects.ts",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "lib/projects.ts",
        'cache: "no-store"',
        'cache: "force-cache"',
      ),
    oracle: (workspace) =>
      contains(workspace, "lib/projects.ts", 'cache: "no-store"'),
  }),
  mutation({
    mutationId: "swallowed-project-fetch-error",
    category: "correctness",
    difficulty: "medium",
    issueStatement:
      "Failed project requests are treated as successful responses.",
    changedPath: "lib/projects.ts",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "lib/projects.ts",
        '  if (!response.ok) throw new Error("projects request failed");\n',
        "",
      ),
    oracle: (workspace) =>
      contains(workspace, "lib/projects.ts", "if (!response.ok)"),
  }),
  mutation({
    mutationId: "route-params-not-awaited",
    category: "nextjs",
    difficulty: "medium",
    issueStatement:
      "The Next.js route helper reads asynchronous params without awaiting them.",
    changedPath: "lib/params.ts",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "lib/params.ts",
        "  const { slug } = await params;",
        "  const { slug } = params;",
      ),
    oracle: (workspace) => contains(workspace, "lib/params.ts", "await params"),
  }),
  mutation({
    mutationId: "hydration-unstable-clock",
    category: "react",
    difficulty: "hard",
    issueStatement:
      "The clock renders a different value between server rendering and hydration.",
    changedPath: "components/stable-clock.tsx",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "components/stable-clock.tsx",
        "{timestamp}</time>",
        "{Date.now()}</time>",
      ),
    oracle: (workspace) =>
      excludes(workspace, "components/stable-clock.tsx", "Date.now()"),
  }),
  mutation({
    mutationId: "form-label-disconnected",
    category: "accessibility",
    difficulty: "medium",
    issueStatement:
      "The project name label is no longer associated with its input.",
    changedPath: "components/project-form.tsx",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "components/project-form.tsx",
        'htmlFor="project-name"',
        'htmlFor="missing-project-name"',
      ),
    oracle: (workspace) =>
      contains(
        workspace,
        "components/project-form.tsx",
        'htmlFor="project-name"',
      ),
  }),
  mutation({
    mutationId: "duplicate-project-request",
    category: "performance",
    difficulty: "hard",
    issueStatement:
      "The projects page performs the same remote request twice in sequence.",
    changedPath: "app/projects/page.tsx",
    apply: (workspace) =>
      replaceExactlyOnce(
        workspace,
        "app/projects/page.tsx",
        "  const projects = await getProjects();",
        "  await getProjects();\n  const projects = await getProjects();",
      ),
    oracle: (workspace) =>
      excludes(
        workspace,
        "app/projects/page.tsx",
        "  await getProjects();\n  const projects",
      ),
  }),
];
