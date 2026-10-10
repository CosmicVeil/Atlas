"""Offline regression coverage for authenticated portfolio creation."""

import unittest
from unittest.mock import patch

from sqlalchemy import inspect

from app import create_app
from app.config import Config
from app.extensions import db


class PortfolioCreationTests(unittest.TestCase):
    def setUp(self):
        with (
            patch.object(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:"),
            patch("services.market_data.seed_database_stocks"),
        ):
            self.app = create_app()

        self.app.config.update(TESTING=True, JWT_SECRET_KEY="test-jwt-secret-that-is-long-enough")
        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _signup(self, email):
        signup = self.client.post(
            "/api/auth/signup",
            json={"email": email, "password": "password"},
        )
        self.assertEqual(signup.status_code, 201)
        return {"Authorization": f"Bearer {signup.get_json()['token']}"}

    def test_created_portfolio_is_owned_persisted_and_selectable(self):
        headers = self._signup("portfolio-owner@example.test")

        created = self.client.post(
            "/api/portfolios/", json={"name": "Retirement"}, headers=headers
        )
        self.assertEqual(created.status_code, 201)
        portfolio = created.get_json()

        reloaded = self.client.get("/api/portfolios/", headers=headers)
        self.assertEqual(reloaded.status_code, 200)
        self.assertEqual([item["id"] for item in reloaded.get_json()], [portfolio["id"]])

        selected = self.client.get(
            f"/api/portfolios/{portfolio['id']}", headers=headers
        )
        self.assertEqual(selected.status_code, 200)
        self.assertEqual(selected.get_json()["name"], "Retirement")

        with self.app.app_context():
            foreign_keys = inspect(db.engine).get_foreign_keys("portfolios")
        self.assertTrue(
            any(
                key["constrained_columns"] == ["user_id"]
                and key["referred_table"] == "user"
                for key in foreign_keys
            ),
            "portfolios.user_id must enforce ownership with a foreign key to user.id",
        )

    def test_create_portfolio_requires_authentication(self):
        response = self.client.post("/api/portfolios/", json={"name": "Retirement"})

        self.assertEqual(response.status_code, 401)
        with self.app.app_context():
            self.assertEqual(db.session.execute(db.text("SELECT COUNT(*) FROM portfolios")).scalar(), 0)

    def test_create_portfolio_rejects_blank_or_invalid_body(self):
        headers = self._signup("validation@example.test")

        for request_kwargs in (
            {"json": {"name": "   "}},
            {"json": {}},
            {"data": "not json", "content_type": "text/plain"},
        ):
            with self.subTest(request_kwargs=request_kwargs):
                response = self.client.post(
                    "/api/portfolios/", headers=headers, **request_kwargs
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json(), {"error": "Name is required"})

        listed = self.client.get("/api/portfolios/", headers=headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.get_json(), [])

    def test_create_portfolio_trims_name(self):
        headers = self._signup("trim@example.test")

        created = self.client.post(
            "/api/portfolios/", json={"name": "  Retirement  "}, headers=headers
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.get_json()["name"], "Retirement")
        listed = self.client.get("/api/portfolios/", headers=headers)
        self.assertEqual([item["name"] for item in listed.get_json()], ["Retirement"])

    def test_update_portfolio_trims_name_and_rejects_invalid_body(self):
        headers = self._signup("rename@example.test")
        portfolio = self.client.post(
            "/api/portfolios/", json={"name": "Original"}, headers=headers
        ).get_json()
        url = f"/api/portfolios/{portfolio['id']}"

        renamed = self.client.put(
            url, json={"name": "  Retirement  "}, headers=headers
        )
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.get_json()["name"], "Retirement")

        for request_kwargs in (
            {"json": {"name": "   "}},
            {"json": {}},
            {"data": "not json", "content_type": "text/plain"},
        ):
            with self.subTest(request_kwargs=request_kwargs):
                response = self.client.put(url, headers=headers, **request_kwargs)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json(), {"error": "Name is required"})

        unchanged = self.client.get(url, headers=headers)
        self.assertEqual(unchanged.get_json()["name"], "Retirement")

    def test_new_portfolio_list_entry_has_summary_fields(self):
        headers = self._signup("summary@example.test")
        self.client.post("/api/portfolios/", json={"name": "Empty"}, headers=headers)

        listed = self.client.get("/api/portfolios/", headers=headers)

        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.get_json()[0]["holdings_count"], 0)
        self.assertEqual(listed.get_json()[0]["total_invested"], 0)

    def test_new_portfolio_detail_opens_with_empty_holdings(self):
        headers = self._signup("holdings@example.test")
        created = self.client.post(
            "/api/portfolios/", json={"name": "Empty"}, headers=headers
        ).get_json()

        opened = self.client.get(
            f"/api/holdings/{created['id']}/holdings", headers=headers
        )

        self.assertEqual(opened.status_code, 200)
        self.assertEqual(opened.get_json()["holdings"], [])
        self.assertEqual(opened.get_json()["summary"]["total_value"], 0)

    def test_portfolios_are_scoped_to_owner(self):
        owner_headers = self._signup("owner@example.test")
        other_headers = self._signup("other@example.test")
        portfolio = self.client.post(
            "/api/portfolios/", json={"name": "Private"}, headers=owner_headers
        ).get_json()

        other_list = self.client.get("/api/portfolios/", headers=other_headers)
        self.assertEqual(other_list.status_code, 200)
        self.assertEqual(other_list.get_json(), [])

        portfolio_url = f"/api/portfolios/{portfolio['id']}"
        self.assertEqual(self.client.get(portfolio_url, headers=other_headers).status_code, 404)
        self.assertEqual(
            self.client.put(
                portfolio_url, json={"name": "Stolen"}, headers=other_headers
            ).status_code,
            404,
        )
        self.assertEqual(self.client.delete(portfolio_url, headers=other_headers).status_code, 404)

        owner_view = self.client.get(portfolio_url, headers=owner_headers)
        self.assertEqual(owner_view.status_code, 200)
        self.assertEqual(owner_view.get_json()["name"], "Private")


if __name__ == "__main__":
    unittest.main()
