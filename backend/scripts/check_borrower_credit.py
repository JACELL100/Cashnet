"""
Check and update credit score for a borrower in the database
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database import get_db
from models import Borrower
from web3 import Web3

def check_borrower_credit(wallet_address: str):
    """Check the credit score for a borrower"""
    db = next(get_db())
    
    try:
        # Normalize wallet address
        wallet_address = Web3.to_checksum_address(wallet_address)
        print(f"\n🔍 Checking credit score for: {wallet_address}")
        
        borrower = db.query(Borrower).filter(Borrower.wallet_address == wallet_address).first()
        
        if borrower:
            print(f"✅ Borrower found:")
            print(f"   - ID: {borrower.id}")
            print(f"   - Name: {borrower.name or 'N/A'}")
            print(f"   - Credit Score: {borrower.credit_score}")
            print(f"   - Created: {borrower.created_at}")
            print(f"   - Last Login: {borrower.last_login or 'Never'}")
            
            if borrower.credit_score == 0:
                print(f"\n⚠️  Credit score is 0! Updating to default 500...")
                borrower.credit_score = 500
                db.commit()
                print(f"✅ Credit score updated to 500")
            
        else:
            print(f"❌ Borrower not found in database")
            print(f"\n💡 Creating borrower with default credit score 500...")
            import secrets
            borrower = Borrower(
                wallet_address=wallet_address,
                nonce=secrets.token_hex(32),
                credit_score=500
            )
            db.add(borrower)
            db.commit()
            print(f"✅ Borrower created successfully")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_borrower_credit.py <wallet_address>")
        print("Example: python check_borrower_credit.py 0xceB0045BFD429eC942aDEc9e84B1F0f2c52C29AD")
        sys.exit(1)
    
    wallet = sys.argv[1]
    check_borrower_credit(wallet)
