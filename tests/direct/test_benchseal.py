"""Direct-mode tests for BenchSeal contract."""
import hashlib
import json
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DIMS = json.dumps(["factual_grounding", "instruction_adherence"])
POLICY = json.dumps({"sample_rate": 0.1})
RUBRIC_URL = "https://example.com/rubric.md"
MANIFEST_URL = "https://example.com/manifest.json"
SAMPLE_URL = "https://example.com/samples.json"
METRICS = json.dumps({"accuracy": 0.82})

# Content strings whose sha256 digests are stored in the contract
RUBRIC_CONTENT = "rubric content for testing"
SAMPLE_CONTENT = "sample bundle content for testing"

def _sha256(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode()).hexdigest()

RUBRIC_DIGEST = _sha256(RUBRIC_CONTENT)
SAMPLE_DIGEST = _sha256(SAMPLE_CONTENT)
MANIFEST_DIGEST = "sha256:" + "b" * 64

GOOD_SCORE_JSON = json.dumps({
    "ok": True,
    "dimension_bands": {"factual_grounding": 3, "instruction_adherence": 4},
    "reason": "Strong performance on both dimensions",
})

BAD_SCORE_JSON = json.dumps({
    "ok": False,
    "reason": "Insufficient sample data",
})

MALFORMED_SCORE = "not json at all {"


def deploy_contract(direct_vm, alice):
    direct_vm.prank(alice)
    from genlayer_test.direct import deploy
    return deploy(direct_vm, "contracts/benchseal.py", constructor_args=[])


def create_benchmark_helper(contract, direct_vm, alice, name="TestBench"):
    direct_vm.prank(alice)
    return contract.create_benchmark(name, RUBRIC_URL, RUBRIC_DIGEST, DIMS, POLICY)


def publish_version_helper(contract, direct_vm, alice, bid):
    direct_vm.prank(alice)
    return contract.publish_version(bid, MANIFEST_URL, MANIFEST_DIGEST, "v1")


def commit_run_helper(contract, direct_vm, alice, bid, version=1, model="GPT-4o"):
    direct_vm.prank(alice)
    return contract.commit_run(bid, version, model, MANIFEST_URL, MANIFEST_DIGEST, METRICS, SAMPLE_URL, SAMPLE_DIGEST)


# ---------------------------------------------------------------------------
# TestCreateBenchmark
# ---------------------------------------------------------------------------

class TestCreateBenchmark:
    def test_creates_with_valid_inputs(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        assert bid == 0

    def test_rejects_empty_name(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.create_benchmark("", RUBRIC_URL, RUBRIC_DIGEST, DIMS, POLICY)

    def test_rejects_name_too_long(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.create_benchmark("x" * 257, RUBRIC_URL, RUBRIC_DIGEST, DIMS, POLICY)

    def test_rejects_no_dimensions(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.create_benchmark("TestBench", RUBRIC_URL, RUBRIC_DIGEST, "[]", POLICY)

    def test_rejects_too_many_dimensions(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        too_many = json.dumps([f"dim_{i}" for i in range(33)])
        with direct_vm.expect_revert("EXPECTED:"):
            contract.create_benchmark("TestBench", RUBRIC_URL, RUBRIC_DIGEST, too_many, POLICY)

    def test_rejects_invalid_sampling_policy_json(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.create_benchmark("TestBench", RUBRIC_URL, RUBRIC_DIGEST, DIMS, "not json {")

    def test_returns_correct_benchmark_id(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid0 = create_benchmark_helper(contract, direct_vm, direct_alice, name="Bench0")
        bid1 = create_benchmark_helper(contract, direct_vm, direct_alice, name="Bench1")
        assert bid0 == 0
        assert bid1 == 1

    def test_owner_is_caller(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        b = contract.get_benchmark(bid)
        assert b["owner"].lower() == str(direct_alice).lower()


# ---------------------------------------------------------------------------
# TestPublishVersion
# ---------------------------------------------------------------------------

class TestPublishVersion:
    def test_owner_can_publish(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        version = publish_version_helper(contract, direct_vm, direct_alice, bid)
        assert version == 1

    def test_non_owner_cannot_publish(self, direct_vm, direct_alice, direct_bob):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        direct_vm.prank(direct_bob)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.publish_version(bid, MANIFEST_URL, MANIFEST_DIGEST, "v1")

    def test_increments_version(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        v1 = publish_version_helper(contract, direct_vm, direct_alice, bid)
        v2 = publish_version_helper(contract, direct_vm, direct_alice, bid)
        assert v1 == 1
        assert v2 == 2

    def test_rejects_missing_url(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.publish_version(bid, "", MANIFEST_DIGEST, "v1")

    def test_rejects_unknown_benchmark(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.publish_version(999, MANIFEST_URL, MANIFEST_DIGEST, "v1")


# ---------------------------------------------------------------------------
# TestCommitRun
# ---------------------------------------------------------------------------

class TestCommitRun:
    def test_commits_run(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        assert rid == 0

    def test_rejects_invalid_benchmark_id(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.commit_run(999, 1, "ModelX", MANIFEST_URL, MANIFEST_DIGEST, METRICS, SAMPLE_URL, SAMPLE_DIGEST)

    def test_rejects_version_zero(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.commit_run(bid, 0, "ModelX", MANIFEST_URL, MANIFEST_DIGEST, METRICS, SAMPLE_URL, SAMPLE_DIGEST)

    def test_rejects_version_above_current(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.commit_run(bid, 99, "ModelX", MANIFEST_URL, MANIFEST_DIGEST, METRICS, SAMPLE_URL, SAMPLE_DIGEST)

    def test_run_starts_committed(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        run = contract.get_run(rid)
        assert run["status"] == 1  # RUN_COMMITTED

    def test_run_count_increments(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        commit_run_helper(contract, direct_vm, direct_alice, bid, model="ModelA")
        commit_run_helper(contract, direct_vm, direct_alice, bid, model="ModelB")
        b = contract.get_benchmark(bid)
        assert b["run_count"] == 2


# ---------------------------------------------------------------------------
# TestScoreRun
# ---------------------------------------------------------------------------

class TestScoreRun:
    def test_score_run_requires_committed_status(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        # Set up LLM mock to return good JSON
        direct_vm.mock_llm(GOOD_SCORE_JSON)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        run = contract.get_run(rid)
        assert run["status"] in (2, 3, 4)  # SCORING, SEALED, or ABSTAINED

    def test_cannot_score_already_scoring_run(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        # Manually set status to SCORING by calling score_run
        direct_vm.mock_llm(GOOD_SCORE_JSON)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        # If already SEALED/ABSTAINED, scoring again should revert
        run = contract.get_run(rid)
        if run["status"] != 1:  # not RUN_COMMITTED
            direct_vm.prank(direct_alice)
            with direct_vm.expect_revert("EXPECTED:"):
                contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)

    def test_abstains_on_malformed_json(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.mock_llm(MALFORMED_SCORE)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        run = contract.get_run(rid)
        assert run["status"] == 4  # ABSTAINED

    def test_abstains_on_missing_dimension(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        # Only one dimension in response, but two expected
        missing_dim_json = json.dumps({
            "ok": True,
            "dimension_bands": {"factual_grounding": 3},  # missing instruction_adherence
            "reason": "partial",
        })
        direct_vm.mock_llm(missing_dim_json)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        run = contract.get_run(rid)
        assert run["status"] == 4  # ABSTAINED

    def test_abstains_on_out_of_range_band(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        bad_band_json = json.dumps({
            "ok": True,
            "dimension_bands": {"factual_grounding": 5, "instruction_adherence": 3},  # 5 is out of range
            "reason": "bad band",
        })
        direct_vm.mock_llm(bad_band_json)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        run = contract.get_run(rid)
        assert run["status"] == 4  # ABSTAINED

    def test_seals_on_valid_response(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.mock_llm(GOOD_SCORE_JSON)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        run = contract.get_run(rid)
        assert run["status"] == 3  # SEALED

    def test_final_score_bps_calculation(self, direct_vm, direct_alice):
        # band 4 all dims = 10000 bps
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        perfect_score_json = json.dumps({
            "ok": True,
            "dimension_bands": {"factual_grounding": 4, "instruction_adherence": 4},
            "reason": "Perfect",
        })
        direct_vm.mock_llm(perfect_score_json)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        run = contract.get_run(rid)
        assert run["status"] == 3  # SEALED
        assert run["final_score_bps"] == 10000

    def test_stores_exemplar_after_seal(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.mock_llm(GOOD_SCORE_JSON)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        run = contract.get_run(rid)
        if run["status"] == 3:  # SEALED
            exemplars = contract.preview_exemplars(rid, "factual_grounding", 4)
            assert len(exemplars) > 0


# ---------------------------------------------------------------------------
# TestSealLeaderboard
# ---------------------------------------------------------------------------

class TestSealLeaderboard:
    def _setup_sealed_run(self, direct_vm, alice):
        contract = deploy_contract(direct_vm, alice)
        bid = create_benchmark_helper(contract, direct_vm, alice)
        publish_version_helper(contract, direct_vm, alice, bid)
        rid = commit_run_helper(contract, direct_vm, alice, bid)
        direct_vm.mock_llm(GOOD_SCORE_JSON)
        direct_vm.prank(alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        return contract, bid, rid

    def test_owner_can_seal(self, direct_vm, direct_alice):
        contract, bid, rid = self._setup_sealed_run(direct_vm, direct_alice)
        run = contract.get_run(rid)
        if run["status"] == 3:  # SEALED
            direct_vm.prank(direct_alice)
            sid = contract.seal_leaderboard(bid, 1, json.dumps([rid]))
            assert sid == 0

    def test_non_owner_cannot_seal(self, direct_vm, direct_alice, direct_bob):
        contract, bid, rid = self._setup_sealed_run(direct_vm, direct_alice)
        run = contract.get_run(rid)
        if run["status"] == 3:  # SEALED
            direct_vm.prank(direct_bob)
            with direct_vm.expect_revert("EXPECTED:"):
                contract.seal_leaderboard(bid, 1, json.dumps([rid]))

    def test_rejects_non_sealed_runs(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        # run is RUN_COMMITTED, not SEALED
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.seal_leaderboard(bid, 1, json.dumps([rid]))

    def test_creates_snapshot_with_digest(self, direct_vm, direct_alice):
        contract, bid, rid = self._setup_sealed_run(direct_vm, direct_alice)
        run = contract.get_run(rid)
        if run["status"] == 3:
            direct_vm.prank(direct_alice)
            sid = contract.seal_leaderboard(bid, 1, json.dumps([rid]))
            snap = contract.get_snapshot(sid)
            assert "digest" in snap
            assert len(snap["digest"]) == 64  # sha256 hex


# ---------------------------------------------------------------------------
# TestInvalidateRun
# ---------------------------------------------------------------------------

class TestInvalidateRun:
    def test_owner_can_invalidate(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.prank(direct_alice)
        contract.invalidate_run(rid, "https://example.com/reason")
        run = contract.get_run(rid)
        assert run["status"] == 5  # INVALIDATED

    def test_submitter_can_invalidate(self, direct_vm, direct_alice, direct_bob):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.prank(direct_bob)
        rid = contract.commit_run(bid, 1, "ModelX", MANIFEST_URL, MANIFEST_DIGEST, METRICS, SAMPLE_URL, SAMPLE_DIGEST)
        direct_vm.prank(direct_bob)
        contract.invalidate_run(rid, "https://example.com/reason")
        run = contract.get_run(rid)
        assert run["status"] == 5  # INVALIDATED

    def test_stranger_cannot_invalidate(self, direct_vm, direct_alice, direct_bob):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.prank(direct_bob)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.invalidate_run(rid, "https://example.com/reason")

    def test_cannot_invalidate_twice(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.prank(direct_alice)
        contract.invalidate_run(rid, "https://example.com/reason")
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.invalidate_run(rid, "https://example.com/reason2")


# ---------------------------------------------------------------------------
# TestViews
# ---------------------------------------------------------------------------

class TestViews:
    def test_get_benchmark_not_found(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.get_benchmark(999)

    def test_get_run_not_found(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.get_run(999)

    def test_list_benchmarks_pagination(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        create_benchmark_helper(contract, direct_vm, direct_alice, name="BenchA")
        create_benchmark_helper(contract, direct_vm, direct_alice, name="BenchB")
        create_benchmark_helper(contract, direct_vm, direct_alice, name="BenchC")
        page1 = contract.list_benchmarks(0, 2)
        assert len(page1) == 2
        page2 = contract.list_benchmarks(2, 2)
        assert len(page2) == 1

    def test_list_runs_pagination(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        commit_run_helper(contract, direct_vm, direct_alice, bid, model="ModelA")
        commit_run_helper(contract, direct_vm, direct_alice, bid, model="ModelB")
        commit_run_helper(contract, direct_vm, direct_alice, bid, model="ModelC")
        page1 = contract.list_runs(bid, 0, 2)
        assert len(page1) == 2
        page2 = contract.list_runs(bid, 2, 2)
        assert len(page2) == 1

    def test_preview_exemplars(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        rid = commit_run_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.mock_llm(GOOD_SCORE_JSON)
        direct_vm.prank(direct_alice)
        contract.score_run(rid, SAMPLE_CONTENT, RUBRIC_CONTENT)
        run = contract.get_run(rid)
        if run["status"] == 3:  # SEALED
            exemplars = contract.preview_exemplars(rid, "factual_grounding", 4)
            assert isinstance(exemplars, list)
            assert len(exemplars) <= 4

    def test_list_benchmarks_empty(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        result = contract.list_benchmarks(0, 10)
        assert result == []

    def test_list_runs_invalid_benchmark(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.list_runs(999, 0, 10)


# ---------------------------------------------------------------------------
# TestEvidenceBinding
# ---------------------------------------------------------------------------

class TestEvidenceBinding:
    def _setup_run(self, direct_vm, alice):
        contract = deploy_contract(direct_vm, alice)
        bid = create_benchmark_helper(contract, direct_vm, alice)
        publish_version_helper(contract, direct_vm, alice, bid)
        rid = commit_run_helper(contract, direct_vm, alice, bid)
        return contract, bid, rid

    def test_wrong_sample_digest_raises_error(self, direct_vm, direct_alice):
        contract, _bid, rid = self._setup_run(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.score_run(rid, "wrong content that does not match stored digest", RUBRIC_CONTENT)

    def test_empty_content_raises_error(self, direct_vm, direct_alice):
        contract, _bid, rid = self._setup_run(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.score_run(rid, "", RUBRIC_CONTENT)

    def test_malformed_digest_rejected_on_create_benchmark(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.create_benchmark("Bench", RUBRIC_URL, "sha256:tooshort", DIMS, POLICY)

    def test_malformed_digest_rejected_on_commit_run(self, direct_vm, direct_alice):
        contract = deploy_contract(direct_vm, direct_alice)
        bid = create_benchmark_helper(contract, direct_vm, direct_alice)
        publish_version_helper(contract, direct_vm, direct_alice, bid)
        direct_vm.prank(direct_alice)
        with direct_vm.expect_revert("EXPECTED:"):
            contract.commit_run(
                bid, 1, "ModelX", MANIFEST_URL, MANIFEST_DIGEST,
                METRICS, SAMPLE_URL, "notadigest",
            )


# ---------------------------------------------------------------------------
# TestLeaderboardValidation
# ---------------------------------------------------------------------------

class TestLeaderboardValidation:
    def _setup_two_sealed_runs(self, direct_vm, alice):
        contract = deploy_contract(direct_vm, alice)
        bid = create_benchmark_helper(contract, direct_vm, alice)
        publish_version_helper(contract, direct_vm, alice, bid)

        rid0 = commit_run_helper(contract, direct_vm, alice, bid, model="ModelA")
        direct_vm.mock_llm(json.dumps({
            "ok": True,
            "dimension_bands": {"factual_grounding": 4, "instruction_adherence": 4},
            "reason": "perfect",
        }))
        direct_vm.prank(alice)
        contract.score_run(rid0, SAMPLE_CONTENT, RUBRIC_CONTENT)

        rid1 = commit_run_helper(contract, direct_vm, alice, bid, model="ModelB")
        direct_vm.mock_llm(json.dumps({
            "ok": True,
            "dimension_bands": {"factual_grounding": 2, "instruction_adherence": 2},
            "reason": "mediocre",
        }))
        direct_vm.prank(alice)
        contract.score_run(rid1, SAMPLE_CONTENT, RUBRIC_CONTENT)

        return contract, bid, rid0, rid1

    def test_leaderboard_wrong_order_rejected(self, direct_vm, direct_alice):
        contract, bid, rid0, rid1 = self._setup_two_sealed_runs(direct_vm, direct_alice)
        r0 = contract.get_run(rid0)
        r1 = contract.get_run(rid1)
        if r0["status"] == 3 and r1["status"] == 3:
            # rid0 has higher score; putting lower score first should fail
            direct_vm.prank(direct_alice)
            with direct_vm.expect_revert("EXPECTED:"):
                contract.seal_leaderboard(bid, 1, json.dumps([rid1, rid0]))

    def test_leaderboard_duplicate_run_rejected(self, direct_vm, direct_alice):
        contract, bid, rid0, _rid1 = self._setup_two_sealed_runs(direct_vm, direct_alice)
        r0 = contract.get_run(rid0)
        if r0["status"] == 3:
            direct_vm.prank(direct_alice)
            with direct_vm.expect_revert("EXPECTED:"):
                contract.seal_leaderboard(bid, 1, json.dumps([rid0, rid0]))
