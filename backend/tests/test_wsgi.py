import importlib
import os
import sys
import unittest
from unittest.mock import patch


class WsgiStartupTests(unittest.TestCase):
    def test_import_builds_app_without_spawning_subprocess(self):
        sys.modules.pop('wsgi', None)
        self.addCleanup(sys.modules.pop, 'wsgi', None)
        # wsgi.py loads backend/.env into os.environ; restore it afterwards.
        with patch.dict(os.environ), \
                patch('subprocess.run') as run, \
                patch('app.create_app') as create_app:
            wsgi = importlib.import_module('wsgi')

        run.assert_not_called()
        create_app.assert_called_once_with()
        self.assertIs(wsgi.app, create_app.return_value)


if __name__ == '__main__':
    unittest.main()
