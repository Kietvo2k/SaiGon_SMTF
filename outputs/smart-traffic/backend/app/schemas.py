from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

ViolationStatus = Literal['new', 'needs_review', 'confirmed', 'dismissed']


class LoginIn(BaseModel):
    username: str
    password: str


class ReviewIn(BaseModel):
    note: Optional[str] = ''


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
