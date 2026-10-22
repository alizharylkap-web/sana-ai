from datetime import datetime, timezone
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from bot.models.reminder import Reminder


class ReminderRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_reminder(self, user_id: int, title: str, remind_at_utc: datetime) -> Reminder:
        if remind_at_utc.tzinfo is None:
            remind_at_utc = remind_at_utc.replace(tzinfo=timezone.utc)
        else:
            remind_at_utc = remind_at_utc.astimezone(timezone.utc)

        reminder = Reminder(
            user_id=user_id,
            title=title.strip()[:512],
            remind_at_utc=remind_at_utc
        )
        self.session.add(reminder)
        await self.session.flush()
        return reminder

    async def get_active_user_reminders(self, user_id: int, limit: int = 20) -> list[Reminder]:
        query = (
            select(Reminder)
            .where(Reminder.user_id == user_id, Reminder.is_completed == False)  # noqa: E712
            .order_by(Reminder.remind_at_utc.asc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_due_reminders(self, current_utc: datetime | None = None, limit: int = 50) -> list[Reminder]:
        if current_utc is None:
            current_utc = datetime.now(timezone.utc)
        elif current_utc.tzinfo is None:
            current_utc = current_utc.replace(tzinfo=timezone.utc)

        query = (
            select(Reminder)
            .where(
                Reminder.is_completed == False,  # noqa: E712
                Reminder.remind_at_utc <= current_utc
            )
            .order_by(Reminder.remind_at_utc.asc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def mark_completed(self, reminder_id: int, user_id: int | None = None) -> bool:
        query = select(Reminder).where(Reminder.id == reminder_id)
        if user_id is not None:
            query = query.where(Reminder.user_id == user_id)
        result = await self.session.execute(query)
        reminder = result.scalar_one_or_none()
        if reminder:
            reminder.is_completed = True
            await self.session.flush()
            return True
        return False

    async def delete_reminder(self, reminder_id: int, user_id: int) -> bool:
        stmt = delete(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user_id)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return bool(result.rowcount and result.rowcount > 0)
