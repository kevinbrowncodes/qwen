"""The worker's job loop (STORY_026): stdin, the stopped set, the protocol lines and the loop that takes jobs.

Standard library only, so the gate can test it without torch; worker.py hands it the function that runs one job.

Two locks, never nested: `_out` serialises protocol lines, `_stops` guards the stopped set. Nothing writes a line while
holding `_stops`. BUG_011 was the main loop calling say() inside the one shared lock, a plain Lock it then took again.
"""

import json
import queue
import sys
import threading
from typing import Callable, Optional, TextIO


class JobLoop:
    def __init__(self, out: TextIO, log: Optional[TextIO] = None) -> None:
        self._out = out
        self._log = log if log is not None else sys.stderr
        self._out_lock = threading.Lock()
        self._stops_lock = threading.Lock()
        self._stops: set = set()
        self._jobs: "queue.Queue[dict]" = queue.Queue()

    def say(self, message: dict) -> None:
        with self._out_lock:
            self._out.write(json.dumps(message) + "\n")
            self._out.flush()

    def put(self, job: dict) -> None:
        """A job read before the loop started (worker.read_init); never dropped."""
        self._jobs.put(job)

    def stop(self, job_id: object) -> None:
        with self._stops_lock:
            self._stops.add(job_id)

    def stopped(self, job_id: object) -> bool:
        """True when a stop for this job has arrived. Read from the step callback while the job runs."""
        with self._stops_lock:
            return job_id in self._stops

    def forget(self, job_id: object) -> None:
        with self._stops_lock:
            self._stops.discard(job_id)

    def read(self, stream: TextIO) -> None:
        """The stdin thread: stops are recorded at once, jobs wait their turn; end of input ends serve()."""
        for line in stream:
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                print(f"worker: ignoring a line that is not JSON: {line[:80]}", file=self._log)
                continue
            if not isinstance(message, dict):
                continue
            if message.get("type") == "cancel":
                self.stop(message.get("id"))
            elif message.get("type") == "job":
                self._jobs.put(message)
        self._jobs.put({"type": "exit"})

    def serve(self, run_one: Callable[[dict, "JobLoop"], None]) -> int:
        """Takes jobs in order until stdin ends. A job stopped before it starts is answered here, outside the lock."""
        while True:
            job = self._jobs.get()
            if job.get("type") == "exit":
                return 0
            job_id = job.get("id")
            if self.stopped(job_id):
                self.forget(job_id)
                self.say({"type": "cancelled", "id": job_id})
                continue
            try:
                run_one(job, self)
            finally:
                self.forget(job_id)
