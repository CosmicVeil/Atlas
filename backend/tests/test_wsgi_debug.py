import importlib
import os
import runpy
import sys
import unittest
from unittest.mock import patch

WSGI_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'wsgi.py')


def run_wsgi_main(env):
    # Run wsgi.py as a script with the app factory and subprocess mocked, and
    # without reading backend/.env (it would overwrite the env under test).
    with patch.dict(os.environ, env, clear=True), \
            patch('os.path.exists', return_value=False), \
            patch('subprocess.run'), \
            patch('app.create_app') as create_app:
        runpy.run_path(WSGI_PATH, run_name='__main__')
    return create_app.return_value.run


class DebugEnabledTests(unittest.TestCase):
    def setUp(self):
        sys.modules.pop('wsgi', None)
        self.addCleanup(sys.modules.pop, 'wsgi', None)
        with patch.dict(os.environ), patch('subprocess.run'), patch('app.create_app'):
            self.wsgi = importlib.import_module('wsgi')

    def test_off_when_unset(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(self.wsgi.debug_enabled())

    def test_on_for_explicit_true_values(self):
        for value in ('1', 'true', 'TRUE', 'yes', 'on', ' 1 '):
            with self.subTest(value=value), patch.dict(os.environ, {'FLASK_DEBUG': value}):
                self.assertTrue(self.wsgi.debug_enabled())

    def test_off_for_anything_else(self):
        for value in ('', '0', 'false', 'no', 'off', 'production', 'ture'):
            with self.subTest(value=value), patch.dict(os.environ, {'FLASK_DEBUG': value}):
                self.assertFalse(self.wsgi.debug_enabled())


class WsgiMainTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(sys.modules.pop, 'wsgi', None)

    def test_runs_without_debug_by_default(self):
        run = run_wsgi_main({})
        run.assert_called_once_with(debug=False, port=5000)

    def test_runs_with_debug_when_flask_debug_set(self):
        run = run_wsgi_main({'FLASK_DEBUG': '1', 'PORT': '5001'})
        run.assert_called_once_with(debug=True, port=5001)


if __name__ == '__main__':
    unittest.main()
