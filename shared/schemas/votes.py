"""Vote schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class VoteRequest(BaseModel):
    value: Literal[1, -1, 0]


class VoteResult(BaseModel):
    score: int
    my_vote: int
