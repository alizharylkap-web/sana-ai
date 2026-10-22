import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bot.services.gemini_service import GeminiService
from bot.models.user import User
from bot.models.dialog import Message
from bot.core.prompts_cache import PromptsCache


@pytest.fixture
def mock_user():
    return User(
        id=12345,
        username="test_user",
        language="ru",
        tier="FREE",
        active_mode="mentor",
    )


@pytest.fixture
def mock_pro_user():
    return User(
        id=99999,
        username="pro_user",
        language="en",
        tier="PRO",
        active_mode="coder",
    )


@pytest.mark.asyncio
async def test_build_system_instruction(mock_user):
    with patch.object(
        PromptsCache, "get_base_prompt", return_value="Base RU Prompt."
    ), patch.object(
        PromptsCache, "get_mode_prompt", return_value="Mode Mentor Prompt."
    ):
        service = GeminiService()
        memories = ["User is a Python developer", "User lives in Almaty"]

        instruction = service._build_system_instruction(mock_user, memories)

        assert "Base RU Prompt." in instruction
        assert "Mode Mentor Prompt." in instruction
        assert "ИЗВЕСТНЫЕ ФАКТЫ О ПОЛЬЗОВАТЕЛЕ" in instruction
        assert "- User is a Python developer" in instruction
        assert "- User lives in Almaty" in instruction


@pytest.mark.asyncio
async def test_generate_response_stream_free_user(mock_user):
    service = GeminiService()

    mock_chunk1 = MagicMock()
    mock_chunk1.text = "Привет, "
    mock_chunk2 = MagicMock()
    mock_chunk2.text = "мир!"

    async def mock_async_generator(*args, **kwargs):
        yield mock_chunk1
        yield mock_chunk2

    with patch.object(
        service.client.aio.models,
        "generate_content_stream",
        side_effect=mock_async_generator,
    ) as mock_gen:
        context = [Message(user_id=12345, role="user", content="Старый вопрос")]
        memories = ["Любит тесты"]

        chunks = []
        async for chunk in service.generate_response_stream(
            user=mock_user,
            context_messages=context,
            memories=memories,
            user_message="Новый вопрос",
        ):
            chunks.append(chunk)

        assert "".join(chunks) == "Привет, мир!"
        mock_gen.assert_called_once()
        call_kwargs = mock_gen.call_args.kwargs
        assert "flash" in call_kwargs["model"]
        assert len(call_kwargs["contents"]) == 2
