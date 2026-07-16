import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(process.cwd(), process.cwd().endsWith("assetgen") ? "../.." : ".");
const output = path.join(root, "client/public/assets");
await Promise.all(["characters", "districts", "items", "ui", "portraits", "endings"].map((folder) => mkdir(path.join(output, folder), { recursive: true })));

const palette = { ink: "#20252b", asphalt: "#30373e", concrete: "#5e666c", paper: "#e7e2d5", sodium: "#d58b38", dawn: "#6f9db8", army: "#718568", danger: "#c65f4c" };

await Promise.all([
  renderSvg(logoSvg(), 900, 300, "logo.png"),
  renderSvg(markSvg(), 96, 96, "logo-mark.png"),
  renderSvg(markSvg(), 64, 64, "favicon.png"),
  generateNoise(),
]);

const outfits = ["underpass", "tent", "shelter", "sro", "apartment", "army"];
for (const sex of ["male", "female"] as const) for (const outfit of outfits) await renderSvg(spriteSheetSvg(sex, outfit), 256, 128, `characters/${sex}-${outfit}.png`);

for (const district of ["downtown", "industrial", "riverfront", "market-row", "northside", "fort-halvern"]) await renderSvg(tilesetSvg(district), 256, 256, `districts/${district}.png`);

const base = JSON.parse(await readFile(path.join(root, "packs/base-city/content.json"), "utf8")) as { items: Array<{ id: string; name: string }>; npcs: Array<{ id: string; name: string }> };
for (const item of base.items) await renderSvg(itemSvg(item.name, hash(item.id)), 64, 64, `items/${item.id}.png`);
for (const icon of ["cash", "grit", "heat", "hunger", "energy", "hygiene", "morale", "map", "chat", "agent", "crew", "report"]) await renderSvg(iconSvg(icon), 48, 48, `ui/${icon}.png`);

const named = [
  ...base.npcs.map((npc) => ({ id: npc.id, name: npc.name })),
  { id: "sam-okafor", name: "Sam Okafor" }, { id: "dana-reyes", name: "Dana Reyes" }, { id: "marcus-hale", name: "Marcus Hale" },
  { id: "staff-sgt-vance", name: "Staff Sgt. Vance" }, { id: "imani-petty", name: "Imani Petty" }, { id: "mateo-dominguez", name: "Mateo Dominguez" },
  { id: "judge-whitfield", name: "Judge Whitfield" }, { id: "child", name: "The Child" }, { id: "adult-child", name: "Adult Child" },
];
for (const npc of named) await renderSvg(portraitSvg(npc.name, hash(npc.id)), 192, 192, `portraits/${npc.id}.png`);
for (const ending of ["forgiveness", "honor", "the-cycle", "file-closed"]) await renderSvg(endingSvg(ending), 1280, 720, `endings/${ending}.png`);

process.stdout.write(`Generated ${outfits.length * 2 + 6 + base.items.length + 12 + named.length + 8} deterministic assets in ${output}\n`);

async function renderSvg(svg: string, width: number, height: number, relative: string) {
  await sharp(Buffer.from(svg)).resize(width, height, { kernel: "nearest" }).png({ compressionLevel: 9, palette: true, colours: 64 }).toFile(path.join(output, relative));
}

async function generateNoise() {
  let seed = 0x524f434b;
  const width = 64, height = 64, channels = 4;
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < width * height; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = 90 + (seed % 80);
    pixels[i * 4] = value; pixels[i * 4 + 1] = value; pixels[i * 4 + 2] = value; pixels[i * 4 + 3] = 90;
  }
  await sharp(pixels, { raw: { width, height, channels } }).png({ palette: true }).toFile(path.join(output, "noise.png"));
}

function logoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300"><g shape-rendering="crispEdges"><rect x="12" y="25" width="14" height="198" fill="${palette.sodium}"/><rect x="36" y="25" width="6" height="198" fill="${palette.dawn}" opacity=".55"/><text x="58" y="151" fill="${palette.paper}" font-family="monospace" font-weight="900" font-size="118" letter-spacing="-10">ROCKBOTTOM</text><rect x="60" y="174" width="760" height="5" fill="${palette.concrete}"/><text x="62" y="227" fill="${palette.sodium}" font-family="monospace" font-weight="800" font-size="37" letter-spacing="13">SECOND WIND</text><text x="63" y="267" fill="${palette.dawn}" font-family="monospace" font-size="15" letter-spacing="6">HALVERN CITY / CASE 02</text></g></svg>`;
}
function markSvg() { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges"><rect width="96" height="96" rx="8" fill="${palette.ink}"/><rect x="9" y="10" width="9" height="76" fill="${palette.sodium}"/><path d="M28 20h34v9h10v20H62v8l15 19H63L48 58h-7v18H28zm13 9v20h20V29z" fill="${palette.paper}"/><rect x="23" y="82" width="62" height="4" fill="${palette.dawn}"/></svg>`; }
function spriteSheetSvg(sex: "male" | "female", outfit: string) {
  const colors: Record<string, string> = { underpass: "#48535d", tent: "#5f5a4b", shelter: "#546a73", sro: "#7a6853", apartment: "#576d6a", army: palette.army };
  let cells = "";
  for (let row = 0; row < 4; row++) for (let frame = 0; frame < 2; frame++) {
    const x = frame * 64 + row * 0, y = row * 32;
    const left = frame ? 21 : 18, right = frame ? 38 : 41;
    cells += `<g transform="translate(${x} ${y})"><ellipse cx="32" cy="29" rx="12" ry="3" fill="#11161a" opacity=".45"/><rect x="25" y="4" width="14" height="12" rx="3" fill="#a97758"/><rect x="23" y="14" width="18" height="11" fill="${colors[outfit]}"/><rect x="${left}" y="16" width="5" height="9" fill="#a97758"/><rect x="${right}" y="16" width="5" height="9" fill="#a97758"/><rect x="25" y="24" width="6" height="7" fill="#263038"/><rect x="34" y="24" width="6" height="7" fill="#263038"/>${sex === "female" ? `<rect x="23" y="3" width="18" height="5" fill="#342821"/><rect x="22" y="7" width="4" height="10" fill="#342821"/>` : `<rect x="25" y="3" width="14" height="4" fill="#342821"/>`}${outfit === "army" ? `<rect x="22" y="12" width="20" height="3" fill="#394a3a"/>` : ""}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 128" shape-rendering="crispEdges">${cells}</svg>`;
}
function tilesetSvg(district: string) {
  const accent = district === "fort-halvern" ? palette.army : district === "riverfront" ? palette.dawn : district === "market-row" ? palette.sodium : palette.concrete;
  let blocks = "";
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = hash(`${district}-${x}-${y}`) % 5; blocks += `<rect x="${x * 16}" y="${y * 16}" width="16" height="16" fill="${v === 0 ? accent : v < 3 ? palette.asphalt : palette.concrete}"/><path d="M${x * 16} ${y * 16 + 15}h16" stroke="#22292f"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" shape-rendering="crispEdges">${blocks}</svg>`;
}
function itemSvg(name: string, seed: number) { const accent = [palette.sodium, palette.dawn, palette.army, palette.danger][seed % 4]; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges"><rect width="64" height="64" rx="5" fill="${palette.ink}"/><rect x="4" y="4" width="56" height="56" rx="3" fill="${palette.asphalt}" stroke="${palette.concrete}"/><path d="M18 17h28v7h6v25H12V24h6zm6 9v15h16V26z" fill="${accent}"/><text x="32" y="56" text-anchor="middle" fill="${palette.paper}" font-family="monospace" font-weight="900" font-size="7">${escapeXml(name.slice(0, 9).toUpperCase())}</text></svg>`; }
function iconSvg(name: string) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" shape-rendering="crispEdges"><rect x="3" y="3" width="42" height="42" rx="5" fill="${palette.asphalt}" stroke="${palette.concrete}"/><text x="24" y="29" text-anchor="middle" fill="${name === "heat" ? palette.danger : palette.sodium}" font-family="monospace" font-weight="900" font-size="13">${escapeXml(name.slice(0, 3).toUpperCase())}</text></svg>`; }
function portraitSvg(name: string, seed: number) {
  const skin = ["#7b503c", "#9f6c50", "#ba8260", "#6a4435"][seed % 4]; const coat = [palette.dawn, palette.army, palette.sodium, "#775d72"][Math.floor(seed / 4) % 4]; const hair = ["#251d1a", "#463126", "#b4aaa0", "#16191b"][Math.floor(seed / 16) % 4];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" shape-rendering="crispEdges"><rect width="192" height="192" fill="${palette.asphalt}"/><rect y="142" width="192" height="50" fill="${palette.ink}"/><path d="M35 192v-31l29-28h64l29 28v31" fill="${coat}"/><rect x="67" y="111" width="58" height="37" fill="${skin}"/><path d="M55 54h82v57l-22 26H77l-22-26z" fill="${skin}"/><path d="M55 62V42l17-17h48l17 17v29l-12-9-10-22-20 16-21-8-7 23z" fill="${hair}"/><rect x="71" y="80" width="13" height="5" fill="${palette.ink}"/><rect x="110" y="80" width="13" height="5" fill="${palette.ink}"/><rect x="91" y="104" width="18" height="4" fill="#4a2e29"/><rect x="8" y="8" width="176" height="4" fill="${coat}"/><text x="96" y="180" text-anchor="middle" fill="${palette.paper}" font-family="monospace" font-weight="900" font-size="11">${escapeXml(name.toUpperCase())}</text></svg>`;
}
function endingSvg(ending: string) { const title = ending.replaceAll("-", " ").toUpperCase(); const accent = ending === "honor" ? palette.army : ending === "file-closed" ? palette.concrete : palette.sodium; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${palette.ink}"/><circle cx="640" cy="330" r="270" fill="${accent}" opacity=".13"/><rect x="210" y="350" width="860" height="3" fill="${accent}"/><text x="640" y="332" text-anchor="middle" fill="${accent}" font-family="monospace" font-weight="900" font-size="92" letter-spacing="-4">${escapeXml(title)}</text><text x="640" y="405" text-anchor="middle" fill="${palette.paper}" font-family="monospace" font-size="18" letter-spacing="8">ROCKBOTTOM / SECOND WIND</text></svg>`; }
function hash(value: string) { let h = 2166136261; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function escapeXml(value: string) { return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" }[char]!)); }
