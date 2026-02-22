"""Add AUDITOR role to crce.10246.ceb@gmail.com (keeping existing ADMIN role)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / '.env.local')

from sqlalchemy import create_engine, text

TARGET_EMAIL = 'crce.10246.ceb@gmail.com'
TARGET_ROLE  = 'AUDITOR'

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL not set')
    sys.exit(1)

engine = create_engine(db_url)

with engine.connect() as conn:
    # Check if user exists
    result = conn.execute(
        text("SELECT uid, email, name, role FROM adminandauditor WHERE email = :email"),
        {'email': TARGET_EMAIL}
    )
    existing = result.fetchall()
    
    if not existing:
        print(f'ERROR: {TARGET_EMAIL} does not exist in the database. Add as admin first.')
        sys.exit(1)
    
    print(f'\nFound {len(existing)} existing entry(ies) for {TARGET_EMAIL}:')
    for row in existing:
        print(f'  - UID: {row[0]}, Role: {row[3]}')
    
    # Check if AUDITOR role already exists
    has_auditor = any(row[3] == TARGET_ROLE for row in existing)
    if has_auditor:
        print(f'\n✓ {TARGET_EMAIL} already has AUDITOR role')
    else:
        # Get the uid and name from the first entry
        uid = existing[0][0]
        name = existing[0][2]
        
        # Add AUDITOR role
        conn.execute(text("""
            INSERT INTO adminandauditor (uid, email, name, picture, role, created_at)
            VALUES (:uid, :email, :name, '', :role, NOW())
        """), {
            'uid': uid,
            'email': TARGET_EMAIL,
            'name': name,
            'role': TARGET_ROLE,
        })
        conn.commit()
        print(f'\n✅ SUCCESS: Added AUDITOR role for {TARGET_EMAIL}')
        print(f'   UID: {uid}')
        print(f'   User now has both ADMIN and AUDITOR roles')

print('\nDone!')
