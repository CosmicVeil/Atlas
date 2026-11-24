import os
from datetime import timedelta

# Values that were once shipped in config.py / .env.example. Anyone can read them
# in the repo history, so a token signed with one of them can be forged.
KNOWN_DEFAULT_SECRETS = frozenset({
    'dev-secret-change-this',
    'dev-jwt-secret-change-this',
})
MIN_SECRET_LENGTH = 32
REQUIRED_SECRETS = ('SECRET_KEY', 'JWT_SECRET_KEY')
GENERATE_HINT = 'python -c "import secrets; print(secrets.token_hex(32))"'


class InsecureSecretError(RuntimeError):
    """Raised at startup when a signing secret is missing, a known default, or too short."""


class Config:
    # No fallback values: a missing secret must stop the app (see validate_secrets),
    # not silently fall back to a value everyone knows.
    SECRET_KEY = os.environ.get('SECRET_KEY')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    SQLALCHEMY_DATABASE_URI = 'sqlite:///app.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


def validate_secrets(config):
    """Fail fast if the signing secrets are unsafe. Testing mode is exempt."""
    if config.get('TESTING'):
        return
    problems = []
    for name in REQUIRED_SECRETS:
        value = config.get(name)
        if not value:
            problems.append(f'{name} is not set')
        elif value in KNOWN_DEFAULT_SECRETS:
            problems.append(f'{name} is a publicly known default value')
        elif len(value) < MIN_SECRET_LENGTH:
            problems.append(f'{name} is shorter than {MIN_SECRET_LENGTH} characters')
    if problems:
        raise InsecureSecretError(
            'Refusing to start: ' + '; '.join(problems) + '. '
            f'Set them in backend/.env. Generate each one with: {GENERATE_HINT}'
        )
