import * as xb from 'xrblocks';

import {AeroManufacturingApp} from './AeroManufacturingApp';
import {isSoftwareGl} from './utils/gpuDetect';

async function start(): Promise<void> {
  const options = new xb.Options();
  options.antialias = !isSoftwareGl;
  options.enableReticles();
  options.setAppTitle('AeroForge AR — Aeronautics Assembly & QC');
  options.setAppDescription(
    'OmniStep-modeled 3D AR aeronautics assembly guidance, Poka-Yoke OK/KO validation, and Google Account cloud traceability.',
  );

  // Support ?autostart=1 for instant desktop verification without modifying default simulator behavior
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') {
    options.formFactor = 'desktop';
  }

  const app = new AeroManufacturingApp();
  xb.add(app);
  await xb.init(options);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void start());
} else {
  void start();
}
