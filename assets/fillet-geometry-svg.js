import { computeFilletNominalMeasurements } from './geometry.js?v=bda6fb5469b7';

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function renderGeometry(geometry) {
  if (!geometry?.points) return null;
  const gamma = finiteNumber(geometry.gamma);
  const gammaRad = finiteNumber(geometry.gammaRad) ?? (gamma === null ? null : gamma * Math.PI / 180);
  const z1 = finiteNumber(geometry.z1);
  const z2 = finiteNumber(geometry.z2);
  const m = finiteNumber(geometry.m);
  const valid = geometry.valid ?? geometry.calculation_valid;
  if (!valid || gamma === null || gammaRad === null || z1 === null || z2 === null || m === null) return null;
  return {points: geometry.points, gamma, gammaRad, z1, z2, m};
}

export function filletGeometrySvg(geometry, nominalA, geometryStatus = 'incomplete') {
  const model = renderGeometry(geometry);
  if (!model) return '';

  const {root, transition1, transition2, middle, control} = model.points;
  const nominalGeometry = computeFilletNominalMeasurements(nominalA, model.gamma);
  const targetLeg = nominalGeometry.valid ? nominalGeometry.z1 : null;
  const target1 = targetLeg === null ? null : {x: targetLeg / Math.sin(model.gammaRad), y: 0};
  const target2 = targetLeg === null ? null : {x: targetLeg / Math.tan(model.gammaRad), y: targetLeg};

  const relevantSize = Math.max(model.z1, model.z2, model.m, nominalGeometry.valid ? nominalGeometry.a : 0);
  const overrun = Math.max(5, relevantSize * 0.2);
  const component1Length = Math.max(transition1.x, target1?.x || 0) + overrun;
  const component2Length = Math.max(
    Math.hypot(transition2.x, transition2.y),
    target2 ? Math.hypot(target2.x, target2.y) : 0,
  ) + overrun;
  const component1End = {x: component1Length, y: 0};
  const component2End = {
    x: component2Length * Math.cos(model.gammaRad),
    y: component2Length * Math.sin(model.gammaRad),
  };

  const fitPoints = [
    root, transition1, transition2, middle, control,
    component1End, component2End,
    ...(target1 && target2 ? [target1, target2] : []),
  ];
  const xs = fitPoints.map(point => point.x);
  const ys = fitPoints.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const scale = Math.min(260 / width, 140 / height);
  const offsetX = 20 + (260 - width * scale) / 2 - minX * scale;
  const offsetY = 20 + (140 - height * scale) / 2 + maxY * scale;
  const map = point => ({
    x: offsetX + point.x * scale,
    y: offsetY - point.y * scale,
  });
  const svgPoint = point => {
    const mapped = map(point);
    return `${mapped.x.toFixed(1)} ${mapped.y.toFixed(1)}`;
  };

  const rootSvg = svgPoint(root);
  const transition1Svg = svgPoint(transition1);
  const transition2Svg = svgPoint(transition2);
  const controlSvg = svgPoint(control);
  const component1EndSvg = svgPoint(component1End);
  const component2EndSvg = svgPoint(component2End);
  const targetPath = target1 && target2
    ? `<path data-contour="target" d="M ${svgPoint(target1)} L ${svgPoint(target2)}" fill="none" stroke="#7f8b93" stroke-width="7" stroke-linecap="round"/>`
    : '';
  const normalizedStatus = ['pass', 'fail'].includes(geometryStatus) ? geometryStatus : 'incomplete';
  const statusColor = {pass:'#1f7a4d', fail:'#b33a3a', incomplete:'#7f8b93'}[normalizedStatus];
  const geometryStatusPath = `<path data-geometry-status="${normalizedStatus}" d="M ${rootSvg} L ${svgPoint(middle)}" fill="none" stroke="${statusColor}" stroke-width="4" stroke-linecap="round"/>`;

  return `<svg viewBox="0 0 300 180" role="img" aria-label="Plausibilitätsdarstellung der Kehlnaht">
    <path data-component="1" d="M ${rootSvg} L ${component1EndSvg}" fill="none" stroke="#173d5f" stroke-width="10" stroke-linecap="square"/>
    <path data-component="2" d="M ${rootSvg} L ${component2EndSvg}" fill="none" stroke="#173d5f" stroke-width="10" stroke-linecap="square"/>
    ${targetPath}
    <path data-weld-fill="true" d="M ${transition1Svg} Q ${controlSvg} ${transition2Svg} L ${rootSvg} Z" fill="#d7e4eb" opacity=".7"/>
    ${geometryStatusPath}
    <path data-contour="measured-upper" d="M ${transition1Svg} Q ${controlSvg} ${transition2Svg}" fill="none" stroke="#101820" stroke-width="3.5" stroke-linecap="round"/>
    <path data-contour="measured-lower" d="M ${transition1Svg} L ${rootSvg} L ${transition2Svg}" fill="none" stroke="#101820" stroke-width="3.5" stroke-linejoin="round"/>
  </svg>`;
}
