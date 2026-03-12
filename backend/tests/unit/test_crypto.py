"""Unit tests for app.core.crypto — Fernet encrypt/decrypt."""
import pytest
from cryptography.fernet import Fernet

from app.core.crypto import decrypt, encrypt


def test_encrypt_decrypt_roundtrip():
    plaintext = "super-secret-password-123!"
    token = encrypt(plaintext)
    assert token != plaintext
    assert decrypt(token) == plaintext


def test_encrypted_value_is_string():
    token = encrypt("hello")
    assert isinstance(token, str)


def test_encrypt_produces_different_tokens_each_call():
    """Fernet uses a random IV so same plaintext → different ciphertext each time."""
    t1 = encrypt("same_value")
    t2 = encrypt("same_value")
    assert t1 != t2
    # Both must decrypt to the same plaintext
    assert decrypt(t1) == decrypt(t2) == "same_value"


def test_decrypt_wrong_key_raises_value_error():
    """Decrypting a token produced by a different key must raise ValueError."""
    token = encrypt("some_secret")

    # Tamper: create a new Fernet with a different key and produce a token
    other_key = Fernet.generate_key()
    other_token = Fernet(other_key).encrypt(b"some_secret").decode()

    with pytest.raises(ValueError, match="Decryption failed"):
        decrypt(other_token)


def test_decrypt_garbage_raises_value_error():
    with pytest.raises(ValueError, match="Decryption failed"):
        decrypt("this-is-not-a-fernet-token")


def test_encrypt_empty_string():
    token = encrypt("")
    assert decrypt(token) == ""


def test_encrypt_unicode():
    text = "pässwörd-ünïcödé-🔑"
    assert decrypt(encrypt(text)) == text
