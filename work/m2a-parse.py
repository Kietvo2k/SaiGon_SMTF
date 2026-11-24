import io, json
t = io.open('work/m2a-qa-classic.out', encoding='utf-16').read()
d = json.loads(t)
print('keys:', list(d.keys()))
print('passed', d.get('passed'), 'failed', d.get('failed'))
for k, v in d.items():
    if k == 'checks':
        continue
    if isinstance(v, list):
        print('LIST', k, 'len', len(v))
        for item in v[:6]:
            print('   ', json.dumps(item, ensure_ascii=False)[:300])
    elif isinstance(v, dict):
        print('DICT', k, list(v.keys())[:10])
    else:
        print('VAL', k, json.dumps(v, ensure_ascii=False)[:200])
