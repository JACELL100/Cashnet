"""
Interactive script to add a single admin account
Usage: python scripts/add_admin.py
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database import SessionLocal, init_db
from models import AdminAuditor, AdminAuditorRoleEnum
from sqlalchemy.exc import IntegrityError
import hashlib


def add_admin_interactive():
    """Interactive admin provisioning"""
    print("╔═══════════════════════════════════════════════════════╗")
    print("║     Add Admin Account (Development Mode)             ║")
    print("╚═══════════════════════════════════════════════════════╝\n")
    
    # Get user input
    email = input("Enter Google email address: ").strip()
    if not email:
        print("❌ Email is required")
        return
    
    name = input("Enter display name: ").strip()
    if not name:
        name = email.split('@')[0].title()
    
    role = input("Enter role (ADMIN/AUDITOR) [ADMIN]: ").strip().upper()
    if role not in ["ADMIN", "AUDITOR"]:
        role = "ADMIN"
    
    # Generate UID from email for dev purposes
    uid = hashlib.md5(email.encode()).hexdigest()[:20]
    
    print(f"\n📝 Creating account:")
    print(f"   Email: {email}")
    print(f"   Name: {name}")
    print(f"   Role: {role}")
    print(f"   UID: {uid}")
    
    confirm = input("\nContinue? (y/n): ").strip().lower()
    if confirm != 'y':
        print("❌ Cancelled")
        return
    
    # Initialize database
    init_db()
    db = SessionLocal()
    
    try:
        # Check if already exists
        existing = db.query(AdminAuditor).filter(
            (AdminAuditor.email == email) | (AdminAuditor.uid == uid)
        ).first()
        
        if existing:
            print(f"\n⚠️  Account already exists:")
            print(f"   Email: {existing.email}")
            print(f"   Name: {existing.name}")
            print(f"   Role: {existing.role.value}")
            
            update = input("\nUpdate to new role? (y/n): ").strip().lower()
            if update == 'y':
                existing.role = AdminAuditorRoleEnum.ADMIN if role == "ADMIN" else AdminAuditorRoleEnum.AUDITOR
                existing.name = name
                db.commit()
                print(f"✅ Updated {email} to {role}")
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
        
        print(f"\n✅ SUCCESS! Provisioned {email} as {record.role.value}")
        print(f"\n🔑 This user can now login at: http://localhost:3000/admin/login")
        
    except IntegrityError as e:
        db.rollback()
        print(f"\n❌ Database error: {e}")
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
    finally:
        db.close()


def list_admins():
    """List all current admin/auditor accounts"""
    init_db()
    db = SessionLocal()
    
    try:
        records = db.query(AdminAuditor).all()
        
        if not records:
            print("No admin/auditor accounts found")
            return
        
        print("\n╔═══════════════════════════════════════════════════════╗")
        print("║          Current Admin/Auditor Accounts              ║")
        print("╚═══════════════════════════════════════════════════════╝\n")
        
        for i, record in enumerate(records, 1):
            print(f"{i}. {record.email}")
            print(f"   Name: {record.name}")
            print(f"   Role: {record.role.value}")
            print(f"   UID:  {record.uid}")
            print(f"   Created: {record.created_at}\n")
            
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "list":
        list_admins()
    else:
        add_admin_interactive()
