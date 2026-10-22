from datetime import datetime
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from bot.models.reminder import Reminder


class ReminderRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_reminder(self, user_id: int, title: str, remind_at_utc: datetime) -> Reminder:
        reminder = Reminder(
            user_id=user_id,
            title=title,
            remind_at_utc=remind_at_utc
        )
        self.session.add(reminder)
        await self.session.flush()
        return reminder

    async def get_active_user_reminders(self, user_id: int, limit: int = 20) -> list[Reminder]:
        query = (
            select(Reminder)
            .where(Reminder.user_id == user_id, Reminder.is_completed == False)
            .order_by(Reminder.remind_at_utc.asc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_due_reminders(self, current_utc: datetime, limit: int = 50) -> list[Reminder]:
        query = (
            select(Reminder)
            .where(
                Reminder.is_completed == False,
                Reminder.remind_at_utc <= current_utc
            )
            .order_by(Reminder.remind_at_utc.asc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def mark_completed(self, reminder_id: int) -> None:
        query = select(Reminder).where(Reminder.id == reminder_id)
        result = await self.session.execute(query)
        reminder = result.scalar_one_or_none()
        if reminder:
            reminder.is_completed = True
            await self.session.flush()
