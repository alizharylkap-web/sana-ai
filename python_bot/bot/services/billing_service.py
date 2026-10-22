from aiogram import Bot
from aiogram.types import LabeledPrice, SuccessfulPayment
from sqlalchemy import select
import structlog
from bot.config import config
import bot.core.database as db_core
from bot.repositories.user_repo import UserRepository
from bot.models.transaction import Transaction

logger = structlog.get_logger(__name__)


class BillingService:
    @staticmethod
    async def send_stars_invoice(bot: Bot, chat_id: int) -> None:
        """
        Отправляет инвойс на оплату Sana Pro в Telegram Stars (валюта XTR).
        """
        title = "Sana Pro (30 дней)"
        description = (
            "⭐ Безлимитные запросы без ограничений\n"
            "🚀 Модель Gemini Pro с глубоким рассуждением\n"
            "📁 Загрузка документов до 50 МБ\n"
            "⚡ Приоритетная скорость и умная память"
        )
        payload = f"pro_sub_{chat_id}"
        currency = "XTR"
        prices = [LabeledPrice(label="Sana Pro 1 месяц", amount=config.PRO_PRICE_STARS)]

        await bot.send_invoice(
            chat_id=chat_id,
            title=title,
            description=description,
            payload=payload,
            currency=currency,
            prices=prices,
            provider_token=""
        )

    @staticmethod
    async def process_successful_payment(payment: SuccessfulPayment, user_id: int) -> bool:
        """
        Идемпотентно сохраняет транзакцию и продлевает Pro-подписку пользователю на 30 дней.
        """
        async with db_core.async_session_maker() as session:
            # Проверка идемпотентности по telegram_payment_charge_id
            existing_tx = (
                await session.execute(
                    select(Transaction).where(
                        Transaction.telegram_payment_charge_id == payment.telegram_payment_charge_id
                    )
                )
            ).scalar_one_or_none()
            if existing_tx:
                logger.info("duplicate_payment_ignored", charge_id=payment.telegram_payment_charge_id)
                return False

            user_repo = UserRepository(session)
            await user_repo.grant_pro(user_id, days=config.PRO_DURATION_DAYS)

            tx = Transaction(
                user_id=user_id,
                telegram_payment_charge_id=payment.telegram_payment_charge_id,
                provider_payment_charge_id=payment.provider_payment_charge_id,
                amount_stars=payment.total_amount,
                status="successful",
                duration_days=config.PRO_DURATION_DAYS
            )
            session.add(tx)
            await session.commit()
            logger.info(
                "pro_subscription_activated",
                user_id=user_id,
                charge_id=payment.telegram_payment_charge_id
            )
            return True
