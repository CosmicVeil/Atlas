import unittest
from unittest.mock import patch

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from app.extensions import db
from app.models.user import User
from app import profile_fields
from app.api.profile.routes import profile_bp
from app.api.ai import routes as ai_routes
from services import ai_service


class ProfileApiTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite://', JWT_SECRET_KEY='offline-test-secret-with-at-least-32-characters')
        db.init_app(self.app)
        JWTManager(self.app)
        self.app.register_blueprint(profile_bp, url_prefix='/api/profile')
        self.app.register_blueprint(ai_routes.ai_bp, url_prefix='/api/ai')
        self.context = self.app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        db.create_all()
        self.addCleanup(db.session.remove)
        self.user = User(email='ana@example.com')
        self.user.set_password('secret')
        other = User(email='taken@example.com')
        other.set_password('secret')
        db.session.add_all([self.user, other])
        db.session.commit()
        self.client = self.app.test_client()
        self.headers = {'Authorization': 'Bearer ' + create_access_token(identity=str(self.user.id))}

    def put(self, body):
        return self.client.put('/api/profile', json=body, headers=self.headers)

    def test_get_returns_schema_and_defaults_without_storage_details(self):
        res = self.client.get('/api/profile', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual([f['key'] for f in data['fields']], [f['key'] for f in profile_fields.PROFILE_FIELDS])
        self.assertTrue(all('column' not in f for f in data['fields']))
        self.assertEqual(data['values'], {'email': 'ana@example.com', 'name': '', 'currency': 'USD',
                                          'country': 'OTHER', 'risk_tolerance': 'moderate', 'top_n': 10})

    def test_put_saves_partial_update_and_keeps_other_values(self):
        self.assertEqual(self.put({'risk_tolerance': 'aggressive', 'name': '  Ana  '}).status_code, 200)
        res = self.put({'top_n': 25, 'email': 'ana.new@example.com'})
        self.assertEqual(res.status_code, 200)
        values = res.get_json()['values']
        self.assertEqual((values['risk_tolerance'], values['name'], values['top_n']), ('aggressive', 'Ana', 25))
        db.session.refresh(self.user)
        self.assertEqual(self.user.email, 'ana.new@example.com')
        self.assertNotIn('email', self.user.preferences)

    def test_put_rejects_invalid_values_and_saves_nothing(self):
        cases = [
            {'risk_tolerance': 'yolo'}, {'currency': 'BTC'}, {'top_n': 0}, {'top_n': 51},
            {'top_n': 2.5}, {'top_n': True}, {'top_n': '10'}, {'name': 'x' * 81},
            {'email': 'not-an-email'}, {'email': 'taken@example.com'}, {'unknown': 1},
        ]
        for body in cases:
            res = self.put({**body, 'country': 'CA'})
            self.assertEqual(res.status_code, 400, body)
            self.assertEqual(list(res.get_json()['errors']), list(body), body)
        db.session.refresh(self.user)
        self.assertEqual(self.user.preferences, {})

    def test_put_rejects_non_object_body(self):
        res = self.client.put('/api/profile', json=['risk'], headers=self.headers)
        self.assertEqual(res.status_code, 400)

    def test_ai_context_has_only_ai_visible_fields_with_readable_labels(self):
        self.put({'name': 'Ana', 'country': 'CA', 'risk_tolerance': 'conservative'})
        context = profile_fields.ai_context(self.user)
        self.assertEqual(context, {'Investor country': 'Canada', 'Risk tolerance': 'Conservative'})

    def test_analyze_passes_preferences_but_not_personal_data(self):
        self.put({'name': 'Ana', 'risk_tolerance': 'aggressive'})
        with patch.object(ai_routes.prediction_store, 'get_prediction', return_value=None), \
             patch.object(ai_routes.market_data, 'get_company_overview', return_value={'symbol': 'AAPL'}), \
             patch.object(ai_routes.market_data, 'get_quote', return_value={'price': 100}), \
             patch.object(ai_routes.ai_service, 'analyze_stock', return_value={'isSimulated': False}) as analyze:
            res = self.client.post('/api/ai/analyze', json={'symbol': 'aapl'}, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        preferences = analyze.call_args.args[2]
        self.assertEqual(preferences['Risk tolerance'], 'Aggressive')
        self.assertNotIn('Ana', str(preferences))
        self.assertNotIn('ana@example.com', str(preferences))

    def test_top_list_is_trimmed_to_user_top_n(self):
        cache = {'recommended': [{'ticker': f'R{i}'} for i in range(50)],
                 'worst': [{'ticker': f'W{i}'} for i in range(50)], 'lastUpdated': 'now'}
        self.put({'top_n': 3})
        with patch.object(ai_routes, '_generate_and_cache_top_1000', return_value=cache), \
             patch.object(ai_routes, '_update_with_live_quotes'):
            data = self.client.post('/api/ai/top-1000/refresh', headers=self.headers).get_json()
        self.assertEqual([s['ticker'] for s in data['recommended']], ['R0', 'R1', 'R2'])
        self.assertEqual(len(data['worst']), 3)
        self.assertEqual(len(cache['recommended']), 50)


class AnalyzePromptTests(unittest.TestCase):
    def test_prompt_includes_preferences_outside_json_template(self):
        with patch.object(ai_service, '_call_multiple_models', return_value='{"recommendation": "hold"}') as call:
            ai_service.analyze_stock({'symbol': 'AAPL', 'price': 100}, user_preferences={'Risk tolerance': 'Conservative'})
        user_prompt = call.call_args.args[1]
        self.assertIn('Investor preferences (weigh the recommendation, risks and summary against these): Risk tolerance: Conservative', user_prompt)
        self.assertLess(user_prompt.index('Conservative'), user_prompt.index('Provide an analysis JSON'))

    def test_prompt_says_none_without_preferences(self):
        with patch.object(ai_service, '_call_multiple_models', return_value='{}') as call:
            ai_service.analyze_stock({'symbol': 'AAPL', 'price': 100})
        self.assertIn('against these): None', call.call_args.args[1])


if __name__ == '__main__':
    unittest.main()
