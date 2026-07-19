import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const mediaTemplate = syntheticTemplate({
  familyId: "owned-media-library-v1",
  name: "Owned Media Library",
  description:
    "A Riven-authored media manager with responsive galleries, upload validation, signed downloads, deletion authorization, and metadata editing.",
  split: "public_test",
  files: {
    "app/media/page.tsx": `import Image from "next/image"; import { listAssets } from "../../lib/assets";
export default async function MediaPage() { const assets = await listAssets(); return <main><h1>Media library</h1><ul>{assets.map((asset) => <li key={asset.id}><Image src={asset.url} alt={asset.alt} width={240} height={160} /><span>{asset.name}</span></li>)}</ul></main>; }
`,
    "components/upload-form.tsx": `"use client";
export function UploadForm() { return <form><label htmlFor="asset-file">Choose image</label><input id="asset-file" type="file" accept="image/png,image/jpeg,image/webp" required /><label htmlFor="asset-alt">Alternative text</label><input id="asset-alt" maxLength={200} required /><button type="submit">Upload</button></form>; }
`,
    "app/media/actions.ts": `"use server";
import { revalidatePath } from "next/cache"; import { requireOwner } from "../../lib/session";
export async function deleteAsset(assetId: string) { const owner = await requireOwner(); if (!owner) throw new Error("forbidden"); if (!/^asset-[a-z0-9]+$/.test(assetId)) throw new Error("invalid asset"); revalidatePath("/media"); }
`,
    "app/api/media/[assetId]/download/route.ts": `import { NextResponse } from "next/server"; import { requireViewer } from "../../../../../../lib/session";
export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) { const viewer = await requireViewer(); if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); const { assetId } = await params; return NextResponse.json({ assetId, expiresIn: 60 }); }
`,
    "lib/assets.ts": `export async function listAssets() { const response = await fetch("https://fixture.invalid/assets", { cache: "no-store" }); if (!response.ok) throw new Error("assets unavailable"); return [{ id: "asset-1", name: "Diagram", alt: "Architecture diagram", url: "/diagram.png" }]; }
export const allowedUpload = (type: string, bytes: number) => ["image/png", "image/jpeg", "image/webp"].includes(type) && bytes <= 10_000_000;
`,
    "lib/filename.ts": `export const safeFilename = (name: string) => name.normalize("NFKC").replaceAll(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
`,
    "lib/session.ts": `export async function requireOwner() { return { id: "owner-1" }; } export async function requireViewer() { return { id: "viewer-1" }; }
`,
  },
});

export const mediaMutations = replacementMutations([
  {
    mutationId: "media-image-alt",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "Media thumbnails no longer use authored alternative text.",
    changedPath: "app/media/page.tsx",
    before: "alt={asset.alt}",
    after: 'alt=""',
  },
  {
    mutationId: "media-asset-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Media items use mutable names as identity.",
    changedPath: "app/media/page.tsx",
    before: "key={asset.id}",
    after: "key={asset.name}",
  },
  {
    mutationId: "media-file-label",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "The upload file label is disconnected.",
    changedPath: "components/upload-form.tsx",
    before: 'htmlFor="asset-file"',
    after: 'htmlFor="missing-file"',
  },
  {
    mutationId: "media-upload-accept",
    category: "security",
    difficulty: "medium",
    issueStatement: "The upload picker accepts arbitrary file types.",
    changedPath: "components/upload-form.tsx",
    before: ' accept="image/png,image/jpeg,image/webp"',
    after: "",
  },
  {
    mutationId: "media-alt-required",
    category: "accessibility",
    difficulty: "medium",
    issueStatement: "Uploads can omit required alternative text.",
    changedPath: "components/upload-form.tsx",
    before: '<input id="asset-alt" maxLength={200} required />',
    after: '<input id="asset-alt" maxLength={200} />',
  },
  {
    mutationId: "media-delete-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Assets can be deleted without owner authorization.",
    changedPath: "app/media/actions.ts",
    before: ' if (!owner) throw new Error("forbidden");',
    after: "",
  },
  {
    mutationId: "media-asset-id",
    category: "security",
    difficulty: "hard",
    issueStatement: "Deletion accepts arbitrary asset identifiers.",
    changedPath: "app/media/actions.ts",
    before:
      ' if (!/^asset-[a-z0-9]+$/.test(assetId)) throw new Error("invalid asset");',
    after: "",
  },
  {
    mutationId: "media-download-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Private downloads no longer require a viewer session.",
    changedPath: "app/api/media/[assetId]/download/route.ts",
    before:
      ' if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });',
    after: "",
  },
  {
    mutationId: "media-route-params",
    category: "nextjs",
    difficulty: "medium",
    issueStatement: "Download routes read unresolved params.",
    changedPath: "app/api/media/[assetId]/download/route.ts",
    before: "const { assetId } = await params",
    after: "const { assetId } = params",
  },
  {
    mutationId: "media-filename-sanitize",
    category: "security",
    difficulty: "hard",
    issueStatement: "Uploaded filenames are stored without normalization.",
    changedPath: "lib/filename.ts",
    before:
      'name.normalize("NFKC").replaceAll(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120)',
    after: "name",
  },
]);
