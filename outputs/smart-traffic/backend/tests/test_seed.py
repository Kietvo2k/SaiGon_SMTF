def test_seed_accounts_and_plates(client):
    from app.db import get_conn
    conn = get_conn()
    users = {r['username']: r['role'] for r in conn.execute('SELECT username, role FROM users')}
    for u, role in [('admin1', 'admin'), ('commander1', 'commander'), ('officer1', 'officer'), ('citizen1', 'citizen'), ('station-3d', 'station')]:
        assert users.get(u) == role
    n = conn.execute('SELECT COUNT(*) AS n FROM plates_seed').fetchone()['n']
    assert n == 21600
    sc = conn.execute('SELECT COUNT(*) AS n FROM plates_seed WHERE is_scenario=1').fetchone()['n']
    assert sc == 6
    cams = {r['camera_id'] for r in conn.execute('SELECT camera_id FROM cameras')}
    assert cams == {'CAM-HX-001', 'CAM-HX-002'}
    nodes = {r['node_id'] for r in conn.execute('SELECT node_id FROM signal_nodes')}
    assert nodes == {'HX-01', 'HX-02', 'HX-03', 'HX-04', 'HX-05', 'HX-06'}


def test_plates_format_valid(client):
    import re
    from app.db import get_conn
    conn = get_conn()
    rows = conn.execute('SELECT plate, vehicle_class FROM plates_seed LIMIT 50').fetchall()
    for r in rows:
        if r['vehicle_class'] == 'motorbike':
            assert re.match(r'^[0-9]{2}-[A-Z][0-9] [0-9]{3}\.[0-9]{2}$', r['plate'])
        else:
            assert re.match(r'^[0-9]{2}[A-Z][0-9]?-[0-9]{3}\.[0-9]{2}$', r['plate'])
