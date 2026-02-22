"""
Database configuration and session management
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings

# Update database URL to use psycopg3 driver
database_url = settings.database_url
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

# Create database engine
engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session
    Usage: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database - create all tables
    """
    import models  # Import here to avoid circular imports
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully")

    # Safe column migrations — add columns that may be missing from older DB instances
    _safe_add_columns()


def _safe_add_columns():
    """Add any columns that were added to models after initial DB creation."""
    migrations = [
        "ALTER TABLE adminandauditor ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE borrowers ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE",
        # Drop unique constraints to allow one user to have multiple roles (admin + auditor)
        "ALTER TABLE adminandauditor DROP CONSTRAINT IF EXISTS adminandauditor_uid_key",
        "ALTER TABLE adminandauditor DROP CONSTRAINT IF EXISTS adminandauditor_email_key",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(__import__('sqlalchemy').text(sql))
                conn.commit()
            except Exception:
                conn.rollback()  # Column already exists or other benign error
