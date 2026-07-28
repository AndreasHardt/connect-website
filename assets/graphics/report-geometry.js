import { computeFilletGeometry } from '../geometry.js';

const key = decodeURIComponent(location.hash.slice(1));
let payload = null;
try {
  payload = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
} catch {
  payload = null;
}

function mapGeometry(input) {
  return computeFilletGeometry({
    z1: Number(input.z1),
    z2: Number(input.z2),
    m: Number(input.m),
    gamma: Number(input.gamma),
    tolerance: Number(input.tolerance_mm),
  });
}

function filletSvg(input) {
  const result = mapGeometry(input);
  if (!result.valid || !result.points) return '';

  const nominalA = Number(input.a);
  const nominalPoint = Number.isFinite(nominalA) && nominalA > 0
    ? {
        x: nominalA * Math.cos(result.gammaRad / 2),
        y: nominalA * Math.sin(result.gammaRad / 2),
      }
    : null;
  const points = [result.points.root, result.points.transition1, result.points.transition2, result.points.middle, result.points.control, result.points.minimum];
  if (nominalPoint) points.push(nominalPoint);
  const minX = Math.min(...points.map(point => point.x), 0);
  const maxX = Math.max(...points.map(point => point.x), 0);
  const minY = Math.min(...points.map(point => point.y), 0);
  const maxY = Math.max(...points.map(point => point.y), 0);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const extension = Math.max(5, span * 0.18);
  const width = 320;
  const height = 190;
  const padding = 20;
  const scale = Math.min(
    (width - 2 * padding) / (maxX - minX + 2 * extension),
    (height - 2 * padding) / (maxY - minY + 2 * extension),
  );
  const map = point => ({
    x: padding + (point.x - minX + extension) * scale,
    y: height - padding - (point.y - minY + extension) * scale,
  });
  const root = map(result.points.root);
  const p1 = map(result.points.transition1);
  const p2 = map(result.points.transition2);
  const middle = map(result.points.middle);
  const control = map(result.points.control);
  const minimum = map(result.points.minimum);
  const nominal = nominalPoint ? map(nominalPoint) : null;
  const u1 = { x: Math.cos(result.gammaRad), y: Math.sin(result.gammaRad) };
  const edge1End = map({
    x: result.points.transition1.x + u1.x * extension,
    y: result.points.transition1.y + u1.y * extension,
  });
  const edge2Start = map({ x: -extension, y: 0 });

  return `<div class="report-geometry-figure">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Dokumentierte Kehlnahtgeometrie">
      <line x1="${root.x}" y1="${root.y}" x2="${edge1End.x}" y2="${edge1End.y}" class="component-edge"/>
      <line x1="${edge2Start.x}" y1="${edge2Start.y}" x2="${root.x}" y2="${root.y}" class="component-edge"/>
      <path d="M ${root.x} ${root.y} L ${p1.x} ${p1.y} Q ${control.x} ${control.y} ${p2.x} ${p2.y} Z" class="weld-fill"/>
      <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="theoretical-contour"/>
      <path d="M ${p1.x} ${p1.y} Q ${control.x} ${control.y} ${p2.x} ${p2.y}" class="actual-contour"/>
      ${nominal ? `<line x1="${root.x}" y1="${root.y}" x2="${nominal.x}" y2="${nominal.y}" class="nominal-a"/><text x="${nominal.x + 5}" y="${nominal.y - 5}" class="nominal-label">a Soll</text>` : ''}
      <line x1="${root.x}" y1="${root.y}" x2="${middle.x}" y2="${middle.y}" class="middle-line"/>
      <line x1="${root.x}" y1="${root.y}" x2="${minimum.x}" y2="${minimum.y}" class="actual-a"/>
      <circle cx="${middle.x}" cy="${middle.y}" r="4" class="middle-point"/>
      <circle cx="${minimum.x}" cy="${minimum.y}" r="2.5" class="minimum-point"/>
      <text x="${middle.x + 5}" y="${middle.y - 5}" class="middle-label">m</text>
      <text x="${minimum.x + 5}" y="${minimum.y + 11}" class="actual-label">aA</text>
    </svg>
    <div class="report-geometry-caption">Geometrische Darstellung des dokumentierten Messquerschnitts</div>
  </div>`;
}

function insertGeometry() {
  if (!payload?.data?.geometry || payload.data.primary?.joint_type !== 'Kehlnaht') return false;
  const sections = document.querySelectorAll('.report-section');
  if (!sections.length) return false;
  sections.forEach(section => {
    if (section.querySelector('.report-geometry-figure')) return;
    const heading = [...section.querySelectorAll('h2')].find(item => item.textContent.includes('Vorgaben, Messung und Berechnung'));
    const table = heading?.nextElementSibling;
    if (table) table.insertAdjacentHTML('afterend', filletSvg(payload.data.geometry));
  });
  return true;
}

if (!insertGeometry()) {
  const observer = new MutationObserver(() => {
    if (insertGeometry()) observer.disconnect();
  });
  observer.observe(document.querySelector('#reports'), { childList: true, subtree: true });
}
