"""Check and list all constraints on adminandauditor table."""
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

print("Checking constraints on adminandauditor table...\n")
with engine.connect() as conn:
    # Get all constraints
    result = conn.execute(text("""
        SELECT conname, contype, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'adminandauditor'::regclass
        ORDER BY contype, conname
    """))
    
    constraints = result.fetchall()
    if constraints:
        print("Found constraints:")
        for row in constraints:
            print(f"  - {row[0]} ({row[1]}): {row[2]}")
    else:
        print("No constraints found")
    
    # Get all indexes
    print("\nChecking indexes on adminandauditor table...\n")
    result = conn.execute(text("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'adminandauditor'
        ORDER BY indexname
    """))
    
    indexes = result.fetchall()
    if indexes:
        print("Found indexes:")
        for row in indexes:
            print(f"  - {row[0]}")
            print(f"    {row[1]}")
    else:
        print("No indexes found")
