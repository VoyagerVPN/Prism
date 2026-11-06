# Prism

<img src="prism.svg" alt="Prism logo" width="64">

**English** · [Русский](README.ru.md)

Generate images locally through ComfyUI. Build prompts with LoRA presets, run batches, and reuse the settings behind images in your gallery.

**Windows 10/11 x64 · ComfyUI · SDXL, Pony and Illustrious**

[Get the current source ZIP](https://github.com/VoyagerVPN/Prism/archive/refs/heads/main.zip)

## Quick start

1. Install [Git for Windows](https://git-scm.com/download/win) and the [Microsoft Visual C++ Redistributable x64](https://aka.ms/vc14/vc_redist.x64.exe).
2. Extract the current source ZIP into a permanent local folder and run `Setup.bat`. Choose a language and select **Install**, or connect an existing ComfyUI installation. For a new install without a model, choose SDXL Base and confirm the download.
3. When Prism opens in your browser, load the included example and start generation. The first image appears in the workspace and gallery.
4. For later sessions, run `Prism.bat`. The launcher window hosts the backend, so keep it open while jobs are running.

Choose English or Russian in setup or in Prism settings. The older [v0.1.0 release ZIP](https://github.com/VoyagerVPN/Prism/releases/tag/v0.1.0) predates the language selector. Use the current source ZIP for this guide.

![Prism workspace with prompt, model settings, and generated image](docs/images/prism-create.png)

## Features

- Store characters, outfits and compatible LoRA presets, and transfer character cards between installations.
- Generate 1, 4 or 9 images at a time with a fixed or changing seed.
- Filter your gallery and reopen saved generation settings. Exact reruns require a saved graph.
- Connect Prism to an existing ComfyUI environment or let setup provision a new one.

## Requirements

- Windows 10/11 x64, 16 GB RAM or more, with 32 GB recommended.
- The default GPU setup targets NVIDIA with at least 8 GB VRAM and a driver compatible with CUDA 12.8. A separate CUDA Toolkit is unnecessary. Setup also offers a slower CPU mode.
- Allow disk space for ComfyUI and your model files. Model downloads and initial setup require internet access.

## Setup and maintenance

- To preview a new installation without downloading anything, run `.\Setup.ps1 -Plan` from PowerShell.
- To connect an existing environment, stop ComfyUI, open `Setup.bat`, select its folder and confirm the Python executable. Start the combined environment with `Prism.bat`.
- Before upgrading, stop the backend and back up `app/data`, `app/prism.local.json`, your models, and ComfyUI's `input`, `output` and `user` folders.
- See the [setup details in Russian](README.ru.md#установка-с-нуля) or the [technical documentation](app/README.md) for model paths, optional models and troubleshooting.
