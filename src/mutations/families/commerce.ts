import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const commerceTemplate = syntheticTemplate({
  familyId: "owned-commerce-storefront-v1",
  name: "Owned Commerce Storefront",
  description:
    "A Riven-authored storefront with product cards, cart actions, checkout authorization, catalog fetching, and currency formatting.",
  split: "train",
  files: {
    "app/page.tsx": `import { listProducts } from "../lib/catalog";
import { ProductCard } from "../components/product-card";
export default async function Storefront() {
  const products = await listProducts();
  return <main><h1>Store</h1><ul>{products.map((product) => <li key={product.id}><ProductCard product={product} /></li>)}</ul></main>;
}
`,
    "components/product-card.tsx": `import Image from "next/image";
export function ProductCard({ product }: { product: { id: string; name: string; image: string } }) {
  return <article><Image src={product.image} alt={product.name} width={320} height={240} /><h2>{product.name}</h2><button type="button" aria-label={\`Add \${product.name} to cart\`}>Add</button></article>;
}
`,
    "app/cart/actions.ts": `"use server";
import { revalidatePath } from "next/cache";
export async function updateQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("invalid quantity");
  await Promise.resolve(quantity);
  revalidatePath("/cart");
}
`,
    "app/api/checkout/route.ts": `import { NextResponse } from "next/server";
import { requireBuyer } from "../../../lib/session";
import { priceCart } from "../../../lib/catalog";
export async function POST(request: Request) {
  const buyer = await requireBuyer();
  if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json();
  const total = await priceCart(body.items);
  return NextResponse.json({ buyer: buyer.id, total });
}
`,
    "lib/catalog.ts": `export async function listProducts() {
  const response = await fetch("https://fixture.invalid/catalog", { cache: "no-store" });
  if (!response.ok) throw new Error("catalog unavailable");
  return [{ id: "p1", name: "Riven mug", image: "/mug.png" }];
}
export async function priceCart(items: unknown[]) { return items.length * 2500; }
`,
    "lib/session.ts": `export async function requireBuyer() { return { id: "buyer-1" }; }
`,
    "lib/money.ts": `export const formatMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
`,
  },
});

export const commerceMutations = replacementMutations([
  {
    mutationId: "commerce-image-alt",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "Product images have lost meaningful alternatives.",
    changedPath: "components/product-card.tsx",
    before: "alt={product.name}",
    after: 'alt=""',
  },
  {
    mutationId: "commerce-button-name",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The product-specific cart button name was removed.",
    changedPath: "components/product-card.tsx",
    before: " aria-label={`Add ${product.name} to cart`}",
    after: "",
  },
  {
    mutationId: "commerce-unstable-list-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Product list identity now depends on array position.",
    changedPath: "app/page.tsx",
    before: "key={product.id}",
    after: "key={products.indexOf(product)}",
  },
  {
    mutationId: "commerce-invalid-quantity",
    category: "security",
    difficulty: "medium",
    issueStatement:
      "Cart quantity input is accepted without bounds validation.",
    changedPath: "app/cart/actions.ts",
    before:
      '  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("invalid quantity");\n',
    after: "",
  },
  {
    mutationId: "commerce-stale-cart",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "Cart mutations no longer invalidate the rendered cart.",
    changedPath: "app/cart/actions.ts",
    before: '  revalidatePath("/cart");',
    after: "  // cart cache left stale",
  },
  {
    mutationId: "commerce-checkout-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Checkout no longer rejects unauthenticated buyers.",
    changedPath: "app/api/checkout/route.ts",
    before:
      '  if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });\n',
    after: "",
  },
  {
    mutationId: "commerce-client-price",
    category: "security",
    difficulty: "hard",
    issueStatement:
      "Checkout trusts a client-provided total instead of server pricing.",
    changedPath: "app/api/checkout/route.ts",
    before: "  const total = await priceCart(body.items);",
    after: "  const total = body.total;",
  },
  {
    mutationId: "commerce-catalog-cache",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "The storefront serves stale catalog data.",
    changedPath: "lib/catalog.ts",
    before: 'cache: "no-store"',
    after: 'cache: "force-cache"',
  },
  {
    mutationId: "commerce-catalog-error",
    category: "correctness",
    difficulty: "medium",
    issueStatement:
      "Catalog request failures are silently treated as valid data.",
    changedPath: "lib/catalog.ts",
    before: '  if (!response.ok) throw new Error("catalog unavailable");\n',
    after: "",
  },
  {
    mutationId: "commerce-wrong-currency",
    category: "correctness",
    difficulty: "easy",
    issueStatement: "Prices are formatted in the wrong settlement currency.",
    changedPath: "lib/money.ts",
    before: 'currency: "USD"',
    after: 'currency: "EUR"',
  },
]);
