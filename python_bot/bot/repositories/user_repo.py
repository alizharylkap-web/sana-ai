import secrets
from datetime import date, datetime, timedelta
import zoneinfo
from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from bot.models.user import User
from bot.config import config


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_telegram_id(self, telegram_id: int) -> User | None:
        query = select(User).where(User.telegram_id == telegram_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_or_create(
        self,
        telegram_id: int,
        first_name: str,
        last_name: str | None = None,
        username: str | None = None,
        referrer_code: str | None = None,
    ) -> tuple[User, bool]:
        user = await self.get_by_telegram_id(telegram_id)
        if user:
            return user, False

        referred_by_id = None
        if referrer_code:
            ref_user = await self.get_by_referral_code(referrer_code)
            if ref_user and ref_user.telegram_id != telegram_id:
                referred_by_id = ref_user.telegram_id

        new_ref_code = secrets.token_urlsafe(8)

        user = User(
            telegram_id=telegram_id,
            first_name=first_name,
            last_name=last_name,
            username=username,
            referral_code=new_ref_code,
            referred_by_id=referred_by_id,
            is_admin=(telegram_id in config.ADMIN_IDS)
        )
        self.session.add(user)
        await self.session.flush()

        if referred_by_id:
            await self.session.execute(
                update(User)
                .where(User.telegram_id == referred_by_id)
                .values(
                    bonus_queries=User.bonus_queries + config.REFERRAL_BONUS_QUERIES,
                    referral_count=User.referral_count + 1
                )
            )

        return user, True

    async def get_by_referral_code(self, code: str) -> User | None:
        query = select(User).where(User.referral_code == code)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def check_quota_precondition(self, user: User) -> tuple[bool, int]:
        """
        Предварительная проверка лимита пользователя перед обращением к Gemini.
        Запрос НЕ списывается здесь.
        Возвращает: (разрешено, примерный остаток).
        """
        if user.is_pro:
            if user.pro_expires_at and user.pro_expires_at < datetime.utcnow():
                user.is_pro = False
                user.pro_expires_at = None
                await self.session.flush()
            else:
                return True, 999999

        try:
            tz = zoneinfo.ZoneInfo(user.timezone)
        except Exception:
            tz = zoneinfo.ZoneInfo("Asia/Almaty")

        user_local_today = datetime.now(tz).date()

        # Автоматический сброс при смене календарного дня по таймзоне
        if user.last_reset_date < user_local_today:
            user.queries_used_today = 0
            user.last_reset_date = user_local_today
            await self.session.flush()

        standard_remaining = max(0, config.FREE_DAILY_LIMIT - user.queries_used_today)
        total_remaining = standard_remaining + user.bonus_queries

        if total_remaining <= 0:
            return False, 0
        return True, total_remaining

    async def atomic_consume_quota(self, telegram_id: int, user_tz: str) -> bool:
        """
        Атомарное списание 1 запроса СТРОГО ПОСЛЕ успешного ответа модели.
        Исключает race conditions при одновременных запросах через атомарный UPDATE.
        """
        try:
            tz = zoneinfo.ZoneInfo(user_tz)
        except Exception:
            tz = zoneinfo.ZoneInfo("Asia/Almaty")

        user_local_today = datetime.now(tz).date()

        user = await self.get_by_telegram_id(telegram_id)
        if not user or user.is_pro:
            return True

        if user.last_reset_date < user_local_today:
            # Сброс счетчика на новый день и списание первого запроса
            stmt = (
                update(User)
                .where(User.telegram_id == telegram_id)
                .values(
                    queries_used_today=1,
                    last_reset_date=user_local_today
                )
            )
            await self.session.execute(stmt)
            await self.session.flush()
            return True

        # Списание из суточного лимита
        if user.queries_used_today < config.FREE_DAILY_LIMIT:
            stmt = (
                update(User)
                .where(
                    and_(
                        User.telegram_id == telegram_id,
                        User.queries_used_today < config.FREE_DAILY_LIMIT
                    )
                )
                .values(queries_used_today=User.queries_used_today + 1)
            )
            res = await self.session.execute(stmt)
            if res.rowcount > 0:
                await self.session.flush()
                return True

        # Списание из бонусных запросов
        if user.bonus_queries > 0:
            stmt = (
                update(User)
                .where(
                    and_(
                        User.telegram_id == telegram_id,
                        User.bonus_queries > 0
                    )
                )
                .values(bonus_queries=User.bonus_queries - 1)
            )
            res = await self.session.execute(stmt)
            if res.rowcount > 0:
                await self.session.flush()
                return True

        return False

    async def grant_pro(self, user_id: int, days: int = 30) -> User | None:
        user = await self.get_by_telegram_id(user_id)
        if not user:
            return None

        now = datetime.utcnow()
        if user.is_pro and user.pro_expires_at and user.pro_expires_at > now:
            user.pro_expires_at += timedelta(days=days)
        else:
            user.is_pro = True
            user.pro_expires_at = now + timedelta(days=days)

        await self.session.flush()
        return user
