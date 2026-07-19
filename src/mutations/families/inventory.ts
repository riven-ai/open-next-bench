import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const inventoryTemplate = syntheticTemplate({
  familyId: "owned-inventory-admin-v1",
  name: "Owned Inventory Admin",
  description:
    "A Riven-authored warehouse console with stock tables, barcode lookup, audited adjustments, role checks, and low-stock alerts.",
  split: "validation",
  files: {
    "app/inventory/page.tsx": `import { listStock } from "../../lib/stock";
export default async function InventoryPage() { const rows = await listStock(); return <main><h1>Inventory</h1><table><caption>Warehouse stock</caption><thead><tr><th scope="col">SKU</th><th scope="col">Quantity</th></tr></thead><tbody>{rows.map((row) => <tr key={row.sku}><td>{row.sku}</td><td>{row.quantity}</td></tr>)}</tbody></table></main>; }
`,
    "components/barcode-form.tsx": `"use client";
export function BarcodeForm() { return <form><label htmlFor="barcode">Barcode</label><input id="barcode" inputMode="numeric" pattern="[0-9]{8,14}" required /><button type="submit">Find item</button></form>; }
`,
    "app/inventory/actions.ts": `"use server";
import { revalidatePath } from "next/cache"; import { requireManager } from "../../lib/session";
export async function adjustStock(sku: string, delta: number) {
  const manager = await requireManager(); if (!manager) throw new Error("forbidden");
  if (!/^[A-Z0-9-]{3,24}$/.test(sku)) throw new Error("invalid sku");
  if (!Number.isInteger(delta) || Math.abs(delta) > 1000) throw new Error("invalid delta");
  revalidatePath("/inventory");
}
`,
    "app/api/stock/[sku]/route.ts": `import { NextResponse } from "next/server";
export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) { const { sku } = await params; return NextResponse.json({ sku, quantity: 12 }); }
`,
    "lib/stock.ts": `export async function listStock() { const response = await fetch("https://fixture.invalid/stock", { cache: "no-store" }); if (!response.ok) throw new Error("stock unavailable"); return [{ sku: "RIV-1", quantity: 12 }]; }
export const isLowStock = (quantity: number, threshold: number) => quantity >= 0 && quantity <= threshold;
`,
    "lib/audit.ts": `export const auditAdjustment = (actorId: string, sku: string, delta: number) => ({ actorId, sku, delta, at: new Date(0).toISOString() });
`,
    "lib/session.ts": `export async function requireManager() { return { id: "manager-1" }; }
`,
  },
});

export const inventoryMutations = replacementMutations([
  {
    mutationId: "inventory-table-caption",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The stock table has lost its caption.",
    changedPath: "app/inventory/page.tsx",
    before: "<caption>Warehouse stock</caption>",
    after: "",
  },
  {
    mutationId: "inventory-column-scope",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "Inventory headers no longer identify columns.",
    changedPath: "app/inventory/page.tsx",
    before: '<th scope="col">SKU</th>',
    after: '<th scope="row">SKU</th>',
  },
  {
    mutationId: "inventory-row-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Stock rows use quantity as unstable identity.",
    changedPath: "app/inventory/page.tsx",
    before: "key={row.sku}",
    after: "key={row.quantity}",
  },
  {
    mutationId: "inventory-barcode-label",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The barcode label is disconnected.",
    changedPath: "components/barcode-form.tsx",
    before: 'htmlFor="barcode"',
    after: 'htmlFor="missing-barcode"',
  },
  {
    mutationId: "inventory-barcode-pattern",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "Malformed barcodes pass client validation.",
    changedPath: "components/barcode-form.tsx",
    before: ' pattern="[0-9]{8,14}"',
    after: "",
  },
  {
    mutationId: "inventory-manager-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Stock adjustments no longer require manager access.",
    changedPath: "app/inventory/actions.ts",
    before: ' if (!manager) throw new Error("forbidden");',
    after: "",
  },
  {
    mutationId: "inventory-sku-validation",
    category: "security",
    difficulty: "hard",
    issueStatement: "Stock adjustment accepts arbitrary SKU input.",
    changedPath: "app/inventory/actions.ts",
    before:
      '  if (!/^[A-Z0-9-]{3,24}$/.test(sku)) throw new Error("invalid sku");\n',
    after: "",
  },
  {
    mutationId: "inventory-delta-bound",
    category: "correctness",
    difficulty: "hard",
    issueStatement: "Unbounded stock deltas can corrupt inventory.",
    changedPath: "app/inventory/actions.ts",
    before:
      '  if (!Number.isInteger(delta) || Math.abs(delta) > 1000) throw new Error("invalid delta");\n',
    after: "",
  },
  {
    mutationId: "inventory-route-params",
    category: "nextjs",
    difficulty: "medium",
    issueStatement: "Stock lookup reads unresolved route params.",
    changedPath: "app/api/stock/[sku]/route.ts",
    before: "const { sku } = await params",
    after: "const { sku } = params",
  },
  {
    mutationId: "inventory-fetch-error",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "Warehouse service errors are ignored.",
    changedPath: "lib/stock.ts",
    before: 'if (!response.ok) throw new Error("stock unavailable");',
    after: "",
  },
]);
