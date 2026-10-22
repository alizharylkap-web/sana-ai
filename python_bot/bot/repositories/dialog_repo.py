from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from bot.models.dialog import DialogMessage, LongTermMemory


class DialogRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_message(self, user_id: int, role: str, content: str, mode: str, token_count: int = 0) -> DialogMessage:
        msg = DialogMessage(
            user_id=user_id,
            role=role,
            content=content,
            mode=mode,
            token_count=token_count
        )
        self.session.add(msg)
        await self.session.flush()
        return msg

    async def get_recent_messages(self, user_id: int, limit: int = 12) -> list[DialogMessage]:
        query = (
            select(DialogMessage)
            .where(DialogMessage.user_id == user_id)
            .order_by(desc(DialogMessage.created_at))
            .limit(limit)
        )
        result = await self.session.execute(query)
        messages = list(result.scalars().all())
        messages.reverse()
        return messages

    async def get_active_memories(self, user_id: int) -> list[str]:
        query = (
            select(LongTermMemory.fact)
            .where(LongTermMemory.user_id == user_id, LongTermMemory.is_active == True)
            .order_by(LongTermMemory.created_at.desc())
            .limit(20)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def add_memory(self, user_id: int, fact: str, category: str = "general") -> LongTermMemory:
        memory = LongTermMemory(user_id=user_id, fact=fact, category=category)
        self.session.add(memory)
        await self.session.flush()
        return memory

    async def count_user_messages(self, user_id: int) -> int:
        query = select(func.count()).select_from(DialogMessage).where(DialogMessage.user_id == user_id)
        result = await self.session.execute(query)
        return result.scalar() or 0
