"""
SQLAlchemy database models for Rust-eze Simulation Lab
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum
from sqlalchemy.sql import func
from database import Base
import enum


class RoleEnum(str, enum.Enum):
    """User roles in the system"""
    ADMIN = "ADMIN"
    LENDER = "LENDER"
    BORROWER = "BORROWER"
    AUDITOR = "AUDITOR"


class TransactionTypeEnum(str, enum.Enum):
    """Transaction types"""
    ADD_LIQUIDITY = "ADD_LIQUIDITY"
    REMOVE_LIQUIDITY = "REMOVE_LIQUIDITY"
    SWAP = "SWAP"
    DEPOSIT_COLLATERAL = "DEPOSIT_COLLATERAL"
    BORROW = "BORROW"
    REPAY = "REPAY"
    LIQUIDATE = "LIQUIDATE"


class AlertSeverityEnum(str, enum.Enum):
    """Alert severity levels"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AdminAuditorRoleEnum(str, enum.Enum):
    ADMIN = "ADMIN"
    AUDITOR = "AUDITOR"


class LogLevelEnum(str, enum.Enum):
    """System log levels"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    SUCCESS = "SUCCESS"


class LogCategoryEnum(str, enum.Enum):
    """System log categories"""
    TRANSACTION = "TRANSACTION"
    ALERT = "ALERT"
    AUTH = "AUTH"
    SYSTEM = "SYSTEM"
    API = "API"
    DATABASE = "DATABASE"


class AdminAuditor(Base):
    """Admin and Auditor accounts authenticated via Google SSO"""
    __tablename__ = "adminandauditor"

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String, index=True, nullable=False)  # Google sub (UID) - removed unique constraint
    email = Column(String, index=True, nullable=False)  # Removed unique constraint to allow multiple roles
    name = Column(String, nullable=False)
    picture = Column(String)                                         # Google profile picture
    role = Column(Enum(AdminAuditorRoleEnum), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), onupdate=func.now())


class Participant(Base):
    """Registered participants with wallet addresses and roles"""
    __tablename__ = "participants"
    
    id = Column(Integer, primary_key=True, index=True)
    wallet = Column(String, unique=True, index=True, nullable=False)
    role = Column(Enum(RoleEnum), nullable=False)
    score = Column(Integer, default=500)  # Credit score 300-850
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Transaction(Base):
    """All blockchain transactions"""
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    hash = Column(String, unique=True, index=True, nullable=False)
    type = Column(Enum(TransactionTypeEnum), nullable=False)
    wallet = Column(String, index=True)
    amount = Column(Float)
    token = Column(String)  # Token symbol or address
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    block_number = Column(Integer)
    gas_used = Column(Integer)
    tx_metadata = Column(Text)  # JSON string for additional data (renamed from metadata)


class Alert(Base):
    """Fraud and risk alerts"""
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)  # wash_trading, flash_loan_attack, etc.
    severity = Column(Enum(AlertSeverityEnum), nullable=False)
    wallet = Column(String, index=True)
    description = Column(Text)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    transaction_hash = Column(String)
    resolved = Column(Integer, default=0)  # 0 = unresolved, 1 = resolved


class Simulation(Base):
    """Simulation runs"""
    __tablename__ = "simulations"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True))
    summary = Column(Text)  # JSON string with simulation results
    status = Column(String, default="running")  # running, completed, failed
    agents_count = Column(Integer, default=0)
    transactions_count = Column(Integer, default=0)
    alerts_count = Column(Integer, default=0)


class Borrower(Base):
    """Borrowers authenticated via wallet signature"""
    __tablename__ = "borrowers"
    
    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), unique=True, index=True, nullable=False)  # Ethereum address
    nonce = Column(String, nullable=False)  # Random nonce for signature verification
    name = Column(String)  # Optional display name
    email = Column(String)  # Optional email
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True))
    is_active = Column(Integer, default=1)  # 1 = active, 0 = inactive
    credit_score = Column(Integer, default=500)  # Credit score 300-850


class SystemLog(Base):
    """System event logs for monitoring and auditing"""
    __tablename__ = "system_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    level = Column(Enum(LogLevelEnum), nullable=False, index=True)
    category = Column(Enum(LogCategoryEnum), nullable=False, index=True)
    source = Column(String, nullable=False)  # e.g., "Backend API", "Authentication", "Database"
    message = Column(Text, nullable=False)
    log_metadata = Column(Text)  # JSON string for additional data (renamed from metadata to avoid SQLAlchemy conflict)
    user_id = Column(String)  # Optional: wallet address or email
    request_id = Column(String)  # Optional: for request tracing
