from aiogram import Router, F, Bot
from aiogram.filters import Command
from aiogram.types import Message, PreCheckoutQuery

from bot.models.user import User
from bot.services.billing_service import BillingService

router = Router(name="billing_router")


@router.message(Command("subscribe", "pro"))
async def cmd_subscribe(message: Message, bot: Bot, current_user: User) -> None:
    if current_user.is_pro:
        await message.answer(
            "🌟 У вас уже активирована подписка <b>Sana PRO</b>! Наслаждайтесь безлимитным общением и моделью Gemini 2.5 Pro.",
            parse_mode="HTML",
        )
        return

    await BillingService.send_stars_invoice(bot=bot, chat_id=message.chat.id)


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
) -> None:
    payment_info = message.successful_payment
    if not payment_info:
        return

    await BillingService.process_successful_payment(
        payment=payment_info,
        user_id=current_user.telegram_id,
    )

    await message.answer(
        "🎉 <b>Оплата прошла успешно!</b>\n\n"
        "Добро пожаловать в <b>Sana PRO</b>! Вам открыт безлимитный доступ к модели <b>Gemini 2.5 Pro</b>, "
        "анализу документов и голосовому общению.",
        parse_mode="HTML",
    )
