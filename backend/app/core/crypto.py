"""
Fernet symmetric encryption for credentials stored in the database.
Key is loaded from FERNET_KEY environment variable — never hardcoded.
Encrypted fields (*_enc) are NEVER returned in API response schemas.
"""
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not settings.fernet_key:
            raise RuntimeError("FERNET_KEY environment variable is not set.")
        _fernet = Fernet(settings.fernet_key.encode())
    return _fernet


def encrypt(value: str) -> str:
    """Encrypt a plaintext string. Returns a URL-safe base64 token."""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a Fernet token back to plaintext. Raises ValueError on failure."""
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Decryption failed: invalid token or wrong key.") from exc
