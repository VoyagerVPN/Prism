import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runtime_metrics import collect_runtime_metrics


class Device:
    type = 'cuda'
    index = 0

    def __eq__(self, other):
        return isinstance(other, Device) and self.index == other.index


class LoadedModel:
    device = Device()
    model = object()

    def model_loaded_memory(self):
        return 4 * 1024 ** 3


class ModelManagement:
    current_loaded_models = [LoadedModel()]

    @staticmethod
    def get_torch_device():
        return Device()

    @staticmethod
    def get_all_torch_devices():
        return [Device()]

    @staticmethod
    def get_total_memory(device, torch_total_too=False):
        assert torch_total_too
        return 10 * 1024 ** 3, 6 * 1024 ** 3

    @staticmethod
    def get_free_memory(device, torch_free_too=False):
        assert torch_free_too
        return 5 * 1024 ** 3, 1 * 1024 ** 3

    @staticmethod
    def get_torch_device_name(device):
        return 'cuda:0 Test GPU'


class Process:
    pid = 321

    @staticmethod
    def memory_info():
        return type('Memory', (), {'rss': 3 * 1024 ** 3})()


class RuntimeMetricsContract(unittest.TestCase):
    def test_process_rss_and_pytorch_vram_have_a_non_overlapping_breakdown(self):
        metrics = collect_runtime_metrics(
            process=Process(),
            ram_capacity=32 * 1024 ** 3,
            model_management=ModelManagement(),
        )

        self.assertEqual(metrics['process'], {
            'pid': 321,
            'ram': {'used': 3 * 1024 ** 3, 'capacity': 32 * 1024 ** 3},
        })
        vram = metrics['devices'][0]['vram']
        self.assertEqual(vram['used'], 6 * 1024 ** 3)
        self.assertEqual(vram['models'], 4 * 1024 ** 3)
        self.assertEqual(vram['working'], 1 * 1024 ** 3)
        self.assertEqual(vram['cache'], 1 * 1024 ** 3)
        self.assertEqual(vram['models'] + vram['working'] + vram['cache'], vram['used'])
        self.assertEqual(vram['scope'], 'comfy_managed_plus_pytorch')

    def test_dynamic_model_memory_is_not_lost_when_it_bypasses_the_pytorch_allocator(self):
        gib = 1024 ** 3

        class DynamicManagement(ModelManagement):
            @staticmethod
            def get_total_memory(device, torch_total_too=False):
                return 10 * gib, 100 * 1024 ** 2

            @staticmethod
            def get_free_memory(device, torch_free_too=False):
                return 4 * gib, 20 * 1024 ** 2

        metrics = collect_runtime_metrics(
            process=Process(), ram_capacity=32 * gib, model_management=DynamicManagement(),
        )
        vram = metrics['devices'][0]['vram']

        self.assertEqual(vram['models'], 4 * gib)
        self.assertEqual(vram['working'], 80 * 1024 ** 2)
        self.assertGreater(vram['used'], 4 * gib)
        self.assertEqual(vram['models'] + vram['working'] + vram['cache'], vram['used'])
        self.assertTrue(vram['estimated'])


if __name__ == '__main__':
    unittest.main()
