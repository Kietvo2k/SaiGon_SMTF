# -*- coding: utf-8 -*-
"""Bộ sinh biển số/xe/chủ tất định — bản Python song song plateFor32 (violation-perception-32.js).

Chạy: python seed_plates.py --out plates.json
Thuật toán phải cho KẾT QUẢ GIỐNG HỆT bản JS (test chéo seed-plates-32.test.mjs).
"""
import argparse
import hashlib
import json
import os

SEED_PLATES = 31031
SERIES = 'ABCDEFGHKLMNPRSTUVWXYZ'
COLORS = ['trắng', 'đen', 'xám', 'bạc', 'đỏ', 'xanh dương', 'xanh lá', 'vàng', 'nâu', 'cam', 'hồng', 'tím']
SCENARIO_PLATES = [
    {'slot': 1, 'gen': 0, 'plate': '51K-888.88', 'vehicle_class': 'car'},
    {'slot': 2, 'gen': 0, 'plate': '59-X9 999.99', 'vehicle_class': 'motorbike'},
    {'slot': 3, 'gen': 0, 'plate': '51K-111.11', 'vehicle_class': 'car'},
    {'slot': 4, 'gen': 0, 'plate': '59-A1 222.22', 'vehicle_class': 'motorbike'},
    {'slot': 5, 'gen': 0, 'plate': '51G-333.33', 'vehicle_class': 'car'},
    {'slot': 6, 'gen': 0, 'plate': '59-B2 444.44', 'vehicle_class': 'motorbike'},
]


def hash_u32(n):
    x = (n ^ 0x9E3779B9) & 0xFFFFFFFF
    x = ((x ^ (x >> 16)) * 0x85EBCA6B) & 0xFFFFFFFF
    x = ((x ^ (x >> 13)) * 0xC2B2AE35) & 0xFFFFFFFF
    return (x ^ (x >> 16)) & 0xFFFFFFFF


def mulberry32(a0):
    """Trả về hàm rút word uint32 — khớp mulberry32 bản JS (r() = word / 2**32)."""
    a = a0 & 0xFFFFFFFF

    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t1 = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        inner = ((t1 ^ (t1 >> 7)) * (61 | t1)) & 0xFFFFFFFF
        t2 = (((t1 + inner) & 0xFFFFFFFF) ^ t1) & 0xFFFFFFFF
        return (t2 ^ (t2 >> 14)) & 0xFFFFFFFF

    return nxt


def registration_code_for(plate, slot, gen):
    """Mã đăng ký xe (8 chữ số) — TẤT ĐỊNH từ seed, dùng để xác minh sở hữu khi gắn biển (M6a).

    Không đổi `plates.json` (file đó được bản JS kiểm chéo); mã được tính khi nạp seed và ghi vào
    cột `plates_seed.registration_code`.
    """
    digest = hashlib.sha256(f'SMTF-REG|{SEED_PLATES}|{slot}|{gen}|{plate}'.encode('utf-8')).hexdigest()
    return '%08d' % (int(digest[:12], 16) % 100000000)


def plate_for(slot, gen, vehicle_class, owners, salt=0):
    r0 = hash_u32((SEED_PLATES ^ slot ^ ((gen << 16) & 0xFFFFFFFF) ^ ((salt * 0x9E3779B9) & 0xFFFFFFFF)) & 0xFFFFFFFF)
    rnd = mulberry32(r0)
    b = rnd()
    letter = SERIES[b % 21]
    b //= 21
    fmt = 'motorbike' if vehicle_class == 'motorbike' else 'car'
    if fmt == 'motorbike':
        d = b % 10
        b //= 10
        n = b % 1000
        b //= 1000
        p = b % 100
        plate = '59-%s%d %03d.%02d' % (letter, d, n, p)
    else:
        with_digit = b % 2
        b //= 2
        mid = ''
        if with_digit:
            mid = str(b % 10)
            b //= 10
        n = b % 1000
        b //= 1000
        p = b % 100
        plate = '51%s%s-%03d.%02d' % (letter, mid, n, p)
    k2 = rnd()
    color = COLORS[(k2 * 12) >> 32]
    k3 = rnd()
    owner_name = owners[(k3 * len(owners)) >> 32] if owners else 'Chủ xe %d' % slot
    k4 = rnd()
    owner_phone = '09%08d' % (k4 % 100000000)
    sc = next((s for s in SCENARIO_PLATES
               if s['slot'] == slot and s['gen'] == gen
               and (('motorbike' if s['vehicle_class'] == 'motorbike' else 'car') == fmt)), None)
    row = {'slot': slot, 'gen': gen, 'salt': salt, 'plate': sc['plate'] if sc else plate,
           'plate_format': fmt, 'vehicle_class': vehicle_class, 'color': color,
           'owner_name': owner_name, 'owner_phone': owner_phone,
           'is_scenario': bool(sc)}
    return row


def generate_all(slot_count=3600, gens=(0, 1, 2), owners=()):
    # Mỗi (slot, gen) có 2 bản ghi theo ĐỊNH DẠNG biển: 'motorbike' và 'car'.
    # bus/truck dùng định dạng 'car' (plateFor32 bản JS cũng vậy) nên lookup theo plate luôn thấy.
    # Slot chạy 1…N (khớp `slot = i + 1` của sim); gen 0…G. `plate` phải DUY NHẤT: khi trùng thì
    # tăng `salt` và sinh lại (cùng công thức trong plateFor32 bản JS) — tất định, chạy lại giống hệt.
    rows = []
    used = set()
    for slot in range(1, slot_count + 1):
        for gen in gens:
            for cls in ('motorbike', 'car'):
                salt = 0
                while True:
                    row = plate_for(slot, gen, cls, owners, salt)
                    if row['plate'] not in used:
                        break
                    salt += 1
                used.add(row['plate'])
                rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), 'plates.json'))
    ap.add_argument('--slots', type=int, default=3600)
    args = ap.parse_args()
    owners_path = os.path.join(os.path.dirname(__file__), 'owners.json')
    with open(owners_path, encoding='utf-8') as f:
        owners = json.load(f)
    rows = generate_all(args.slots, (0, 1, 2), owners)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({'rows': len(rows), 'out': args.out}))


if __name__ == '__main__':
    main()
