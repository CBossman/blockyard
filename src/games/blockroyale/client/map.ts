import type { Client, ClientKit, KitControls } from '@platform/client';
import { CENTER, SITES } from '../island';
import type { BusWire } from '../wire';
import mapUrl from './minimap.png?url';
import { stormView } from './storm';

/**
 * The map: a small one in the corner, and a big one on M. Both show the island from above (a picture
 * of it baked from the world: `tests/headless/_minimap.ts`), the safe circle and the one it's
 * closing on, the bus and its route, and you with the way you face. The big one names the landmarks.
 */

/** How far each way from the island's middle the picture reaches. */
const EXTENT = 170;

const STYLE = `
.br-map { position: absolute; top: 14px; right: 14px; width: 172px; height: 172px; border: 3px solid #000; border-radius: 12px; overflow: hidden; background: #10141c; box-shadow: 0 4px 0 #0009; }
.br-map canvas, .br-bigmap canvas { display: block; width: 100%; height: 100%; }
.br-bigmap { position: absolute; left: 50%; top: 50%; width: min(78vh, 78vw); height: min(78vh, 78vw); transform: translate(-50%, -50%); border: 4px solid #000; border-radius: 16px; overflow: hidden; background: #10141c; box-shadow: 0 8px 0 #000a, 0 0 0 9999px #0a0c1099; display: none; }
.br-bigmap.on { display: block; }
.br-bigmap .tip { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font: 600 12px/1 var(--sans, sans-serif); letter-spacing: 0.08em; text-transform: uppercase; color: #fff; text-shadow: 0 1px 2px #000; }
body.touch-mode .br-map { top: 64px; width: 128px; height: 128px; }
`;

export function mapKit(): ClientKit {
  let small: HTMLCanvasElement | null = null;
  let big: HTMLCanvasElement | null = null;
  let bigBox: HTMLElement | null = null;
  let bus: { wire: BusWire; at: number } | null = null;
  let image: HTMLImageElement | null = null;
  let off: (() => void) | null = null;
  let markedAt = '';

  const toPx = (x: number, z: number, size: number) => [((x - (CENTER.x - EXTENT)) / (EXTENT * 2)) * size, ((z - (CENTER.z - EXTENT)) / (EXTENT * 2)) * size] as const;

  function draw(client: Client, cv: HTMLCanvasElement, labels: boolean) {
    const size = cv.width;
    const g = cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, size, size);
    if (image?.complete && image.naturalWidth) g.drawImage(image, 0, 0, size, size);
    else {
      g.fillStyle = '#243040';
      g.fillRect(0, 0, size, size);
    }
    const k = size / (EXTENT * 2);
    const now = stormView.now;
    if (now) {
      // The storm: everything outside the circle in purple, the circle in white.
      const [cx, cz] = toPx(now.x, now.z, size);
      g.save();
      g.beginPath();
      g.rect(0, 0, size, size);
      g.arc(cx, cz, Math.max(0, now.r * k), 0, Math.PI * 2, true);
      g.fillStyle = 'rgba(120, 40, 220, 0.5)';
      g.fill('evenodd');
      g.restore();
      g.beginPath();
      g.arc(cx, cz, Math.max(0, now.r * k), 0, Math.PI * 2);
      g.strokeStyle = '#ffffff';
      g.lineWidth = labels ? 3 : 2;
      g.stroke();
    }
    const next = stormView.next;
    if (next) {
      const [nx, nz] = toPx(next.x, next.z, size);
      g.beginPath();
      g.arc(nx, nz, Math.max(0, next.r * k), 0, Math.PI * 2);
      g.setLineDash([6, 5]);
      g.strokeStyle = '#ffd23a';
      g.lineWidth = labels ? 3 : 2;
      g.stroke();
      g.setLineDash([]);
    }
    if (labels) {
      g.font = '700 13px sans-serif';
      g.textAlign = 'center';
      for (const s of SITES) {
        const [x, z] = toPx(s.cx, s.cz, size);
        g.lineWidth = 4;
        g.strokeStyle = '#000';
        g.fillStyle = '#fff';
        g.strokeText(s.label, x, z - 10);
        g.fillText(s.label, x, z - 10);
      }
    }
    // The bus: its route, and where it is on it.
    if (bus && !bus.wire.over) {
      const w = bus.wire;
      const [ax, az] = toPx(w.from[0], w.from[1], size);
      const [bx, bz] = toPx(w.to[0], w.to[1], size);
      g.beginPath();
      g.moveTo(ax, az);
      g.lineTo(bx, bz);
      g.setLineDash([5, 5]);
      g.strokeStyle = '#ff8a2a';
      g.lineWidth = labels ? 3 : 2;
      g.stroke();
      g.setLineDash([]);
      const t = Math.min(1, (w.t + (w.sailing ? client.time - bus.at : 0)) / w.seconds);
      const [x, z] = [ax + (bx - ax) * t, az + (bz - az) * t];
      g.save();
      g.translate(x, z);
      g.rotate(Math.atan2(bz - az, bx - ax));
      g.fillStyle = '#ff8a2a';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      const r = labels ? 9 : 6;
      g.beginPath();
      g.moveTo(r, 0);
      g.lineTo(-r * 0.8, r * 0.7);
      g.lineTo(-r * 0.8, -r * 0.7);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    // You, pointing the way you face.
    const me = client.me;
    const [px, pz] = toPx(me.position.x, me.position.z, size);
    g.save();
    g.translate(px, pz);
    g.rotate(-me.look.yaw);
    g.fillStyle = '#4de3ff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    const r = labels ? 9 : 6;
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.75, r * 0.8);
    g.lineTo(0, r * 0.35);
    g.lineTo(-r * 0.75, r * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  return {
    name: 'map',
    setup(client: Client) {
      off = client.hud.style(STYLE);
      const layer = client.hud.layer('br-map', 'panels');
      const box = document.createElement('div');
      box.className = 'br-map';
      small = document.createElement('canvas');
      small.width = small.height = 220;
      box.appendChild(small);
      layer.appendChild(box);
      bigBox = document.createElement('div');
      bigBox.className = 'br-bigmap';
      big = document.createElement('canvas');
      big.width = big.height = 640;
      bigBox.appendChild(big);
      const tip = document.createElement('div');
      tip.className = 'tip';
      tip.textContent = 'M to close';
      bigBox.appendChild(tip);
      layer.appendChild(bigBox);
      image = new Image();
      image.src = mapUrl;
      client.on('bus', (data) => {
        bus = { wire: data as BusWire, at: client.time };
      });
    },
    controls(_client: Client, c: KitControls) {
      if (c.pressed('KeyM')) bigBox?.classList.toggle('on');
    },
    frame(client: Client) {
      if (client.events.some((e) => e.t === 'reset')) bus = null;
      if (small) draw(client, small, false);
      if (big && bigBox?.classList.contains('on')) draw(client, big, true);
      // A diamond over where the next circle is, at the screen's edge when it's off to the side.
      const next = stormView.next ?? (stormView.now && stormView.step !== 'calm' ? stormView.now : null);
      const key = next ? `${Math.round(next.x)},${Math.round(next.z)}` : '';
      if (key !== markedAt) {
        markedAt = key;
        client.hud.marker('zone', next ? { x: next.x, y: 80, z: next.z } : null, { label: 'Safe zone', shape: 'diamond', color: '#ffffff', edge: true, size: 12 });
      }
    },
    dispose() {
      off?.();
    },
  };
}
