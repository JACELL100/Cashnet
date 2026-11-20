"""
Backfill: push every borrower's DB credit score to CreditRegistry on Sepolia.

The DB is only READ. For each borrower with a valid wallet, compares borrowers.credit_score
(NULL -> 500, the model default) with CreditRegistry.creditScores(wallet) and, unless --dry-run,
sends updateScore(wallet, score) from the server wallet (needs ORACLE_ROLE), sequentially.

Usage (from repo root or backend/):
    python backend/scripts/sync_credit_scores.py --dry-run
    python backend/scripts/sync_credit_scores.py [--max 50]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/

from web3 import Web3  # noqa: E402

from blockchain_service import blockchain_service  # noqa: E402
from database import SessionLocal  # noqa: E402
from models import Borrower  # noqa: E402

DEFAULT_SCORE = 500


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Only print what would change")
    parser.add_argument("--max", type=int, default=None, help="Abort (send nothing) if more than N wallets need syncing")
    args = parser.parse_args()

    if "CreditRegistry" not in blockchain_service.contracts:
        sys.exit("CreditRegistry not loaded (check CREDIT_REGISTRY_ADDRESS)")

    db = SessionLocal()
    try:
        rows = db.query(Borrower.wallet_address, Borrower.credit_score).all()
    finally:
        db.close()
    print(f"Borrowers in DB: {len(rows)}")

    pending = []
    invalid = 0
    seen = set()
    for wallet, score in rows:
        if not wallet or not Web3.is_address(wallet):
            invalid += 1
            continue
        wallet_cs = Web3.to_checksum_address(wallet)
        if wallet_cs in seen:
            continue
        seen.add(wallet_cs)
        target = int(score) if score is not None else DEFAULT_SCORE
        onchain = int(blockchain_service.call_contract_function("CreditRegistry", "creditScores", wallet_cs))
        if onchain != target:
            pending.append((wallet_cs, onchain, target))

    print(f"Invalid wallets skipped: {invalid}")
    print(f"Need syncing: {len(pending)}")
    for wallet_cs, onchain, target in pending:
        print(f"  {wallet_cs}: on-chain {onchain} -> DB {target}")

    if args.dry_run or not pending:
        return
    if args.max is not None and len(pending) > args.max:
        sys.exit(f"Aborting: {len(pending)} wallets need syncing (> --max {args.max})")

    sent = []
    for wallet_cs, onchain, target in pending:
        try:
            tx = blockchain_service.send_transaction("CreditRegistry", "updateScore", wallet_cs, target)
            sent.append(tx)
            print(f"  updated {wallet_cs} -> {target}  tx {tx}")
        except Exception as e:
            print(f"  FAILED {wallet_cs}: {e}")
    print(f"Done: {len(sent)}/{len(pending)} txs sent")


if __name__ == "__main__":
    main()
