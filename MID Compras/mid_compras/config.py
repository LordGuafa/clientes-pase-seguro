from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gateway_url: str
    gateway_token_path: str = "/token"
    client_id: str = Field(min_length=1)
    client_secret: SecretStr = Field(min_length=1)
    qr_secret: SecretStr = Field(min_length=1)
    max_boletas: int = Field(default=4, ge=1)
    minutos_bloqueo: int = Field(default=10, ge=1)
    gateway_timeout_ms: int = Field(default=3000, gt=0)
    ticketmaster_base_url: str = "https://app.ticketmaster.com"
    ticketmaster_api_key: SecretStr = SecretStr("")
    ticketmaster_eventos: dict[str, str] = Field(default_factory=dict)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
