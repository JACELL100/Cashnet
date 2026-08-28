"""
Configuration management for the Rust-eze Simulation Lab backend
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load environment variables from the project root.
# This project stores settings in .env, while older docs may reference .env.local.
root_dir = Path(__file__).parent.parent
for env_name in (".env", ".env.local"):
    env_path = root_dir / env_name
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Database
    database_url: str = os.getenv("DATABASE_URL", "")
    
    # Blockchain
    sepolia_rpc_url: str = os.getenv("SEPOLIA_RPC_URL", "")
    private_key: str = os.getenv("PRIVATE_KEY", "")
    enable_blockchain_txs: bool = os.getenv("ENABLE_BLOCKCHAIN_TXS", "false").lower() == "true"

    # AI / LLM
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

    # Firebase service-account credentials may be provided as base64 text.
    firebase_sa_b64: str = os.getenv("FIREBASE_SA_B64", "")

    # Market Data
    coindesk_api_key: str = os.getenv("COINDESK_API_KEY", "")

    # Email (SMTP) settings for threat alert notifications
    smtp_host: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_name: str = os.getenv("SMTP_FROM_NAME", "CashNet Threat Monitor")
    alert_email_enabled: bool = os.getenv("ALERT_EMAIL_ENABLED", "true").lower() == "true"
    
    # Contract Addresses
    access_control_address: str = os.getenv("ACCESS_CONTROL_ADDRESS", "")
    palladium_address: str = os.getenv("PALLADIUM_ADDRESS", "")
    badassium_address: str = os.getenv("BADASSIUM_ADDRESS", "")
    identity_registry_address: str = os.getenv("IDENTITY_REGISTRY_ADDRESS", "")
    credit_registry_address: str = os.getenv("CREDIT_REGISTRY_ADDRESS", "")
    collateral_vault_address: str = os.getenv("COLLATERAL_VAULT_ADDRESS", "")
    lending_pool_address: str = os.getenv("LENDING_POOL_ADDRESS", "")
    liquidity_pool_address: str = os.getenv("LIQUIDITY_POOL_ADDRESS", "")
    
    # Firebase (service account key path — set GOOGLE_APPLICATION_CREDENTIALS env var)
    # No config field needed; firebase-admin reads GOOGLE_APPLICATION_CREDENTIALS automatically.

    # JWT
    jwt_secret: str = os.getenv("JWT_SECRET", "change-this-secret-in-production")

    # Operator provisioning secret
    provision_secret: str = os.getenv("PROVISION_SECRET", "provision-secret-change-me")

    # API Settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = True
    
    class Config:
        env_file = ".env.local"
        case_sensitive = False


# Global settings instance
settings = Settings()