"""
Simple script to create the system_logs table
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import init_db

if __name__ == "__main__":
    print("Initializing database and creating all tables...")
    try:
        init_db()
        print("✅ All tables created successfully, including system_logs!")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
