import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bot.services.memory_service import MemoryService


@pytest.mark.asyncio
async def test_extract_and_save_facts_found():
    service = MemoryService()

    mock_response = MagicMock()
    mock_response.text = '["Пользователь учит Go", "Готовится к собеседованию в Яндекс"]'

    mock_session = AsyncMock()

    with patch.object(
        service.client.aio.models,
        "generate_content",
        new_callable=AsyncMock,
        return_value=mock_response,
    ), patch("bot.services.memory_service.DialogRepository") as MockRepo:
        mock_repo_instance = MockRepo.return_value
        mock_repo_instance.add_memory = AsyncMock()

        await service.extract_and_save_facts(
            user_id=123,
            user_message="Я сейчас учу Go, хочу пройти собес в Яндекс.",
            bot_response="Отличная цель! Давай разберем горутины.",
            session=mock_session,
        )

        assert mock_repo_instance.add_memory.call_count == 2
        mock_repo_instance.add_memory.assert_any_call(123, "Пользователь учит Go")
        mock_repo_instance.add_memory.assert_any_call(
            123, "Готовится к собеседованию в Яндекс"
        )
        mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_extract_and_save_facts_empty():
    service = MemoryService()

    mock_response = MagicMock()
    mock_response.text = "[]"
    mock_session = AsyncMock()

    with patch.object(
        service.client.aio.models,
        "generate_content",
        new_callable=AsyncMock,
        return_value=mock_response,
    ), patch("bot.services.memory_service.DialogRepository") as MockRepo:
        mock_repo_instance = MockRepo.return_value
        mock_repo_instance.add_memory = AsyncMock()

        await service.extract_and_save_facts(
            user_id=123,
            user_message="Сколько будет 2+2?",
            bot_response="4",
            session=mock_session,
        )

        mock_repo_instance.add_memory.assert_not_called()
        mock_session.commit.assert_not_called()
