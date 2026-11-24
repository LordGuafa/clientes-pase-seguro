from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    nombre_app: str = "Eventos y boletas"
    puerto: int = 8001
    url_base_datos: str
    secreto_gateway: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
