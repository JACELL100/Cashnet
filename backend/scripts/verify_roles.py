"""Verify user has both ADMIN and AUDITOR roles."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / '.env.local')

from sqlalchemy import create_engine, text

TARGET_EMAIL = 'crce.10246.ceb@gmail.com'

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL not set')
    sys.exit(1)

engine = create_engine(db_url)

with engine.connect() as conn:
    result = conn.execute(
        text("SELECT uid, email, name, role FROM adminandauditor WHERE email = :email ORDER BY role"),
        {'email': TARGET_EMAIL}
    )
    entries = result.fetchall()
    
    if not entries:
        print(f'❌ No entries found for {TARGET_EMAIL}')
    else:
        print(f'\n✅ Found {len(entries)} role(s) for {TARGET_EMAIL}:\n')
        for row in entries:
            print(f'  • Role: {row[3]}')
            print(f'    UID: {row[0]}')
            print(f'    Name: {row[2]}')
            print()
        
        roles = [row[3] for row in entries]
        if 'ADMIN' in roles and 'AUDITOR' in roles:
            print('✅ User has both ADMIN and AUDITOR roles!')
        else:
            print(f'⚠ User has only: {", ".join(roles)}')
