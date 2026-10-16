"""Tests for shared.markdown.render_markdown — the sanitisation primitive."""

from __future__ import annotations

from shared.markdown import render_markdown


def test_renders_commonmark_to_html() -> None:
    html = render_markdown("# Title\n\nSome **bold** text and a [link](https://example.com).")
    assert "<h1>" in html
    assert "<strong>bold</strong>" in html
    assert 'href="https://example.com"' in html


def test_raw_html_never_becomes_markup() -> None:
    html = render_markdown('<script>alert("x")</script>\n\n<img src=x onerror="alert(1)">')
    assert "<script" not in html
    assert "<img" not in html


def test_raw_html_block_is_escaped() -> None:
    html = render_markdown("<div onclick='evil()'>hi</div>")
    assert "<div" not in html
    assert "&lt;div" in html


def test_javascript_urls_never_become_links() -> None:
    html = render_markdown("[click](javascript:alert(1))")
    assert 'href="javascript' not in html
    assert "<a " not in html


def test_embedded_markup_directly_is_sanitised() -> None:
    html = render_markdown("<b>bold</b> and *emphasis*")
    assert "<b>" not in html
    assert "<em>emphasis</em>" in html


def test_code_blocks_survive() -> None:
    html = render_markdown("```python\nprint('hi')\n```")
    assert "<pre>" in html
    assert "<code" in html


def test_empty_input_renders_empty() -> None:
    assert render_markdown("") == ""
