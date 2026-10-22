from aiogram import Router, F, Bot
from aiogram.filters import Command
from aiogram.types import Message, PreCheckoutQuery
from sqlalchemy.ext.asyncio import AsyncSession

from bot.models.user import User
from bot.services.billing_service import billing_service

router = Router(name="billing_router")


@router.message(Command("subscribe", "pro"))
async def cmd_subscribe(message: Message, bot: Bot, current_user: User) -> None:
    if current_user.tier == "PRO":
        await message.answer(
            "🌟 У вас уже активирована подписка <b>Sana PRO</b>! Наслаждайтесь безлимитным общением и моделью Gemini 2.5 Pro.",
            parse_mode="HTML",
        )
        return

    await billing_service.send_pro_invoice(bot=bot, chat_id=message.chat.id)


@router.pre_checkout_query()
async def process_pre_checkout_query(
    pre_checkout_query: PreCheckoutQuery,
    bot: Bot,
) -> None:
    await bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)


@router.message(F.successful_payment)
async def process_successful_payment(
    message: Message,
    current_user: User,
    db_session: AsyncSession,
) -> None:
    payment_info = message.successful_payment
    if not payment_info:
        return

    await billing_service.process_successful_payment(
        session=db_session,
        user=current_user,
        telegram_payment_charge_id=payment_info.telegram_payment_charge_id,
        amount=payment_info.total_amount,
        currency=payment_info.currency,
        payload=payment_info.invoice_payload,
    )

    await message.answer(
        "🎉 <b>Оплата прошла успешно!</b>\n\n"
        "Добро пожаловать в <b>Sana PRO</b>! Вам открыт безлимитный доступ к модели <b>Gemini 2.5 Pro</b>, "
        "анализу документов и голосовому общению.",
        parse_mode="HTML",
    )
