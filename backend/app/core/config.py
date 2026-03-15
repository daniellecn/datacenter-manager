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

    # Security — both are required; startup will fail with a clear error if empty.
    secret_key: str = ""
    fernet_key: str = ""
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # App
    cors_origins: list[str] = ["http://localhost:5173"]
    environment: str = "development"
    log_level: str = "WARNING"

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

    @field_validator("secret_key")
    @classmethod
    def require_secret_key(cls, v: str) -> str:
        if not v:
            raise ValueError(
                "SECRET_KEY is not set. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(64))\""
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY is too short — minimum 32 characters.")
        return v

    @field_validator("fernet_key")
    @classmethod
    def require_fernet_key(cls, v: str) -> str:
        if not v:
            raise ValueError(
                "FERNET_KEY is not set. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        # Fernet keys are 44-character URL-safe base64 strings.
        import base64  # noqa: PLC0415
        try:
            decoded = base64.urlsafe_b64decode(v + "==")
            if len(decoded) != 32:
                raise ValueError("FERNET_KEY must be a 32-byte Fernet key (44 base64 chars).")
        except Exception as exc:
            raise ValueError(f"FERNET_KEY is not a valid Fernet key: {exc}") from exc
        return v


settings = Settings()
