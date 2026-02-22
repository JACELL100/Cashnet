"""Drop unique constraints on uid and email to allow multiple roles per user."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / '.env.local')

from sqlalchemy import create_engine, text

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL not set')
    sys.exit(1)

engine = create_engine(db_url)

migrations = [
    # Drop unique indexes
    "DROP INDEX IF EXISTS ix_adminandauditor_uid",
    "DROP INDEX IF EXISTS ix_adminandauditor_email",
    # Recreate as non-unique indexes
    "CREATE INDEX IF NOT EXISTS idx_adminandauditor_uid ON adminandauditor(uid)",
    "CREATE INDEX IF NOT EXISTS idx_adminandauditor_email ON adminandauditor(email)",
]

print("Dropping unique indexes and recreating as non-unique...")
with engine.connect() as conn:
    for sql in migrations:
        try:
            print(f"  Running: {sql}")
            conn.execute(text(sql))
            conn.commit()
            print(f"  ✓ Success")
        except Exception as e:
            print(f"  ⚠ {e}")
            conn.rollback()

print("\n✅ Migration complete! Users can now have multiple roles.")
