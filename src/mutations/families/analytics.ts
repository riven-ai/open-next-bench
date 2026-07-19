import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const analyticsTemplate = syntheticTemplate({
  familyId: "owned-analytics-studio-v1",
  name: "Owned Analytics Studio",
  description:
    "A Riven-authored analytics workspace with metric cards, accessible charts, date filters, scoped query APIs, CSV export, and cache-aware aggregation.",
  split: "train",
  files: {
    "app/analytics/page.tsx": `import { loadMetrics } from "../../lib/metrics";
import { MetricChart } from "../../components/metric-chart";
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range = "7d" } = await searchParams;
  const metrics = await loadMetrics(range);
  return <main><h1>Analytics</h1><MetricChart points={metrics.points} /><dl>{metrics.totals.map((metric) => <div key={metric.name}><dt>{metric.name}</dt><dd>{metric.value}</dd></div>)}</dl></main>;
}
`,
    "components/metric-chart.tsx": `export function MetricChart({ points }: { points: number[] }) {
  return <figure><svg role="img" aria-labelledby="chart-title chart-description"><title id="chart-title">Weekly active users</title><desc id="chart-description">Seven daily active-user values</desc><path d={\`M \${points.join(" ")}\`} /></svg></figure>;
}
`,
    "components/range-filter.tsx": `"use client";
export function RangeFilter() {
  return <fieldset><legend>Date range</legend><label><input type="radio" name="range" value="7d" defaultChecked />Last 7 days</label><label><input type="radio" name="range" value="30d" />Last 30 days</label></fieldset>;
}
`,
    "app/api/query/route.ts": `import { NextResponse } from "next/server";
import { requireAnalyst } from "../../../lib/session";
export async function POST(request: Request) {
  const analyst = await requireAnalyst();
  if (!analyst) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json();
  if (!Array.isArray(body.dimensions) || body.dimensions.length > 5) return NextResponse.json({ error: "invalid query" }, { status: 400 });
  return NextResponse.json({ rows: [], analystId: analyst.id });
}
`,
    "lib/metrics.ts": `const allowedRanges = new Set(["7d", "30d", "90d"]);
export async function loadMetrics(range: string) {
  if (!allowedRanges.has(range)) throw new Error("invalid range");
  const response = await fetch(\`https://fixture.invalid/metrics?range=\${encodeURIComponent(range)}\`, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error("metrics unavailable");
  return { points: [1, 2, 3], totals: [{ name: "Users", value: 3 }] };
}
`,
    "lib/csv.ts": `export const csvCell = (value: string) => {
  const safe = /^[=+@-]/.test(value) ? \`'\${value}\` : value;
  return \`"\${safe.replaceAll('"', '""')}"\`;
};
`,
    "lib/session.ts": `export async function requireAnalyst() { return { id: "analyst-1" }; }
`,
  },
});

export const analyticsMutations = replacementMutations([
  {
    mutationId: "analytics-searchparams",
    category: "nextjs",
    difficulty: "medium",
    issueStatement: "Analytics filters read unresolved search parameters.",
    changedPath: "app/analytics/page.tsx",
    before: 'const { range = "7d" } = await searchParams',
    after: 'const { range = "7d" } = searchParams',
  },
  {
    mutationId: "analytics-metric-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Metric cards use changing values as identity.",
    changedPath: "app/analytics/page.tsx",
    before: "key={metric.name}",
    after: "key={metric.value}",
  },
  {
    mutationId: "analytics-chart-role",
    category: "accessibility",
    difficulty: "easy",
    issueStatement:
      "The metric visualization no longer exposes image semantics.",
    changedPath: "components/metric-chart.tsx",
    before: ' role="img"',
    after: "",
  },
  {
    mutationId: "analytics-chart-description",
    category: "accessibility",
    difficulty: "medium",
    issueStatement: "The chart no longer references its detailed description.",
    changedPath: "components/metric-chart.tsx",
    before: 'aria-labelledby="chart-title chart-description"',
    after: 'aria-labelledby="chart-title"',
  },
  {
    mutationId: "analytics-filter-legend",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "Date range radio controls have lost their group label.",
    changedPath: "components/range-filter.tsx",
    before: "<legend>Date range</legend>",
    after: "",
  },
  {
    mutationId: "analytics-query-auth",
    category: "security",
    difficulty: "hard",
    issueStatement:
      "Arbitrary analytics queries no longer require analyst authorization.",
    changedPath: "app/api/query/route.ts",
    before:
      '  if (!analyst) return NextResponse.json({ error: "unauthorized" }, { status: 401 });\n',
    after: "",
  },
  {
    mutationId: "analytics-dimension-limit",
    category: "security",
    difficulty: "hard",
    issueStatement: "Analytics queries can request an unbounded dimension set.",
    changedPath: "app/api/query/route.ts",
    before: " || body.dimensions.length > 5",
    after: "",
  },
  {
    mutationId: "analytics-range-allowlist",
    category: "security",
    difficulty: "medium",
    issueStatement:
      "Metric range values are interpolated without an allowlist.",
    changedPath: "lib/metrics.ts",
    before:
      '  if (!allowedRanges.has(range)) throw new Error("invalid range");\n',
    after: "",
  },
  {
    mutationId: "analytics-fetch-error",
    category: "correctness",
    difficulty: "medium",
    issueStatement:
      "Metrics service failures are mistaken for empty successful responses.",
    changedPath: "lib/metrics.ts",
    before: '  if (!response.ok) throw new Error("metrics unavailable");\n',
    after: "",
  },
  {
    mutationId: "analytics-csv-injection",
    category: "security",
    difficulty: "hard",
    issueStatement: "CSV exports no longer neutralize spreadsheet formulas.",
    changedPath: "lib/csv.ts",
    before: "const safe = /^[=+@-]/.test(value) ? `'${value}` : value",
    after: "const safe = value",
  },
]);
