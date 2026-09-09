"""CPU-проверка начального шума; запуск через Python установленного ComfyUI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from comfy.cli_args import args
args.cpu = True
import torch
from variation_noise import VariationNoise
import comfy.sample

latent = {'samples': torch.zeros((2, 4, 32, 32))}
base = comfy.sample.prepare_noise(latent['samples'], 123)
other = comfy.sample.prepare_noise(latent['samples'], 456)

def noise(strength, seed=123, variation_seed=456):
    return VariationNoise().create(seed, variation_seed, strength)[0].generate_noise(latent)

assert torch.equal(noise(0), base)
assert torch.equal(noise(1), other)
assert torch.equal(noise(.1), noise(.1))
assert torch.allclose(noise(.5, 123, 123), base)
assert torch.isfinite(noise(.1)).all()
assert 0 < torch.linalg.vector_norm(noise(.05)-base) < torch.linalg.vector_norm(noise(.5)-base)
assert not torch.equal(noise(.1), base)
for invalid in (-.1, 1.1, float('nan')):
    try:
        noise(invalid)
        raise AssertionError('Некорректная сила принята')
    except ValueError:
        pass
print('CPU noise: endpoints, reproducibility, smooth variation and validation OK')
