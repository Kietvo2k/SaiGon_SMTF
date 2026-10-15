import json
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.vms import TEXT_MAX, clean_text

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


class HeatAlertIn(BaseModel):
    """Cảnh báo kẹt của một cạnh (M4c): xác suất kẹt, độ tin cậy, sau bao nhiêu phút, mức hiện tại 0–1."""
    edge: int = Field(ge=0, le=10_000_000)
    prob: float = Field(ge=0, le=1)
    reliability: float = Field(ge=0, le=1)
    horizon_min: float = Field(ge=0, le=120)
    level: float = Field(ge=0, le=1)


class HeatIn(BaseModel):
    """Bản đồ nhiệt từ trạm (M4c): `levels` là [cạnh, mức 0–1], trạm chỉ gửi cạnh mức ≥ 0,05.

    `day_start_hour` (tùy chọn, mặc định 0) cho giờ trong ngày = (t_sim/3600 + day_start_hour) mod 24,
    cùng quy ước với heat-32.js. Tối đa 5000 phần tử mỗi danh sách.
    """
    t_sim: float = Field(ge=0)
    day_start_hour: float = Field(default=0, ge=0, lt=24)
    levels: list[tuple[Annotated[int, Field(ge=0, le=10_000_000)], Annotated[float, Field(ge=0, le=1)]]] = Field(
        default_factory=list, max_length=5000)
    alerts: list[HeatAlertIn] = Field(default_factory=list, max_length=5000)


class SignalOverrideIn(BaseModel):
    # §4.5: group ∈ {0,1,null} (null = hủy); 0 < duration_s ≤ 600.
    node_id: str
    group: Optional[Literal[0, 1]] = None
    duration_s: float = Field(60, gt=0, le=600)
    reason: str = ''
    until_t_sim: Optional[float] = None   # giây sim nếu trạm đã biết (tùy chọn)


class ScenarioIn(BaseModel):
    """Kịch bản (M6c). `none` = dừng kịch bản đang chạy. `params` nhỏ, tối đa ~1 KB JSON."""
    model_config = ConfigDict(extra='forbid')
    scenario: Literal['peak-hang-xanh', 'lane-block', 'flood-nhc', 'priority-run', 'none']
    params: dict = Field(default_factory=dict)

    @field_validator('params')
    @classmethod
    def _params_small(cls, v: dict) -> dict:
        if len(json.dumps(v, ensure_ascii=False)) > 1000:
            raise ValueError('params quá lớn (tối đa 1000 ký tự JSON)')
        return v


class VmsIn(BaseModel):
    """Nội dung bảng VMS (M6c). `auto` trả quyền về hệ thống (nội dung bị bỏ); `manual` cần nội dung ≤ 60 ký tự."""
    model_config = ConfigDict(extra='forbid')
    text: str = Field(default='', max_length=300)
    mode: Literal['auto', 'manual']

    @model_validator(mode='after')
    def _clean(self):
        text = clean_text(self.text)
        if len(text) > TEXT_MAX:
            raise ValueError(f'Nội dung VMS tối đa {TEXT_MAX} ký tự')
        if self.mode == 'manual' and not text:
            raise ValueError('Chế độ thủ công cần nội dung hiển thị')
        self.text = text if self.mode == 'manual' else ''
        return self


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
