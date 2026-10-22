from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from bot.services.memory_service import MemoryService


@pytest.mark.asyncio
async def test_extract_and_save_facts_found():
    mock_repo = AsyncMock()
    msg1 = MagicMock(role="user", content="Я сейчас учу Go и готовлюсь к собеседованию в Яндекс.")
    msg2 = MagicMock(role="model", content="Отличная цель!")
    mock_repo.get_recent_messages.return_value = [msg1, msg2]

    service = MemoryService(dialog_repo=mock_repo)

    mock_response = MagicMock()
    mock_response.text = '["Пользователь учит Go", "Готовится к собеседованию в Яндекс"]'

    with patch.object(
        service.client.aio.models,
        "generate_content",
        new_callable=AsyncMock,
        return_value=mock_response,
    ):
        await service.extract_and_save_facts(user_id=123)

        assert mock_repo.add_memory.call_count == 2
        mock_repo.add_memory.assert_any_call(123, "Пользователь учит Go")
        mock_repo.add_memory.assert_any_call(
            123, "Готовится к собеседованию в Яндекс"
        )


@pytest.mark.asyncio
async def test_extract_and_save_facts_empty():
    mock_repo = AsyncMock()
    msg1 = MagicMock(role="user", content="Сколько будет 2+2?")
    mock_repo.get_recent_messages.return_value = [msg1]

    service = MemoryService(dialog_repo=mock_repo)

    mock_response = MagicMock()
    mock_response.text = "[]"

    with patch.object(
        service.client.aio.models,
        "generate_content",
        new_callable=AsyncMock,
        return_value=mock_response,
    ):
        await service.extract_and_save_facts(user_id=123)
        mock_repo.add_memory.assert_not_called()
