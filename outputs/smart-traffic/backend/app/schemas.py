from typing import Literal, Optional
from pydantic import BaseModel

ViolationStatus = Literal['new', 'needs_review', 'confirmed', 'dismissed']


class LoginIn(BaseModel):
    username: str
    password: str


class ReviewIn(BaseModel):
    note: Optional[str] = ''


class SignalOverrideIn(BaseModel):
    node_id: str
    group: Optional[int] = None
    duration_s: float = 60
    reason: str = ''
