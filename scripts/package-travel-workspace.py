"""Package prepared sources. No repository creation, server deployment, or credentials."""
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
workspace = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
lock = json.loads((root / 'integrations/upstreams.lock.json').read_text())
output.mkdir(parents=True, exist_ok=True)
report = {'mode': 'source-package-only', 'remote_fork_created': False, 'packages': []}
excluded = {'.git', 'node_modules', '__pycache__', '.venv', 'storage', 'dist'}
for entry in (lock['app'], lock['reference']):
    source = workspace / entry['directory']
    actual = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != entry['commit']:
        raise SystemExit('Pinned upstream SHA mismatch')
    license_path = source / entry['license_file']
    if 'MIT License' not in license_path.read_text():
        raise SystemExit('Original upstream license is missing')
    archive = output / f"{entry['directory']}-source.zip"
    count = 0
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as target:
        for path in sorted(source.rglob('*')):
            relative = path.relative_to(source)
            if path.is_symlink() or not path.is_file() or any(p in excluded for p in relative.parts):
                continue
            if path.name == '.env' or (path.name.startswith('.env.') and not path.name.endswith('.example')):
                continue
            target.write(path, str(Path(entry['directory']) / relative))
            count += 1
    report['packages'].append({
        'file': archive.name, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        'files': count, 'upstream': entry['repository'], 'commit': actual,
        'role': entry['role'], 'license_file': entry['license_file'],
        'git_history_in_zip': False
    })
(output / 'provenance.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
