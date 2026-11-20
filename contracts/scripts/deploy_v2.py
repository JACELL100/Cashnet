#!/usr/bin/env python3
"""
Phase 2 deployment: LendingPool v2 + LiquidityPool v2 on Sepolia.

Reuses the existing AccessControl, CreditRegistry, CollateralVault and the
PLDM / BADM SimTokens. Steps (each is skipped if already recorded in
contracts/scripts/deployed_v2.json, so the script is safe to re-run):

  1. compile LendingPool.sol + LiquidityPool.sol (solc 0.8.24, optimizer 200)
     and write ABIs to contracts/abi/
  2. deploy LendingPool v2 (Chainlink ETH/USD feed, 6h staleness window)
  3. deploy LiquidityPool v2 (PLDM / BADM)
  4. CollateralVault.setLendingPool(LendingPool v2)
  5. remove the deployer's LP shares from the old LiquidityPool
  6. mint + addLiquidity 20,200 PLDM : 30,300 BADM to LiquidityPool v2
  7. mint 1,000,000 PLDM and supply() it to LendingPool v2

Usage:
  pip install web3 python-dotenv py-solc-x
  # OpenZeppelin v5 sources: `npm install` in the repo root (node_modules/@openzeppelin),
  # or set OZ_NODE_MODULES to a dir containing @openzeppelin/contracts.
  python contracts/scripts/deploy_v2.py            # compile + deploy
  python contracts/scripts/deploy_v2.py --compile  # compile + write ABIs only

Env (repo-root .env): PRIVATE_KEY, SEPOLIA_RPC_URL, ACCESS_CONTROL_ADDRESS,
COLLATERAL_VAULT_ADDRESS, CREDIT_REGISTRY_ADDRESS, PALLADIUM_ADDRESS,
BADASSIUM_ADDRESS, LIQUIDITY_POOL_ADDRESS (old pool, for step 5),
optional CHAINLINK_ETH_USD_FEED.
"""

import json
import os
import posixpath
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from solcx import compile_standard, install_solc
from web3 import Web3

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "contracts"
ABI_DIR = CONTRACTS / "abi"
STATE_FILE = Path(__file__).with_name("deployed_v2.json")

load_dotenv(ROOT / ".env")

SOLC_VERSION = "0.8.24"
DEFAULT_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306"  # Chainlink ETH/USD Sepolia
MAX_PRICE_AGE = 6 * 3600
E18 = 10**18
SEED_PLDM_AMM = 20_200 * E18
SEED_BADM_AMM = 30_300 * E18
SEED_LENDING = 1_000_000 * E18


IMPORT_RE = re.compile(r"""^\s*import\s+(?:[^"']*from\s+)?["']([^"']+)["']""", re.M)


def collect_sources(entry_files, node_modules: Path) -> dict:
    """Resolve imports in Python and hand solc every file as inline content
    (avoids solc path-resolution issues with absolute Windows paths)."""
    sources, queue = {}, list(entry_files)
    while queue:
        unit = queue.pop()
        if unit in sources:
            continue
        disk = node_modules / unit if unit.startswith("@") else CONTRACTS / unit
        text = disk.read_text(encoding="utf-8")
        sources[unit] = {"content": text}
        for imp in IMPORT_RE.findall(text):
            if imp.startswith("."):
                imp = posixpath.normpath(posixpath.join(posixpath.dirname(unit), imp))
            queue.append(imp)
    return sources


def compile_v2():
    node_modules = Path(os.getenv("OZ_NODE_MODULES") or ROOT / "node_modules")
    if not (node_modules / "@openzeppelin" / "contracts" / "token" / "ERC20" / "ERC20.sol").exists():
        sys.exit(f"@openzeppelin/contracts not found under {node_modules} (set OZ_NODE_MODULES)")
    install_solc(SOLC_VERSION, show_progress=False)
    out = compile_standard(
        {
            "language": "Solidity",
            "sources": collect_sources(["LendingPool.sol", "LiquidityPool.sol"], node_modules),
            "settings": {
                "optimizer": {"enabled": True, "runs": 200},
                "evmVersion": "shanghai",
                "outputSelection": {"*": {"*": ["abi", "evm.bytecode.object"]}},
            },
        },
        solc_version=SOLC_VERSION,
    )
    errors = [e for e in out.get("errors", []) if e["severity"] == "error"]
    if errors:
        sys.exit("\n".join(e["formattedMessage"] for e in errors))
    result = {}
    for name in ("LendingPool", "LiquidityPool"):
        c = out["contracts"][f"{name}.sol"][name]
        result[name] = (c["abi"], c["evm"]["bytecode"]["object"])
        (ABI_DIR / f"{name}.json").write_text(json.dumps(c["abi"], indent=2))  # raw array (format backend expects)
        print(f"  {name}: bytecode {len(c['evm']['bytecode']['object']) // 2} bytes, ABI written")
    return result


def load_abi(name):
    data = json.loads((ABI_DIR / f"{name}.json").read_text())
    return data["abi"] if isinstance(data, dict) else data


class Deployer:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(os.environ["SEPOLIA_RPC_URL"]))
        self.acct = self.w3.eth.account.from_key(os.environ["PRIVATE_KEY"])
        self.state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {"txs": {}}

    def save(self):
        STATE_FILE.write_text(json.dumps(self.state, indent=2))

    def send(self, label, fn=None, deploy=None, value=0):
        if label in self.state["txs"]:
            print(f"  [skip] {label}: {self.state['txs'][label]['hash']}")
            return None
        params = {"from": self.acct.address, "nonce": self.w3.eth.get_transaction_count(self.acct.address, "pending"), "value": value}
        tx = (deploy or fn).build_transaction(params)
        tx["gas"] = int(self.w3.eth.estimate_gas(tx) * 1.2)
        signed = self.acct.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        r = self.w3.eth.wait_for_transaction_receipt(h, timeout=300)
        if r.status != 1:
            sys.exit(f"  [FAIL] {label}: {h.hex()}")
        entry = {"hash": "0x" + h.hex().removeprefix("0x"), "block": r.blockNumber}
        if r.contractAddress:
            entry["address"] = r.contractAddress
        self.state["txs"][label] = entry
        self.save()
        print(f"  [ok] {label}: {entry['hash']} (block {r.blockNumber})")
        return r

    def c(self, addr, name):
        return self.w3.eth.contract(address=Web3.to_checksum_address(addr), abi=load_abi(name))


def main():
    print("Compiling…")
    compiled = compile_v2()
    if "--compile" in sys.argv:
        return

    env = os.environ
    d = Deployer()
    w3, me = d.w3, d.acct.address
    print(f"Deployer {me}, balance {w3.from_wei(w3.eth.get_balance(me), 'ether')} ETH")
    feed = env.get("CHAINLINK_ETH_USD_FEED", DEFAULT_FEED)

    # 2. LendingPool v2
    abi, bin_ = compiled["LendingPool"]
    d.send("deploy_LendingPool", deploy=w3.eth.contract(abi=abi, bytecode=bin_).constructor(
        env["ACCESS_CONTROL_ADDRESS"], env["COLLATERAL_VAULT_ADDRESS"], env["CREDIT_REGISTRY_ADDRESS"],
        env["PALLADIUM_ADDRESS"], feed, MAX_PRICE_AGE))
    lending_addr = d.state["txs"]["deploy_LendingPool"]["address"]

    # 3. LiquidityPool v2
    abi, bin_ = compiled["LiquidityPool"]
    d.send("deploy_LiquidityPool", deploy=w3.eth.contract(abi=abi, bytecode=bin_).constructor(
        env["PALLADIUM_ADDRESS"], env["BADASSIUM_ADDRESS"], env["ACCESS_CONTROL_ADDRESS"]))
    amm_addr = d.state["txs"]["deploy_LiquidityPool"]["address"]
    d.state.update({"LendingPool": lending_addr, "LiquidityPool": amm_addr, "priceFeed": feed})
    d.save()

    lending = d.c(lending_addr, "LendingPool")
    amm = d.c(amm_addr, "LiquidityPool")
    vault = d.c(env["COLLATERAL_VAULT_ADDRESS"], "CollateralVault")
    pldm = d.c(env["PALLADIUM_ADDRESS"], "SimToken")
    badm = d.c(env["BADASSIUM_ADDRESS"], "SimToken")

    # 4. Point the vault at v2
    if vault.functions.lendingPool().call() != lending_addr:
        d.send("vault_setLendingPool", vault.functions.setLendingPool(lending_addr))

    # 5. Pull deployer liquidity out of the old AMM (if it is not the v2 pool)
    old_amm_addr = d.state.get("oldLiquidityPool") or env.get("LIQUIDITY_POOL_ADDRESS")
    if old_amm_addr and Web3.to_checksum_address(old_amm_addr) != amm_addr:
        d.state["oldLiquidityPool"] = old_amm_addr
        old_amm = w3.eth.contract(address=Web3.to_checksum_address(old_amm_addr), abi=[
            {"name": "balanceOf", "type": "function", "stateMutability": "view",
             "inputs": [{"name": "a", "type": "address"}], "outputs": [{"type": "uint256"}]},
            {"name": "removeLiquidity", "type": "function", "stateMutability": "nonpayable",
             "inputs": [{"name": "shares", "type": "uint256"}], "outputs": []}])
        shares = old_amm.functions.balanceOf(me).call()
        if shares > 0:
            d.send("oldAMM_removeLiquidity", old_amm.functions.removeLiquidity(shares))

    # 6. Seed the v2 AMM
    if amm.functions.totalSupply().call() == 0:
        for tok, need, sym in ((pldm, SEED_PLDM_AMM, "PLDM"), (badm, SEED_BADM_AMM, "BADM")):
            bal = tok.functions.balanceOf(me).call()
            if bal < need:
                d.send(f"mint_{sym}_amm", tok.functions.mint(me, need - bal))
            d.send(f"approve_{sym}_amm", tok.functions.approve(amm_addr, need))
        d.send("amm_addLiquidity", amm.functions.addLiquidity(SEED_PLDM_AMM, SEED_BADM_AMM))

    # 7. Seed lending liquidity
    if lending.functions.totalSupply().call() == 0:
        d.send("mint_PLDM_lending", pldm.functions.mint(me, SEED_LENDING))
        d.send("approve_PLDM_lending", pldm.functions.approve(lending_addr, SEED_LENDING))
        d.send("lending_supply", lending.functions.supply(SEED_LENDING))

    print("\nDone.")
    print(f"  LENDING_POOL_ADDRESS={lending_addr}")
    print(f"  LIQUIDITY_POOL_ADDRESS={amm_addr}")
    print(f"  CHAINLINK_ETH_USD_FEED={feed}")
    print(f"  ETH price (1e18): {lending.functions.getEthPrice().call()}")
    print(f"  lending cash: {lending.functions.cash().call() / E18:,.2f} PLDM")
    print(f"  AMM reserves: {amm.functions.reserveA().call() / E18:,.2f} / {amm.functions.reserveB().call() / E18:,.2f}")


if __name__ == "__main__":
    main()
