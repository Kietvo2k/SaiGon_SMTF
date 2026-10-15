"""M6a — vòng đời đầy đủ 7 trạng thái (§4.4), khiếu nại, nộp phạt chỉ đổi trạng thái."""
from tests.m6_helpers import confirm, db, hdr, new_violation, register, seed_plates


def _audit(client, vid):
    return client.get(f'/api/v1/officer/audit?target_id={vid}', headers=hdr(client, 'commander1')).json()['items']


def _complain(client, vid, **over):
    body = {'violation_id': vid, 'kind': 'wrong_plate', 'reason': 'Biển đọc sai'}
    body.update(over)
    return client.post('/api/v1/citizen/complaints', headers=hdr(client, 'citizen1'), json=body)


def test_confirm_plate_without_account_stays_confirmed_and_notify_is_409(client):
    vid = new_violation(client, '51K-123.45')
    r = confirm(client, vid)
    assert r.status_code == 200 and r.json()['status'] == 'confirmed'
    n = client.post(f'/api/v1/officer/violations/{vid}/notify', headers=hdr(client, 'officer1'), json={'note': ''})
    assert n.status_code == 409, n.text
    assert 'error' in n.json()


def test_confirm_plate_bound_to_account_auto_notifies_and_audits_both_steps(client):
    vid = new_violation(client, '51K-888.88', is_scenario_plate=True)
    r = confirm(client, vid)
    assert r.status_code == 200 and r.json()['status'] == 'notified', r.text
    steps = [(i['from_state'], i['to_state'], i['actor']) for i in _audit(client, vid)]
    assert ('new', 'confirmed', 'officer1') in steps
    assert ('confirmed', 'notified', 'system') in steps
    items = client.get('/api/v1/citizen/notifications', headers=hdr(client, 'citizen1')).json()['items']
    assert any(i['violation_id'] == vid for i in items)


def test_notify_endpoint_only_from_confirmed(client):
    vid = new_violation(client, '51K-888.88')
    r = client.post(f'/api/v1/officer/violations/{vid}/notify', headers=hdr(client, 'officer1'), json={'note': ''})
    assert r.status_code == 409   # new → notified không phải cạnh hợp lệ


def test_citizen_pays_notified_once_and_pay_only_changes_status(client):
    vid = new_violation(client, '51K-888.88')
    confirm(client, vid)
    ch = hdr(client, 'citizen1')
    assert client.post(f'/api/v1/citizen/violations/{vid}/pay', headers=ch, json={'confirm': False}).status_code == 422
    r = client.post(f'/api/v1/citizen/violations/{vid}/pay', headers=ch, json={'confirm': True})
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'paid' and r.json()['note'] == 'chỉ đổi trạng thái'
    assert client.post(f'/api/v1/citizen/violations/{vid}/pay', headers=ch, json={'confirm': True}).status_code == 409
    conn = db()
    try:
        cols = {c['name'] for c in conn.execute('PRAGMA table_info(payments)')}
        rows = conn.execute('SELECT status FROM payments WHERE violation_id=?', (vid,)).fetchall()
    finally:
        conn.close()
    assert not (cols & {'card_number', 'bank_account', 'account_no', 'card_token'})
    assert [r['status'] for r in rows] == ['recorded']
    assert any(a['to_state'] == 'paid' and a['actor'] == 'citizen1' for a in _audit(client, vid))


def test_pay_is_409_while_disputed_and_for_not_notified(client):
    vid = new_violation(client, '51K-888.88')
    confirm(client, vid)
    assert _complain(client, vid, kind='other', reason='Cần xem lại').status_code == 200
    assert client.post(f'/api/v1/citizen/violations/{vid}/pay', headers=hdr(client, 'citizen1'),
                       json={'confirm': True}).status_code == 409


def test_dispute_keep_returns_to_notified_then_citizen_can_pay(client):
    vid = new_violation(client, '51K-888.88')
    confirm(client, vid)
    c = _complain(client, vid, kind='priority_vehicle', reason='Tôi đã nhường xe cứu thương',
                  message='Xe cứu thương đi qua nút lúc vi phạm')
    assert c.status_code == 200, c.text
    cid = c.json()['id']
    assert cid.startswith('CB-') and c.json()['status'] == 'open'
    oh = hdr(client, 'officer1')
    assert client.get(f'/api/v1/officer/violations/{vid}', headers=oh).json()['status'] == 'disputed'
    assert _complain(client, vid).status_code == 409   # đã disputed → không khiếu nại lần hai
    r = client.post(f'/api/v1/officer/complaints/{cid}/resolve', headers=oh,
                    json={'action': 'confirm', 'note': 'Ảnh cho thấy xe không nhường'})
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'rejected' and r.json()['violation'] == {'id': vid, 'status': 'notified'}
    got = client.get(f'/api/v1/citizen/complaints/{cid}', headers=hdr(client, 'citizen1')).json()
    assert got['status'] == 'rejected' and got['resolution'] == 'Ảnh cho thấy xe không nhường'
    assert 'resolved_by' not in got
    assert client.post(f'/api/v1/citizen/violations/{vid}/pay', headers=hdr(client, 'citizen1'),
                       json={'confirm': True}).status_code == 200


def test_dispute_dismiss_is_final_and_resolve_needs_note(client):
    vid = new_violation(client, '51K-888.88')
    confirm(client, vid)
    cid = _complain(client, vid).json()['id']
    oh = hdr(client, 'officer1')
    assert client.post(f'/api/v1/officer/complaints/{cid}/resolve', headers=oh,
                       json={'action': 'dismiss', 'note': '   '}).status_code == 422
    open_list = client.get('/api/v1/officer/complaints?status=open', headers=oh).json()
    assert [i['id'] for i in open_list['items']] == [cid]
    r = client.post(f'/api/v1/officer/complaints/{cid}/resolve', headers=oh,
                    json={'action': 'dismiss', 'note': 'Biển đọc sai, đã gỡ'})
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'resolved' and r.json()['violation']['status'] == 'dismissed'
    assert client.post(f'/api/v1/officer/complaints/{cid}/resolve', headers=oh,
                       json={'action': 'confirm', 'note': 'x'}).status_code == 409
    assert client.post(f'/api/v1/officer/violations/{vid}/notify', headers=oh, json={'note': ''}).status_code == 409
    assert client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=oh, json={'note': ''}).status_code == 409
    assert client.get('/api/v1/officer/complaints?status=resolved', headers=oh).json()['total'] == 1


def test_invalid_edges_are_409_and_every_step_audited(client):
    vid = new_violation(client, '51K-888.88')
    confirm(client, vid)
    oh = hdr(client, 'officer1')
    # notified không có cạnh sang dismissed/confirmed (chỉ paid và disputed).
    assert client.post(f'/api/v1/officer/violations/{vid}/dismiss', headers=oh, json={'note': 'x'}).status_code == 409
    assert client.post(f'/api/v1/officer/violations/{vid}/confirm', headers=oh, json={'note': 'x'}).status_code == 409
    assert client.post(f'/api/v1/citizen/violations/{vid}/pay', headers=hdr(client, 'citizen1'), json={'confirm': True}).status_code == 200
    # paid là trạng thái cuối.
    assert client.post(f'/api/v1/officer/violations/{vid}/dismiss', headers=oh, json={'note': 'x'}).status_code == 409
    assert client.post(f'/api/v1/officer/violations/{vid}/needs-review', headers=oh, json={'note': 'x'}).status_code == 409
    edges = [(i['from_state'], i['to_state']) for i in _audit(client, vid)]
    assert ('new', 'confirmed') in edges and ('confirmed', 'notified') in edges and ('notified', 'paid') in edges
    assert ('paid', 'dismissed') not in edges


def test_complaint_on_not_owned_or_unknown_violation_is_404(client):
    vid = new_violation(client, '51K-888.88')
    confirm(client, vid)
    other = register(client, 'nguoikhac01')
    r = client.post('/api/v1/citizen/complaints', headers=other,
                    json={'violation_id': vid, 'kind': 'other', 'reason': 'Không phải của tôi'})
    assert r.status_code == 404
    assert client.post('/api/v1/citizen/complaints', headers=hdr(client, 'citizen1'),
                       json={'violation_id': 'VP-NOPE', 'kind': 'other', 'reason': 'x'}).status_code == 404


def test_confirmed_without_account_becomes_notifiable_after_binding(client):
    p = seed_plates(1, offset=40)[0]
    vid = new_violation(client, p['plate'], vehicle_class=p['vehicle_class'])
    assert confirm(client, vid).json()['status'] == 'confirmed'
    h = register(client, 'binhgiadinh')
    bind = client.post('/api/v1/citizen/account/plates', headers=h,
                       json={'plate': p['plate'], 'vehicle_class': p['vehicle_class'], 'registration_code': p['registration_code']})
    assert bind.status_code == 200, bind.text
    r = client.post(f'/api/v1/officer/violations/{vid}/notify', headers=hdr(client, 'officer1'), json={'note': ''})
    assert r.status_code == 200 and r.json()['status'] == 'notified', r.text
    assert client.get('/api/v1/citizen/violations', headers=h).json()['total'] == 1


def test_priority_flag_violation_needs_review_and_list_shows_flag(client):
    vid = new_violation(client, '51K-123.45', priority_flag=True, priority_reason='nghi nhường xe ưu tiên')
    oh = hdr(client, 'officer1')
    items = client.get('/api/v1/officer/violations?status=needs_review', headers=oh).json()['items']
    row = next(i for i in items if i['id'] == vid)
    assert row['priority_flag'] is True and row['priority_reason'] == 'nghi nhường xe ưu tiên'
    assert client.post(f'/api/v1/officer/violations/{vid}/dismiss', headers=oh, json={'note': 'nhường đúng'}).status_code == 200
