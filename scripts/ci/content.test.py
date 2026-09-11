import subprocess
import tempfile
import unittest
from pathlib import Path

CHECKER = Path(__file__).with_name('content.py').resolve()

class ContentChecks(unittest.TestCase):
    def test_missing_and_present_references(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', directory], check=True)
            (root / 'README.md').write_text('[demo](site/demo.gif)\n')
            subprocess.run(['git', 'add', 'README.md'], cwd=root, check=True)
            result = subprocess.run(['python3', str(CHECKER)], cwd=root, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            (root / 'site').mkdir()
            (root / 'site/demo.gif').write_bytes(b'GIF89a')
            result = subprocess.run(['python3', str(CHECKER)], cwd=root, capture_output=True)
            self.assertEqual(result.returncode, 0)

if __name__ == '__main__':
    unittest.main()
