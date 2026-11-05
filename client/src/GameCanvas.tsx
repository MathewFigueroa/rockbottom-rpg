import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";

interface Props {
  scene: string;
  location: string;
  night: boolean;
}

export function GameCanvas({ scene, location, night }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ scene, location, night });
  latest.current = { scene, location, night };
  const repaint = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let initialized = false;
    let app: Application | undefined;
    const destroy = () => {
      if (!app || !initialized) return;
      initialized = false;
      app.destroy(true, { children: true });
    };
    const paint = () => {
      if (!app || !initialized || disposed) return;
      const current = latest.current;
      app.stage.removeChildren().forEach(child => child.destroy({ children: true }));
      app.renderer.background.color = current.night ? 0x171d23 : 0x60798a;
      app.canvas.setAttribute("aria-label", `Top-down view of ${current.location}`);
      drawWorld(app.stage, app.screen.width, app.screen.height, current.scene, current.night);
      app.render();
    };
    const resize = () => { if (app && initialized && !disposed) { app.resize(); paint(); } };
    const init = async () => {
      app = new Application();
      await app.init({ resizeTo: element, background: 0x60798a, antialias: false, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio) });
      initialized = true;
      if (disposed) { destroy(); return; }
      // The map has no continuous animation: render only on state/size changes.
      app.stop();
      element.appendChild(app.canvas);
      app.canvas.setAttribute("role", "img");
      repaint.current = paint;
      paint();
      window.addEventListener("resize", resize);
    };
    void init().catch(() => { if (!disposed) element.textContent = 'The city map is unavailable. Story decisions remain available.'; destroy(); });
    return () => {
      disposed = true;
      repaint.current = undefined;
      window.removeEventListener("resize", resize);
      destroy();
    };
  }, []);
  useEffect(() => { repaint.current?.(); }, [scene, location, night]);
  return <div className="game-canvas" ref={host} />;
}

function drawWorld(stage: Container, width: number, height: number, scene: string, night: boolean) {
  const world = new Graphics();
  const asphalt = night ? 0x1f252b : 0x343c43;
  const concrete = night ? 0x32383e : 0x657078;
  const sidewalk = night ? 0x3b4146 : 0x7a7e7a;
  world.rect(0, 0, width, height).fill(asphalt);
  const tile = Math.max(24, Math.floor(width / 28));
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const n = ((x / tile) * 13 + (y / tile) * 7) % 11;
      if (n < 5) world.rect(x + 1, y + 1, tile - 2, tile - 2).fill(n % 2 ? concrete : sidewalk);
    }
  }
  world.rect(width * 0.34, 0, width * 0.24, height).fill(asphalt);
  world.rect(0, height * 0.44, width, height * 0.2).fill(asphalt);
  world.rect(width * 0.45, 0, Math.max(2, width * 0.012), height).fill(0xbda45b);
  for (let y = 12; y < height; y += 36) world.rect(width * 0.452, y, Math.max(2, width * 0.008), 20).fill(0xe2d397);

  if (scene === "overpass" || scene === "opening") {
    world.rect(0, height * 0.17, width, height * 0.24).fill(0x252a2e);
    for (let x = 40; x < width; x += width / 4) world.rect(x, height * 0.2, 26, height * 0.54).fill(0x454b50);
    world.rect(width * 0.12, height * 0.68, width * 0.2, 8).fill(0x805c40);
    world.circle(width * 0.16, height * 0.66, 10).fill(0x1c2023);
    world.circle(width * 0.28, height * 0.66, 10).fill(0x1c2023);
  } else if (scene === "day-labor") {
    world.rect(width * 0.08, height * 0.08, width * 0.28, height * 0.28).fill(0x6d6252);
    world.rect(width * 0.66, height * 0.1, width * 0.22, height * 0.32).fill(0x51585c);
    for (let i = 0; i < 6; i++) world.rect(width * (0.12 + i * 0.07), height * 0.7, 22, 14).fill(i % 2 ? 0xc38332 : 0x8b9278);
  } else if (scene === "army") {
    world.rect(width * 0.08, height * 0.08, width * 0.84, height * 0.76).fill(0x59624d);
    world.rect(width * 0.13, height * 0.14, width * 0.74, height * 0.64).fill(0x8b8978);
    world.rect(width * 0.4, height * 0.14, width * 0.2, 8).fill(0x394338);
    world.rect(width * 0.18, height * 0.6, width * 0.22, height * 0.1).fill(0x515746);
  } else {
    for (let i = 0; i < 8; i++) {
      const x = (i % 4) * width * 0.24 + width * 0.03;
      const y = Math.floor(i / 4) * height * 0.48 + height * 0.04;
      world.rect(x, y, width * 0.18, height * 0.3).fill(i % 2 ? 0x4d555b : 0x55504b);
      world.rect(x + 8, y + 14, width * 0.045, height * 0.045).fill(night ? 0xc9853a : 0x8298a5);
      world.rect(x + width * 0.1, y + 14, width * 0.045, height * 0.045).fill(night ? 0xc9853a : 0x8298a5);
    }
  }
  stage.addChild(world);

  const characters = new Graphics();
  drawPerson(characters, width * 0.5, height * 0.57, 0xd28536, 1);
  if (scene === "crew") {
    drawPerson(characters, width * 0.55, height * 0.52, 0x789761, 0.9);
    drawPerson(characters, width * 0.45, height * 0.5, 0x7f8ea2, 0.9);
    characters.poly([width * 0.12, height * 0.4, width * 0.25, height * 0.34, width * 0.27, height * 0.46, width * 0.14, height * 0.5]).fill(0x8f573a);
  }
  if (scene === "sam") drawPerson(characters, width * 0.58, height * 0.51, 0x85906c, 1.1);
  stage.addChild(characters);

  if (night) {
    const lighting = new Graphics();
    lighting.rect(0, 0, width, height).fill({ color: 0x0b1421, alpha: 0.38 });
    lighting.circle(width * 0.7, height * 0.35, Math.min(width, height) * 0.32).fill({ color: 0xd37f2f, alpha: 0.16 });
    stage.addChild(lighting);
  }
}

function drawPerson(g: Graphics, x: number, y: number, color: number, scale: number) {
  g.ellipse(x, y + 21 * scale, 13 * scale, 5 * scale).fill({ color: 0x101418, alpha: 0.45 });
  g.circle(x, y - 12 * scale, 8 * scale).fill(0x9b6d50);
  g.rect(x - 8 * scale, y - 5 * scale, 16 * scale, 20 * scale).fill(color);
  g.rect(x - 7 * scale, y + 15 * scale, 5 * scale, 13 * scale).fill(0x252b31);
  g.rect(x + 2 * scale, y + 15 * scale, 5 * scale, 13 * scale).fill(0x252b31);
}
