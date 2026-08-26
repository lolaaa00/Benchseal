import pytest
from genlayer_test.direct import DirectVM, deploy


@pytest.fixture
def direct_vm():
    vm = DirectVM()
    yield vm


@pytest.fixture
def direct_alice(direct_vm):
    return direct_vm.create_account()


@pytest.fixture
def direct_bob(direct_vm):
    return direct_vm.create_account()


@pytest.fixture
def deployed_contract(direct_vm, direct_alice):
    direct_vm.prank(direct_alice)
    return deploy(direct_vm, "contracts/benchseal.py", constructor_args=[])
