from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ViolationStatus = Literal['new', 'needs_review', 'confirmed', 'dismissed']
# Mẫu biển (đặc tả §4.3): ô tô `51K-123.45`/`51K1-123.45`, xe máy `59-X1 234.56`.
PLATE_PATTERN = r'^(?:[0-9]{2}[A-Z][0-9]?-[0-9]{3}\.[0-9]{2}|[0-9]{2}-[A-Z][0-9] [0-9]{3}\.[0-9]{2})$'
USERNAME_PATTERN = r'^[A-Za-z0-9_.\-]{3,32}$'
EMAIL_PATTERN = r'^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,20}$'


def _no_blank(v: str) -> str:
    if not v.strip():
        raise ValueError('Không được để trống')
    return v.strip()


class LoginIn(BaseModel):
    username: str
    password: str


class ReviewIn(BaseModel):
    note: Optional[str] = ''


class RegisterIn(BaseModel):
    """Đăng ký công dân (M6a). Không nhận `role`: extra=forbid ⇒ 422, công dân không tự nâng quyền."""
    model_config = ConfigDict(extra='forbid')
    username: str = Field(pattern=USERNAME_PATTERN)
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    phone: Optional[str] = Field(default=None, pattern=r'^0[0-9]{8,10}$')

    @field_validator('password')
    @classmethod
    def _bcrypt_bytes(cls, v: str) -> str:
        # bcrypt chỉ nhận tối đa 72 byte UTF-8; vượt quá sẽ lỗi/cắt âm thầm → từ chối rõ ràng.
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Mật khẩu quá dài (tối đa 72 byte)')
        return v

    @field_validator('full_name')
    @classmethod
    def _name(cls, v: str) -> str:
        return _no_blank(v)


class PlateBindIn(BaseModel):
    plate: str = Field(min_length=6, max_length=16, pattern=PLATE_PATTERN)
    vehicle_class: Literal['car', 'motorbike']
    registration_code: str = Field(pattern=r'^[0-9]{8}$')


class ComplaintIn(BaseModel):
    violation_id: str = Field(min_length=3, max_length=64)
    kind: Literal['priority_vehicle', 'wrong_plate', 'other']
    reason: str = Field(min_length=1, max_length=200)     # lý do — bắt buộc
    message: Optional[str] = Field(default=None, max_length=1000)   # mô tả chi tiết (tùy chọn)

    @field_validator('reason')
    @classmethod
    def _reason(cls, v: str) -> str:
        return _no_blank(v)


class PayIn(BaseModel):
    confirm: Literal[True]


class NotifyReadIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)

    @field_validator('ids')
    @classmethod
    def _ids(cls, v: list[str]) -> list[str]:
        if any(not i or len(i) > 64 for i in v):
            raise ValueError('Mã thông báo không hợp lệ')
        return v


class ResolveIn(BaseModel):
    """Cán bộ xử lý khiếu nại: `confirm` = giữ vi phạm, `dismiss` = gỡ. Lý do bắt buộc."""
    action: Literal['confirm', 'dismiss']
    note: str = Field(min_length=1, max_length=1000)

    @field_validator('note')
    @classmethod
    def _note(cls, v: str) -> str:
        return _no_blank(v)


class StaffCreateIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(pattern=USERNAME_PATTERN)
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=1, max_length=100)
    role: Literal['officer', 'commander']

    @field_validator('password')
    @classmethod
    def _bcrypt_bytes(cls, v: str) -> str:
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Mật khẩu quá dài (tối đa 72 byte)')
        return v


class StaffActiveIn(BaseModel):
    active: bool


class StaffRoleIn(BaseModel):
    role: Literal['officer', 'commander']


class SignalOverrideIn(BaseModel):
    # §4.5: group ∈ {0,1,null} (null = hủy); 0 < duration_s ≤ 600.
    node_id: str
    group: Optional[Literal[0, 1]] = None
    duration_s: float = Field(60, gt=0, le=600)
    reason: str = ''
    until_t_sim: Optional[float] = None   # giây sim nếu trạm đã biết (tùy chọn)


class ViolationIn(BaseModel):
    """Bản ghi vi phạm mục 4.4 do trạm gửi (backend tự sinh id/created_at/status/occurred_at).

    Bắt buộc theo §4.4: `violation_code, plate, plate_format, vehicle_class, vehicle_id,
    cycle_id, node_id, camera_id, signal, confidence (0–1), penalty, sim` → thiếu/sai ⇒ 422.
    """
    violation_code: str
    plate: str
    plate_format: str
    vehicle_class: str
    vehicle_id: str
    node_id: str
    camera_id: str
    signal: dict
    confidence: float = Field(ge=0, le=1)
    penalty: dict
    sim: dict
    cycle_id: Optional[int] = None
    occurred_at: Optional[str] = None
    node_osm_id: Optional[int] = None
    node_label: Optional[str] = None
    road_index: Optional[int] = None
    lane_index: Optional[int] = None
    vehicle_color: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    is_scenario_plate: bool = False
    priority_flag: bool = False
    priority_reason: Optional[str] = None
    ocr_confidence: Optional[float] = None
    detection: dict = Field(default_factory=dict)
    evidence: list = Field(default_factory=list)

    @model_validator(mode='after')
    def _require_cycle_id(self):
        if self.cycle_id is None:
            cid = self.signal.get('cycle_id') if isinstance(self.signal, dict) else None
            if cid is None:
                raise ValueError('Thiếu cycle_id (cấp gốc hoặc trong signal)')
            self.cycle_id = cid
        return self
