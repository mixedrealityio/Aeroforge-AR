import test from 'node:test';
import assert from 'node:assert/strict';

import {AeroAssemblyEngine} from './assemblyEngine';

test('enforces sequential aerospace assembly prerequisites', () => {
  const engine = new AeroAssemblyEngine('turbofan_core');

  const blocked = engine.installStep(3);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.kind, 'blocked');
  assert.equal(engine.isStepInstalled(3), false);
  assert.equal(engine.getCurrentStep().id, 1);

  const installed1 = engine.installStep(1);
  assert.equal(installed1.ok, true);
  assert.equal(engine.isStepInstalled(1), true);
  assert.equal(engine.getCurrentStep().id, 2);
});

test('gates QC inspection until subassembly is installed and detects shop-floor anomalies', () => {
  const engine = new AeroAssemblyEngine('turbofan_core');

  const premature = engine.inspectCheckpoint('CP-01');
  assert.equal(premature.ok, false);
  assert.equal(premature.kind, 'blocked');

  for (let id = 1; id <= 6; id++) {
    const res = engine.installStep(id);
    assert.equal(res.ok, true);
  }
  assert.equal(engine.computeSummary().installedCount, 6);

  const scanRes = engine.inspectAllInstalled();
  assert.equal(scanRes.ok, true);
  assert.equal(scanRes.kind, 'inspect_fail');

  const summaryAfterScan = engine.computeSummary();
  assert.equal(summaryAfterScan.compliantCount, 4);
  assert.equal(summaryAfterScan.activeDefectCount, 2);
  assert.equal(summaryAfterScan.canSignOff, false);

  const cp04 = engine.selectCheckpoint('CP-04');
  assert.equal(cp04.status, 'fail');
  assert.equal(cp04.measuredValue, 0.34);

  const cp05 = engine.selectCheckpoint('CP-05');
  assert.equal(cp05.status, 'fail');
  assert.equal(cp05.measuredValue, 138.0);
});

test('rework calibrates out-of-spec defects and unlocks FAA Form 8130-3 sign-off', () => {
  const engine = new AeroAssemblyEngine('turbofan_core');
  for (let id = 1; id <= 6; id++) {
    engine.installStep(id);
  }
  engine.inspectAllInstalled();

  const blockedSignoff = engine.signOffAirworthiness();
  assert.equal(blockedSignoff.ok, false);

  const rework4 = engine.reworkCheckpoint('CP-04');
  assert.equal(rework4.ok, true);
  assert.equal(rework4.kind, 'rework');

  const rework5 = engine.reworkCheckpoint('CP-05');
  assert.equal(rework5.ok, true);
  assert.equal(rework5.kind, 'rework');

  const summaryReady = engine.computeSummary();
  assert.equal(summaryReady.activeDefectCount, 0);
  assert.equal(summaryReady.compliantCount, 6);
  assert.equal(summaryReady.reworkedCount, 2);
  assert.equal(summaryReady.canSignOff, true);

  const signed = engine.signOffAirworthiness();
  assert.equal(signed.ok, true);
  assert.equal(signed.kind, 'signoff');
  assert.equal(engine.computeSummary().signedOff, true);
  assert.ok(engine.computeSummary().certificateCode?.includes('8130-3'));
});

test('computes exploded axial offsets and nacelle cutaway spread accurately', () => {
  const engine = new AeroAssemblyEngine('turbofan_core');
  for (let id = 1; id <= 6; id++) {
    engine.installStep(id);
  }

  engine.setExplodedFactor(1.0);
  engine.setCutawayEnabled(true);
  const targets = engine.computePartTransformTargets();

  const fanTarget = targets.find((t) => t.stepId === 2)!;
  const turbineTarget = targets.find((t) => t.stepId === 5)!;
  const nacelleTarget = targets.find((t) => t.stepId === 6)!;

  assert.ok(fanTarget.targetPosition[2] > 0.5);
  assert.ok(turbineTarget.targetPosition[2] < -0.5);
  assert.ok(nacelleTarget.nacelleHalfSpreadX > 0.3);
});

test('supports OmniStep Fuselage Panel Build-Up (ABS2277VV40B) procedure and canonical traceability export', () => {
  const engine = new AeroAssemblyEngine('panel_buildup');
  assert.equal(engine.getScenario().workOrderId, 'WO-F6X-2277');
  assert.equal(engine.getCurrentStep().partNumber, 'ABS2277VV40B');
  assert.ok(engine.getCurrentStep().warningText.includes('ABS2277VV30B'));

  for (let id = 1; id <= 6; id++) {
    assert.equal(engine.installStep(id).ok, true);
  }
  assert.deepEqual(engine.getCompletedStepCodes(), [
    'STEP-01',
    'STEP-02',
    'STEP-03',
    'STEP-04',
    'STEP-05',
    'STEP-06',
  ]);

  const scan = engine.inspectAllInstalled();
  assert.equal(scan.kind, 'inspect_fail');
  assert.equal(engine.reworkCheckpoint('CP-04').ok, true);
  assert.equal(engine.reworkCheckpoint('CP-05').ok, true);

  const signed = engine.signOffAirworthiness();
  assert.equal(signed.ok, true);
  assert.equal(engine.computeSummary().certificateCode, 'FAA-8130-3-F6X-2277-PASS');

  // Switching scenario resets state cleanly and increments session nonce
  const prevNonce = engine.getSessionNonce();
  engine.setScenario('turbofan_core');
  assert.equal(engine.getScenarioId(), 'turbofan_core');
  assert.equal(engine.computeSummary().installedCount, 0);
  assert.equal(engine.getSessionNonce(), prevNonce + 1);
});

test('applyWorkflowSteps updates step descriptions, 3D entity IDs, and linked QC torque checkpoints', () => {
  const engine = new AeroAssemblyEngine('panel_buildup');
  engine.installStep(1);
  engine.installStep(2);

  engine.applyWorkflowSteps('panel_buildup', [
    {
      stepNumber: 2,
      title: 'Click-Stud Brackets (9.6 N·m Spec)',
      description: 'Apply 9.6 N·m calibrated torque to 6x click-stud brackets.',
      warningText: 'Orient retention slot +Y.',
      requiredTorqueNm: 9.6,
      torqueMinNm: 9.1,
      torqueMaxNm: 10.1,
      modelEntityIds: ['ENT-F6X-CLICK-BRACKETS'],
      highlightColorHex: '#34d399',
    },
  ]);

  const step2 = engine.getStep(2)!;
  assert.equal(step2.name, 'Click-Stud Brackets (9.6 N·m Spec)');
  assert.equal(
    step2.instruction,
    'Apply 9.6 N·m calibrated torque to 6x click-stud brackets.',
  );
  assert.equal(step2.requiredTorqueNm, 9.6);
  assert.deepEqual(step2.modelEntityIds, ['ENT-F6X-CLICK-BRACKETS']);

  const cp02 = engine.selectCheckpoint('CP-02');
  assert.equal(cp02.spec.nominal, 9.6);
  assert.equal(cp02.spec.minAllowed, 9.1);
  assert.equal(cp02.spec.maxAllowed, 10.1);

  const inspectRes = engine.inspectCheckpoint('CP-02');
  assert.equal(inspectRes.kind, 'inspect_pass');
  assert.equal(engine.selectCheckpoint('CP-02').measuredValue, 9.6);
});

