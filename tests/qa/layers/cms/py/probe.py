#!/usr/bin/env python3
"""Drive the fleet's quickstart code (quickstart.py, quickstart_jpa.py) from a QA scenario.

The scenario arrives as one JSON argument. This script only BUILDS inputs (archives, pins, a pack
folder) and reports what the product code did; it never judges. The judgement lives in the Node
assertion that reads this report.

  scenario = {"op": "download" | "local_file" | "jpa", "module_dir": "<dir with quickstart.py>",
              "work": "<scratch dir>", ...}
"""
import base64
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import struct
import sys
import tarfile
import zipfile

sys.dont_write_bytecode = True


def load(module_dir, name):
    sys.path.insert(0, module_dir)
    spec = importlib.util.spec_from_file_location(name, os.path.join(module_dir, name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tar_bytes(members):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
        for m in members:
            info = tarfile.TarInfo(m['name'])
            if m.get('type') == 'symlink':
                info.type = tarfile.SYMTYPE
                info.linkname = m.get('target', '/etc/passwd')
                archive.addfile(info)
            else:
                data = m.get('data', 'x').encode()
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def zip_bytes(members):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        for m in members:
            archive.writestr(m['name'], m.get('data', 'x'))
    return buffer.getvalue()


def jpa_bytes(files):
    raw = b'JPA' + struct.pack('<H', 19) + b'\0' * 14
    for name, content in files:
        encoded = name.encode()
        raw += b'JPF' + struct.pack('<HH', 21 + len(encoded), len(encoded)) + encoded
        raw += struct.pack('<BBIII', 1, 0, len(content), len(content), 0o644) + content.encode()
    return raw


def report(fn):
    try:
        value = fn()
        return {'raised': None, 'value': value}
    except BaseException as error:  # noqa: BLE001 - the report names whatever the product raised
        return {'raised': type(error).__name__, 'message': str(error)}


def op_download(s):
    qs = load(s['module_dir'], 'quickstart')
    work = pathlib.Path(s['work'])
    pack = work / 'pack'
    pack.mkdir(parents=True, exist_ok=True)
    kind = s.get('artifact', 'tar')
    members = s.get('members', [{'name': 'index.php'}])
    if kind == 'tar':
        data = tar_bytes(members)
    elif kind == 'zip':
        data = zip_bytes(members)
    else:
        data = s.get('data', 'plain').encode()
    declared = data
    tamper = s.get('tamper')
    if tamper == 'flip':
        served = bytearray(data)
        served[len(served) // 2] ^= 0xFF
        data = bytes(served)
    elif tamper == 'truncate':
        data = data[:-1]
    elif tamper == 'extend':
        data = data + b'\n'
    name = 'artifact.bin'
    (pack / name).write_bytes(data)
    artifact = {
        'file': name,
        'sha256': hashlib.sha256(declared).hexdigest(),
        'bytes': len(declared),
        'url': pathlib.Path(pack / name).resolve().as_uri(),
    }
    if 'pin' in s:
        artifact.update(s['pin'])  # a deliberately broken pin: nulls, short hashes, odd sizes
    root = str(pack.resolve())
    if s.get('local_url') == 'outside':
        outside = work / 'outside.bin'
        outside.write_bytes(data)
        artifact['url'] = outside.resolve().as_uri()
    elif s.get('local_url') == 'symlink':
        outside = work / 'outside.bin'
        outside.write_bytes(data)
        link = pack / 'link.bin'
        link.symlink_to(outside)
        artifact['url'] = pathlib.Path(pack / 'link.bin').as_uri()
    elif s.get('local_url') == 'root':
        artifact['url'] = pathlib.Path(root).as_uri()
    if s.get('root') == 'unset':
        os.environ.pop('TRACY_LOCAL_RELEASES_DIR', None)
    else:
        os.environ['TRACY_LOCAL_RELEASES_DIR'] = root
    output = work / 'out.bin'
    result = report(lambda: qs.download(artifact, str(output), s['part']))
    result['output_sha256'] = hashlib.sha256(output.read_bytes()).hexdigest() if output.exists() else None
    result['declared_sha256'] = hashlib.sha256(declared).hexdigest()
    return result


def op_jpa(s):
    jpa = load(s['module_dir'], 'quickstart_jpa')
    if 'raw_b64' in s:
        raw = base64.b64decode(s['raw_b64'])
    else:
        raw = jpa_bytes([(n, c) for n, c in s['files']])
    if s.get('cut'):
        raw = raw[: -s['cut']]
    return report(lambda: [e[0] for e in jpa.entries(raw)])


def main():
    scenario = json.loads(sys.argv[1])
    ops = {'download': op_download, 'jpa': op_jpa}
    print(json.dumps(ops[scenario['op']](scenario)))


if __name__ == '__main__':
    main()
