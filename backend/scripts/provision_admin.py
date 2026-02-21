"""One-shot script to provision crce.10367.aids@gmail.com as ADMIN."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / '.env.local')

from sqlalchemy import create_engine, text

TARGET_EMAIL = 'crce.10367.aids@gmail.com'
TARGET_NAME  = 'Admin User'
TARGET_ROLE  = 'ADMIN'
PLACEHOLDER_UID = 'placeholder_crce10367'

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL not set')
    sys.exit(1)

engine = create_engine(db_url)

with engine.connect() as conn:
    result = conn.execute(
        text("SELECT uid, email, role FROM adminandauditor WHERE email = :email"),
        {'email': TARGET_EMAIL}
    )
    existing = result.fetchone()
    if existing:
        print(f'Already provisioned: {existing[1]} as {existing[2]} (uid={existing[0]})')
    else:
        conn.execute(text("""
            INSERT INTO adminandauditor (uid, email, name, picture, role, created_at)
            VALUES (:uid, :email, :name, '', :role, NOW())
        """), {
            'uid': PLACEHOLDER_UID,
            'email': TARGET_EMAIL,
            'name': TARGET_NAME,
            'role': TARGET_ROLE,
        })
        conn.commit()
        print(f'SUCCESS: {TARGET_EMAIL} provisioned as {TARGET_ROLE}')
        print('The real Google UID will be back-filled on first login.')
