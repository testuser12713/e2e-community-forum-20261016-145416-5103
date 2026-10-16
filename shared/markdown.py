"""Sanitised CommonMark rendering.

This is a security primitive: user-supplied Markdown is rendered with
markdown-it-py (raw HTML disabled) and then passed through nh3, which strips
anything that could execute script, so the result is safe to inject into a page.
"""

from __future__ import annotations

import nh3
from markdown_it import MarkdownIt

_ALLOWED_TAGS = {
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
}

_ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title"},
    "td": {"align"},
    "th": {"align"},
}

_markdown = MarkdownIt("commonmark", {"html": False, "linkify": True}).enable("table")


def render_markdown(text: str) -> str:
    """Render Markdown to HTML with raw HTML disabled and the output sanitised."""
    if not text:
        return ""
    rendered = _markdown.render(text)
    return nh3.clean(
        rendered,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        link_rel="noopener noreferrer nofollow",
        url_schemes={"http", "https", "mailto"},
    )
