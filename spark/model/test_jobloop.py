"""The worker's job loop (STORY_026, BUG_011). Standard library only; run in the gate's unit lane by the model server's
package (`python3 -m unittest discover -s ../model -p "test_*.py"`). Every case runs serve() on a thread and joins it
with a timeout, so a deadlock fails the case instead of hanging the gate."""

import io
import json
import os
import queue
import threading
import unittest

from jobloop import JobLoop

TIMEOUT = 5.0


class Lines(io.TextIOBase):
    """The protocol stream: each line written is parsed and handed to the test as it arrives."""

    def __init__(self) -> None:
        self.messages: "queue.Queue[dict]" = queue.Queue()
        self._buffer = ""

    def write(self, text: str) -> int:
        self._buffer += text
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            self.messages.put(json.loads(line))
        return len(text)

    def next(self) -> dict:
        return self.messages.get(timeout=TIMEOUT)


class Harness:
    """A loop fed through a pipe, as the real worker's stdin is, with a fake job runner."""

    def __init__(self, run_one) -> None:
        self.out = Lines()
        self.log = io.StringIO()
        self.loop = JobLoop(self.out, self.log)
        read_fd, write_fd = os.pipe()
        self.stdin = os.fdopen(write_fd, "w", buffering=1)
        self._read_end = os.fdopen(read_fd, "r")
        self.reader = threading.Thread(target=self.loop.read, args=(self._read_end,), daemon=True)
        self.result: list = []
        self.server = threading.Thread(target=lambda: self.result.append(self.loop.serve(run_one)), daemon=True)
        self.reader.start()
        self.server.start()

    def send(self, message) -> None:
        self.stdin.write((message if isinstance(message, str) else json.dumps(message)) + "\n")

    def close(self) -> None:
        self.stdin.close()
        self.server.join(TIMEOUT)
        self.reader.join(TIMEOUT)
        self._read_end.close()


def job(job_id: str) -> dict:
    return {"type": "job", "id": job_id, "prompt": "p", "seed": 1, "steps": 4, "output": f"/tmp/{job_id}.png"}


class JobLoopTest(unittest.TestCase):
    def test_a_job_stopped_before_it_starts_is_answered_and_the_loop_goes_on(self) -> None:
        # BUG_011, 2026-10-11: B is sent while A runs, stopped before A finishes, then taken by the loop.
        release_a = threading.Event()
        started = queue.Queue()

        def run_one(j: dict, loop: JobLoop) -> None:
            started.put(j["id"])
            if j["id"] == "a":
                self.assertTrue(release_a.wait(TIMEOUT))
            loop.say({"type": "done", "id": j["id"]})

        h = Harness(run_one)
        h.send(job("a"))
        self.assertEqual(started.get(timeout=TIMEOUT), "a")
        h.send(job("b"))
        h.send({"type": "cancel", "id": "b"})
        # The stop must be recorded before A is released, or B would simply run.
        for _ in range(500):
            if h.loop.stopped("b"):
                break
            threading.Event().wait(0.01)
        self.assertTrue(h.loop.stopped("b"))
        release_a.set()
        self.assertEqual(h.out.next(), {"type": "done", "id": "a"})
        self.assertEqual(h.out.next(), {"type": "cancelled", "id": "b"})
        h.send(job("c"))
        self.assertEqual(h.out.next(), {"type": "done", "id": "c"})
        self.assertEqual(started.get(timeout=TIMEOUT), "c")  # B never ran
        h.close()
        self.assertFalse(h.server.is_alive())
        self.assertEqual(h.result, [0])

    def test_a_stop_during_a_run_is_seen_by_the_job_and_the_next_job_runs(self) -> None:
        stop_sent = threading.Event()

        def run_one(j: dict, loop: JobLoop) -> None:
            if j["id"] == "a":
                self.assertTrue(stop_sent.wait(TIMEOUT))
                for _ in range(500):
                    if loop.stopped("a"):
                        loop.say({"type": "cancelled", "id": "a"})
                        return
                    threading.Event().wait(0.01)
                self.fail("the stop never reached the running job")
            loop.say({"type": "done", "id": j["id"]})

        h = Harness(run_one)
        h.send(job("a"))
        h.send({"type": "cancel", "id": "a"})
        stop_sent.set()
        self.assertEqual(h.out.next(), {"type": "cancelled", "id": "a"})
        self.assertFalse(h.loop.stopped("a"))  # forgotten once the job ended
        h.send(job("b"))
        self.assertEqual(h.out.next(), {"type": "done", "id": "b"})
        h.close()

    def test_a_stop_for_no_waiting_job_writes_nothing_and_later_jobs_run(self) -> None:
        h = Harness(lambda j, loop: loop.say({"type": "done", "id": j["id"]}))
        h.send({"type": "cancel", "id": "gone"})
        h.send(job("a"))
        self.assertEqual(h.out.next(), {"type": "done", "id": "a"})
        h.close()
        self.assertTrue(h.out.messages.empty())

    def test_a_line_that_is_not_json_is_logged_and_ignored(self) -> None:
        h = Harness(lambda j, loop: loop.say({"type": "done", "id": j["id"]}))
        h.send("not json at all")
        h.send("[1, 2]")
        h.send(job("a"))
        self.assertEqual(h.out.next(), {"type": "done", "id": "a"})
        h.close()
        self.assertIn("ignoring a line that is not JSON: not json at all", h.log.getvalue())

    def test_the_end_of_stdin_ends_serve(self) -> None:
        h = Harness(lambda j, loop: None)
        h.close()
        self.assertFalse(h.server.is_alive())
        self.assertEqual(h.result, [0])

    def test_a_job_queued_before_the_loop_starts_is_run(self) -> None:
        out = Lines()
        loop = JobLoop(out, io.StringIO())
        loop.put(job("early"))
        loop.put({"type": "exit"})
        server = threading.Thread(target=lambda: loop.serve(lambda j, l: l.say({"type": "done", "id": j["id"]})), daemon=True)
        server.start()
        server.join(TIMEOUT)
        self.assertEqual(out.next(), {"type": "done", "id": "early"})


if __name__ == "__main__":
    unittest.main()
