from unittest.mock import MagicMock, patch
import pytest
from google.genai import types
from bot.services.gemini_service import GeminiService
from bot.core.prompts_cache import get_cached_system_prompt


def test_get_cached_system_prompt():
    prompt = get_cached_system_prompt("ru", "mentor")
    assert "Sana AI" in prompt
    assert "НАСТАВНИК" in prompt or "МЕНТОР" in prompt


@pytest.mark.asyncio
async def test_generate_response_stream_free_user():
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
        contents = [
            types.Content(role="user", parts=[types.Part.from_text(text="Новый вопрос")])
        ]

        chunks = []
        async for chunk in service.generate_response_stream(
            system_prompt="System prompt",
            contents=contents,
            use_pro=False,
        ):
            chunks.append(chunk)

        assert "".join(chunks) == "Привет, мир!"
        mock_gen.assert_called_once()
        call_kwargs = mock_gen.call_args.kwargs
        assert "flash" in call_kwargs["model"]
