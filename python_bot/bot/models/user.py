from datetime import datetime, date, timezone
from sqlalchemy import BigInteger, String, Boolean, Integer, DateTime, Date, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from bot.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str] = mapped_column(String(128))
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Настройки продукта
    language: Mapped[str] = mapped_column(String(5), default="ru", nullable=False)
    mode: Mapped[str] = mapped_column(String(32), default="mentor", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Almaty", nullable=False)
    study_goal: Mapped[str | None] = mapped_column(String(255), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Тариф и лимиты
    is_pro: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    pro_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    queries_used_today: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bonus_queries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_reset_date: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)

    # Реферальная система
    referral_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    referred_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.telegram_id", ondelete="SET NULL"),
        nullable=True
    )
    referral_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Статусы аккаунта
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False
    )

    # Связи
    messages = relationship("DialogMessage", back_populates="user", cascade="all, delete-orphan")
    memories = relationship("LongTermMemory", back_populates="user", cascade="all, delete-orphan")
    reminders = relationship("Reminder", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_user_pro_reset", "is_pro", "last_reset_date"),
    )
