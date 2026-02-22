"""
Database migration: Add system_logs table
Run this script to add the system logging table to your database
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import Base, engine
from models import SystemLog

def add_system_logs_table():
    """Create the system_logs table"""
    print("Creating system_logs table...")
    
    try:
        # Create only the SystemLog table
        SystemLog.__table__.create(bind=engine, checkfirst=True)
        print("✅ system_logs table created successfully!")
        return True
    except Exception as e:
        print(f"❌ Error creating system_logs table: {e}")
        return False

if __name__ == "__main__":
    add_system_logs_table()
