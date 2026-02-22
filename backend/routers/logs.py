"""
System Logs API Router
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database import get_db
from models import SystemLog, LogLevelEnum, LogCategoryEnum
from typing import List, Optional
from datetime import datetime, timedelta
import json

router = APIRouter(prefix="/api/logs", tags=["System Logs"])


@router.get("/")
async def get_system_logs(
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of logs to return"),
    level: Optional[str] = Query(None, description="Filter by log level"),
    category: Optional[str] = Query(None, description="Filter by category"),
    source: Optional[str] = Query(None, description="Filter by source"),
    since: Optional[str] = Query(None, description="Get logs since this timestamp (ISO format)"),
    db: Session = Depends(get_db)
):
    """
    Get system logs with optional filters
    
    Returns logs in reverse chronological order (newest first)
    """
    try:
        query = db.query(SystemLog)
        
        # Apply filters
        if level:
            try:
                level_enum = LogLevelEnum[level.upper()]
                query = query.filter(SystemLog.level == level_enum)
            except KeyError:
                pass
        
        if category:
            try:
                category_enum = LogCategoryEnum[category.upper()]
                query = query.filter(SystemLog.category == category_enum)
            except KeyError:
                pass
        
        if source:
            query = query.filter(SystemLog.source.ilike(f"%{source}%"))
        
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
                query = query.filter(SystemLog.timestamp >= since_dt)
            except ValueError:
                pass
        
        # Order by timestamp descending and limit
        logs = query.order_by(desc(SystemLog.timestamp)).limit(limit).all()
        
        # Format response
        result = []
        for log in logs:
            log_dict = {
                "id": log.id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "level": log.level.value if log.level else None,
                "category": log.category.value if log.category else None,
                "source": log.source,
                "message": log.message,
                "user_id": log.user_id,
                "request_id": log.request_id,
            }
            
            # Parse metadata if present
            if log.log_metadata:
                try:
                    log_dict["metadata"] = json.loads(log.log_metadata)
                except:
                    log_dict["metadata"] = None
            else:
                log_dict["metadata"] = None
            
            result.append(log_dict)
        
        return {
            "success": True,
            "count": len(result),
            "logs": result
        }
    
    except Exception as e:
        # Return empty result if table doesn't exist yet
        print(f"Error fetching logs: {e}")
        return {
            "success": False,
            "count": 0,
            "logs": [],
            "error": str(e)
        }


@router.get("/stats")
async def get_log_stats(
    hours: int = Query(24, ge=1, le=168, description="Time window in hours"),
    db: Session = Depends(get_db)
):
    """
    Get statistics about system logs
    """
    since = datetime.utcnow() - timedelta(hours=hours)
    
    # Total logs
    total = db.query(SystemLog).filter(SystemLog.timestamp >= since).count()
    
    # Count by level
    level_counts = {}
    for level in LogLevelEnum:
        count = db.query(SystemLog).filter(
            SystemLog.timestamp >= since,
            SystemLog.level == level
        ).count()
        level_counts[level.value] = count
    
    # Count by category
    category_counts = {}
    for category in LogCategoryEnum:
        count = db.query(SystemLog).filter(
            SystemLog.timestamp >= since,
            SystemLog.category == category
        ).count()
        category_counts[category.value] = count
    
    # Recent errors
    recent_errors = db.query(SystemLog).filter(
        SystemLog.timestamp >= since,
        SystemLog.level == LogLevelEnum.ERROR
    ).order_by(desc(SystemLog.timestamp)).limit(10).all()
    
    return {
        "success": True,
        "time_window_hours": hours,
        "total_logs": total,
        "by_level": level_counts,
        "by_category": category_counts,
        "recent_error_count": len(recent_errors),
    }


@router.delete("/cleanup")
async def cleanup_old_logs(
    days: int = Query(30, ge=1, le=365, description="Delete logs older than this many days"),
    db: Session = Depends(get_db)
):
    """
    Delete logs older than specified number of days
    Admin only operation
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    deleted = db.query(SystemLog).filter(SystemLog.timestamp < cutoff_date).delete()
    db.commit()
    
    return {
        "success": True,
        "deleted_count": deleted,
        "cutoff_date": cutoff_date.isoformat()
    }
