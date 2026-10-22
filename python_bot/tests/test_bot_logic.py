from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from bot.models import Base
from bot.repositories.user_repo import UserRepository
from bot.repositories.dialog_repo import DialogRepository
from bot.repositories.reminder_repo import ReminderRepository
from bot.utils.markdown_escaper import (
    escape_markdown_v2,
    format_telegram_html,
    split_message,
)


@pytest.fixture
async def db_session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


def test_escape_markdown_v2():
    raw = "Hello_world *bold* `code` [link](https://example.com)!"
    escaped = escape_markdown_v2(raw)
    assert r"\_" in escaped
    assert r"\*" in escaped
    assert r"\!" in escaped


def test_format_telegram_html():
    md = "**Привет**, `print(1 < 2)` и ||секрет||\n```python\nx = 1 < 2\n```"
    html_out = format_telegram_html(md)
    assert "<b>Привет</b>" in html_out
    assert "<code>print(1 &lt; 2)</code>" in html_out
    assert "<tg-spoiler>секрет</tg-spoiler>" in html_out
    assert '<pre><code class="language-python">x = 1 &lt; 2</code></pre>' in html_out


def test_split_message():
    long_text = ("Параграф текста.\n" * 400).strip()
    parts = split_message(long_text, max_length=1000)
    assert len(parts) > 1
    assert all(len(p) <= 1000 for p in parts)


def test_dispatcher_and_routers_setup():
    from bot.main import app, create_dispatcher
    dp = create_dispatcher(redis_client=None)
    assert dp is not None
    assert app.title == "Sana AI Webhook API"


@pytest.mark.asyncio
async def test_user_quota_and_pro_upgrade(db_session: AsyncSession):
    repo = UserRepository(db_session)
    user, created = await repo.get_or_create(1001, first_name="Ali", username="ali")
    await db_session.commit()

    assert created is True
    assert user.is_pro is False
    allowed, remaining = await repo.check_quota_precondition(user)
    assert allowed is True
    assert remaining == 20

    assert await repo.atomic_consume_quota(user.telegram_id, user.timezone) is True
    await db_session.refresh(user)
    assert user.queries_used_today == 1

    await repo.grant_pro(user.telegram_id)
    await db_session.commit()
    await db_session.refresh(user)
    assert user.is_pro is True
    allowed_pro, rem_pro = await repo.check_quota_precondition(user)
    assert allowed_pro is True
    assert rem_pro == 999999


@pytest.mark.asyncio
async def test_dialog_and_memory_deduplication(db_session: AsyncSession):
    user_repo = UserRepository(db_session)
    dialog_repo = DialogRepository(db_session)
    await user_repo.get_or_create(2002, first_name="Sana User", username="sana")

    await dialog_repo.add_message(2002, "user", "Привет", mode="mentor")
    await dialog_repo.add_message(2002, "model", "Здравствуйте!", mode="mentor")
    await dialog_repo.add_memory(2002, "Живет в Алматы")
    await dialog_repo.add_memory(2002, "Живет в Алматы")  # duplicate should be ignored
    await db_session.commit()

    context = await dialog_repo.get_recent_messages(2002)
    memories = await dialog_repo.get_active_memories(2002)
    assert len(context) == 2
    assert memories == ["Живет в Алматы"]

    await dialog_repo.clear_user_messages(2002)
    await db_session.commit()
    assert len(await dialog_repo.get_recent_messages(2002)) == 0


@pytest.mark.asyncio
async def test_reminder_lifecycle(db_session: AsyncSession):
    user_repo = UserRepository(db_session)
    rem_repo = ReminderRepository(db_session)
    await user_repo.get_or_create(3003, first_name="Planner User", username="planner")

    past_due = datetime.now(timezone.utc) - timedelta(minutes=5)
    reminder = await rem_repo.create_reminder(3003, "Позвонить клиенту", past_due)
    await db_session.commit()

    due_list = await rem_repo.get_due_reminders(datetime.now(timezone.utc))
    assert len(due_list) == 1
    assert due_list[0].id == reminder.id

    await rem_repo.mark_completed(reminder.id)
    await db_session.commit()

    due_after = await rem_repo.get_due_reminders(datetime.now(timezone.utc))
    assert len(due_after) == 0
