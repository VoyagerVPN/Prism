import { compileRefineWorkflow } from './workflow.js';


export function createRefineSubmission({settings, source}) {
  const refinedSettings = {
    ...settings,
    width: source.width,
    height: source.height,
    batchCount: 1,
    batchLayout: 'square-v1',
    variationStrength: 0,
    hiresToggle: true,
    faceToggle: false,
    upscaleToggle: false,
    reactorToggle: false,
    operation: 'refine',
    sourceImage: {
      filename: source.filename,
      subfolder: source.subfolder ?? '',
      type: source.type ?? 'output',
    },
  };
  return {
    settings: refinedSettings,
    workflow: compileRefineWorkflow(refinedSettings, source),
  };
}
