import importlib.util
import pathlib
import struct
import tempfile
import unittest
import zipfile
import gzip

source = pathlib.Path(__file__).parents[1] / 'scripts/provision/quickstart_jpa.py'
spec = importlib.util.spec_from_file_location('jpa', source)
jpa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jpa)


def archive(files):
    raw = b'JPA' + struct.pack('<H', 19) + b'\0' * 14
    for name, content in files:
        name = name.encode()
        raw += b'JPF' + struct.pack('<HH', 21 + len(name), len(name)) + name
        raw += struct.pack('<BBIII', 1, 0, len(content), len(content), 0o644) + content
    return raw


class JPA(unittest.TestCase):
    def test_refuses_traversal_links_and_truncation(self):
        for name in ['../secret', '/secret', 'folder/../../secret', 'a\\b']:
            with self.assertRaises(ValueError): list(jpa.entries(archive([(name, b'x')])))
        raw = archive([('file', b'x')])
        with self.assertRaises(ValueError): list(jpa.entries(raw[:-1]))
        with self.assertRaises(ValueError): list(jpa.entries(archive([('same', b''), ('same', b'')])))
        altered = bytearray(raw)
        altered[19 + 7 + len('file')] = 2
        with self.assertRaises(ValueError): list(jpa.entries(altered))

    def test_joins_ordered_database_chunks_and_removes_installer(self):
        files = [('configuration.php', b"<?php class JConfig { public $dbprefix='abc_'; }"),
                 ('installation/sql/site.sql', b'CREATE TABLE `#__a` (id int);'),
                 ('installation/sql/site.s01', b'INSERT INTO `#__a` VALUES(1);'),
                 ('index.php', b'<?php')]
        with tempfile.TemporaryDirectory() as tmp:
            source = pathlib.Path(tmp)/'source.zip'
            with zipfile.ZipFile(source, 'w') as z: z.writestr('base.jpa', archive(files))
            out = pathlib.Path(tmp)/'out'
            jpa.convert(source, out, 'database', 'base.jpa')
            self.assertEqual(gzip.open(out).read(), b'CREATE TABLE `abc_a` (id int);\nINSERT INTO `abc_a` VALUES(1);\n')
            jpa.convert(source, out, 'webroot', 'base.jpa')
            with jpa.tarfile.open(out) as t: self.assertEqual(t.getnames(), ['configuration.php', 'index.php'])

if __name__ == '__main__': unittest.main()
