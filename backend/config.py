"""
Configuration management for the Rust-eze Simulation Lab backend
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load environment variables from .env.local in parent directory
env_path = Path(__file__).parent.parent / ".env.local"
load_dotenv(dotenv_path=env_path)


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Database
    database_url: str = os.getenv("DATABASE_URL", "")
    
    # Blockchain
    sepolia_rpc_url: str = os.getenv("SEPOLIA_RPC_URL", "")
    private_key: str = os.getenv("PRIVATE_KEY", "")
    
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