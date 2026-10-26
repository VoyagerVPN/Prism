import torch
import torch.nn.functional as functional


class PrismEditSource:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'image': ('IMAGE',), 'mask': ('MASK',)}}

    RETURN_TYPES = ('IMAGE', 'MASK', 'PRISM_EDIT_ORIGINAL')
    FUNCTION = 'snapshot'
    CATEGORY = 'Prism/image edit'

    def snapshot(self, image, mask):
        # Crop/Stitch может менять переданный тензор; исходник храним отдельной копией.
        original = {'image': image.clone(), 'mask': mask.clone()}
        return image.clone(), mask.clone(), original


class PrismEditRestore:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'original': ('PRISM_EDIT_ORIGINAL',), 'edited': ('IMAGE',),
                             'blend_pixels': ('INT', {'default': 16, 'min': 0, 'max': 256})}}

    RETURN_TYPES = ('IMAGE',)
    FUNCTION = 'restore'
    CATEGORY = 'Prism/image edit'

    def restore(self, original, edited, blend_pixels):
        image = original['image'].to(device=edited.device, dtype=edited.dtype)
        mask = original['mask'].to(device=edited.device)
        if image.shape != edited.shape or mask.shape != image.shape[:3]:
            raise ValueError('Размер локальной правки не совпадает с исходным кадром.')
        allowed = (mask > 0).to(dtype=torch.float32).unsqueeze(1)
        if blend_pixels:
            allowed = functional.max_pool2d(allowed, 2 * blend_pixels + 1, stride=1, padding=blend_pixels)
        # За пределами выделения и ограниченной полосы стыка возвращаем исходные значения без смешивания.
        return (torch.where(allowed.squeeze(1).unsqueeze(-1) > 0, edited, image),)
