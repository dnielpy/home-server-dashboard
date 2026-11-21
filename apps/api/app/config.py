from functools import lru_cache

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    bluetti_api_url: str = "http://localhost:3001"
    homenet_api_url: str = "http://localhost:3011"
    localtube_api_url: str = "http://localhost:8000"
    localtube_service_token: str | None = None
    # The agent that runs on the server itself and updates the projects (apps/agent)
    agent_url: str = "http://localhost:3022"
    astro_api_url: str = "http://localhost:3024"
    astro_api_token: str | None = None
    # The Nano's current speed takes up to 5 seconds to read
    upstream_timeout_seconds: float = 8
    # Where Sender keeps the packages until they are downloaded; a folder on the external disk in production
    sender_dir: str = "./data/sender"
    # Where the Downloader keeps the files it downloads, and how many it downloads at once
    downloads_dir: str = "./data/downloads"
    downloads_parallel: int = 2
    telegram_bot_token: SecretStr | None = None
    # One-time bootstrap when the persisted state has no user registry yet.
    telegram_owner_user_id: int | None = Field(default=None, gt=0)
    telegram_state_dir: str = "./data/telegram"

    @field_validator("telegram_bot_token", "telegram_owner_user_id", mode="before")
    @classmethod
    def empty_telegram_setting(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value


@lru_cache
def get_settings() -> Settings:
    return Settings()
