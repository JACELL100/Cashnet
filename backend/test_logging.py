"""
Quick script to test logging and create some sample logs
Run from backend directory with venv active
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from logging_utils import log_info, log_success, log_warn, log_error
from models import LogCategoryEnum

def create_sample_logs():
    """Create some sample log entries for testing"""
    print("Creating sample log entries...")
    
    try:
        # System logs
        log_success(
            LogCategoryEnum.SYSTEM,
            "Backend API",
            "Server started successfully on port 8000",
            metadata={"port": 8000, "env": "development"}
        )
        
        log_info(
            LogCategoryEnum.DATABASE,
            "Database",
            "Database connection pool initialized (size: 10)",
            metadata={"pool_size": 10}
        )
        
        # Auth logs
        log_success(
            LogCategoryEnum.AUTH,
            "Authentication",
            "User login successful - admin@cashnet.io (ADMIN)",
            user_id="admin@cashnet.io",
            metadata={"role": "ADMIN", "method": "Google SSO"}
        )
        
        log_warn(
            LogCategoryEnum.AUTH,
            "Authentication",
            "Access denied for unauthorized user: test@example.com",
            user_id="test@example.com"
        )
        
        # API logs
        log_info(
            LogCategoryEnum.API,
            "API Request",
            "GET /api/logs/ - 200 OK",
            metadata={"method": "GET", "path": "/api/logs/", "status": 200}
        )
        
        # Transaction logs
        log_info(
            LogCategoryEnum.TRANSACTION,
            "Blockchain",
            "ADD LIQUIDITY - 0x1234...5678 - $5000.00",
            user_id="0x1234567890abcdef",
            metadata={"type": "ADD_LIQUIDITY", "amount": 5000}
        )
        
        # Alert logs
        log_error(
            LogCategoryEnum.ALERT,
            "Fraud Monitor",
            "Wash Trading - 0xabc1...ef23 - Circular loan pattern detected",
            metadata={"severity": "CRITICAL", "wallet": "0xabc1ef23"}
        )
        
        print("✅ Sample logs created successfully!")
        print("Check /api/logs/ endpoint or the auditor events page")
        
    except Exception as e:
        print(f"❌ Error creating sample logs: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    create_sample_logs()
