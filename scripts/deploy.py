#!/usr/bin/env python3
"""
Deployment script for Spithack contracts on Sepolia Testnet
Uses web3.py + py-solc-x for compilation and deployment.

Requirements:
    pip install -r scripts/requirements.txt

Usage:
    Set environment variables in .env (copy from .env.example), then:
    python scripts/deploy.py
"""

import json
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
from solcx import compile_files, install_solc, set_solc_version
from web3 import Web3
try:
    from web3.middleware import ExtraDataToPOAMiddleware as poa_middleware
except ImportError:
    from web3.middleware import geth_poa_middleware as poa_middleware

# ── Config ───────────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent / ".env.local", override=True)

PRIVATE_KEY   = os.getenv("PRIVATE_KEY")          # deployer private key (no 0x prefix needed)
RPC_URL       = os.getenv("SEPOLIA_RPC_URL")       # e.g. https://sepolia.infura.io/v3/<KEY>
ETHERSCAN_KEY = os.getenv("ETHERSCAN_API_KEY", "") # optional, for verification info

CONTRACTS_DIR = Path(__file__).parent.parent / "contracts"
ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"
SOLC_VERSION  = "0.8.20"

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    print(f"  {msg}")

def section(title: str):
    print(f"\n{'─'*55}")
    print(f"  {title}")
    print(f"{'─'*55}")

def save_artifact(name: str, address: str, abi: list, tx_hash: str):
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    # Full artifact (address + ABI + tx hash)
    data = {"contractName": name, "address": address, "txHash": tx_hash, "abi": abi}
    path = ARTIFACTS_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2))
    log(f"  Artifact saved → artifacts/{name}.json")
    # ABI-only file (for frontend / tooling)
    abi_dir = ARTIFACTS_DIR / "abi"
    abi_dir.mkdir(exist_ok=True)
    abi_path = abi_dir / f"{name}.json"
    abi_path.write_text(json.dumps(abi, indent=2))
    log(f"  ABI saved     → artifacts/abi/{name}.json")

def check_env():
    missing = [v for v in ["PRIVATE_KEY", "SEPOLIA_RPC_URL"] if not os.getenv(v)]
    if missing:
        print(f"\n[ERROR] Missing environment variables: {', '.join(missing)}")
        print("  Copy .env.example → .env and fill in the values.")
        sys.exit(1)

# ── Compile ───────────────────────────────────────────────────────────────────

def compile_contracts():
    section("Compiling contracts")
    log(f"Installing solc {SOLC_VERSION} (if not cached)…")
    install_solc(SOLC_VERSION, show_progress=False)
    set_solc_version(SOLC_VERSION)

    # Resolve the absolute path to node_modules so solc can always find @openzeppelin
    project_root = CONTRACTS_DIR.parent
    node_modules = project_root / "node_modules"
    if not node_modules.exists():
        print("\n[ERROR] node_modules not found.")
        print("  Run:  npm install   (in the project root)")
        sys.exit(1)

    oz_path = str(node_modules / "@openzeppelin")
    remapping = f"@openzeppelin={oz_path}"

    sol_files = sorted(CONTRACTS_DIR.glob("*.sol"))
    log(f"Found {len(sol_files)} contract(s):")
    for f in sol_files:
        log(f"  • {f.name}")

    compiled = compile_files(
        [str(f) for f in sol_files],
        output_values=["abi", "bin"],
        import_remappings=[remapping],
        solc_version=SOLC_VERSION,
        allow_paths=[str(project_root), str(node_modules)],
    )
    log("Compilation successful ✓")
    return compiled

def get_contract(compiled, name: str):
    """Return (abi, bytecode) for a contract by its short name."""
    for key, data in compiled.items():
        if key.endswith(f":{name}"):
            return data["abi"], data["bin"]
    available = [k.split(":")[-1] for k in compiled.keys()]
    raise KeyError(f"Contract '{name}' not found. Available: {available}")

def load_existing(label: str):
    """Return the contract address from a saved artifact, or None if not found."""
    path = ARTIFACTS_DIR / f"{label}.json"
    if path.exists():
        data = json.loads(path.read_text())
        return data.get("address")
    return None

# ── Deploy ────────────────────────────────────────────────────────────────────

def deploy_contract(w3, abi, bytecode, deployer, *constructor_args, label=""):
    """Deploy a contract and wait for receipt. Returns deployed contract instance."""

    # ── Resume: skip if already deployed ─────────────────────────────────────
    existing = load_existing(label)
    if existing:
        log(f"  ↩  {label} already deployed at {existing}  (skipping)")
        return w3.eth.contract(address=existing, abi=abi)

    Contract = w3.eth.contract(abi=abi, bytecode=bytecode)

    log(f"Deploying {label}…")
    nonce = w3.eth.get_transaction_count(deployer.address, "pending")
    gas_price = w3.eth.gas_price

    tx = Contract.constructor(*constructor_args).build_transaction({
        "from": deployer.address,
        "nonce": nonce,
        "gasPrice": gas_price,
        "gas": 4_000_000,
    })

    signed = deployer.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    log(f"  Tx sent: {tx_hash.hex()}")
    log("  Waiting for confirmation…")

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)
    address = receipt["contractAddress"]

    log(f"  ✓ {label} deployed at {address}")
    save_artifact(label, address, abi, tx_hash.hex())
    return w3.eth.contract(address=address, abi=abi)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    check_env()

    # ── Connect ────────────────────────────────────────────────────────────
    section("Connecting to Sepolia")
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    w3.middleware_onion.inject(poa_middleware, layer=0)

    if not w3.is_connected():
        print("[ERROR] Cannot connect to RPC endpoint. Check SEPOLIA_RPC_URL.")
        sys.exit(1)

    deployer = w3.eth.account.from_key(
        PRIVATE_KEY if PRIVATE_KEY.startswith("0x") else "0x" + PRIVATE_KEY
    )
    balance = w3.eth.get_balance(deployer.address)
    log(f"Connected  → chain ID {w3.eth.chain_id}")
    log(f"Deployer   → {deployer.address}")
    log(f"Balance    → {w3.from_wei(balance, 'ether'):.6f} ETH")

    if balance < w3.to_wei(0.05, "ether"):
        print("\n[WARN] Low balance. You may need more Sepolia ETH from a faucet.")

    # ── Compile ─────────────────────────────────────────────────────────────
    compiled = compile_contracts()

    # ── Deploy in dependency order ───────────────────────────────────────────
    section("Deploying contracts")

    # 1. AccessControl  (no deps)
    abi, bin_ = get_contract(compiled, "AccessControl")
    access_ctrl = deploy_contract(w3, abi, bin_, deployer, label="AccessControl")

    # 2. SimToken (borrowToken + optional tokenA/tokenB for LP)
    abi, bin_ = get_contract(compiled, "SimToken")
    sim_token_a = deploy_contract(w3, abi, bin_, deployer, "Palladium", "PLDM", label="Palladium")
    sim_token_b = deploy_contract(w3, abi, bin_, deployer, "Badassium", "BADM", label="Badassium")

    # 3. IdentityRegistry  (needs AccessControl)
    abi, bin_ = get_contract(compiled, "IdentityRegistry")
    identity_registry = deploy_contract(
        w3, abi, bin_, deployer, access_ctrl.address, label="IdentityRegistry"
    )

    # 4. CreditRegistry  (needs AccessControl)
    abi, bin_ = get_contract(compiled, "CreditRegistry")
    credit_registry = deploy_contract(
        w3, abi, bin_, deployer, access_ctrl.address, label="CreditRegistry"
    )

    # 5. CollateralVault  (needs AccessControl)
    abi, bin_ = get_contract(compiled, "CollateralVault")
    collateral_vault = deploy_contract(
        w3, abi, bin_, deployer, access_ctrl.address, label="CollateralVault"
    )

    # 6. LendingPool  (needs AccessControl, CollateralVault, CreditRegistry, SimTokenA)
    abi, bin_ = get_contract(compiled, "LendingPool")
    lending_pool = deploy_contract(
        w3, abi, bin_, deployer,
        access_ctrl.address,
        collateral_vault.address,
        credit_registry.address,
        sim_token_a.address,
        label="LendingPool"
    )

    # 7. LiquidityPool  (needs tokenA, tokenB, AccessControl)
    abi, bin_ = get_contract(compiled, "LiquidityPool")
    liquidity_pool = deploy_contract(
        w3, abi, bin_, deployer,
        sim_token_a.address,
        sim_token_b.address,
        access_ctrl.address,
        label="LiquidityPool"
    )

    # ── Post-deploy wiring ────────────────────────────────────────────────────
    section("Post-deployment wiring")

    # Only call setLendingPool if this is a fresh deploy of either contract
    vault_is_new  = load_existing("CollateralVault") is None
    lp_is_new     = load_existing("LendingPool") is None
    if vault_is_new or lp_is_new:
        log("Setting LendingPool address in CollateralVault…")
        nonce = w3.eth.get_transaction_count(deployer.address, "pending")
        tx = collateral_vault.functions.setLendingPool(lending_pool.address).build_transaction({
            "from": deployer.address,
            "nonce": nonce,
            "gasPrice": w3.eth.gas_price,
            "gas": 100_000,
        })
        signed = deployer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        log(f"  ✓ setLendingPool tx: {tx_hash.hex()}")
    else:
        log("  ↩  setLendingPool already wired  (skipping)")

    # ── Summary ───────────────────────────────────────────────────────────────
    section("Deployment Summary")
    addresses = {
        "AccessControl":    access_ctrl.address,
        "Palladium":        sim_token_a.address,
        "Badassium":        sim_token_b.address,
        "IdentityRegistry": identity_registry.address,
        "CreditRegistry":   credit_registry.address,
        "CollateralVault":  collateral_vault.address,
        "LendingPool":      lending_pool.address,
        "LiquidityPool":    liquidity_pool.address,
    }

    for name, addr in addresses.items():
        log(f"  {name:<22} {addr}")

    # Save combined deployment manifest
    manifest_path = ARTIFACTS_DIR / "deployed_addresses.json"
    manifest_path.write_text(json.dumps(addresses, indent=2))
    log(f"\n  Full manifest saved → artifacts/deployed_addresses.json")
    log(f"\n  View on Etherscan: https://sepolia.etherscan.io/address/<address>")
    log("\n  All done! 🎉")


if __name__ == "__main__":
    main()
