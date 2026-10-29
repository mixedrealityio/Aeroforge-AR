import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RAW_TECHNICIAN_NOTES,
  DimeoAndroidXrEngine,
  parseDimeoVoiceCommand,
} from './dimeoEngine';

test('parseDimeoVoiceCommand recognizes French, English, and Spanish hands-free commands', () => {
  assert.equal(parseDimeoVoiceCommand('Étape suivante s’il vous plaît'), 'next_step');
  assert.equal(parseDimeoVoiceCommand('Next step'), 'next_step');
  assert.equal(parseDimeoVoiceCommand('Paso siguiente'), 'next_step');
  assert.equal(parseDimeoVoiceCommand('Précédent'), 'prev_step');
  assert.equal(parseDimeoVoiceCommand('Valider cette étape'), 'validate_step');
  assert.equal(parseDimeoVoiceCommand('Prendre une photo'), 'capture_photo');
  assert.equal(parseDimeoVoiceCommand('Suivre ma tête'), 'toggle_follow_head');
  assert.equal(parseDimeoVoiceCommand('Lire l’instruction'), 'read_aloud');
  assert.equal(parseDimeoVoiceCommand('Placer une flèche'), 'place_arrow');
  assert.equal(parseDimeoVoiceCommand('ambient hangar noise'), null);
});

test('DimeoAndroidXrEngine localizes steps (EN/FR/ES), branches QCM guidance, and toggles optional AR/Follow modes', () => {
  const dimeo = new DimeoAndroidXrEngine();

  // Default English
  const enPres = dimeo.resolveStepPresentation(
    'panel_buildup',
    4,
    'Avionics & ECS Harness P-Clamp Rail',
    'Route braided harness.',
    'WARNING: Maintain >= 6.5 mm.',
  );
  assert.equal(enPres.selectedQcm, null);
  assert.ok(enPres.qcm.options.length === 3);

  // Switch to French and answer corrective QCM branch
  dimeo.setLanguage('fr');
  dimeo.answerStepQcm('panel_buildup', 4, 'corrective_rework');
  const frPres = dimeo.resolveStepPresentation(
    'panel_buildup',
    4,
    'Avionics & ECS Harness P-Clamp Rail',
    'Route braided harness.',
    'WARNING: Maintain >= 6.5 mm.',
  );
  assert.match(frPres.title, /Colliers P/i);
  assert.equal(frPres.selectedQcm, 'corrective_rework');
  assert.match(frPres.adaptiveBanner, /NAS1149/);

  // Optional AR indicators toggle ("Ces technologies sont optionnelles dans Dimeo")
  assert.ok(dimeo.getActiveStepMarkers('panel_buildup', 1).length >= 2);
  dimeo.setArIndicatorsEnabled(false);
  assert.equal(dimeo.getActiveStepMarkers('panel_buildup', 1).length, 0);
  dimeo.setArIndicatorsEnabled(true);

  // Follow-Head vs World-Pinned toggle
  assert.equal(dimeo.isFollowHeadEnabled(), false);
  assert.equal(dimeo.toggleFollowHead(), true);
});

test('Dimeo Recorder captures field know-how steps and publishes a playable AR module', () => {
  const dimeo = new DimeoAndroidXrEngine();
  dimeo.startFieldRecording();
  assert.equal(dimeo.isFieldRecordingActive(), true);

  const emptyAttempt = dimeo.captureFieldStep({
    noteText: '  ',
    markerType: 'arrow',
    worldPosition: [0.1, 1.3, -1.4],
  });
  assert.equal(emptyAttempt.ok, false);

  const s1 = dimeo.captureFieldStep({
    noteText: 'Inspect rotor brake caliper pad thickness 4.5 mm (warning: hot disc)',
    markerType: 'circle_ring',
    worldPosition: [0.12, 1.32, -1.45],
    snapshotDataUrl: 'data:image/jpeg;base64,AAA',
  });
  assert.equal(s1.ok, true);

  const s2 = dimeo.captureFieldStep({
    noteText: 'Torque caliper bleed valve to 14.0 N·m and install safety cap',
    markerType: 'arrow',
    worldPosition: [-0.08, 1.28, -1.42],
  });
  assert.equal(s2.ok, true);

  const pub = dimeo.publishRecordedModule('H145M Rotor Brake Check');
  assert.equal(pub.ok, true);
  assert.equal(pub.stepCount, 2);
  assert.equal(dimeo.isCustomModuleActive(), true);
  assert.equal(dimeo.getActiveStepMarkers('panel_buildup', 2)[0]?.type, 'arrow');
});

test('On-device AI structures raw technician notes, translates FR/ES, and exports supervision CSV', () => {
  const dimeo = new DimeoAndroidXrEngine();
  const res = dimeo.structureRawProcedureWithAi(
    DEFAULT_RAW_TECHNICIAN_NOTES.en,
    'Swashplate Pitch-Link SOP',
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.steps.length, 3);
  assert.equal(res.steps[1].extractedTorqueNm, 24.5);
  assert.match(res.steps[1].extractedToleranceLabel, /0\.15\s*mm/i);
  assert.match(res.steps[0].warningText, /nitrile gloves/i);

  // Translate structured module to French
  dimeo.translateCustomStepsWithAi('fr');
  assert.match(dimeo.getCustomSteps()[0].instruction, /\[SOP RA\]/);

  // Shared workstation account mode + comment + photo + CSV export
  dimeo.setAccountMode('shared_station');
  dimeo.setSharedStationBadge('POSTE-MRO-04');
  dimeo.validateStep('panel_buildup', 1);
  dimeo.attachStepPhoto({
    stepNumber: 1,
    dataUrl: 'data:image/jpeg;base64,TEST',
  });
  const commentRes = dimeo.addStepComment({
    stepNumber: 1,
    category: 'kaizen',
    message: 'Add angled mirror check for aft clevis pin.',
  });
  assert.equal(commentRes.ok, true);

  const csv = dimeo.exportSupervisionCsv('panel_buildup', 'WO-F6X-2277');
  assert.match(csv, /POSTE-MRO-04/);
  assert.match(csv, /Add angled mirror check/);
});
