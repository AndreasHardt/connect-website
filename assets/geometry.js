export const GEOMETRY_TOLERANCE_MM = 0.1;

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function point(x, y) {
  return {x, y};
}

function bezierPoint(p1, control, p2, t) {
  const u = 1 - t;
  return point(
    u * u * p1.x + 2 * u * t * control.x + t * t * p2.x,
    u * u * p1.y + 2 * u * t * control.y + t * t * p2.y,
  );
}

function distanceFromOrigin(p) {
  return Math.hypot(p.x, p.y);
}

function minimumBezierDistance(p1, control, p2) {
  const samples = 160;
  let bestT = 0;
  let bestDistance = distanceFromOrigin(p1);

  for (let index = 1; index <= samples; index += 1) {
    const t = index / samples;
    const distance = distanceFromOrigin(bezierPoint(p1, control, p2, t));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
    }
  }

  let left = Math.max(0, bestT - 1 / samples);
  let right = Math.min(1, bestT + 1 / samples);
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const third = (right - left) / 3;
    const t1 = left + third;
    const t2 = right - third;
    const d1 = distanceFromOrigin(bezierPoint(p1, control, p2, t1));
    const d2 = distanceFromOrigin(bezierPoint(p1, control, p2, t2));
    if (d1 <= d2) right = t2;
    else left = t1;
  }

  const t = (left + right) / 2;
  const minimumPoint = bezierPoint(p1, control, p2, t);
  return {distance: distanceFromOrigin(minimumPoint), t, point: minimumPoint};
}

export function computeFilletGeometry(input = {}) {
  const tolerance = Number.isFinite(input.tolerance) && input.tolerance >= 0
    ? input.tolerance
    : GEOMETRY_TOLERANCE_MM;
  const z1 = Number(input.z1);
  const z2 = Number(input.z2);
  const m = Number(input.m);
  const gamma = Number(input.gamma);
  const errors = [];

  if (!finitePositive(z1)) errors.push('Messwert z1 muss größer als 0 mm sein.');
  if (!finitePositive(z2)) errors.push('Messwert z2 muss größer als 0 mm sein.');
  if (!finiteNonNegative(m)) errors.push('Der Höhenmesswert m auf der Winkelhalbierenden ist erforderlich.');
  if (!Number.isFinite(gamma) || gamma <= 0 || gamma >= 180) {
    errors.push('Der eingeschlossene Bauteilwinkel γ muss zwischen 0° und 180° liegen.');
  }

  if (errors.length) {
    return {
      valid: false,
      errors,
      tolerance,
      b: null,
      az: null,
      m0: null,
      profileH: null,
      asymmetryH: null,
      aA: null,
      reinforcementH: null,
      needsDirectAA: false,
      needsDirectH: false,
    };
  }

  const gammaRad = gamma * Math.PI / 180;
  const halfGamma = gammaRad / 2;
  const sinGamma = Math.sin(gammaRad);
  const cosHalfGamma = Math.cos(halfGamma);
  const sinHalfGamma = Math.sin(halfGamma);

  if (Math.abs(sinGamma) < 1e-9 || Math.abs(cosHalfGamma) < 1e-9) {
    return {
      valid: false,
      errors: ['Der Bauteilwinkel liegt zu nahe an einer geometrisch entarteten Lage.'],
      tolerance,
      b: null,
      az: null,
      m0: null,
      profileH: null,
      asymmetryH: null,
      aA: null,
      reinforcementH: null,
      needsDirectAA: false,
      needsDirectH: false,
    };
  }

  const p1 = point(z1 / Math.tan(gammaRad), z1);
  const p2 = point(z2 / sinGamma, 0);
  const middlePoint = point(m * cosHalfGamma, m * sinHalfGamma);
  const b = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  if (!finitePositive(b)) {
    return {
      valid: false,
      errors: ['Aus z1, z2 und γ konnte keine gültige Nahtbreite b berechnet werden.'],
      tolerance,
      b: null,
      az: null,
      m0: null,
      profileH: null,
      asymmetryH: null,
      aA: null,
      reinforcementH: null,
      needsDirectAA: false,
      needsDirectH: false,
    };
  }

  const m0 = (z1 * z2) / ((z1 + z2) * sinHalfGamma);
  const deltaM = m - m0;
  const profileFactor = (z1 + z2) / (2 * b * cosHalfGamma);
  const profileH = deltaM * profileFactor;
  const reinforcementH = Math.max(profileH, 0);
  const underfillH = Math.max(-profileH, 0);
  const asymmetryH = Math.abs(z1 - z2);
  const symmetric = asymmetryH <= tolerance;
  const profileClass = Math.abs(profileH) <= tolerance
    ? 'straight'
    : profileH > 0
      ? 'convex'
      : 'concave';

  const interpolationT = z1 / (z1 + z2);
  const interpolationU = 1 - interpolationT;
  const denominator = 2 * interpolationT * interpolationU;
  const controlPoint = point(
    (middlePoint.x - interpolationU ** 2 * p1.x - interpolationT ** 2 * p2.x) / denominator,
    (middlePoint.y - interpolationU ** 2 * p1.y - interpolationT ** 2 * p2.y) / denominator,
  );

  const minimum = minimumBezierDistance(p1, controlPoint, p2);
  const aA = minimum.distance;
  const referenceAA = Math.abs(p1.x * p2.y - p1.y * p2.x) / b;
  const az = referenceAA;
  const validationErrors = [];

  if (!finitePositive(aA)) {
    validationErrors.push('Die tatsächliche Kehlnahtdicke aA konnte aus der Modellkontur nicht bestimmt werden.');
  }

  const extremeRatio = Math.max(z1, z2) / Math.min(z1, z2);
  const modelStable = extremeRatio <= 8
    && Number.isFinite(controlPoint.x)
    && Number.isFinite(controlPoint.y)
    && aA > 0;
  if (!modelStable) {
    validationErrors.push('Die Messwertkombination führt zu einer instabilen Modellkontur und muss fachlich geprüft werden.');
  }

  return {
    valid: validationErrors.length === 0,
    errors: validationErrors,
    tolerance,
    z1,
    z2,
    m,
    gamma,
    gammaRad,
    b,
    az,
    referenceAA,
    m0,
    deltaM,
    profileFactor,
    profileH,
    reinforcementH,
    underfillH,
    asymmetryH,
    symmetric,
    profileClass,
    needsDirectAA: false,
    needsDirectH: false,
    directAA: null,
    directH: null,
    aA,
    aASource: 'model',
    reinforcementSource: profileClass === 'convex' ? 'middle' : 'none',
    combinedFeatures: !symmetric && profileClass !== 'straight',
    modelStable,
    points: {
      root: point(0, 0),
      transition1: p1,
      transition2: p2,
      middle: middlePoint,
      control: controlPoint,
      minimum: minimum.point,
    },
    interpolationT,
    minimumT: minimum.t,
  };
}
