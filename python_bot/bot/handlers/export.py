from datetime import datetime, timezone
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, BufferedInputFile
from sqlalchemy.ext.asyncio import AsyncSession

from bot.models.user import User
from bot.repositories.dialog_repo import DialogRepository

router = Router(name="export_router")


@router.message(Command("export"))
async def cmd_export_history(
    message: Message,
    current_user: User,
    db_session: AsyncSession,
) -> None:
    status_msg = await message.answer(
        "📦 <i>Формирую архив вашей истории диалогов и фактов памяти...</i>",
        parse_mode="HTML",
    )

    repo = DialogRepository(db_session)
    messages = await repo.get_recent_context(current_user.id, limit=200)
    memories = await repo.get_user_memories(current_user.id)

    if not messages and not memories:
        await status_msg.edit_text("📭 Ваша история диалогов пока пуста.")
        return

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    md_content = f"# 🧠 История диалогов с Sana AI\n"
    md_content += f"**Пользователь:** {current_user.full_name or current_user.username or current_user.id}\n"
    md_content += f"**Тариф:** {current_user.tier} | **Режим:** {current_user.active_mode}\n"
    md_content += f"**Дата экспорта:** {now_str}\n\n"
    md_content += "---\n\n"

    if memories:
        md_content += "## 📌 Долгосрочная память (Известные факты)\n\n"
        for mem in memories:
            md_content += f"- {mem}\n"
        md_content += "\n---\n\n"

    md_content += "## 💬 Диалоги\n\n"
    for msg in messages:
        role_title = "👤 **Вы**" if msg.role == "user" else "🤖 **Sana AI**"
        time_str = msg.created_at.strftime("%Y-%m-%d %H:%M") if msg.created_at else ""
        md_content += f"### {role_title} ({time_str})\n{msg.content}\n\n---\n\n"

    file_bytes = md_content.encode("utf-8")
    input_file = BufferedInputFile(
        file=file_bytes,
        filename=f"sana_ai_history_{current_user.id}.md",
    )

    await message.answer_document(
        document=input_file,
        caption="📄 Ваша полная история диалогов и долгосрочной памяти в формате Markdown.",
    )
    await status_msg.delete()
