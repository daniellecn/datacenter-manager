from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/datacenter"

    # Security
    secret_key: str = ""
    fernet_key: str = ""
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # App
    cors_origins: list[str] = ["http://localhost:5173"]
    environment: str = "development"
    log_level: str = "INFO"

    # Retention
    power_readings_retention_days: int = 90

    # Initial admin (created on first startup if no users exist)
    initial_admin_username: str = "admin"
    initial_admin_password: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v  # type: ignore[return-value]


settings = Settings()
