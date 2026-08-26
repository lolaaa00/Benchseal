# {
#   "Seq": [
#     { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
#   ]
# }
"""
BenchSeal — Consensus certification for off-chain AI benchmark runs.

Expensive model inference happens off-chain; GenLayer certifies a bounded,
semantically judged scorecard.

Storage approach: all state serialized to JSON strings.
  benchmarks_json: serialized list of benchmark objects (index = benchmark_id)
  runs_json: serialized list of run objects (index = run_id)
  snapshots_json: serialized list of snapshot objects (index = snapshot_id)
  exemplars_json: serialized list of {benchmark_id, dimension, text} objects
"""

from genlayer import *

import json
import hashlib
import re

_DIGEST_RE = re.compile(r'^sha256:[0-9a-f]{64}$')


# ---------------------------------------------------------------------------
# Status codes (module-level constants)
# ---------------------------------------------------------------------------
REGISTERED = 0
RUN_COMMITTED = 1
SCORING = 2
SEALED = 3
ABSTAINED = 4
INVALIDATED = 5


class BenchSeal(gl.Contract):
    # All state stored as JSON strings for portability
    benchmarks_json: str   # JSON array of benchmark dicts
    runs_json: str         # JSON array of run dicts
    snapshots_json: str    # JSON array of snapshot dicts
    exemplars_json: str    # JSON array of {benchmark_id, dimension, text}

    def __init__(self):
        self.benchmarks_json = "[]"
        self.runs_json = "[]"
        self.snapshots_json = "[]"
        self.exemplars_json = "[]"

    # -----------------------------------------------------------------------
    # Storage helpers
    # -----------------------------------------------------------------------

    def _load_benchmarks(self) -> list:
        return json.loads(self.benchmarks_json)

    def _save_benchmarks(self, bs: list) -> None:
        self.benchmarks_json = json.dumps(bs)

    def _load_runs(self) -> list:
        return json.loads(self.runs_json)

    def _save_runs(self, rs: list) -> None:
        self.runs_json = json.dumps(rs)

    def _load_snapshots(self) -> list:
        return json.loads(self.snapshots_json)

    def _save_snapshots(self, ss: list) -> None:
        self.snapshots_json = json.dumps(ss)

    def _load_exemplars(self) -> list:
        return json.loads(self.exemplars_json)

    def _save_exemplars(self, es: list) -> None:
        self.exemplars_json = json.dumps(es)

    def _caller(self) -> str:
        addr = gl.message.sender_address
        # Address object — convert to hex string
        if hasattr(addr, 'as_hex'):
            return addr.as_hex
        return str(addr)

    def _validate_digest(self, digest: str) -> None:
        if not _DIGEST_RE.match(digest):
            raise gl.vm.UserError("EXPECTED: invalid digest format")

    def _do_score(self, scoring_prompt: str) -> str:
        def leader() -> str:
            result = gl.exec_prompt(scoring_prompt)
            return result.replace("```json", "").replace("```", "").strip()
        return gl.eq_principle.prompt_comparative(
            leader,
            "The dimension_bands integer values (0-4) for each named dimension must match exactly"
        )

    def _parse_dimensions(self, dimensions_json) -> list:
        # Accept both a JSON string and a pre-parsed list
        if isinstance(dimensions_json, list):
            return [str(d) for d in dimensions_json]
        try:
            dims = json.loads(dimensions_json)
            if not isinstance(dims, list):
                raise gl.vm.UserError("EXPECTED: dimensions_json must be a JSON array")
            return [str(d) for d in dims]
        except json.JSONDecodeError as e:
            raise gl.vm.UserError(f"EXPECTED: Invalid dimensions_json: {e}") from e

    # -----------------------------------------------------------------------
    # Public write methods
    # -----------------------------------------------------------------------

    @gl.public.write
    def create_benchmark(
        self,
        name: str,
        rubric_url: str,
        rubric_digest: str,
        dimensions_json: str,
        sampling_policy_json: str,
    ) -> int:
        if not name or len(name) > 256:
            raise gl.vm.UserError("EXPECTED: name must be 1-256 characters")
        if not rubric_url or len(rubric_url) > 2048:
            raise gl.vm.UserError("EXPECTED: rubric_url must be 1-2048 characters")
        if not rubric_digest:
            raise gl.vm.UserError("EXPECTED: rubric_digest is required")
        self._validate_digest(rubric_digest)
        dims = self._parse_dimensions(dimensions_json)
        if len(dims) == 0:
            raise gl.vm.UserError("EXPECTED: dimensions_json must contain at least one dimension")
        if len(dims) > 32:
            raise gl.vm.UserError("EXPECTED: dimensions_json may not contain more than 32 dimensions")
        # Normalize JSON fields
        if isinstance(sampling_policy_json, dict):
            sampling_policy_str = json.dumps(sampling_policy_json)
        else:
            try:
                json.loads(sampling_policy_json)
                sampling_policy_str = sampling_policy_json
            except json.JSONDecodeError as e:
                raise gl.vm.UserError(f"EXPECTED: Invalid sampling_policy_json: {e}") from e

        dims_str = json.dumps(dims)

        bs = self._load_benchmarks()
        bid = len(bs)
        bs.append({
            "benchmark_id": bid,
            "owner": self._caller(),
            "name": name,
            "rubric_url": rubric_url,
            "rubric_digest": rubric_digest,
            "dimensions_json": dims_str,
            "sampling_policy_json": sampling_policy_str,
            "current_version": 0,
            "run_count": 0,
        })
        self._save_benchmarks(bs)
        return bid

    @gl.public.write
    def publish_version(
        self,
        benchmark_id: int,
        task_manifest_url: str,
        task_manifest_digest: str,
        version_note: str,
    ) -> int:
        bs = self._load_benchmarks()
        if benchmark_id < 0 or benchmark_id >= len(bs):
            raise gl.vm.UserError(f"EXPECTED: Benchmark {benchmark_id} not found")
        b = bs[benchmark_id]
        if b["owner"] != self._caller():
            raise gl.vm.UserError("EXPECTED: Only the benchmark owner can publish versions")
        if not task_manifest_url or len(task_manifest_url) > 2048:
            raise gl.vm.UserError("EXPECTED: task_manifest_url must be 1-2048 characters")
        if not task_manifest_digest:
            raise gl.vm.UserError("EXPECTED: task_manifest_digest is required")
        self._validate_digest(task_manifest_digest)
        b["current_version"] += 1
        self._save_benchmarks(bs)
        return b["current_version"]

    @gl.public.write
    def commit_run(
        self,
        benchmark_id: int,
        version: int,
        model_name: str,
        run_manifest_url: str,
        run_manifest_digest: str,
        deterministic_metrics_json: str,
        sample_bundle_url: str,
        sample_bundle_digest: str,
    ) -> int:
        bs = self._load_benchmarks()
        if benchmark_id < 0 or benchmark_id >= len(bs):
            raise gl.vm.UserError(f"EXPECTED: Benchmark {benchmark_id} not found")
        b = bs[benchmark_id]
        if version <= 0 or version > b["current_version"]:
            raise gl.vm.UserError(f"EXPECTED: Invalid version {version}; current is {b['current_version']}")
        if not model_name or len(model_name) > 256:
            raise gl.vm.UserError("EXPECTED: model_name must be 1-256 characters")
        if not run_manifest_url or len(run_manifest_url) > 2048:
            raise gl.vm.UserError("EXPECTED: run_manifest_url required")
        if not run_manifest_digest:
            raise gl.vm.UserError("EXPECTED: run_manifest_digest required")
        self._validate_digest(run_manifest_digest)
        if not sample_bundle_url or len(sample_bundle_url) > 2048:
            raise gl.vm.UserError("EXPECTED: sample_bundle_url required")
        if not sample_bundle_digest:
            raise gl.vm.UserError("EXPECTED: sample_bundle_digest required")
        self._validate_digest(sample_bundle_digest)
        if isinstance(deterministic_metrics_json, dict):
            metrics_str = json.dumps(deterministic_metrics_json)
        else:
            try:
                json.loads(deterministic_metrics_json)
                metrics_str = deterministic_metrics_json
            except json.JSONDecodeError as e:
                raise gl.vm.UserError(f"EXPECTED: Invalid deterministic_metrics_json: {e}") from e

        rs = self._load_runs()
        rid = len(rs)
        b["run_count"] += 1
        rs.append({
            "run_id": rid,
            "benchmark_id": benchmark_id,
            "version": version,
            "submitter": self._caller(),
            "model_name": model_name,
            "run_manifest_url": run_manifest_url,
            "run_manifest_digest": run_manifest_digest,
            "deterministic_metrics_json": metrics_str,
            "sample_bundle_url": sample_bundle_url,
            "sample_bundle_digest": sample_bundle_digest,
            "status": RUN_COMMITTED,
            "dimension_bands_json": "{}",
            "final_score_bps": 0,
            "rationale": "",
            "sealed_at": 0,
        })
        self._save_runs(rs)
        self._save_benchmarks(bs)
        return rid

    @gl.public.write
    def score_run(self, run_id: int, sample_bundle_content: str = "", rubric_content: str = "") -> None:
        """CONSENSUS method: validators evaluate the run using supplied content or URLs.
        Pass sample_bundle_content and rubric_content to avoid URL fetching."""
        rs = self._load_runs()
        if run_id < 0 or run_id >= len(rs):
            raise gl.vm.UserError(f"EXPECTED: Run {run_id} not found")
        run = rs[run_id]
        if run["status"] != RUN_COMMITTED:
            raise gl.vm.UserError(
                f"EXPECTED: Run {run_id} is not in RUN_COMMITTED state (current: {run['status']})"
            )

        bs = self._load_benchmarks()
        bid = run["benchmark_id"]
        b = bs[bid]
        dimensions = self._parse_dimensions(b["dimensions_json"])
        if not dimensions:
            raise gl.vm.UserError("EXPECTED: Benchmark has no dimensions configured")

        # Reject empty sample bundle content
        if sample_bundle_content == "":
            raise gl.vm.UserError("EXPECTED: content must not be empty")

        # Evidence binding: verify content matches stored digest
        actual_sample_hash = hashlib.sha256(sample_bundle_content.encode()).hexdigest()
        stored_sample_digest = run["sample_bundle_digest"]
        if stored_sample_digest.startswith("sha256:"):
            stored_sample_digest = stored_sample_digest[7:]
        if actual_sample_hash != stored_sample_digest:
            raise gl.vm.UserError("EXPECTED: sample bundle digest mismatch")

        if rubric_content:
            actual_rubric_hash = hashlib.sha256(rubric_content.encode()).hexdigest()
            stored_rubric_digest = b["rubric_digest"]
            if stored_rubric_digest.startswith("sha256:"):
                stored_rubric_digest = stored_rubric_digest[7:]
            if actual_rubric_hash != stored_rubric_digest:
                raise gl.vm.UserError("EXPECTED: rubric digest mismatch")

        run["status"] = SCORING
        self._save_runs(rs)

        # Use supplied content
        sample_bundle_raw = sample_bundle_content
        rubric_raw = rubric_content if rubric_content else f"[See rubric at: {b['rubric_url']}]"

        # Retrieve exemplars from exemplar store
        exemplars_list = self._load_exemplars()
        exemplars_by_dim = {}
        for dim in dimensions:
            found = []
            for ex in exemplars_list:
                if ex["benchmark_id"] == bid and ex["dimension"] == dim:
                    found.append(ex["text"])
                    if len(found) >= 4:
                        break
            exemplars_by_dim[dim] = found

        # Build exemplar section
        exemplar_section = ""
        for dim, exemplars in exemplars_by_dim.items():
            if exemplars:
                exemplar_section += f"\n### Dimension: {dim}\nExemplars:\n"
                for i, ex in enumerate(exemplars, 1):
                    exemplar_section += f"  {i}. {ex}\n"

        dims_list = ", ".join(dimensions)

        scoring_prompt = f"""You are a technical judge evaluating an AI model's benchmark run.

## Rubric
{rubric_raw[:4000]}

## Sample Bundle (model outputs)
{sample_bundle_raw[:8000]}

## Historical Exemplars for Reference
{exemplar_section if exemplar_section else "No exemplars available yet."}

## Task
Score the model outputs on each of these dimensions: {dims_list}

For each dimension, assign a band from 0 to 4:
- 0: Completely fails
- 1: Mostly fails, occasional success
- 2: Mixed results, some successes
- 3: Mostly succeeds, occasional failure
- 4: Consistently exceeds expectations

Return ONLY a valid JSON object in this exact format:
{{
  "ok": true,
  "dimension_bands": {{
    "<dimension_name>": <band_0_to_4>
  }},
  "reason": "<brief justification>"
}}

If you cannot score due to invalid data, return: {{"ok": false, "reason": "<explanation>"}}
"""

        try:
            validator_result = self._do_score(scoring_prompt)
        except Exception as e:
            run["status"] = ABSTAINED
            run["rationale"] = f"TRANSIENT: Scoring prompt failed: {str(e)[:200]}"
            self._save_runs(rs)
            return

        # Post-consensus: parse and validate
        rs2 = self._load_runs()
        run2 = rs2[run_id]

        try:
            envelope = json.loads(validator_result)
        except (json.JSONDecodeError, TypeError):
            run2["status"] = ABSTAINED
            run2["rationale"] = "Validator returned malformed JSON"
            self._save_runs(rs2)
            return

        if not isinstance(envelope, dict) or not envelope.get("ok"):
            run2["status"] = ABSTAINED
            reason = envelope.get("reason", "Validator returned ok=false") if isinstance(envelope, dict) else "Bad envelope"
            run2["rationale"] = reason
            self._save_runs(rs2)
            return

        dimension_bands = envelope.get("dimension_bands")
        if not isinstance(dimension_bands, dict):
            run2["status"] = ABSTAINED
            run2["rationale"] = "Validator did not return dimension_bands dict"
            self._save_runs(rs2)
            return

        for dim in dimensions:
            if dim not in dimension_bands:
                run2["status"] = ABSTAINED
                run2["rationale"] = f"Missing dimension '{dim}' in validator result"
                self._save_runs(rs2)
                return
            band = dimension_bands[dim]
            if not isinstance(band, int) or band < 0 or band > 4:
                run2["status"] = ABSTAINED
                run2["rationale"] = f"Invalid band {band} for dimension '{dim}'"
                self._save_runs(rs2)
                return

        total = sum(dimension_bands.get(dim, 0) for dim in dimensions)
        max_possible = 4 * len(dimensions)
        final_score_bps = int(round((total / max_possible) * 10000)) if max_possible > 0 else 0

        run2["status"] = SEALED
        run2["dimension_bands_json"] = json.dumps(dimension_bands)
        run2["final_score_bps"] = final_score_bps
        run2["rationale"] = envelope.get("reason", "")
        self._save_runs(rs2)

        # Store exemplar memories
        exemplars_list2 = self._load_exemplars()
        rationale = envelope.get("reason", "")
        for dim in dimensions:
            band = dimension_bands.get(dim, 0)
            text = f"benchmark:{bid} dimension:{dim} run:{run_id} band:{band} {rationale[:200]}"
            exemplars_list2.append({
                "benchmark_id": bid,
                "dimension": dim,
                "text": text,
            })
        self._save_exemplars(exemplars_list2)

    @gl.public.write
    def seal_leaderboard(
        self,
        benchmark_id: int,
        version: int,
        ordered_run_ids_json: str,
    ) -> int:
        bs = self._load_benchmarks()
        if benchmark_id < 0 or benchmark_id >= len(bs):
            raise gl.vm.UserError(f"EXPECTED: Benchmark {benchmark_id} not found")
        b = bs[benchmark_id]
        if b["owner"] != self._caller():
            raise gl.vm.UserError("EXPECTED: Only the benchmark owner can seal leaderboards")
        if isinstance(ordered_run_ids_json, list):
            ordered_run_ids = ordered_run_ids_json
            ordered_run_ids_json = json.dumps(ordered_run_ids)
        else:
            try:
                ordered_run_ids = json.loads(ordered_run_ids_json)
            except json.JSONDecodeError as e:
                raise gl.vm.UserError(f"EXPECTED: Invalid ordered_run_ids_json: {e}") from e
            if not isinstance(ordered_run_ids, list):
                raise gl.vm.UserError("EXPECTED: ordered_run_ids_json must be a JSON array")

        rs = self._load_runs()

        # Check for duplicates
        seen_ids: set = set()
        for rid_raw in ordered_run_ids:
            rid = int(rid_raw)
            if rid in seen_ids:
                raise gl.vm.UserError(f"EXPECTED: Duplicate run_id {rid} in ordered_run_ids")
            seen_ids.add(rid)

        for rid_raw in ordered_run_ids:
            rid = int(rid_raw)
            if rid < 0 or rid >= len(rs):
                raise gl.vm.UserError(f"EXPECTED: Run {rid} not found")
            run = rs[rid]
            if run["benchmark_id"] != benchmark_id:
                raise gl.vm.UserError(f"EXPECTED: Run {rid} does not belong to benchmark {benchmark_id}")
            if run["version"] != version:
                raise gl.vm.UserError(f"EXPECTED: Run {rid} is not for version {version}")
            if run["status"] != SEALED:
                raise gl.vm.UserError(f"EXPECTED: Run {rid} is not SEALED (status: {run['status']})")

        # Check scores are in descending order
        prev_score = None
        for rid_raw in ordered_run_ids:
            rid = int(rid_raw)
            score = rs[rid]["final_score_bps"]
            if prev_score is not None and score > prev_score:
                raise gl.vm.UserError("EXPECTED: Run scores must be in descending order")
            prev_score = score

        content = f"{benchmark_id}:{version}:{ordered_run_ids_json}"
        digest = hashlib.sha256(content.encode()).hexdigest()

        ss = self._load_snapshots()
        sid = len(ss)
        ss.append({
            "snapshot_id": sid,
            "benchmark_id": benchmark_id,
            "version": version,
            "ordered_run_ids_json": ordered_run_ids_json,
            "digest": digest,
            "sealed_at": 0,
        })
        self._save_snapshots(ss)
        return sid

    @gl.public.write
    def invalidate_run(self, run_id: int, public_reason_url: str) -> None:
        rs = self._load_runs()
        if run_id < 0 or run_id >= len(rs):
            raise gl.vm.UserError(f"EXPECTED: Run {run_id} not found")
        run = rs[run_id]
        bs = self._load_benchmarks()
        b = bs[run["benchmark_id"]]
        caller = self._caller()
        if caller != b["owner"] and caller != run["submitter"]:
            raise gl.vm.UserError("EXPECTED: Only the benchmark owner or run submitter can invalidate a run")
        if run["status"] == INVALIDATED:
            raise gl.vm.UserError(f"EXPECTED: Run {run_id} is already invalidated")
        run["status"] = INVALIDATED
        run["rationale"] = f"INVALIDATED: {public_reason_url}"
        self._save_runs(rs)

    # -----------------------------------------------------------------------
    # Public read methods
    # -----------------------------------------------------------------------

    @gl.public.view
    def get_run(self, run_id: int) -> dict:
        rs = self._load_runs()
        if run_id < 0 or run_id >= len(rs):
            raise gl.vm.UserError(f"EXPECTED: Run {run_id} not found")
        return rs[run_id]

    @gl.public.view
    def get_benchmark(self, benchmark_id: int) -> dict:
        bs = self._load_benchmarks()
        if benchmark_id < 0 or benchmark_id >= len(bs):
            raise gl.vm.UserError(f"EXPECTED: Benchmark {benchmark_id} not found")
        return bs[benchmark_id]

    @gl.public.view
    def get_snapshot(self, snapshot_id: int) -> dict:
        ss = self._load_snapshots()
        if snapshot_id < 0 or snapshot_id >= len(ss):
            raise gl.vm.UserError(f"EXPECTED: Snapshot {snapshot_id} not found")
        return ss[snapshot_id]

    @gl.public.view
    def preview_exemplars(self, run_id: int, dimension: str, k: int) -> list:
        rs = self._load_runs()
        if run_id < 0 or run_id >= len(rs):
            raise gl.vm.UserError(f"EXPECTED: Run {run_id} not found")
        if k < 1 or k > 10:
            raise gl.vm.UserError("EXPECTED: k must be between 1 and 10")
        run = rs[run_id]
        bid = run["benchmark_id"]
        exemplars_list = self._load_exemplars()
        found = []
        for ex in exemplars_list:
            if ex["benchmark_id"] == bid and ex["dimension"] == dimension:
                found.append(ex["text"])
                if len(found) >= min(k, 4):
                    break
        return found

    @gl.public.view
    def list_benchmarks(self, offset: int, limit: int) -> list:
        if offset < 0:
            raise gl.vm.UserError("EXPECTED: offset must be >= 0")
        if limit < 1 or limit > 100:
            raise gl.vm.UserError("EXPECTED: limit must be between 1 and 100")
        bs = self._load_benchmarks()
        return bs[offset: offset + limit]

    @gl.public.view
    def list_runs(self, benchmark_id: int, offset: int, limit: int) -> list:
        bs = self._load_benchmarks()
        if benchmark_id < 0 or benchmark_id >= len(bs):
            raise gl.vm.UserError(f"EXPECTED: Benchmark {benchmark_id} not found")
        if offset < 0:
            raise gl.vm.UserError("EXPECTED: offset must be >= 0")
        if limit < 1 or limit > 100:
            raise gl.vm.UserError("EXPECTED: limit must be between 1 and 100")
        rs = self._load_runs()
        matching = [r for r in rs if r["benchmark_id"] == benchmark_id]
        page = matching[offset: offset + limit]
        return [{
            "run_id": r["run_id"],
            "version": r["version"],
            "submitter": r["submitter"],
            "model_name": r["model_name"],
            "status": r["status"],
            "final_score_bps": r["final_score_bps"],
            "sealed_at": r["sealed_at"],
        } for r in page]

    @gl.public.view
    def list_snapshots(self, benchmark_id: int, offset: int, limit: int) -> list:
        bs = self._load_benchmarks()
        if benchmark_id < 0 or benchmark_id >= len(bs):
            raise gl.vm.UserError(f"EXPECTED: Benchmark {benchmark_id} not found")
        if offset < 0:
            raise gl.vm.UserError("EXPECTED: offset must be >= 0")
        if limit < 1 or limit > 100:
            raise gl.vm.UserError("EXPECTED: limit must be between 1 and 100")
        ss = self._load_snapshots()
        matching = [s for s in ss if s["benchmark_id"] == benchmark_id]
        return matching[offset: offset + limit]
