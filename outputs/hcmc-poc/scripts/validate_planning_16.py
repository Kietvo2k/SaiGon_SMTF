"""Fail-closed provenance gate for planning source discovery; no future geometry allowed."""
from copy import deepcopy
from datetime import date
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlparse
import json

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'research/vibecode-16'
ALLOWED_HOSTS = {'hdnd.hochiminhcity.gov.vn', 'qhkt.hochiminhcity.gov.vn'}
REQUIRED = ('id', 'title', 'url', 'publisher', 'publishedAt', 'verifiedAt', 'status',
            'scope', 'allowedUse', 'limitations', 'sourceType', 'originalPublisher',
            'verification', 'rights')


def validate(doc):
    assert doc['version'] == '16a', 'Unsupported registry version'
    verified = date.fromisoformat(doc['verifiedAt'])
    assert verified <= date.today(), 'Verification date is in the future'
    assert doc.get('geometryReady') is False, 'No geometry has been verified in this registry'
    assert doc.get('planningStages') == [], 'No planning stages may be invented from articles'
    assert doc.get('geometryLayers') == [], 'No planning geometry may be invented from articles'
    assert len(doc.get('missingData', [])) >= 4, 'Required source gaps must remain visible'
    sources = doc['sources']
    assert len(sources) >= 2
    assert len({s['id'] for s in sources}) == len(sources), 'Duplicate source ID'
    for source in sources:
        assert all(isinstance(source.get(k), str) and source[k].strip() for k in REQUIRED), 'Missing provenance'
        url = urlparse(source['url'])
        assert url.scheme == 'https' and url.hostname in ALLOWED_HOSTS, 'Unofficial source URL'
        assert date.fromisoformat(source['publishedAt']) <= date.fromisoformat(source['verifiedAt']) <= verified
        assert source.get('geometryReady') is False, 'Article cannot activate geometry'
        assert source.get('approvalVerified') is False, 'Approval has not been verified'
        assert source['sourceType'] in {'official_activity_article', 'official_portal_republication', 'official_data_lead'}
    assert next(s for s in sources if s['id'] == 'qhkt-metro')['status'].startswith('Dự kiến')
    assert next(s for s in sources if s['id'] == 'hdnd-workshop')['sourceType'] == 'official_portal_republication'
    return len(sources)


def run():
    doc = json.loads((ROOT / 'data/planning-16.json').read_text(encoding='utf-8'))
    bundle = (ROOT / 'data/planning-16.js').read_text(encoding='utf-8')
    assert bundle.startswith('window.PLANNING_16=') and bundle.rstrip().endswith(';')
    assert json.loads(bundle[len('window.PLANNING_16='):].rstrip().removesuffix(';')) == doc
    count = validate(doc)
    mutations = []
    bad = deepcopy(doc); bad['geometryReady'] = True; mutations.append(bad)
    bad = deepcopy(doc); bad['sources'][0]['approvalVerified'] = True; mutations.append(bad)
    bad = deepcopy(doc); bad['sources'][0].pop('scope'); mutations.append(bad)
    bad = deepcopy(doc); bad['planningStages'] = [{'year': 2126}]; mutations.append(bad)
    bad = deepcopy(doc); bad['geometryLayers'] = [{'type': 'FeatureCollection'}]; mutations.append(bad)
    bad = deepcopy(doc); bad['sources'][0]['url'] = 'https://example.com/fake-plan'; mutations.append(bad)
    rejected = 0
    for item in mutations:
        try:
            validate(item)
        except (AssertionError, KeyError, ValueError):
            rejected += 1
    assert rejected == len(mutations), 'Unsafe data passed validation'
    archive_count = 0
    manifest = json.loads((RESEARCH / 'source-snapshots/manifest.json').read_text(encoding='utf-8'))
    for entry in manifest:
        if 'archive' in entry:
            raw = (RESEARCH / entry['archive']).read_bytes()
            assert sha256(raw).hexdigest() == entry['sha256'] and len(raw) == entry['bytes']
            archive_count += 1
        else:
            assert entry.get('error'), 'Missing archive must disclose failure'
    evidence = RESEARCH / 'source-snapshots/verification-notes.json'
    assert evidence.exists(), 'Verification metadata is required even without HTML archive'
    assert sha256(evidence.read_bytes()).hexdigest() == evidence.with_suffix('.sha256').read_text(encoding='utf-8').split()[0]
    notes = json.loads(evidence.read_text(encoding='utf-8'))
    assert all(any(n['id'] == s['id'] and n['url'] == s['url'] for n in notes['sources']) for s in doc['sources'])
    result = {'status': 'PASS', 'sourceRecords': count, 'jsonJsIdentity': True,
              'invalidFixturesRejected': rejected, 'archivedHtmlHashChecks': archive_count,
              'planningGeometryLayers': 0, 'planningStages': 0,
              'limit': 'Validates provenance structure and fail-closed gate, not legal approval or cartographic accuracy.'}
    (RESEARCH / 'planning-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    run()
