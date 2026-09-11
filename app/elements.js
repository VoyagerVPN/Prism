// DOM Elements Exporter
export const statusDot = document.getElementById("status-dot");
export const statusText = document.getElementById("status-text");
export const queueLengthText = document.getElementById("queue-length");

export const checkpointSelect = document.getElementById("checkpoint-select");
export const stepsSlider = document.getElementById("steps-slider");
export const stepsVal = document.getElementById("steps-val");
export const cfgSlider = document.getElementById("cfg-slider");
export const cfgVal = document.getElementById("cfg-val");
export const samplerSelect = document.getElementById("sampler-select");
export const schedulerSelect = document.getElementById("scheduler-select");

export const positiveTextarea = document.getElementById("positive-prompt");
export const negativeTextarea = document.getElementById("negative-prompt");

// T2I specific elements
export const widthSlider = document.getElementById("width-slider");
export const widthVal = document.getElementById("width-val");
export const heightSlider = document.getElementById("height-slider");
export const heightVal = document.getElementById("height-val");
export const variationSeedInput = document.getElementById('variation-seed-input');
export const variationStrength = document.getElementById('variation-strength');
export const batchCountInput = document.getElementById("batch-count");

// LoRA dynamic stack
export const loraStackContainer = document.getElementById("lora-stack-container");

// Improvements
export const hiresToggle = document.getElementById("hires-toggle");
export const hiresScaleSelect = document.getElementById("hires-scale");
export const hiresDenoiseSlider = document.getElementById("hires-denoise");
export const hiresDenoiseVal = document.getElementById("hires-denoise-val");

export const faceToggle = document.getElementById("face-toggle");
export const faceThresholdSlider = document.getElementById("face-threshold");
export const faceThresholdVal = document.getElementById("face-threshold-val");
export const faceStepsSlider = document.getElementById("face-steps");
export const faceStepsVal = document.getElementById("face-steps-val");

export const upscaleToggle = document.getElementById("upscale-toggle");
export const upscaleSelect = document.getElementById("upscale-select");

export const advancedToggle = document.getElementById("advanced-toggle");
export const clipSkipSlider = document.getElementById("clip-skip");
export const clipSkipVal = document.getElementById("clip-skip-val");
export const vaeSelect = document.getElementById("vae-select");

// Header actions & progress
export const generateBtn = document.getElementById("generate-btn");
export const progressContainer = document.getElementById("progress-container");
export const progressBarFill = document.getElementById("progress-bar-fill");
export const progressLabel = document.getElementById("progress-label");
export const progressSub = document.getElementById("progress-sub");

// Canvas and Output
export const canvasPlaceholder = document.getElementById("canvas-placeholder");
export const imageLoader = document.getElementById("image-loader");
export const outputImage = document.getElementById("output-image");
export const galleryItems = document.getElementById("gallery-items");
export const downloadBtn = document.getElementById("download-btn");

// Control Bar & Metadata Bar
export const seedInput = document.getElementById("seed-input");
export const seedRandomBtn = document.getElementById("seed-random-btn");
export const seedLockBtn = document.getElementById("seed-lock-btn");
export const seedPrevBtn = document.getElementById("seed-prev-btn");
export const seedNextBtn = document.getElementById("seed-next-btn");

export const ramVal = document.getElementById("ram-val");
export const ramFill = document.getElementById("ram-fill");
export const ramDetail = document.getElementById("ram-detail");
export const vramVal = document.getElementById("vram-val");
export const vramFill = document.getElementById("vram-fill");
export const vramWorkingFill = document.getElementById("vram-working-fill");
export const vramCacheFill = document.getElementById("vram-cache-fill");
export const vramDetail = document.getElementById("vram-detail");

export const interruptBtn = document.getElementById("interrupt-btn");
export const clearQueueBtn = document.getElementById("clear-queue-btn");

export const metadataBar = document.getElementById("metadata-bar");
export const metadataSummary = document.getElementById("metadata-summary");
export const refineBtn = document.getElementById("refine-btn");
export const applyPromptBtn = document.getElementById("apply-prompt-btn");
export const applySeedBtn = document.getElementById("apply-seed-btn");
export const fullscreenBtn = document.getElementById("fullscreen-btn");

// Lightbox Elements
export const lightbox = document.getElementById("lightbox");
export const lightboxClose = document.getElementById("lightbox-close");
export const lightboxPrev = document.getElementById("lightbox-prev");
export const lightboxNext = document.getElementById("lightbox-next");
export const lightboxImg = document.getElementById("lightbox-img");
export const lightboxFavorite = document.getElementById("lightbox-favorite-btn");

// Profile Presets
export const profileSelect = document.getElementById("profile-select");
export const saveProfileBtn = document.getElementById("save-profile-btn");

export const batchThumbnails = document.getElementById("batch-thumbnails");

// ReActor Face Swap
export const reactorToggle = document.getElementById("reactor-toggle");
export const reactorDropzone = document.getElementById("reactor-dropzone");
export const reactorFileInput = document.getElementById("reactor-file-input");
export const reactorPreview = document.getElementById("reactor-preview");
export const reactorClearBtn = document.getElementById("reactor-clear-btn");
export const reactorDetection = document.getElementById("reactor-detection");
export const reactorRestore = document.getElementById("reactor-restore");
export const reactorVisibility = document.getElementById("reactor-visibility");
export const reactorVisibilityVal = document.getElementById("reactor-visibility-val");
export const reactorCodeformerWeight = document.getElementById("reactor-codeformer-weight");
export const reactorCodeformerWeightVal = document.getElementById("reactor-codeformer-weight-val");
export const reactorIndexSource = document.getElementById("reactor-index-source");
export const reactorIndexInput = document.getElementById("reactor-index-input");
