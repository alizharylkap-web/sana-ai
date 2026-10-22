import html
import re


def escape_markdown_v2(text: str) -> str:
    """
    Экранирует специальные символы Telegram MarkdownV2 согласно документации Bot API:
    _ * [ ] ( ) ~ ` > # + - = | { } . ! \\
    """
    if not text:
        return ""
    escape_chars = r"_*[]()~`>#+-=|{}.!\\"
    return re.sub(f"([{re.escape(escape_chars)}])", r"\\\1", text)


def format_telegram_html(text: str) -> str:
    """
    Безопасно конвертирует Markdown-ответ Gemini (блоки кода ```...```, инлайн-код `...`,
    жирный **...**, курсив _..._) в валидный Telegram HTML без ошибок парсинга сущностей.
    """
    if not text:
        return ""

    code_blocks: list[str] = []

    def _save_code_block(match: re.Match) -> str:
        lang = (match.group(1) or "").strip()
        code = html.escape(match.group(2).strip("\n"))
        if lang:
            block_html = f'<pre><code class="language-{html.escape(lang)}">{code}</code></pre>'
        else:
            block_html = f"<pre><code>{code}</code></pre>"
        code_blocks.append(block_html)
        return f"@@CODEBLOCK_{len(code_blocks) - 1}@@"

    processed = re.sub(r"```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```", _save_code_block, text)

    inline_codes: list[str] = []

    def _save_inline_code(match: re.Match) -> str:
        code = html.escape(match.group(1))
        inline_codes.append(f"<code>{code}</code>")
        return f"@@INLINECODE_{len(inline_codes) - 1}@@"

    processed = re.sub(r"`([^`\n]+)`", _save_inline_code, processed)

    # Экранируем остальной HTML
    processed = html.escape(processed)

    # Заголовки ### -> жирный
    processed = re.sub(r"^#{1,4}\s+(.+)$", r"<b>\1</b>", processed, flags=re.MULTILINE)
    # Жирный **текст**
    processed = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", processed)
    # Спойлеры ||текст||
    processed = re.sub(r"\|\|(.+?)\|\|", r"<tg-spoiler>\1</tg-spoiler>", processed)

    for idx, val in enumerate(inline_codes):
        processed = processed.replace(f"@@INLINECODE_{idx}@@", val)
    for idx, val in enumerate(code_blocks):
        processed = processed.replace(f"@@CODEBLOCK_{idx}@@", val)

    return processed


def split_message(text: str, max_length: int = 4096) -> list[str]:
    """
    Разбивает длинный ответ нейросети на части <= max_length символов,
    сохраняя целостность абзацев и предложений.
    """
    if not text:
        return []
    if len(text) <= max_length:
        return [text]

    chunks: list[str] = []
    remaining = text

    while len(remaining) > max_length:
        split_index = remaining.rfind("\n\n", 0, max_length)
        if split_index == -1 or split_index < max_length // 2:
            split_index = remaining.rfind("\n", 0, max_length)
        if split_index == -1 or split_index < max_length // 2:
            split_index = remaining.rfind(" ", 0, max_length)
        if split_index <= 0:
            split_index = max_length

        chunks.append(remaining[:split_index].strip())
        remaining = remaining[split_index:].strip()

    if remaining:
        chunks.append(remaining)

    return chunks
