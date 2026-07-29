export const GEOMETRY_TOLERANCE_MM = 0.1;
export const FILLET_MIN_ANGLE_DEG = 60;
export const FILLET_MAX_ANGLE_DEG = 120;
export const FILLET_GEOMETRY_STATUS_RULE_IDS = Object.freeze([
  'IMP-000010', // Nr. 1.10 – zu große Nahtüberhöhung
  'IMP-000016', // Nr. 1.16 – Ungleichschenkligkeit
  'IMP-000020', // Nr. 1.20 – zu kleine Kehlnahtdicke
  'IMP-000021', // Nr. 1.21 – zu große Kehlnahtdicke
]);

export function deriveFilletGeometryStatus(inspectionResult = {}) {
  const resultById = new Map((inspectionResult.results ?? []).map(item => [item.rule_id, item]));
  const criterionStatuses = Object.fromEntries(
    FILLET_GEOMETRY_STATUS_RULE_IDS.map(ruleId => [ruleId, resultById.get(ruleId)?.status ?? 'incomplete']),
  );
  const statuses = Object.values(criterionStatuses);
  const status = statuses.includes('fail')
    ? 'fail'
    : statuses.every(item => ['pass', 'not_applicable'].includes(item))
      ? 'pass'
      : 'incomplete';
  return {
    status,
    rule_ids: [...FILLET_GEOMETRY_STATUS_RULE_IDS],
    criterion_statuses: criterionStatuses,
  };
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function computeFilletNominalMeasurements(nominalA, gamma) {
  const a = Number(nominalA);
  const angle = Number(gamma);
  if (!finitePositive(a)
      || !Number.isFinite(angle)
      || angle < FILLET_MIN_ANGLE_DEG
      || angle > FILLET_MAX_ANGLE_DEG) {
    return {valid:false, a:null, gamma:null, z1:null, z2:null, m:null};
  }

  const targetLeg = 2 * a * Math.sin(angle * Math.PI / 360);
  return {valid:true, a, gamma:angle, z1:targetLeg, z2:targetLeg, m:a};
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
  if (!Number.isFinite(gamma) || gamma < FILLET_MIN_ANGLE_DEG || gamma > FILLET_MAX_ANGLE_DEG) {
    errors.push(`Der eingeschlossene Bauteilwinkel γ muss zwischen ${FILLET_MIN_ANGLE_DEG}° und ${FILLET_MAX_ANGLE_DEG}° liegen.`);
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

  // Bauteil 1 liegt horizontal: z1 gehört zu seinem Übergangspunkt.
  // Bauteil 2 verläuft im Winkel γ: z2 gehört zu seinem Übergangspunkt.
  const p1 = point(z1 / sinGamma, 0);
  const p2 = point(z2 / Math.tan(gammaRad), z2);
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


function nullableGeometryNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculatedGeometryNumber(value) {
  return Number.isFinite(value) ? value : null;
}

export function normalizeFilletGeometryPayload(source = {}) {
  const tolerance = nullableGeometryNumber(source.tolerance_mm);
  const computed = computeFilletGeometry({
    z1: nullableGeometryNumber(source.z1),
    z2: nullableGeometryNumber(source.z2),
    m: nullableGeometryNumber(source.m),
    gamma: nullableGeometryNumber(source.gamma),
    tolerance: tolerance ?? GEOMETRY_TOLERANCE_MM,
  });

  return {
    ...source,
    z1: nullableGeometryNumber(source.z1),
    z2: nullableGeometryNumber(source.z2),
    m: nullableGeometryNumber(source.m),
    gamma: nullableGeometryNumber(source.gamma),
    aA: calculatedGeometryNumber(computed.aA),
    b: calculatedGeometryNumber(computed.b),
    az: calculatedGeometryNumber(computed.az),
    reference_aA: calculatedGeometryNumber(computed.referenceAA),
    m0: calculatedGeometryNumber(computed.m0),
    delta_m: calculatedGeometryNumber(computed.deltaM),
    profile_h: calculatedGeometryNumber(computed.profileH),
    reinforcement_h: calculatedGeometryNumber(computed.reinforcementH),
    underfill_h: calculatedGeometryNumber(computed.underfillH),
    asymmetry_h: calculatedGeometryNumber(computed.asymmetryH),
    profile_class: computed.profileClass ?? null,
    aA_source: computed.aASource ?? null,
    combined_features: Boolean(computed.combinedFeatures),
    tolerance_mm: computed.tolerance,
    model_stable: Boolean(computed.modelStable),
    points: computed.points ?? null,
    interpolation_t: calculatedGeometryNumber(computed.interpolationT),
    minimum_t: calculatedGeometryNumber(computed.minimumT),
    calculation_valid: Boolean(computed.valid),
    calculation_errors: [...(computed.errors || [])],
  };
}
