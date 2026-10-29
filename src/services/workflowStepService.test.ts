import assert from 'node:assert/strict';
import test from 'node:test';

import type {WorkflowStepDraft} from '../firebase/payloadValidation';
import {
  WorkflowStepService,
  type WorkflowStepBackend,
  type WorkflowStepRecord,
} from './workflowStepService';

class InMemoryCloudBackend implements WorkflowStepBackend {
  user: {uid: string; emailVerified: boolean} | null = null;
  docs = new Map<string, WorkflowStepRecord>();
  seedCalls = 0;
  upsertCalls = 0;
  private subscribers = new Set<(records: WorkflowStepRecord[]) => void>();

  getAuthenticatedUser() {
    return this.user;
  }

  async listOperatorSteps(uid: string): Promise<WorkflowStepRecord[]> {
    return Array.from(this.docs.values()).filter((d) => d.operatorUid === uid);
  }

  subscribeOperatorSteps(
    uid: string,
    onRecords: (records: WorkflowStepRecord[]) => void,
  ): () => void {
    const listener = (all: WorkflowStepRecord[]) => {
      onRecords(all.filter((d) => d.operatorUid === uid));
    };
    this.subscribers.add(listener);
    listener(Array.from(this.docs.values()));
    return () => {
      this.subscribers.delete(listener);
    };
  }

  async seedMissingSteps(
    uid: string,
    drafts: readonly WorkflowStepDraft[],
  ): Promise<void> {
    this.seedCalls += 1;
    const nowIso = new Date().toISOString();
    for (const draft of drafts) {
      this.docs.set(draft.stepDocId, {
        ...draft,
        operatorUid: uid,
        updatedAtIso: nowIso,
        source: 'cloud',
      });
    }
    this.broadcast();
  }

  async upsertStep(uid: string, draft: WorkflowStepDraft): Promise<void> {
    this.upsertCalls += 1;
    this.docs.set(draft.stepDocId, {
      ...draft,
      operatorUid: uid,
      updatedAtIso: new Date().toISOString(),
      source: 'cloud',
    });
    this.broadcast();
  }

  private broadcast(): void {
    const all = Array.from(this.docs.values());
    for (const sub of this.subscribers) {
      sub(all);
    }
  }
}

test('WorkflowStepService seeds 6 default steps per scenario with torque and 3D entity IDs', () => {
  const backend = new InMemoryCloudBackend();
  const service = new WorkflowStepService(backend);

  const panelSteps = service.getSteps('panel_buildup');
  assert.equal(panelSteps.length, 6);
  assert.deepEqual(panelSteps[0].modelEntityIds, [
    'ENT-F6X-PINS-40MM',
    'ENT-F6X-PIN-BASES',
  ]);
  assert.equal(panelSteps[1].requiredTorqueNm, 8.5);
  assert.equal(panelSteps[1].torqueMinNm, 8.0);
  assert.equal(panelSteps[1].torqueMaxNm, 9.0);

  const turbofanSteps = service.getSteps('turbofan_core');
  assert.equal(turbofanSteps.length, 6);
  assert.equal(turbofanSteps[1].requiredTorqueNm, 420.0);
  assert.ok(turbofanSteps[1].modelEntityIds.includes('ENT-TF90-FAN-BLADES'));
});

test('WorkflowStepService fetches and seeds Cloud Firestore steps for verified Google operator', async () => {
  const backend = new InMemoryCloudBackend();
  backend.user = {uid: 'googleOp42', emailVerified: true};
  const service = new WorkflowStepService(backend);

  const fetched = await service.fetchWorkflowSteps('panel_buildup');
  assert.equal(fetched.length, 6);
  assert.equal(backend.seedCalls, 1);
  assert.equal(backend.docs.size, 6);

  const updated = await service.updateWorkflowStep('panel_buildup', 2, {
    title: 'Click-Stud Brackets (Custom Torque)',
    description:
      'Seat 6x NSA5516-22 click-stud brackets and apply calibrated 9.4 N·m digital torque.',
    warningText: 'Verify upper retention tab faces +Y.',
    requiredTorqueNm: 9.4,
    torqueMinNm: 8.9,
    torqueMaxNm: 9.9,
    modelEntityIds: ['ENT-F6X-CLICK-BRACKETS'],
    highlightColorHex: '#34d399',
  });

  assert.equal(backend.upsertCalls, 1);
  assert.equal(updated.requiredTorqueNm, 9.4);
  assert.deepEqual(updated.modelEntityIds, ['ENT-F6X-CLICK-BRACKETS']);
  assert.equal(updated.source, 'cloud');

  const storedCloudDoc = backend.docs.get('wf_googleOp42_panel_buildup_step02');
  assert.ok(storedCloudDoc);
  assert.equal(storedCloudDoc.requiredTorqueNm, 9.4);
  assert.equal(storedCloudDoc.torqueMinNm, 8.9);
  assert.equal(storedCloudDoc.torqueMaxNm, 9.9);
});

test('WorkflowStepService rejects invalid torque envelopes, short descriptions, and cross-scenario entity IDs', async () => {
  const backend = new InMemoryCloudBackend();
  const service = new WorkflowStepService(backend);

  await assert.rejects(
    () =>
      service.updateWorkflowStep('panel_buildup', 2, {
        title: 'Click-Stud Brackets',
        description: 'Valid description for step two torque test.',
        warningText: '',
        requiredTorqueNm: 8.5,
        torqueMinNm: 11.0, // min > nominal!
        torqueMaxNm: 12.0,
        modelEntityIds: ['ENT-F6X-CLICK-BRACKETS'],
        highlightColorHex: '#38bdf8',
      }),
    /Torque tolerance envelope invalid/,
  );

  await assert.rejects(
    () =>
      service.updateWorkflowStep('panel_buildup', 2, {
        title: 'Click-Stud Brackets',
        description: 'Too', // < 5 chars!
        warningText: '',
        requiredTorqueNm: 8.5,
        torqueMinNm: 8.0,
        torqueMaxNm: 9.0,
        modelEntityIds: ['ENT-F6X-CLICK-BRACKETS'],
        highlightColorHex: '#38bdf8',
      }),
    /Step description must be between 5 and 500 characters/,
  );

  await assert.rejects(
    () =>
      service.updateWorkflowStep('panel_buildup', 2, {
        title: 'Click-Stud Brackets',
        description: 'Valid step description with illegal turbofan entity.',
        warningText: '',
        requiredTorqueNm: 8.5,
        torqueMinNm: 8.0,
        torqueMaxNm: 9.0,
        modelEntityIds: ['ENT-TF90-FAN-BLADES'], // wrong scenario!
        highlightColorHex: '#38bdf8',
      }),
    /does not belong to panel_buildup/,
  );
});

test('WorkflowStepService resolves step vs spotlight AR entity highlights and resets cleanly', async () => {
  const backend = new InMemoryCloudBackend();
  const service = new WorkflowStepService(backend);

  const initial = service.resolveArHighlightState('panel_buildup', 1);
  assert.equal(initial.enabled, true);
  assert.equal(initial.mode, 'step');
  assert.deepEqual(initial.entityIds, ['ENT-F6X-PINS-40MM', 'ENT-F6X-PIN-BASES']);

  // Spotlight a single 3D entity in AR
  service.toggleSpotlightEntity('panel_buildup', 'ENT-F6X-KAPTON-BLANKET');
  const spotlighted = service.resolveArHighlightState('panel_buildup', 1);
  assert.equal(spotlighted.mode, 'spotlight');
  assert.deepEqual(spotlighted.entityIds, ['ENT-F6X-KAPTON-BLANKET']);

  // Disable AR highlight globally
  service.toggleArHighlight(false);
  const disabled = service.resolveArHighlightState('panel_buildup', 1);
  assert.equal(disabled.enabled, false);
  assert.deepEqual(disabled.entityIds, []);

  // Re-enable and verify resetScenarioSteps restores defaults
  service.toggleArHighlight(true);
  await service.updateWorkflowStep('panel_buildup', 1, {
    title: 'Temporary Custom Pin Step',
    description: 'Modified pin description before factory reset.',
    warningText: 'Custom warning',
    requiredTorqueNm: 2.5,
    torqueMinNm: 2.0,
    torqueMaxNm: 3.0,
    modelEntityIds: ['ENT-F6X-PINS-40MM'],
    highlightColorHex: '#f59e0b',
  });
  assert.equal(service.getStep('panel_buildup', 1).requiredTorqueNm, 2.5);

  await service.resetScenarioSteps('panel_buildup');
  assert.equal(service.getStep('panel_buildup', 1).requiredTorqueNm, 0);
  assert.deepEqual(service.getStep('panel_buildup', 1).modelEntityIds, [
    'ENT-F6X-PINS-40MM',
    'ENT-F6X-PIN-BASES',
  ]);
});
