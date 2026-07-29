import { RuleEngine, EngineError, RequestError } from './engine.js?v=bc918a37258f';
import { deriveFilletGeometryStatus, normalizeFilletGeometryPayload } from './geometry.js';

export function createEvaluationService(library, config) {
  const engine = new RuleEngine(library);
  const rulesById = Object.fromEntries(library.rules.map((rule) => [rule.rule_id, rule]));

  function normalizePayload(payload = {}) {
    const normalized = {
      ...payload,
      geometry: { ...(payload.geometry ?? {}) },
    };
    if (payload.joint_type === 'fillet') {
      normalized.geometry = normalizeFilletGeometryPayload(normalized.geometry);
    }
    return normalized;
  }

  function editionConfig(ruleId, edition) {
    return rulesById[ruleId].editions[String(edition)];
  }

  function criterionCatalog() {
    return config.criteria.map((item) => {
      const rule = rulesById[item.rule_id];
      const ui = rule.editions['2023'].ui;
      return {
        ...item,
        table_no: rule.table_no,
        name: rule.name,
        description: rule.description,
        ui,
      };
    });
  }

  function baseValues(payload, edition) {
    const g = payload.geometry ?? {};
    const values = {};
    if (g.t !== null && g.t !== undefined && g.t !== '') {
      values.plate_thickness_t = Number(g.t);
      values.smaller_thickness_t = Number(g.t);
    }
    if (g.s !== null && g.s !== undefined && g.s !== '') values.weld_thickness_s = Number(g.s);
    if (g.a !== null && g.a !== undefined && g.a !== '') values.required_throat_a = Number(g.a);
    if (g.aA !== null && g.aA !== undefined && g.aA !== '') {
      values.actual_throat_aA = Number(g.aA);
      values.actual_throat = Number(g.aA);
    }
    if (g.z1 !== null && g.z1 !== undefined && g.z1 !== '') values.leg_length_z1 = Number(g.z1);
    if (g.z2 !== null && g.z2 !== undefined && g.z2 !== '') values.leg_length_z2 = Number(g.z2);
    if (payload.joint_type === 'fillet') {
      const reference = edition === 2023 ? g.aA : g.a;
      if (reference !== null && reference !== undefined && reference !== '') values.fillet_reference = Number(reference);
    }
    return values;
  }

  function validatePayload(payload) {
    const errors = [];
    if (!['fillet', 'butt'].includes(payload.joint_type)) errors.push('Nahtart muss Kehlnaht oder Stumpfnaht sein.');
    if (!['B', 'C', 'D'].includes(payload.required_quality)) errors.push('Geforderte Bewertungsgruppe muss B, C oder D sein.');
    const t = Number(payload.geometry?.t);
    if (!Number.isFinite(t)) errors.push('Die Bauteildicke t ist erforderlich.');
    else if (t < 0.5) errors.push('Die Bauteildicke t muss mindestens 0,5 mm betragen.');

    if (payload.joint_type === 'butt') {
      const s = Number(payload.geometry?.s);
      if (!Number.isFinite(s)) errors.push('Die Nahtdicke s ist für die Stumpfnaht erforderlich.');
      else if (s <= 0) errors.push('Die Nahtdicke s muss größer als 0 mm sein.');
    } else {
      for (const [key, label] of [
        ['a', 'Nenn-Kehlnahtdicke a'], ['aA', 'tatsächliche Kehlnahtdicke aA'],
        ['z1', 'Schenkellänge z1'], ['z2', 'Schenkellänge z2'],
      ]) {
        const value = Number(payload.geometry?.[key]);
        if (!Number.isFinite(value)) errors.push(`${label} ist erforderlich.`);
        else if (value <= 0) errors.push(`${label} muss größer als 0 mm sein.`);
      }
    }

    if (!payload.accessibility?.face && !payload.accessibility?.root) {
      errors.push('Mindestens eine Prüfseite muss zugänglich sein.');
    }
    for (const message of payload.geometry?.calculation_errors ?? []) errors.push(message);
    return [...new Set(errors)];
  }

  function inspectionSide(criterion, payload, edition) {
    const configured = criterion.side ?? 'auto';
    if (['face', 'root'].includes(configured)) return configured;
    const applicability = editionConfig(criterion.rule_id, edition).applicability;
    if (applicability.face_side && payload.accessibility?.face) return 'face';
    if (applicability.root_side && payload.accessibility?.root) return 'root';
    return applicability.face_side ? 'face' : 'root';
  }

  function normalizeRuleValues(ruleId, values, payload) {
    const presenceDefaults = {
      'IMP-000001': 'crack_present',
      'IMP-000002': 'crater_crack_present',
      'IMP-000003': 'surface_pore_present',
      'IMP-000004': 'open_crater_present',
      'IMP-000005': 'lack_of_fusion_visible',
      'IMP-000013': 'overlap_present',
      'IMP-000015': 'burn_through_present',
      'IMP-000018': 'root_porosity_present',
      'IMP-000019': 'restart_imperfection_present',
      'IMP-000022': 'arc_strike_present',
      'IMP-000023': 'spatter_present',
      'IMP-000024': 'temper_colours_present',
    };
    const presenceField = presenceDefaults[ruleId];
    if (presenceField && !Object.hasOwn(values, presenceField)) values[presenceField] = false;

    const numericDefaults = {
      'IMP-000003': ['pore_diameter_d'],
      'IMP-000004': ['crater_depth_h', 'crater_diameter_d'],
      'IMP-000006': ['root_penetration_h'],
      'IMP-000007': ['undercut_left_h', 'undercut_right_h'],
      'IMP-000008': ['root_undercut_h'],
      'IMP-000009': ['butt_reinforcement_h'],
      'IMP-000010': ['fillet_reinforcement_h'],
      'IMP-000011': ['root_reinforcement_h'],
      'IMP-000013': ['overlap_height_h', 'overlap_width_b'],
      'IMP-000014': ['sagging_height_h'],
      'IMP-000017': ['root_concavity_h'],
      'IMP-000038': ['misalignment_h'],
      'IMP-000039': ['fitup_gap_h'],
    };
    for (const field of numericDefaults[ruleId] ?? []) {
      if (!Object.hasOwn(values, field)) values[field] = 0;
    }

    if (ruleId === 'IMP-000005' && !Object.hasOwn(values, 'micro_lack_of_fusion_detected')) values.micro_lack_of_fusion_detected = false;
    if (['IMP-000006', 'IMP-000008', 'IMP-000014', 'IMP-000017', 'IMP-000020'].includes(ruleId) && !Object.hasOwn(values, 'short_imperfection_confirmed')) values.short_imperfection_confirmed = true;
    if (['IMP-000007', 'IMP-000008', 'IMP-000009', 'IMP-000010', 'IMP-000014', 'IMP-000017'].includes(ruleId) && !Object.hasOwn(values, 'smooth_transition')) values.smooth_transition = true;
    if (ruleId === 'IMP-000007') {
      if (Number(payload.geometry?.t ?? 0) > 3) values.short_imperfection_confirmed = true;
      else if (!Object.hasOwn(values, 'short_imperfection_confirmed')) values.short_imperfection_confirmed = true;
    }
    if (ruleId === 'IMP-000009' && !Object.hasOwn(values, 'butt_reinforcement_width_b')) values.butt_reinforcement_width_b = 10;
    if (ruleId === 'IMP-000010' && !Object.hasOwn(values, 'fillet_reinforcement_width_b')) values.fillet_reinforcement_width_b = 10;
    if (ruleId === 'IMP-000011' && !Object.hasOwn(values, 'root_reinforcement_width_b')) values.root_reinforcement_width_b = 5;
    if (ruleId === 'IMP-000012') {
      if (payload.joint_type === 'butt') {
        if (!Object.hasOwn(values, 'transition_angle_alpha')) values.transition_angle_alpha = 180;
      } else {
        if (!Object.hasOwn(values, 'transition_angle_alpha1')) values.transition_angle_alpha1 = 180;
        if (!Object.hasOwn(values, 'transition_angle_alpha2')) values.transition_angle_alpha2 = 180;
      }
    }
    if (ruleId === 'IMP-000014' && !Object.hasOwn(values, 'sagging_variant')) values.sagging_variant = '509';
    if (ruleId === 'IMP-000016' && !Object.hasOwn(values, 'asymmetric_fillet_specified')) values.asymmetric_fillet_specified = false;
    if (ruleId === 'IMP-000018' && !values.root_porosity_present) delete values.application_accepts_root_porosity;
    if (ruleId === 'IMP-000019' && values.restart_imperfection_present && !Object.hasOwn(values, 'resulting_imperfection')) values.resulting_imperfection = 'Andere';
    if (ruleId === 'IMP-000020' && !Object.hasOwn(values, 'greater_penetration_proven')) values.greater_penetration_proven = false;
    if (ruleId === 'IMP-000022' && !values.arc_strike_present) delete values.base_material_affected;
    if (ruleId === 'IMP-000023' && !values.spatter_present) delete values.spatter_project_requirement_met;
    if (ruleId === 'IMP-000024' && !values.temper_colours_present) delete values.temper_colours_project_requirement_met;
    if (ruleId === 'IMP-000038' && !Object.hasOwn(values, 'misalignment_variant')) values.misalignment_variant = '5071';
    if (ruleId === 'IMP-000039' && !Object.hasOwn(values, 'compensation_by_increased_throat')) values.compensation_by_increased_throat = false;
  }

  function buildRuleRequests(payload, edition) {
    const requests = [];
    const commonValues = baseValues(payload, edition);
    for (const criterion of config.criteria) {
      if (!criterion.joint_types.includes(payload.joint_type)) continue;
      const ruleId = criterion.rule_id;
      const submitted = payload.criteria?.[ruleId] ?? {};
      const values = {};
      const submittedValues = submitted.values ?? submitted;
      for (const [key, value] of Object.entries(submittedValues)) {
        if (value !== null && value !== undefined) values[key] = value;
      }

      // Allgemeine und berechnete Geometriewerte sind systemgeführt und dürfen
      // nicht durch kriterienspezifisch übergebene Werte auseinanderlaufen.
      Object.assign(values, commonValues);
      if (payload.joint_type === 'fillet' && ruleId === 'IMP-000010') {
        values.fillet_reinforcement_h = payload.geometry.reinforcement_h;
        values.fillet_reinforcement_width_b = payload.geometry.b;
      }
      if (payload.joint_type === 'butt' && ruleId === 'IMP-000009') {
        values.butt_reinforcement_width_b = payload.geometry.b;
      }
      normalizeRuleValues(ruleId, values, payload);

      const ruleRequest = {
        rule_id: ruleId,
        required_quality: submitted.required_quality || payload.required_quality,
        inspection_side: inspectionSide(criterion, payload, edition),
        values,
      };
      if (submitted.variant) ruleRequest.variant = submitted.variant;
      else if (['IMP-000038', 'IMP-000014'].includes(ruleId)) {
        ruleRequest.variant = values.misalignment_variant || values.sagging_variant;
      }
      requests.push(ruleRequest);
    }
    return requests;
  }

  function decorateResults(result) {
    for (const item of result.results) {
      const rule = rulesById[item.rule_id];
      item.ui = rule.editions[String(item.edition)].ui;
      item.description = rule.description;
    }
    return result;
  }

  function evaluateEdition(payload, edition) {
    return engine.evaluateInspection({
      edition,
      joint_type: payload.joint_type,
      required_quality: payload.required_quality,
      accessibility: payload.accessibility,
      rule_requests: buildRuleRequests(payload, edition),
    });
  }

  function evaluateFilletGeometryStatus(payload) {
    const reinforcementCriterion = payload.criteria?.['IMP-000010'] ?? {};
    const reinforcementValues = reinforcementCriterion.values ?? reinforcementCriterion;
    const dimensionalPayload = {
      ...payload,
      criteria: {
        ...(payload.criteria ?? {}),
        'IMP-000010': {
          ...reinforcementCriterion,
          values: {
            ...reinforcementValues,
            // RGL-01 bewertet an Nr. 1.10 ausschließlich h und b.
            // Der weiche Übergang bleibt Teil der vollständigen Normbewertung.
            smooth_transition: true,
          },
        },
      },
    };
    return deriveFilletGeometryStatus(evaluateEdition(dimensionalPayload, 2023));
  }

  function evaluatePayload(payload) {
    const normalizedPayload = normalizePayload(payload);
    const errors = validatePayload(normalizedPayload);
    if (errors.length) throw new RequestError(errors.join('\n'));
    const primary = decorateResults(evaluateEdition(normalizedPayload, 2023));
    const comparison = normalizedPayload.compare_2014 ? decorateResults(evaluateEdition(normalizedPayload, 2014)) : null;
    const geometry = {...(normalizedPayload.geometry ?? {})};
    if (normalizedPayload.joint_type === 'fillet') {
      geometry.geometry_status = evaluateFilletGeometryStatus(normalizedPayload);
    }
    return {
      assistant_version: config.prototype_version,
      app_mode: config.app_mode ?? 'test',
      report: normalizedPayload.report ?? {},
      geometry,
      accessibility: normalizedPayload.accessibility ?? {},
      primary,
      comparison,
      generated_at: new Date().toISOString(),
    };
  }

  return {
    engine,
    config: {
      ...config,
      criteria: criterionCatalog(),
      library: {
        version: library.metadata.library_version,
        content_sha256: library.metadata.content_sha256,
      },
    },
    evaluatePayload,
    validatePayload: payload => validatePayload(normalizePayload(payload)),
    buildRuleRequests: (payload, edition) => buildRuleRequests(normalizePayload(payload), edition),
  };
}

export { EngineError, RequestError };
