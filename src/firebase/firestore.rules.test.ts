import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveOperatorBadge,
  evaluateFirestoreRuleContract,
  sanitizeAndValidateDimeoRunDraft,
  sanitizeAndValidateTraceabilityDraft,
  sanitizeAndValidateWorkflowStepDraft,
  validateWorkflowStepPatchInput,
  type SimulatedRuleContext,
} from './payloadValidation';

const NOW = 1_762_000_000_000;

function baseCtx(overrides?: Partial<SimulatedRuleContext>): SimulatedRuleContext {
  return {
    auth: {
      uid: 'uid_operator_1',
      email: 'kingofbrea@gmail.com',
      email_verified: true,
    },
    requestTimeMs: NOW,
    existingDocs: {
      'users/uid_operator_1': {
        uid: 'uid_operator_1',
        displayName: 'Lead Operator',
        photoUrl: '',
        operatorBadge: 'OPR-UIDOPE',
        createdAt: NOW - 5000,
        updatedAt: NOW - 5000,
      },
    },
    ...overrides,
  };
}

function validRunPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    runId: 'run_panel_001',
    operatorUid: 'uid_operator_1',
    operatorName: 'Lead Operator',
    scenarioId: 'panel_buildup',
    workOrderId: 'WO-F6X-2277',
    installedCount: 3,
    compliantCount: 3,
    activeDefectCount: 0,
    reworkedCount: 0,
    firstPassYieldPercent: 100,
    status: 'in_progress',
    certificateCode: '',
    completedSteps: ['STEP-01', 'STEP-02', 'STEP-03'],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function validWorkflowStepPayload(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    stepDocId: 'wf_uid_operator_1_panel_buildup_step02',
    operatorUid: 'uid_operator_1',
    scenarioId: 'panel_buildup',
    stepNumber: 2,
    canonicalCode: 'STEP-02',
    title: 'Click-Stud Retention Brackets (Stringer S-14)',
    partNumber: 'ABS1423FA02',
    description:
      'Snap 6 ABS1423FA02 click-stud standoffs onto stringer S-14 & S-15 flanges.',
    warningText: 'Orient locking tab UPWARD (+Y) toward Frame FR-14 web.',
    requiredTorqueNm: 8.5,
    torqueMinNm: 8.0,
    torqueMaxNm: 9.0,
    modelEntityIds: ['ENT-F6X-CLICK-BRACKETS', 'ENT-F6X-BRACKET-TABS'],
    highlightColorHex: '#60a5fa',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test('Dirty Dozen #1–#6: rejects identity spoofing, unverified emails, ghost fields, PII leaks, orphaned private info, and ID poisoning', () => {
  // 1. Identity spoofing on /users/{userId}
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: 'users/uid_victim',
      requestData: {
        uid: 'uid_victim',
        displayName: 'Spoofed',
        photoUrl: '',
        operatorBadge: 'OPR-000001',
        createdAt: NOW,
        updatedAt: NOW,
      },
      ctx: baseCtx(),
    }),
    false,
  );

  // 2. Email spoofing / unverified email write
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: 'users/uid_operator_1',
      requestData: {
        uid: 'uid_operator_1',
        displayName: 'Lead Operator',
        photoUrl: '',
        operatorBadge: 'OPR-000001',
        createdAt: NOW,
        updatedAt: NOW,
      },
      ctx: baseCtx({
        auth: {
          uid: 'uid_operator_1',
          email: 'kingofbrea@gmail.com',
          email_verified: false,
        },
      }),
    }),
    false,
  );

  // 3. Shadow ghost field injection (isAdmin: true)
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: 'users/uid_operator_1',
      requestData: {
        uid: 'uid_operator_1',
        displayName: 'Lead Operator',
        photoUrl: '',
        operatorBadge: 'OPR-000001',
        isAdmin: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
      ctx: baseCtx({existingDocs: {}}),
    }),
    false,
  );

  // 4. PII blanket read by non-owner on /users/{victim}/private/info
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'get',
      path: 'users/uid_victim/private/info',
      ctx: baseCtx({
        existingDocs: {
          'users/uid_victim': {uid: 'uid_victim'},
        },
      }),
    }),
    false,
  );

  // 5. Orphaned private PII write without parent /users/{uid}
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: 'users/uid_operator_1/private/info',
      requestData: {
        uid: 'uid_operator_1',
        email: 'kingofbrea@gmail.com',
        createdAt: NOW,
        updatedAt: NOW,
      },
      ctx: baseCtx({existingDocs: {}, afterDocs: {}}),
    }),
    false,
  );

  // 6. ID poisoning (200-char junk ID)
  const poisonedId = 'x'.repeat(200);
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: `traceabilityRuns/${poisonedId}`,
      requestData: validRunPayload({runId: poisonedId}),
      ctx: baseCtx(),
    }),
    false,
  );
});

test('Dirty Dozen #7–#12: rejects orphaned runs, unbounded arrays, value poisoning, terminal mutation, timestamp forgery, and cross-tenant list scraping', () => {
  // 7. Orphaned traceability run without parent /users/{uid}
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: 'traceabilityRuns/run_panel_001',
      requestData: validRunPayload(),
      ctx: baseCtx({existingDocs: {}}),
    }),
    false,
  );

  // 8. Unbounded array (> 6 steps)
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: 'traceabilityRuns/run_panel_001',
      requestData: validRunPayload({
        completedSteps: [
          'STEP-01',
          'STEP-02',
          'STEP-03',
          'STEP-04',
          'STEP-05',
          'STEP-06',
          'STEP-01',
        ],
      }),
      ctx: baseCtx(),
    }),
    false,
  );

  // 9. Value poisoning on update (installedCount as string)
  const existingRun = validRunPayload({createdAt: NOW - 2000, updatedAt: NOW - 2000});
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'update',
      path: 'traceabilityRuns/run_panel_001',
      resourceData: existingRun,
      requestData: validRunPayload({
        createdAt: NOW - 2000,
        installedCount: 'six',
      }),
      ctx: baseCtx(),
    }),
    false,
  );

  // 10. Terminal state mutation (modifying an already certified run)
  const certifiedRun = validRunPayload({
    installedCount: 6,
    compliantCount: 6,
    status: 'certified',
    certificateCode: 'EASA-FORM1-F6X-PASS',
    createdAt: NOW - 4000,
    updatedAt: NOW - 2000,
  });
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'update',
      path: 'traceabilityRuns/run_panel_001',
      resourceData: certifiedRun,
      requestData: validRunPayload({
        installedCount: 5,
        createdAt: NOW - 4000,
      }),
      ctx: baseCtx(),
    }),
    false,
  );

  // 11. Client timestamp forgery
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: 'traceabilityRuns/run_panel_001',
      requestData: validRunPayload({createdAt: NOW - 99999}),
      ctx: baseCtx(),
    }),
    false,
  );

  // 12. Cross-tenant list query scraping
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'list',
      path: 'traceabilityRuns/run_other_999',
      resourceData: validRunPayload({operatorUid: 'uid_another_operator'}),
      ctx: baseCtx(),
    }),
    false,
  );

  // Confirm legitimate owner create & list succeed
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: 'traceabilityRuns/run_panel_001',
      requestData: validRunPayload(),
      ctx: baseCtx(),
    }),
    true,
  );
});

test('/workflowSteps/{stepDocId}: enforces ownership, torque invariants, scenario entity allowlists, and immutable keys', () => {
  const docPath = 'workflowSteps/wf_uid_operator_1_panel_buildup_step02';

  // Legitimate owner create succeeds
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: docPath,
      requestData: validWorkflowStepPayload(),
      ctx: baseCtx(),
    }),
    true,
  );

  // Reject cross-scenario entity injection (turbofan entity inside panel_buildup step)
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: docPath,
      requestData: validWorkflowStepPayload({
        modelEntityIds: ['ENT-TF90-LP-SHAFT'],
      }),
      ctx: baseCtx(),
    }),
    false,
  );

  // Reject inverted torque envelope (torqueMinNm > requiredTorqueNm)
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: docPath,
      requestData: validWorkflowStepPayload({
        torqueMinNm: 12.0,
        requiredTorqueNm: 8.5,
        torqueMaxNm: 14.0,
      }),
      ctx: baseCtx(),
    }),
    false,
  );

  // Reject mismatched stepNumber vs canonicalCode
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: docPath,
      requestData: validWorkflowStepPayload({
        stepNumber: 2,
        canonicalCode: 'STEP-05',
      }),
      ctx: baseCtx(),
    }),
    false,
  );

  // Reject cross-tenant list read
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'list',
      path: docPath,
      resourceData: validWorkflowStepPayload({operatorUid: 'uid_intruder'}),
      ctx: baseCtx(),
    }),
    false,
  );

  // Reject immutable partNumber mutation on update, allow description/torque/entity update
  const existingStep = validWorkflowStepPayload({
    createdAt: NOW - 5000,
    updatedAt: NOW - 5000,
  });

  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'update',
      path: docPath,
      resourceData: existingStep,
      requestData: validWorkflowStepPayload({
        partNumber: 'HACKED-PN',
        createdAt: NOW - 5000,
        updatedAt: NOW,
      }),
      ctx: baseCtx(),
    }),
    false,
  );

  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'update',
      path: docPath,
      resourceData: existingStep,
      requestData: validWorkflowStepPayload({
        description: 'Updated calibrated torque instruction for Stringer S-14.',
        requiredTorqueNm: 9.2,
        torqueMinNm: 8.7,
        torqueMaxNm: 9.7,
        modelEntityIds: ['ENT-F6X-CLICK-BRACKETS'],
        createdAt: NOW - 5000,
        updatedAt: NOW,
      }),
      ctx: baseCtx(),
    }),
    true,
  );
});

test('client payload sanitizer clamps values and validates workflow step patches strictly', () => {
  assert.equal(deriveOperatorBadge('abc-123-xyz'), 'OPR-ABC123');
  const sanitized = sanitizeAndValidateTraceabilityDraft({
    runId: 'run_test_01',
    operatorUid: 'uid_operator_1',
    operatorName: '   Marie   Laurent   ',
    scenarioId: 'panel_buildup',
    workOrderId: 'WO-F6X-2277',
    installedCount: 6,
    compliantCount: 5,
    activeDefectCount: 1,
    reworkedCount: 0,
    firstPassYieldPercent: 83.4,
    status: 'certified',
    certificateCode: 'PREMATURE-CODE',
    completedSteps: ['STEP-01', 'INVALID_HACK', 'STEP-02'],
  });
  assert.equal(sanitized.operatorName, 'Marie Laurent');
  assert.equal(sanitized.status, 'in_progress');
  assert.equal(sanitized.certificateCode, '');
  assert.deepEqual(sanitized.completedSteps, ['STEP-01', 'STEP-02']);

  // Verify strict form patch validation rejects invalid inputs without silent fallback
  const badTorque = validateWorkflowStepPatchInput('panel_buildup', {
    title: 'Click-Stud Retention Brackets',
    description: 'Snap 6 standoffs onto stringer flanges.',
    warningText: '',
    requiredTorqueNm: 12,
    torqueMinNm: 8,
    torqueMaxNm: 10,
    modelEntityIds: ['ENT-F6X-CLICK-BRACKETS'],
    highlightColorHex: '#60a5fa',
  });
  assert.equal(badTorque.ok, false);

  const validDraft = sanitizeAndValidateWorkflowStepDraft({
    stepDocId: 'wf_uid1_turbofan_core_step02',
    operatorUid: 'uid_operator_1',
    scenarioId: 'turbofan_core',
    stepNumber: 2,
    canonicalCode: 'STEP-02',
    title: '18-Blade Wide-Chord Titanium Fan Rotor',
    partNumber: 'PN-TF90-204',
    description: 'Slide fan disk onto forward LP splines and torque spinner nut.',
    warningText: 'Match master spline index #01.',
    requiredTorqueNm: 420,
    torqueMinNm: 412,
    torqueMaxNm: 428,
    modelEntityIds: ['ENT-TF90-FAN-BLADES', 'ENT-TF90-SPINNER-LOCKNUT'],
    highlightColorHex: '#38bdf8',
  });
  assert.equal(validDraft.requiredTorqueNm, 420);
  assert.deepEqual(validDraft.modelEntityIds, [
    'ENT-TF90-FAN-BLADES',
    'ENT-TF90-SPINNER-LOCKNUT',
  ]);
});

test('/dimeoRuns/{dimeoRunId}: enforces ownership, bounded photo/comment counts, language allowlist, and immutable keys', () => {
  const docPath = 'dimeoRuns/dm_uid_operator_1_panel_buildup_s1';
  const validDimeoPayload = (overrides?: Record<string, unknown>) => ({
    dimeoRunId: 'dm_uid_operator_1_panel_buildup_s1',
    operatorUid: 'uid_operator_1',
    operatorLabel: 'POSTE-A1-MATIN',
    accountMode: 'shared_station',
    language: 'fr',
    scenarioId: 'panel_buildup',
    moduleTitle: 'Habillage Panneau Fuselage',
    validatedStepsCount: 2,
    qcmAnsweredCount: 2,
    photosCount: 1,
    commentsCount: 1,
    arEnabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

  // Legitimate owner create succeeds
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: docPath,
      requestData: validDimeoPayload(),
      ctx: baseCtx(),
    }),
    true,
  );

  // Shadow ghost field injection rejected
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: docPath,
      requestData: validDimeoPayload({ghostAdmin: true}),
      ctx: baseCtx(),
    }),
    false,
  );

  // Invalid language code rejected
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: docPath,
      requestData: validDimeoPayload({language: 'de'}),
      ctx: baseCtx(),
    }),
    false,
  );

  // Out-of-bounds photosCount (> 12) rejected
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'create',
      path: docPath,
      requestData: validDimeoPayload({photosCount: 99}),
      ctx: baseCtx(),
    }),
    false,
  );

  // Cross-tenant list read rejected
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'list',
      path: docPath,
      resourceData: validDimeoPayload({operatorUid: 'uid_intruder'}),
      ctx: baseCtx(),
    }),
    false,
  );

  // Immutable scenarioId mutation rejected on update, valid supervision update allowed
  const existingDimeo = validDimeoPayload({
    createdAt: NOW - 5000,
    updatedAt: NOW - 5000,
  });
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'update',
      path: docPath,
      resourceData: existingDimeo,
      requestData: validDimeoPayload({
        scenarioId: 'turbofan_core',
        createdAt: NOW - 5000,
        updatedAt: NOW,
      }),
      ctx: baseCtx(),
    }),
    false,
  );
  assert.equal(
    evaluateFirestoreRuleContract({
      op: 'update',
      path: docPath,
      resourceData: existingDimeo,
      requestData: validDimeoPayload({
        validatedStepsCount: 4,
        photosCount: 3,
        createdAt: NOW - 5000,
        updatedAt: NOW,
      }),
      ctx: baseCtx(),
    }),
    true,
  );

  const sanitized = sanitizeAndValidateDimeoRunDraft({
    dimeoRunId: 'dm_uid1_panel_s1',
    operatorUid: 'uid_operator_1',
    operatorLabel: '  POSTE-A1-MATIN  ',
    accountMode: 'shared_station',
    language: 'fr',
    scenarioId: 'panel_buildup',
    moduleTitle: '  Gamme Structurée par IA Locale  ',
    validatedStepsCount: 99,
    qcmAnsweredCount: 3,
    photosCount: 50,
    commentsCount: 40,
    arEnabled: true,
  });
  assert.equal(sanitized.validatedStepsCount, 6);
  assert.equal(sanitized.photosCount, 12);
  assert.equal(sanitized.commentsCount, 24);
});
