import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const docsTemplate = syntheticTemplate({
  familyId: "owned-docs-portal-v1",
  name: "Owned Documentation Portal",
  description:
    "A Riven-authored documentation portal with dynamic articles, full-text search, draft protection, table-of-contents links, and safe markup rendering.",
  split: "train",
  files: {
    "app/docs/[slug]/page.tsx": `import { loadArticle } from "../../../lib/articles";
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  return <main><h1>{article.title}</h1><article>{article.body}</article></main>;
}
`,
    "app/search/page.tsx": `import { searchDocs } from "../../lib/search";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const results = await searchDocs(q);
  return <main><label htmlFor="docs-query">Search documentation</label><input id="docs-query" defaultValue={q} /><ul>{results.map((item) => <li key={item.slug}>{item.title}</li>)}</ul></main>;
}
`,
    "app/api/drafts/[slug]/route.ts": `import { NextResponse } from "next/server";
import { requireEditor } from "../../../../../lib/session";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const editor = await requireEditor();
  if (!editor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { slug } = await params;
  return NextResponse.json({ slug, draft: true });
}
`,
    "components/toc.tsx": `export function Toc({ headings }: { headings: { id: string; label: string }[] }) {
  return <nav aria-label="On this page"><ul>{headings.map((heading) => <li key={heading.id}><a href={\`#\${heading.id}\`}>{heading.label}</a></li>)}</ul></nav>;
}
`,
    "lib/articles.ts": `export async function loadArticle(slug: string) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("invalid slug");
  const response = await fetch(\`https://fixture.invalid/docs/\${slug}\`, { cache: "force-cache" });
  if (!response.ok) throw new Error("article unavailable");
  return { title: slug, body: "Safe documentation" };
}
`,
    "lib/search.ts": `export async function searchDocs(query: string) {
  const normalized = query.trim().slice(0, 100);
  if (normalized.length < 2) return [];
  return [{ slug: "getting-started", title: \`Result for \${normalized}\` }];
}
`,
    "lib/sanitize.ts": `export const sanitizeMarkup = (html: string) => html.replaceAll(/<script[^>]*>.*?<\\/script>/gis, "");
`,
    "lib/session.ts": `export async function requireEditor() { return { id: "editor-1" }; }
`,
  },
});

export const docsMutations = replacementMutations([
  {
    mutationId: "docs-params-not-awaited",
    category: "nextjs",
    difficulty: "medium",
    issueStatement: "Dynamic article parameters are read before resolving.",
    changedPath: "app/docs/[slug]/page.tsx",
    before: "const { slug } = await params",
    after: "const { slug } = params",
  },
  {
    mutationId: "docs-searchparams-not-awaited",
    category: "nextjs",
    difficulty: "medium",
    issueStatement: "Search parameters are treated as a synchronous value.",
    changedPath: "app/search/page.tsx",
    before: 'const { q = "" } = await searchParams',
    after: 'const { q = "" } = searchParams',
  },
  {
    mutationId: "docs-search-label",
    category: "accessibility",
    difficulty: "easy",
    issueStatement:
      "The documentation search label points to a missing control.",
    changedPath: "app/search/page.tsx",
    before: 'htmlFor="docs-query"',
    after: 'htmlFor="missing-query"',
  },
  {
    mutationId: "docs-result-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Search result identity is no longer stable.",
    changedPath: "app/search/page.tsx",
    before: "key={item.slug}",
    after: "key={item.title}",
  },
  {
    mutationId: "docs-draft-auth",
    category: "security",
    difficulty: "hard",
    issueStatement:
      "Draft documentation can be fetched without editor authorization.",
    changedPath: "app/api/drafts/[slug]/route.ts",
    before:
      '  if (!editor) return NextResponse.json({ error: "forbidden" }, { status: 403 });\n',
    after: "",
  },
  {
    mutationId: "docs-toc-label",
    category: "accessibility",
    difficulty: "easy",
    issueStatement:
      "The article table of contents has lost its navigation label.",
    changedPath: "components/toc.tsx",
    before: ' aria-label="On this page"',
    after: "",
  },
  {
    mutationId: "docs-slug-validation",
    category: "security",
    difficulty: "hard",
    issueStatement: "Article slugs are interpolated without validation.",
    changedPath: "lib/articles.ts",
    before:
      '  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("invalid slug");\n',
    after: "",
  },
  {
    mutationId: "docs-article-error",
    category: "correctness",
    difficulty: "medium",
    issueStatement:
      "Missing documentation pages are returned as valid articles.",
    changedPath: "lib/articles.ts",
    before: '  if (!response.ok) throw new Error("article unavailable");\n',
    after: "",
  },
  {
    mutationId: "docs-query-bound",
    category: "security",
    difficulty: "medium",
    issueStatement: "Search queries are no longer length bounded.",
    changedPath: "lib/search.ts",
    before: ".trim().slice(0, 100)",
    after: ".trim()",
  },
  {
    mutationId: "docs-script-sanitizer",
    category: "security",
    difficulty: "hard",
    issueStatement: "Rendered documentation markup no longer removes scripts.",
    changedPath: "lib/sanitize.ts",
    before: 'html.replaceAll(/<script[^>]*>.*?<\\/script>/gis, "")',
    after: "html",
  },
]);
