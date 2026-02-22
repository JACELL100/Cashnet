"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from models import RoleEnum, TransactionTypeEnum, AlertSeverityEnum


# ============================================================================
# PARTICIPANT SCHEMAS
# ============================================================================

class ParticipantCreate(BaseModel):
    """Request to register a new participant"""
    wallet: str = Field(..., description="Ethereum wallet address")
    role: RoleEnum = Field(..., description="Role in the system")


class ParticipantResponse(BaseModel):
    """Participant information response"""
    id: int
    wallet: str
    role: RoleEnum
    score: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# TRANSACTION SCHEMAS
# ============================================================================

class TransactionCreate(BaseModel):
    """Request to record a transaction"""
    hash: str
    type: TransactionTypeEnum
    wallet: Optional[str] = None
    amount: Optional[float] = None
    token: Optional[str] = None
    block_number: Optional[int] = None
    gas_used: Optional[int] = None
    tx_metadata: Optional[str] = None


class TransactionResponse(BaseModel):
    """Transaction information response"""
    id: int
    hash: str
    type: TransactionTypeEnum
    wallet: Optional[str]
    amount: Optional[float]
    token: Optional[str]
    timestamp: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# ALERT SCHEMAS
# ============================================================================

class AlertCreate(BaseModel):
    """Request to create a fraud alert"""
    type: str = Field(..., description="Alert type (e.g., wash_trading)")
    severity: AlertSeverityEnum
    wallet: Optional[str] = None
    description: Optional[str] = None
    transaction_hash: Optional[str] = None


class AlertResponse(BaseModel):
    """Alert information response"""
    id: int
    type: str
    severity: AlertSeverityEnum
    wallet: Optional[str]
    description: Optional[str]
    timestamp: datetime
    resolved: int
    
    class Config:
        from_attributes = True


# ============================================================================
# SIMULATION SCHEMAS
# ============================================================================

class SimulationCreate(BaseModel):
    """Request to start a new simulation"""
    name: Optional[str] = "Unnamed Simulation"


class SimulationResponse(BaseModel):
    """Simulation information response"""
    id: int
    name: Optional[str]
    start_time: datetime
    end_time: Optional[datetime]
    status: str
    agents_count: int
    transactions_count: int
    alerts_count: int
    
    class Config:
        from_attributes = True


# ============================================================================
# POOL & LENDING SCHEMAS
# ============================================================================

class AddLiquidityRequest(BaseModel):
    """Request to add liquidity to pool"""
    wallet: str
    amount_a: float
    amount_b: float


class SwapRequest(BaseModel):
    """Request to swap tokens"""
    wallet: str
    token_in: str
    token_out: str
    amount_in: float


class DepositCollateralRequest(BaseModel):
    """Request to deposit collateral"""
    wallet: str
    amount: float


class BorrowRequest(BaseModel):
    """Request to borrow against collateral"""
    wallet: str
    amount: float


class RepayRequest(BaseModel):
    """Request to repay loan"""
    wallet: str
    amount: float


class PoolStateResponse(BaseModel):
    """Current state of liquidity pool"""
    reserve_a: float
    reserve_b: float
    price_a_per_b: float
    price_b_per_a: float
    total_liquidity: float


class HealthFactorResponse(BaseModel):
    """Borrower health factor"""
    wallet: str
    collateral_value: float
    debt_value: float
    health_factor: float
    liquidation_threshold: float
    at_risk: bool


# ============================================================================
# BORROWER AUTH SCHEMAS
# ============================================================================

class NonceRequest(BaseModel):
    """Request to get authentication nonce for wallet"""
    wallet_address: str = Field(..., description="Ethereum wallet address")


class NonceResponse(BaseModel):
    """Nonce response for signature"""
    nonce: str
    message: str


class AuthVerifyRequest(BaseModel):
    """Request to verify wallet signature"""
    wallet_address: str
    signature: str
    name: Optional[str] = None
    email: Optional[str] = None


class AuthResponse(BaseModel):
    """Authentication response with token"""
    wallet_address: str
    name: Optional[str] = None
    email: Optional[str] = None
    token: str
    created_at: datetime
    credit_score: int = 500
    
    class Config:
        from_attributes = True


class BorrowerResponse(BaseModel):
    """Borrower information response"""
    id: int
    wallet_address: str
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None
    is_active: int
    credit_score: int = 500
    
    class Config:
        from_attributes = True

