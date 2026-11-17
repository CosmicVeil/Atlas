"""Registry of user profile fields.

To add a profile field, append one entry to PROFILE_FIELDS. The API validates it,
the Profile page renders it, and AI prompts include it when `ai_visible` is True.
Values live in `User.preferences` (JSON), so no database migration is needed,
unless the entry names a real `column` on the User model (like email).

Field keys:
  key         unique id, used in the API and the JSON column
  label       text shown on the Profile page
  type        'text' | 'email' | 'select' | 'number'
  default     value used until the user saves one
  options     for 'select': list of {'value', 'label'}
  min, max    for 'number': inclusive bounds
  max_length  for 'text': maximum characters
  help        optional hint shown under the field
  ai_visible  True sends the value to AI prompts. Keep personal data
              (name, email) False: the model doesn't need it.
  ai_label    how the field is named in AI prompts (defaults to label)
  column      store in this User column instead of the JSON preferences
"""

import re

CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD']

COUNTRY_OPTIONS = [
    ('CA', 'Canada'), ('US', 'United States'), ('GB', 'United Kingdom'),
    ('IN', 'India'), ('JP', 'Japan'), ('AU', 'Australia'), ('DE', 'Germany'),
    ('FR', 'France'), ('OTHER', 'Other'),
]

PROFILE_FIELDS = [
    {
        'key': 'email', 'label': 'Email Address', 'type': 'email',
        'column': 'email', 'ai_visible': False,
    },
    {
        'key': 'name', 'label': 'Name', 'type': 'text', 'default': '',
        'max_length': 80, 'ai_visible': False,
    },
    {
        'key': 'currency', 'label': 'Display Currency', 'type': 'select', 'default': 'USD',
        'options': [{'value': c, 'label': c} for c in CURRENCY_OPTIONS],
        'ai_visible': False,
    },
    {
        'key': 'country', 'label': 'Country', 'type': 'select', 'default': 'OTHER',
        'options': [{'value': code, 'label': name} for code, name in COUNTRY_OPTIONS],
        'ai_visible': True, 'ai_label': 'Investor country',
    },
    {
        'key': 'risk_tolerance', 'label': 'Risk Tolerance', 'type': 'select', 'default': 'moderate',
        'options': [
            {'value': 'conservative', 'label': 'Conservative'},
            {'value': 'moderate', 'label': 'Moderate'},
            {'value': 'aggressive', 'label': 'Aggressive'},
        ],
        'help': 'How much price volatility you accept for higher potential returns.',
        'ai_visible': True, 'ai_label': 'Risk tolerance',
    },
    {
        'key': 'top_n', 'label': 'Stocks to Recommend', 'type': 'number', 'default': 10,
        'min': 1, 'max': 50,
        'help': 'How many stocks to show from the top 1000 list.',
        'ai_visible': False,
    },
]

FIELDS_BY_KEY = {field['key']: field for field in PROFILE_FIELDS}

EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def public_schema():
    """Field definitions for the frontend, without storage details."""
    return [{k: v for k, v in field.items() if k != 'column'} for field in PROFILE_FIELDS]


def get_values(user):
    """Every field's current value for this user, falling back to defaults."""
    stored = user.preferences or {}
    values = {}
    for field in PROFILE_FIELDS:
        if 'column' in field:
            values[field['key']] = getattr(user, field['column'])
        else:
            values[field['key']] = stored.get(field['key'], field.get('default'))
    return values


def get_value(user, key):
    return get_values(user)[key]


def _clean(field, value):
    """Returns (cleaned_value, error_message)."""
    kind = field['type']
    if kind in ('text', 'email'):
        if not isinstance(value, str):
            return None, 'Must be text'
        value = value.strip()
        if kind == 'email':
            # Not lowercased: signup and login compare emails exactly
            if not EMAIL_PATTERN.match(value):
                return None, 'Enter a valid email address'
        elif len(value) > field.get('max_length', 255):
            return None, f"Must be at most {field.get('max_length', 255)} characters"
        return value, None
    if kind == 'select':
        allowed = [option['value'] for option in field['options']]
        if value not in allowed:
            return None, 'Choose one of the listed options'
        return value, None
    if kind == 'number':
        # bool is a subclass of int, so reject it explicitly
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != int(value):
            return None, 'Must be a whole number'
        value = int(value)
        if value < field['min'] or value > field['max']:
            return None, f"Must be between {field['min']} and {field['max']}"
        return value, None
    return None, 'Unsupported field type'


def validate(data):
    """Checks a partial update against the registry. Returns (cleaned, errors)."""
    cleaned, errors = {}, {}
    if not isinstance(data, dict):
        return {}, {'_': 'Expected a JSON object'}
    for key, value in data.items():
        field = FIELDS_BY_KEY.get(key)
        if not field:
            errors[key] = 'Unknown field'
            continue
        clean_value, error = _clean(field, value)
        if error:
            errors[key] = error
        else:
            cleaned[key] = clean_value
    return cleaned, errors


def apply(user, cleaned):
    """Writes validated values onto the user. The caller commits."""
    # Assign a new dict: SQLAlchemy doesn't notice in-place changes to a JSON column
    preferences = dict(user.preferences or {})
    for key, value in cleaned.items():
        field = FIELDS_BY_KEY[key]
        if 'column' in field:
            setattr(user, field['column'], value)
        else:
            preferences[key] = value
    user.preferences = preferences


def ai_context(user):
    """{prompt label: readable value} for fields marked ai_visible."""
    values = get_values(user)
    context = {}
    for field in PROFILE_FIELDS:
        if not field.get('ai_visible'):
            continue
        value = values[field['key']]
        if field['type'] == 'select':
            value = next((o['label'] for o in field['options'] if o['value'] == value), value)
        context[field.get('ai_label', field['label'])] = value
    return context
