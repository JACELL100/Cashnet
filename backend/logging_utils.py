"""
Centralized logging utility for system events
Logs are written to both database and standard output
"""
import logging
import json
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from models import SystemLog, LogLevelEnum, LogCategoryEnum
from database import SessionLocal

# Configure standard Python logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger("cashnet")


class DatabaseLogHandler(logging.Handler):
    """Custom logging handler that writes to database"""
    
    def __init__(self):
        super().__init__()
        self.category_map = {
            'auth': LogCategoryEnum.AUTH,
            'transaction': LogCategoryEnum.TRANSACTION,
            'alert': LogCategoryEnum.ALERT,
            'api': LogCategoryEnum.API,
            'database': LogCategoryEnum.DATABASE,
            'system': LogCategoryEnum.SYSTEM,
        }
    
    def emit(self, record):
        """Write log record to database"""
        try:
            db = SessionLocal()
            
            # Map logging level to our enum
            level_map = {
                'DEBUG': LogLevelEnum.DEBUG,
                'INFO': LogLevelEnum.INFO,
                'WARNING': LogLevelEnum.WARN,
                'ERROR': LogLevelEnum.ERROR,
                'CRITICAL': LogLevelEnum.ERROR,
            }
            
            level = level_map.get(record.levelname, LogLevelEnum.INFO)
            
            # Determine category from logger name or extra fields
            category = LogCategoryEnum.SYSTEM
            if hasattr(record, 'category'):
                category = self.category_map.get(record.category.lower(), LogCategoryEnum.SYSTEM)
            
            # Extract metadata if available
            log_metadata = None
            if hasattr(record, 'metadata'):
                log_metadata = json.dumps(record.metadata)
            
            # Create log entry
            log_entry = SystemLog(
                level=level,
                category=category,
                source=record.name,
                message=record.getMessage(),
                log_metadata=log_metadata,
                user_id=getattr(record, 'user_id', None),
                request_id=getattr(record, 'request_id', None),
            )
            
            db.add(log_entry)
            db.commit()
            db.close()
            
        except Exception as e:
            # Don't let logging errors crash the application
            print(f"Error writing log to database: {e}")
            if 'db' in locals():
                db.close()


# Add database handler to logger
db_handler = DatabaseLogHandler()
logger.addHandler(db_handler)


def log_event(
    level: LogLevelEnum,
    category: LogCategoryEnum,
    source: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None,
    request_id: Optional[str] = None,
    db: Optional[Session] = None
):
    """
    Log an event to the database
    
    Args:
        level: Log level (DEBUG, INFO, WARN, ERROR, SUCCESS)
        category: Event category (TRANSACTION, ALERT, AUTH, SYSTEM, API, DATABASE)
        source: Source of the event (e.g., "Authentication", "Backend API")
        message: Log message
        metadata: Optional dictionary with additional data
        user_id: Optional user identifier (wallet address or email)
        request_id: Optional request ID for tracing
        db: Optional database session (creates new if not provided)
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    
    try:
        log_entry = SystemLog(
            level=level,
            category=category,
            source=source,
            message=message,
            log_metadata=json.dumps(metadata) if metadata else None,
            user_id=user_id,
            request_id=request_id,
        )
        
        db.add(log_entry)
        db.commit()
        
        # Also log to standard output
        level_str = level.value
        category_str = category.value
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level_str}] [{category_str}] {source}: {message}")
        
    except Exception as e:
        print(f"Error logging event: {e}")
        db.rollback()
    finally:
        if close_db:
            db.close()


def log_info(category: LogCategoryEnum, source: str, message: str, **kwargs):
    """Log an INFO level event"""
    log_event(LogLevelEnum.INFO, category, source, message, **kwargs)


def log_success(category: LogCategoryEnum, source: str, message: str, **kwargs):
    """Log a SUCCESS level event"""
    log_event(LogLevelEnum.SUCCESS, category, source, message, **kwargs)


def log_warn(category: LogCategoryEnum, source: str, message: str, **kwargs):
    """Log a WARN level event"""
    log_event(LogLevelEnum.WARN, category, source, message, **kwargs)


def log_error(category: LogCategoryEnum, source: str, message: str, **kwargs):
    """Log an ERROR level event"""
    log_event(LogLevelEnum.ERROR, category, source, message, **kwargs)


def log_debug(category: LogCategoryEnum, source: str, message: str, **kwargs):
    """Log a DEBUG level event"""
    log_event(LogLevelEnum.DEBUG, category, source, message, **kwargs)
