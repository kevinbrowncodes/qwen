"""The mflux worker's lock keeps Pillow below 13 while mflux is 0.21.0 (STORY_035). Standard library only (tomllib)."""

import os
import tomllib
import unittest

LOCK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mlx", "uv.lock")
SPIKE_ERROR = "ImportError: cannot import name '_IntegralLike' from 'numbers'"


def versions(lock_text: str) -> dict:
    return {p["name"]: p["version"] for p in tomllib.loads(lock_text).get("package", []) if "version" in p}


def pin_problem(lock_text: str):
    """None when the lock is safe, else the gate's message: the rule, why, and the fix."""
    found = versions(lock_text)
    mflux, pillow = found.get("mflux"), found.get("pillow")
    if mflux is None or pillow is None:
        return f"spark/model/mlx/uv.lock must resolve mflux and pillow (found mflux={mflux}, pillow={pillow})."
    if mflux == "0.21.0" and int(pillow.split(".")[0]) >= 13:
        return (
            f"spark/model/mlx/uv.lock resolves pillow {pillow} with mflux 0.21.0, which then fails to import: "
            f"\"{SPIKE_ERROR}\" (SPIKE_001, STORY_035). Fix: keep \"pillow<13\" in spark/model/mlx/pyproject.toml and "
            "run `uv lock` there, until an mflux release is shown to work with Pillow 13."
        )
    return None


class MlxLock(unittest.TestCase):
    def test_the_committed_lock_keeps_pillow_below_13(self):
        with open(LOCK, encoding="utf-8") as f:
            problem = pin_problem(f.read())
        self.assertIsNone(problem, problem)

    def test_pillow_13_with_mflux_0_21_0_fails_with_the_rule_and_the_fix(self):
        lock = '[[package]]\nname = "mflux"\nversion = "0.21.0"\n\n[[package]]\nname = "pillow"\nversion = "13.0.0"\n'
        problem = pin_problem(lock) or ""
        self.assertIn("pillow 13.0.0 with mflux 0.21.0", problem)
        self.assertIn(SPIKE_ERROR, problem)
        self.assertIn('keep "pillow<13"', problem)


if __name__ == "__main__":
    unittest.main()
