import math
import torch


class _VariationNoise:
    def __init__(self, seed, variation_seed, strength):
        self.seed = seed
        self.variation_seed = variation_seed
        self.strength = strength

    def generate_noise(self, input_latent):
        import comfy.sample
        latent = input_latent['samples']
        indices = input_latent.get('batch_index')
        base = comfy.sample.prepare_noise(latent, self.seed, indices)
        if self.strength == 0:
            return base
        other = comfy.sample.prepare_noise(latent, self.variation_seed, indices)
        if self.strength == 1:
            return other
        # Как в Forge: SLERP начального шума по высоте каждой карты каналов.
        # Почти параллельные векторы смешиваем линейно без деления на ноль.
        low = torch.nn.functional.normalize(base, dim=-2)
        high = torch.nn.functional.normalize(other, dim=-2)
        dot = (low * high).sum(dim=-2, keepdim=True).clamp(-1, 1)
        angle = torch.acos(dot)
        sine = torch.sin(angle).clamp_min(1e-7)
        amount = self.strength
        spherical = (torch.sin((1-amount)*angle)*base + torch.sin(amount*angle)*other) / sine
        return torch.where(dot.abs() > .9995, (1-amount)*base + amount*other, spherical)


class VariationNoise:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'seed': ('INT', {'default': 0, 'min': 0, 'max': 9007199254740991}),
            'variation_seed': ('INT', {'default': 0, 'min': 0, 'max': 9007199254740991}),
            'strength': ('FLOAT', {'default': 0, 'min': 0, 'max': 1, 'step': .01}),
        }}

    RETURN_TYPES = ('NOISE',)
    FUNCTION = 'create'
    CATEGORY = 'Prism'

    def create(self, seed, variation_seed, strength):
        if any(type(value) is not int or not 0 <= value <= 9007199254740991 for value in (seed, variation_seed)):
            raise ValueError('Seed должен быть целым числом от 0 до 9007199254740991')
        if type(strength) not in (int, float) or not math.isfinite(strength) or not 0 <= strength <= 1:
            raise ValueError('Сила вариации должна быть от 0 до 1')
        return (_VariationNoise(seed, variation_seed, strength),)
