import pytest
import sys
from gltest.direct import VMContext, deploy_contract, create_address
from pathlib import Path


def _reset_contract_registry():
    """Reset the genlayer SDK's global contract class registry.

    The genlayer SDK tracks the one registered contract class in a module-level
    global ``__known_contract__``. When a contract module is reloaded between
    tests the SDK raises 'only one contract is allowed' if this global is not
    reset first. This teardown clears it so each test gets a fresh deploy.
    """
    for mod_name, mod in list(sys.modules.items()):
        if "genvm_contracts" in mod_name or (
            hasattr(mod, "__known_contract__") and mod.__name__ and "genlayer" in mod.__name__
        ):
            if hasattr(mod, "__known_contract__"):
                mod.__known_contract__ = None
    for mod_name in list(sys.modules):
        if mod_name.startswith("_contract_benchseal"):
            del sys.modules[mod_name]


@pytest.fixture(autouse=True)
def reset_genlayer_registry():
    """Reset genlayer contract registry before and after each test."""
    _reset_contract_registry()
    yield
    _reset_contract_registry()


@pytest.fixture
def direct_vm():
    return VMContext()


@pytest.fixture(autouse=True)
def activate_vm(direct_vm):
    """Activate the VM context so wasi_mock is in place for all contract calls."""
    with direct_vm.activate():
        yield


@pytest.fixture
def direct_alice(direct_vm):
    return create_address("alice")


@pytest.fixture
def direct_bob(direct_vm):
    return create_address("bob")
