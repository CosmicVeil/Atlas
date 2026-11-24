import unittest
from unittest.mock import patch

from app import create_app
from app.config import Config, InsecureSecretError, MIN_SECRET_LENGTH, validate_secrets

STRONG = 'a' * 64
OTHER_STRONG = 'b' * 64


class ValidateSecretsTests(unittest.TestCase):
    def assertRejected(self, config, fragment):
        with self.assertRaises(InsecureSecretError) as ctx:
            validate_secrets(config)
        self.assertIn(fragment, str(ctx.exception))
        self.assertIn('secrets.token_hex(32)', str(ctx.exception))

    def test_strong_secrets_are_accepted(self):
        validate_secrets({'SECRET_KEY': STRONG, 'JWT_SECRET_KEY': OTHER_STRONG})

    def test_known_defaults_are_rejected(self):
        self.assertRejected({'SECRET_KEY': STRONG, 'JWT_SECRET_KEY': 'dev-jwt-secret-change-this'},
                            'JWT_SECRET_KEY is a publicly known default')
        self.assertRejected({'SECRET_KEY': 'dev-secret-change-this', 'JWT_SECRET_KEY': STRONG},
                            'SECRET_KEY is a publicly known default')

    def test_missing_or_empty_is_rejected(self):
        self.assertRejected({'SECRET_KEY': STRONG}, 'JWT_SECRET_KEY is not set')
        self.assertRejected({'SECRET_KEY': '', 'JWT_SECRET_KEY': STRONG}, 'SECRET_KEY is not set')

    def test_short_secret_is_rejected(self):
        short = 'x' * (MIN_SECRET_LENGTH - 1)
        self.assertRejected({'SECRET_KEY': STRONG, 'JWT_SECRET_KEY': short}, 'shorter than 32 characters')
        validate_secrets({'SECRET_KEY': STRONG, 'JWT_SECRET_KEY': 'x' * MIN_SECRET_LENGTH})

    def test_every_problem_is_reported_at_once(self):
        self.assertRejected({}, 'SECRET_KEY is not set; JWT_SECRET_KEY is not set')

    def test_testing_mode_is_exempt(self):
        validate_secrets({'TESTING': True})
        validate_secrets({'TESTING': True, 'JWT_SECRET_KEY': 'dev-jwt-secret-change-this'})


class CreateAppSecretGuardTests(unittest.TestCase):
    def test_create_app_refuses_default_secret_before_touching_the_database(self):
        with patch.object(Config, 'SECRET_KEY', STRONG), \
                patch.object(Config, 'JWT_SECRET_KEY', 'dev-jwt-secret-change-this'), \
                patch('app.db.init_app') as init_db:
            with self.assertRaises(InsecureSecretError):
                create_app()
        init_db.assert_not_called()

    def test_create_app_refuses_missing_secret(self):
        with patch.object(Config, 'SECRET_KEY', None), \
                patch.object(Config, 'JWT_SECRET_KEY', None), \
                patch('app.db.init_app') as init_db:
            with self.assertRaises(InsecureSecretError):
                create_app()
        init_db.assert_not_called()


if __name__ == '__main__':
    unittest.main()
