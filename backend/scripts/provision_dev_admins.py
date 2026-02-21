"""
Development script to provision multiple admin accounts
Run this to add admin accounts for your team during development
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database import SessionLocal, init_db
from models import AdminAuditor, AdminAuditorRoleEnum
from sqlalchemy.exc import IntegrityError


def provision_admin(email: str, name: str, uid: str = None, role: str = "ADMIN"):
    """
    Provision an admin or auditor account
    
    Args:
        email: Google email address
        name: Display name
        uid: Firebase UID (optional - will use email as fallback)
        role: ADMIN or AUDITOR
    """
    db = SessionLocal()
    
    # Use email hash as UID if not provided (for dev purposes)
    if uid is None:
        import hashlib
        uid = hashlib.md5(email.encode()).hexdigest()[:20]
    
    try:
        # Check if already exists
        existing = db.query(AdminAuditor).filter(
            (AdminAuditor.email == email) | (AdminAuditor.uid == uid)
        ).first()
        
        if existing:
            print(f"✓ {email} already provisioned as {existing.role.value}")
            db.close()
            return
        
        # Create new admin/auditor
        record = AdminAuditor(
            uid=uid,
            email=email,
            name=name,
            picture=f"https://api.dicebear.com/7.x/avataaars/svg?seed={email}",
            role=AdminAuditorRoleEnum.ADMIN if role == "ADMIN" else AdminAuditorRoleEnum.AUDITOR,
        )
        
        db.add(record)
        db.commit()
        db.refresh(record)
        
        print(f"✅ Provisioned: {email} as {record.role.value}")
        
    except IntegrityError as e:
        db.rollback()
        print(f"❌ Error provisioning {email}: {e}")
    finally:
        db.close()


def main():
    print("🔧 Provisioning Development Admin Accounts\n")
    
    # Initialize database
    init_db()
    
    # Add your team members here with their Google emails
    # These emails will be allowed to login as admins
    dev_admins = [
        # Format: (email, name)
        ("your.email@gmail.com", "Your Name"),
        ("teammate1@gmail.com", "Teammate 1"),
        ("teammate2@gmail.com", "Teammate 2"),
        ("teammate3@gmail.com", "Teammate 3"),
        # Add more team members as needed
    ]
    
    print("📝 Add these emails to provision admin access:\n")
    for i, (email, name) in enumerate(dev_admins, 1):
        if email == "your.email@gmail.com":
            print(f"   {i}. [EXAMPLE] {email} - {name}")
        else:
            provision_admin(email, name)
    
    print("\n✅ Provisioning complete!")
    print("\n📌 To add more admins, edit this file and add emails to the 'dev_admins' list")
    print("   Then run: python scripts/provision_dev_admins.py\n")


if __name__ == "__main__":
    main()
