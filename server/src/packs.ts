import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";

export interface PackManifest {
  id: string;
  version: string;
  dependencies: string[];
  enabled?: boolean;
}

export interface LoadedPack {
  manifest: PackManifest;
  content: Record<string, unknown>;
  path: string;
}

const manifestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "version", "dependencies"],
  properties: {
    id: { type: "string", pattern: "^[a-z0-9-]+$" },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    dependencies: { type: "array", items: { type: "string" }, uniqueItems: true },
    enabled: { type: "boolean" },
  },
} as const;

const contentSchema = {
  type: "object",
  required: ["kind"],
  properties: {
    kind: { type: "string" },
    maps: { type: "array" },
    items: { type: "array" },
    npcs: { type: "array" },
    quests: { type: "array" },
    dialogues: { type: "array" },
    events: { type: "array" },
    tapes: { type: "array" },
    endings: { type: "array" },
  },
} as const;

export async function loadPacks(packRoot = resolvePackRoot()): Promise<LoadedPack[]> {
  const AjvConstructor = Ajv as unknown as new (options?: { allErrors?: boolean }) => {
    compile: (schema: object) => ((data: unknown) => boolean) & { errors?: unknown };
    errorsText: (errors?: unknown) => string;
  };
  const ajv = new AjvConstructor({ allErrors: true });
  const validateManifest = ajv.compile(manifestSchema);
  const validateContent = ajv.compile(contentSchema);
  const names = (await readdir(packRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const packs: LoadedPack[] = [];
  for (const name of names) {
    const folder = path.join(packRoot, name);
    const manifest = JSON.parse(await readFile(path.join(folder, "manifest.json"), "utf8")) as PackManifest;
    const content = JSON.parse(await readFile(path.join(folder, "content.json"), "utf8")) as Record<string, unknown>;
    if (!validateManifest(manifest)) throw new Error(`Invalid manifest ${name}: ${ajv.errorsText(validateManifest.errors)}`);
    if (!validateContent(content)) throw new Error(`Invalid content ${name}: ${ajv.errorsText(validateContent.errors)}`);
    packs.push({ manifest, content, path: folder });
  }
  const loaded = new Set(packs.map((pack) => pack.manifest.id));
  for (const pack of packs) {
    for (const dependency of pack.manifest.dependencies) {
      if (!loaded.has(dependency)) throw new Error(`Pack ${pack.manifest.id} requires missing ${dependency}`);
    }
  }
  return packs;
}

function resolvePackRoot(): string {
  const cwd = process.cwd();
  return path.resolve(cwd, path.basename(cwd) === "server" ? "../packs" : "packs");
}
