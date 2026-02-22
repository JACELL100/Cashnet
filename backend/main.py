"""
Rust-eze Simulation Lab - FastAPI Backend
Main application entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from blockchain_service import blockchain_service
from config import settings

# Import routers
from agents.router import router as agents_router
from agents.scenario_router import router as scenario_router
from routers import participants, pool, lending, alerts, simulations, api_adapter, auth, wallet_auth, system_control, blockchain, logs
from routers.contract_analyzer import router as contract_analyzer_router
from liquidity_engine.router import router as liquidity_engine_router
from liquidity_engine.ml_router import router as ml_risk_router
from agents.ml_router import router as agent_intel_router


# Create FastAPI app
app = FastAPI(
    title="Rust-eze Simulation Lab API",
    description="DeFi Risk & Liquidity Simulation Platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)          # Firebase/Google SSO → /auth/*
app.include_router(wallet_auth.router)   # Wallet/MetaMask auth → /api/auth/*
app.include_router(system_control.router) # System pause/unpause → /system/*
app.include_router(blockchain.router)    # Blockchain transactions → /blockchain/*
app.include_router(logs.router)          # System logs → /api/logs/*
app.include_router(api_adapter.router)   # Frontend API adapter → /api/*
app.include_router(participants.router)
app.include_router(pool.router)
app.include_router(lending.router)
app.include_router(alerts.router)
app.include_router(simulations.router)
app.include_router(agents_router)
app.include_router(scenario_router)
app.include_router(liquidity_engine_router)
app.include_router(ml_risk_router)
app.include_router(agent_intel_router)
app.include_router(contract_analyzer_router)


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    from logging_utils import log_info, log_success, log_error
    from models import LogCategoryEnum
    
    print("🚀 Starting Rust-eze Simulation Lab Backend...")
    
    # Initialize database
    try:
        init_db()
        print("✅ Database initialized successfully")
        log_success(
            LogCategoryEnum.DATABASE,
            "Database",
            "Database initialized successfully and connection pool created"
        )
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        log_error(
            LogCategoryEnum.DATABASE,
            "Database",
            f"Database initialization failed: {str(e)}"
        )
    
    # Check blockchain connection
    try:
        if blockchain_service.is_connected():
            block_number = blockchain_service.get_block_number()
            print(f"✅ Connected to Sepolia testnet (Block: {block_number})")
            log_success(
                LogCategoryEnum.SYSTEM,
                "Blockchain",
                f"Connected to Sepolia testnet at block {block_number}",
                metadata={"network": "sepolia", "block_number": block_number}
            )
        else:
            print("⚠️  Blockchain connection failed")
            log_error(
                LogCategoryEnum.SYSTEM,
                "Blockchain",
                "Blockchain connection failed"
            )
    except Exception as e:
        print(f"⚠️  Blockchain connection error: {e}")
        log_error(
            LogCategoryEnum.SYSTEM,
            "Blockchain",
            f"Blockchain connection error: {str(e)}"
        )
    
    # Log server startup
    log_success(
        LogCategoryEnum.SYSTEM,
        "Backend API",
        f"Server started successfully on port {settings.api_port}",
        metadata={"port": settings.api_port, "env": "production"}
    )
    
    # Pre-warm Firebase public-key certificate cache so first login is fast
    try:
        import urllib.request as _ureq
        _ureq.urlopen(
            "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
            timeout=4,
        )
        print("✅ Firebase cert cache pre-warmed")
        log_info(
            LogCategoryEnum.AUTH,
            "Firebase",
            "Firebase certificate cache pre-warmed"
        )
    except Exception as _e:
        print(f"⚠️  Firebase cert pre-warm skipped: {_e}")

    # Pre-load / train the combined ML risk model
    try:
        import asyncio
        from liquidity_engine.ml_model import get_model as get_liquidity_model
        await asyncio.get_event_loop().run_in_executor(None, get_liquidity_model)
        print("✅ DotlocalRiskModel ready")
        log_success(
            LogCategoryEnum.SYSTEM,
            "ML Model",
            "DotlocalRiskModel initialized and ready"
        )
    except Exception as e:
        print(f"⚠️  Liquidity ML model init failed: {e}")

    # Pre-load / train the agent intelligence ML model
    try:
        from agents.ml_model import get_model as get_agent_model
        await asyncio.get_event_loop().run_in_executor(None, get_agent_model)
        print("✅ DotlocalAgentIntelModel ready")
    except Exception as e:
        print(f"⚠️  Agent ML model init failed: {e}")

    # Initialize blockchain integrator for on-chain event recording
    try:
        from agents.blockchain_integrator import get_blockchain_integrator
        integrator = await get_blockchain_integrator()
        if integrator.contracts_loaded:
            print(f"✅ BlockchainIntegrator ready (real txs: {integrator.enable_real_txs})")
        else:
            print("⚠️  BlockchainIntegrator running in simulation mode")
    except Exception as e:
        print(f"⚠️  BlockchainIntegrator init failed: {e}")

    # Verify Groq LLM connectivity
    try:
        from agents.groq_advisor import _get_groq_key, _get_groq_model
        groq_key = _get_groq_key()
        groq_model = _get_groq_model()
        if groq_key:
            print(f"✅ Groq LLM ready (model: {groq_model}, key: ...{groq_key[-8:]})")
        else:
            print("⚠️  Groq API key not configured — agent AI decisions disabled")
    except Exception as e:
        print(f"⚠️  Groq init check failed: {e}")

    print(f"🌐 API running at http://{settings.api_host}:{settings.api_port}")
    print(f"📚 Docs available at http://{settings.api_host}:{settings.api_port}/docs")


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": "Rust-eze Simulation Lab API",
        "version": "1.0.0",
        "status": "operational",
        "blockchain_connected": blockchain_service.is_connected(),
        "endpoints": {
            "docs": "/docs",
            "participants": "/participants",
            "pool": "/pool",
            "lending": "/lending",
            "alerts": "/alerts",
            "simulations": "/simulations",
            "agents_simulation": "/agents-sim"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        blockchain_connected = blockchain_service.is_connected()
        block_number = blockchain_service.get_block_number() if blockchain_connected else None
        
        return {
            "status": "healthy",
            "blockchain": {
                "connected": blockchain_connected,
                "network": "Sepolia",
                "block_number": block_number
            },
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@app.get("/contracts")
async def get_contract_addresses():
    """Get all deployed contract addresses"""
    return {
        "network": "Sepolia",
        "contracts": {
            "AccessControl": settings.access_control_address,
            "IdentityRegistry": settings.identity_registry_address,
            "CreditRegistry": settings.credit_registry_address,
            "CollateralVault": settings.collateral_vault_address,
            "LendingPool": settings.lending_pool_address,
            "LiquidityPool": settings.liquidity_pool_address,
            "Palladium (PLDM)": settings.palladium_address,
            "Badassium (BADM)": settings.badassium_address
        }
    }


if __name__ == "__main__":
    import uvicorn
    # Disable reload to avoid Windows multiprocessing errors with Python 3.13
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False  # Set to False to avoid multiprocessing issues on Windows
    )
