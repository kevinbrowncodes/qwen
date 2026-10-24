"""Tests for mlxjob.py (STORY_035): standard library only; run in the gate by model-server's `test` script."""

import unittest

import mlxjob

JOB = {"type": "job", "id": "j1", "prompt": "a grey wall", "seed": 1001, "steps": 40, "references": [], "output": "/o/j1.png"}


class GenerateKwargs(unittest.TestCase):
    def test_text_to_image_has_its_size_no_references_and_no_guidance(self):
        kwargs = mlxjob.generate_kwargs({**JOB, "width": 896, "height": 1184})
        self.assertEqual(
            kwargs,
            {"seed": 1001, "prompt": "a grey wall", "num_inference_steps": 40, "image_paths": [], "width": 896, "height": 1184},
        )

    def test_an_edit_with_a_chosen_size_keeps_references_in_order(self):
        kwargs = mlxjob.generate_kwargs({**JOB, "references": ["/u/a.png", "/u/b.png"], "width": 1376, "height": 768})
        self.assertEqual(kwargs["image_paths"], ["/u/a.png", "/u/b.png"])
        self.assertEqual((kwargs["width"], kwargs["height"]), (1376, 768))

    def test_an_edit_without_a_size_leaves_the_shape_to_the_reference(self):
        kwargs = mlxjob.generate_kwargs({**JOB, "references": ["/u/a.png"]})
        self.assertNotIn("width", kwargs)
        self.assertNotIn("height", kwargs)

    def test_guidance_above_one_brings_the_one_space_negative_prompt(self):
        kwargs = mlxjob.generate_kwargs({**JOB, "lora": {"id": "b", "scale": 1.0, "guidance": 3}})
        self.assertEqual(kwargs["guidance"], 3.0)
        self.assertEqual(kwargs["negative_prompt"], " ")

    def test_guidance_of_one_or_none_runs_unguided(self):
        for lora in ({"id": "b", "scale": 1.0, "guidance": 1}, {"id": "b", "scale": 1.0}, None):
            kwargs = mlxjob.generate_kwargs({**JOB, "lora": lora})
            self.assertNotIn("guidance", kwargs)
            self.assertNotIn("negative_prompt", kwargs)


class LoraScales(unittest.TestCase):
    def test_only_the_jobs_add_on_gets_its_strength(self):
        scales = mlxjob.lora_scales({**JOB, "lora": {"id": "b", "scale": 0.8}}, ["a", "b", "c"])
        self.assertEqual(scales, {"a": 0.0, "b": 0.8, "c": 0.0})

    def test_no_add_on_sets_every_one_to_zero(self):
        self.assertEqual(mlxjob.lora_scales(JOB, ["a", "b"]), {"a": 0.0, "b": 0.0})

    def test_an_add_on_that_did_not_load_is_refused(self):
        with self.assertRaisesRegex(mlxjob.NotLoaded, "the add-on z is not loaded"):
            mlxjob.lora_scales({**JOB, "lora": {"id": "z", "scale": 1.0}}, ["a"])


class ParametersText(unittest.TestCase):
    def test_the_size_is_appended_to_the_size_line(self):
        job = {**JOB, "parameters": {"lines": ["Prompt: x", "Size: 3:4", "Seed: 1001"], "sizeLine": 1}}
        self.assertEqual(mlxjob.parameters_text(job, 896, 1184), "Prompt: x\nSize: 3:4 · 896 × 1184\nSeed: 1001")

    def test_an_out_of_range_size_line_leaves_the_lines_unchanged(self):
        job = {**JOB, "parameters": {"lines": ["Prompt: x"], "sizeLine": 5}}
        self.assertEqual(mlxjob.parameters_text(job, 1, 1), "Prompt: x")

    def test_no_parameters_gives_no_text(self):
        self.assertIsNone(mlxjob.parameters_text(JOB, 1, 1))


class FailureMessage(unittest.TestCase):
    def test_running_out_of_memory_names_no_machine(self):
        message = mlxjob.failure_message(RuntimeError("[metal::malloc] Attempting to allocate 40 GB which exceeds memory"))
        self.assertEqual(message, mlxjob.MEMORY_MESSAGE)
        self.assertNotIn("Spark", message)

    def test_other_errors_report_type_and_message_cut_to_300(self):
        self.assertEqual(mlxjob.failure_message(ValueError("bad size")), "ValueError: bad size")
        self.assertEqual(len(mlxjob.failure_message(ValueError("x" * 500))), 300)


if __name__ == "__main__":
    unittest.main()


class MemoryLimit(unittest.TestCase):
    """STORY_041: the worker's MLX limit comes from MEMORY_LIMIT_GB, and the worker sets it before the model loads."""

    def test_the_limit_is_read_in_gib_and_is_none_when_unset_or_not_positive(self):
        self.assertEqual(mlxjob.memory_limit_bytes({"MEMORY_LIMIT_GB": "48"}), 48 << 30)
        self.assertEqual(mlxjob.memory_limit_bytes({"MEMORY_LIMIT_GB": " 40.5 "}), int(40.5 * (1 << 30)))
        for env in ({}, {"MEMORY_LIMIT_GB": ""}, {"MEMORY_LIMIT_GB": "0"}, {"MEMORY_LIMIT_GB": "-3"}, {"MEMORY_LIMIT_GB": "lots"}):
            self.assertIsNone(mlxjob.memory_limit_bytes(env), env)

    def test_the_worker_sets_the_limit_before_it_loads_the_model(self):
        from pathlib import Path

        source = (Path(__file__).with_name("worker_mlx.py")).read_text()
        main = source[source.index("def main()"):]
        self.assertIn("mx.set_memory_limit(limit)", main)
        self.assertLess(main.index("mx.set_memory_limit(limit)"), main.index("QwenImage21Edit(quantize"))
