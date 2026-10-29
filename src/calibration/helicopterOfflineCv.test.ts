import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HELICOPTER_PROFILES,
  HelicopterOfflineCvCalibrator,
  XREAL_AURA_OPTICS,
  convertRgbaToPyramidLuma,
  projectToXrealEye,
  runHelicopterOfflineCvPipeline,
  triangulateXrealStereo,
} from './helicopterOfflineCv';

test('enforces XREAL Aura stereo optics with QR code scanning strictly disabled', () => {
  assert.equal(XREAL_AURA_OPTICS.deviceName, 'XREAL Aura');
  assert.equal(XREAL_AURA_OPTICS.qrCodeScanningEnabled, false);
  assert.equal(XREAL_AURA_OPTICS.stereoBaselineMeters, 0.112);

  const report = runHelicopterOfflineCvPipeline({
    variantId: 'h145m',
    standoffMeters: 1.85,
    occlusionPreset: 'clear_line_of_sight',
    seed: 101,
  });

  assert.equal(report.qrCodeScanningUsed, false);
  assert.equal(report.qrFinderPatternsDetected, 0);
  assert.equal(report.calibrationMethod, 'MARKERLESS_OFFLINE_STEREO_SILHOUETTE_PNP');
  assert.ok(report.sobelEdgePixels > 120, 'Expected Sobel silhouette edges on helicopter');
  assert.ok(report.shiTomasiCorners >= 8, 'Expected Shi-Tomasi corners on natural landmarks');
});

test('triangulates XREAL Aura stereo rays back to exact 3D metric coordinates', () => {
  const halfB = 0.5 * XREAL_AURA_OPTICS.stereoBaselineMeters;
  const target: readonly [number, number, number] = [0.18, 0.24, -1.85];

  const uvL = projectToXrealEye(target, -halfB);
  const uvR = projectToXrealEye(target, halfB);
  assert.ok(uvL && uvR);
  assert.ok(uvL[0] - uvR[0] > 60, 'Expected positive stereo disparity');

  const recovered = triangulateXrealStereo(uvL[0], uvL[1], uvR[0], uvR[1]);
  assert.ok(recovered);
  assert.ok(Math.abs(recovered[0] - target[0]) < 1e-9);
  assert.ok(Math.abs(recovered[1] - target[1]) < 1e-9);
  assert.ok(Math.abs(recovered[2] - target[2]) < 1e-9);
});

test('converges from >30 mm uncalibrated drift to <= 2.00 mm RMS across all 3 helicopter airframes', () => {
  for (const variantId of ['h145m', 'h160', 'as350'] as const) {
    const report = runHelicopterOfflineCvPipeline({
      variantId,
      standoffMeters: 1.85,
      occlusionPreset: 'clear_line_of_sight',
      seed: 4040,
    });

    assert.ok(
      report.initialDriftMm > 30,
      `Expected >30 mm initial VIO drift for ${variantId}, got ${report.initialDriftMm}`,
    );
    assert.equal(report.inlierCount, HELICOPTER_PROFILES[variantId].landmarks.length);
    assert.ok(
      report.rmsErrorMm <= 2.0,
      `Expected <= 2.00 mm calibrated RMS for ${variantId}, got ${report.rmsErrorMm} mm`,
    );
    assert.ok(report.reprojectionRmsPx < 0.35);
    assert.equal(report.passes2mmGate, true);
    assert.equal(report.status, 'calibrated_pass');

    // Stage convergence must monotonically improve from Stage 0 to Stage 3
    assert.ok(report.stageHistory[3].rmsErrorMm < report.stageHistory[0].rmsErrorMm);
  }
});

test('maintains <= 2.00 mm accuracy under partial rotor mast shadow (8/10 keypoints) and blocks gate under severe occlusion', () => {
  const partial = runHelicopterOfflineCvPipeline({
    variantId: 'h145m',
    standoffMeters: 1.85,
    occlusionPreset: 'partial_rotor_shadow',
    seed: 777,
  });
  assert.equal(partial.inlierCount, 8);
  assert.equal(partial.passes2mmGate, true);
  assert.ok(partial.rmsErrorMm <= 2.0, `Expected <= 2.0 mm, got ${partial.rmsErrorMm}`);

  const severe = runHelicopterOfflineCvPipeline({
    variantId: 'h145m',
    standoffMeters: 1.85,
    occlusionPreset: 'severe_glare_occlusion',
    seed: 777,
  });
  assert.equal(severe.inlierCount, 3);
  assert.equal(severe.passes2mmGate, false);
  assert.equal(severe.status, 'gate_blocked');
});

test('HelicopterOfflineCvCalibrator handles pose drift injection, camera RGBA luma ingestion, and re-calibration', () => {
  const calibrator = new HelicopterOfflineCvCalibrator('h145m');
  assert.equal(calibrator.getReport().passes2mmGate, true);
  assert.ok(calibrator.getReport().rmsErrorMm <= 2.0);

  const drifted = calibrator.injectUncalibratedDrift();
  assert.equal(drifted.status, 'uncalibrated_drift');
  assert.equal(drifted.passes2mmGate, false);
  assert.ok(drifted.rmsErrorMm > 30);

  // Ingest synthetic XREAL Aura RGB pass-through RGBA buffer (64x36)
  const rgba = new Uint8ClampedArray(64 * 36 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 40;
    rgba[i + 1] = 65;
    rgba[i + 2] = 90;
    rgba[i + 3] = 255;
  }
  const luma = convertRgbaToPyramidLuma(rgba, 64, 36, 320, 180);
  assert.equal(luma.length, 320 * 180);
  assert.ok(luma[0] > 50 && luma[0] < 70);

  calibrator.ingestExternalCameraRgba(rgba, 64, 36);
  const recalibrated = calibrator.runOfflineCalibration();
  assert.equal(recalibrated.status, 'calibrated_pass');
  assert.equal(recalibrated.passes2mmGate, true);
  assert.ok(recalibrated.rmsErrorMm <= 2.0);
});
