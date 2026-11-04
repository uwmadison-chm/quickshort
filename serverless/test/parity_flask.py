"""
Run the parity cases against the original Flask app and write the expected
results to parity-expected.json. Needs Flask 2.2 (see ../../requirements.txt).

    python test/parity_flask.py
"""
import json
import os
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).parent
cases = json.loads((HERE / 'parity-cases.json').read_text())

tmp = pathlib.Path(tempfile.mkdtemp())
for key, url in cases['redirects'].items():
    (tmp / key).write_text(url + '\n')
os.environ['REDIRECTS_PATH'] = str(tmp)
sys.path.insert(0, str(HERE.parent.parent))
import quickshort  # noqa: E402

client = quickshort.app.test_client()
log_dir = quickshort.LOG_PATH


def log_sizes():
    return {p.name: p.stat().st_size for p in log_dir.glob('*.log')}


results = []
for path in cases['requests']:
    before = log_sizes()
    resp = client.get(path, base_url='https://short.example')
    after = log_sizes()
    logged = sorted(name[:-4] for name, size in after.items() if size != before.get(name, 0))
    results.append({
        'path': path,
        'status': resp.status_code,
        'location': resp.headers.get('Location'),
        'logged': logged[0] if logged else None,
    })

(HERE / 'parity-expected.json').write_text(json.dumps(results, indent=2) + '\n')
print(f'Wrote {len(results)} results')
