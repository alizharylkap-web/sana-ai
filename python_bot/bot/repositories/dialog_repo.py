from sqlalchemy import select, desc, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from bot.models.dialog import DialogMessage, LongTermMemory


class DialogRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_message(
        self,
        user_id: int,
        role: str,
        content: str,
        mode: str,
        token_count: int = 0
    ) -> DialogMessage:
        msg = DialogMessage(
            user_id=user_id,
            role=role,
            content=content,
            mode=mode,
            token_count=token_count or max(1, len(content) // 4)
        )
        self.session.add(msg)
        await self.session.flush()
        return msg

    async def get_recent_messages(self, user_id: int, limit: int = 12) -> list[DialogMessage]:
        query = (
            select(DialogMessage)
            .where(DialogMessage.user_id == user_id)
            .order_by(desc(DialogMessage.created_at), desc(DialogMessage.id))
            .limit(limit)
        )
        result = await self.session.execute(query)
        messages = list(result.scalars().all())
        messages.reverse()
        return messages

    async def clear_user_messages(self, user_id: int) -> int:
        stmt = delete(DialogMessage).where(DialogMessage.user_id == user_id)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount or 0

    async def get_active_memories(self, user_id: int) -> list[str]:
        query = (
            select(LongTermMemory.fact)
            .where(LongTermMemory.user_id == user_id, LongTermMemory.is_active == True)  # noqa: E712
            .order_by(LongTermMemory.created_at.desc(), LongTermMemory.id.desc())
            .limit(20)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def add_memory(self, user_id: int, fact: str, category: str = "general") -> LongTermMemory | None:
        clean_fact = fact.strip()
        if not clean_fact:
            return None
        existing = await self.get_active_memories(user_id)
        if any(clean_fact.lower() == e.lower() for e in existing):
            return None
        memory = LongTermMemory(user_id=user_id, fact=clean_fact[:512], category=category)
        self.session.add(memory)
        await self.session.flush()
        return memory

    async def clear_user_memories(self, user_id: int) -> int:
        stmt = (
            update(LongTermMemory)
            .where(LongTermMemory.user_id == user_id, LongTermMemory.is_active == True)  # noqa: E712
            .values(is_active=False)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount or 0

    async def count_user_messages(self, user_id: int) -> int:
        query = (
            select(func.count())
            .select_from(DialogMessage)
            .where(DialogMessage.user_id == user_id, DialogMessage.role == "user")
        )
        result = await self.session.execute(query)
        return result.scalar() or 0
