# Remove Personalized Investment Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep portfolio tracking and market research while removing personalized portfolio and budget advice from the public application.

**Architecture:** Flask will expose stock research without loading portfolio context. React will keep portfolio tracking and factual news alerts, remove recommendation controls, and show an educational-use notice with AI research. Regression tests will enforce the privacy boundary at the API, service, and interface layers.

**Tech Stack:** Python 3.12, Flask, Flask-JWT-Extended, unittest, React 19, Vite 6, Node test runner, ESLint

## Global Constraints

- Keep accounts, portfolios, holdings, gain and loss calculations, and factual portfolio news alerts.
- Remove personalized buy, sell, hold, trim, allocation, and budget suggestions.
- Do not send portfolio holdings or purchase details to an AI provider.
- Keep market-wide stock research and label AI-generated material as educational, potentially inaccurate, and not investment advice.
- Do not change the user's existing uncommitted edit in `backend/services/ai_service.py`.
- Preserve removed behavior through Git history, not through a production feature flag.
- Do not redesign authentication, replace SQLite, or create the DigitalOcean deployment in this plan.

---

### Task 1: Add Backend Privacy-Boundary Tests

**Files:**
- Create: `backend/tests/test_ai_public_scope.py`
- Modify: none
- Test: `backend/tests/test_ai_public_scope.py`

**Interfaces:**
- Consumes: `app.create_app()`, Flask route map, `services.ai_service.analyze_stock(stock_info)`
- Produces: regression coverage for removed routes and non-personalized stock analysis

- [ ] **Step 1: Write the failing route and call-signature tests**

Create `backend/tests/test_ai_public_scope.py`:

```python
import unittest
from unittest.mock import patch

from flask_jwt_extended import create_access_token

from app import create_app
from app.config import Config
from app.extensions import db
from app.models.Stock import Stock


class PublicAIEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Config.SQLALCHEMY_DATABASE_URI = "sqlite://"
        with patch("services.market_data.seed_database_stocks"):
            cls.app = create_app()
        cls.app.config.update(TESTING=True)

    def setUp(self):
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            db.session.add(Stock(symbol="AAPL", name="Apple", price=200.0))
            db.session.commit()
            self.token = create_access_token(identity="1")
        self.client = self.app.test_client()

    def test_personalized_recommendation_routes_are_not_registered(self):
        paths = {rule.rule for rule in self.app.url_map.iter_rules()}
        self.assertNotIn("/api/ai/portfolio-recommend", paths)
        self.assertNotIn("/api/ai/budget-suggest", paths)

    @patch("app.api.ai.routes.market_data.get_quote", return_value=None)
    @patch("app.api.ai.routes.ai_service.analyze_stock")
    def test_stock_analysis_does_not_pass_portfolio_context(self, mock_analyze, _mock_quote):
        mock_analyze.return_value = {"ticker": "AAPL", "isSimulated": True}

        response = self.client.post(
            "/api/ai/analyze",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"symbol": "AAPL", "portfolio_id": 42},
        )

        self.assertEqual(response.status_code, 200)
        mock_analyze.assert_called_once()
        args, kwargs = mock_analyze.call_args
        self.assertEqual(len(args), 1)
        self.assertEqual(kwargs, {})
        self.assertEqual(args[0]["symbol"], "AAPL")

    @patch("app.api.ai.routes.market_data.get_quote", return_value=None)
    @patch("app.api.ai.routes.ai_service.analyze_stock", side_effect=RuntimeError("private provider detail"))
    def test_stock_analysis_returns_public_error_without_internal_detail(self, _mock_analyze, _mock_quote):
        response = self.client.post(
            "/api/ai/analyze",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"symbol": "AAPL"},
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json(), {"error": "Stock analysis is temporarily unavailable"})
        self.assertNotIn(b"private provider detail", response.data)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and confirm the current code fails**

Run:

```bash
cd backend
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tests/test_ai_public_scope.py -v
```

Expected: the route-map test finds both personalized endpoints, or the call-signature test records a second `portfolio_context` argument.

- [ ] **Step 3: Commit the failing tests**

```bash
git add backend/tests/test_ai_public_scope.py
git commit -m "test: define public AI privacy boundary"
```

---

### Task 2: Remove Personalized Flask Endpoints

**Files:**
- Modify: `backend/app/api/ai/routes.py:1-143`
- Test: `backend/tests/test_ai_public_scope.py`

**Interfaces:**
- Consumes: `ai_service.analyze_stock(stock_info)`
- Produces: `POST /api/ai/analyze` with symbol-only research; no portfolio or budget recommendation routes

- [ ] **Step 1: Remove portfolio-specific imports and helpers**

Change the imports to:

```python
from flask import Blueprint, current_app, request, jsonify
from flask_jwt_extended import jwt_required
```

Remove imports for `get_jwt_identity`, `Portfolio`, and `Holding`. Delete `_get_portfolio_context`.

- [ ] **Step 2: Make stock analysis symbol-only**

Replace the personalized part of `analyze()` with:

```python
    data = request.get_json() or {}
    symbol = data.get("symbol")

    if not symbol:
        return jsonify({"error": "Stock symbol is required"}), 400

    symbol = symbol.strip().upper()
```

Keep the stock lookup and quote refresh. Call the service with one argument and return a public error if an unexpected failure escapes the service:

```python
    try:
        analysis = ai_service.analyze_stock(stock_info)
        return jsonify(analysis), 200
    except Exception:
        current_app.logger.exception("Stock analysis failed for %s", symbol)
        return jsonify({"error": "Stock analysis is temporarily unavailable"}), 503
```

- [ ] **Step 3: Delete both personalized routes**

Delete the complete functions registered at:

```text
POST /api/ai/portfolio-recommend
POST /api/ai/budget-suggest
```

- [ ] **Step 4: Run the backend privacy tests**

Run:

```bash
cd backend
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tests/test_ai_public_scope.py -v
```

Expected: all three tests pass.

- [ ] **Step 5: Commit the route removal**

```bash
git add backend/app/api/ai/routes.py
git commit -m "feat: remove personalized AI endpoints"
```

---

### Task 3: Remove Portfolio Data from the AI Service

**Files:**
- Modify: `backend/services/ai_service.py:188-629`
- Create: `backend/tests/test_ai_service_privacy.py`
- Test: `backend/tests/test_ai_service_privacy.py`

**Interfaces:**
- Consumes: stock dictionaries with symbol and market fields
- Produces: `analyze_stock(stock_info)` and `_simulate_stock_analysis(stock_info)` without portfolio parameters

- [ ] **Step 1: Add failing service-signature and prompt tests**

Create `backend/tests/test_ai_service_privacy.py`:

```python
import inspect
import json
import unittest
from unittest.mock import patch

from services import ai_service


class AIServicePrivacyTests(unittest.TestCase):
    def test_stock_analysis_accepts_no_portfolio_context(self):
        parameters = inspect.signature(ai_service.analyze_stock).parameters
        self.assertEqual(list(parameters), ["stock_info"])

    @patch("services.ai_service._call_multiple_models")
    def test_stock_prompt_contains_market_data_without_portfolio_data(self, mock_models):
        mock_models.return_value = json.dumps(
            {
                "ticker": "AAPL",
                "recommendation": "hold",
                "prediction": "neutral",
                "confidence": 50,
                "targetPrice": 200,
                "summary": "Research summary",
                "pros": [],
                "cons": [],
                "riskFactors": [],
            }
        )

        ai_service.analyze_stock(
            {
                "symbol": "AAPL",
                "name": "Apple",
                "price": 200,
                "pe_ratio": 30,
                "sector": "Technology",
                "industry": "Consumer Electronics",
                "market_cap": 1,
                "dividend_yield": 0,
                "eps": 1,
                "week_52_high": 210,
                "week_52_low": 150,
                "description": "Company description",
            }
        )

        _system_prompt, user_prompt = mock_models.call_args.args
        self.assertIn("Ticker: AAPL", user_prompt)
        self.assertNotIn("User Portfolio", user_prompt)
        self.assertNotIn("shares bought", user_prompt)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and confirm the signature test fails**

Run:

```bash
cd backend
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tests/test_ai_service_privacy.py -v
```

Expected: `analyze_stock` still exposes `portfolio_context`.

- [ ] **Step 3: Remove portfolio inputs from general stock analysis**

Use these signatures:

```python
def analyze_stock(stock_info):
```

```python
def _simulate_stock_analysis(stock_info):
```

Delete the portfolio-string block, the portfolio section of the prompt, and the personalization block inside `_simulate_stock_analysis`. Change the fallback call to:

```python
return _simulate_stock_analysis(stock_info)
```

- [ ] **Step 4: Delete personalized advice functions**

Delete these functions:

```text
recommend_portfolio
suggest_buys
_simulate_portfolio_analysis
_simulate_budget_suggestions
```

Keep market-wide multi-model analysis and warning-analysis helpers.

- [ ] **Step 5: Run the service and endpoint tests**

Run:

```bash
cd backend
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tests/test_ai_service_privacy.py -v
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tests/test_ai_public_scope.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit the service cleanup**

Stage only the service and its test. Confirm the preserved user edit remains visible in the staged diff before committing.

```bash
git add backend/services/ai_service.py backend/tests/test_ai_service_privacy.py
git diff --cached
git commit -m "feat: remove portfolio data from AI analysis"
```

---

### Task 4: Remove Personalized Frontend API Calls

**Files:**
- Modify: `frontend/src/api/ai.js:1-44`
- Modify: `frontend/tests/frontend-regressions.test.mjs`
- Test: `frontend/tests/frontend-regressions.test.mjs`

**Interfaces:**
- Consumes: `analyzeStock(token, symbol)`
- Produces: a frontend API module with no portfolio recommendation or budget suggestion functions

- [ ] **Step 1: Replace the obsolete budget regression with privacy regressions**

Add these tests to `frontend/tests/frontend-regressions.test.mjs`:

```javascript
test('AI client exposes no personalized portfolio or budget endpoints', async () => {
  const source = await readFile(new URL('src/api/ai.js', frontendRoot), 'utf8');

  assert.doesNotMatch(source, /portfolio-recommend/);
  assert.doesNotMatch(source, /budget-suggest/);
  assert.doesNotMatch(source, /portfolio_id/);
});

test('portfolio page exposes no personalized recommendation controls', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');

  assert.doesNotMatch(source, /getPortfolioRecommendations/);
  assert.doesNotMatch(source, /AI Portfolio Analysis/);
  assert.doesNotMatch(source, /suggestedWeight/);
});

test('AI research page has no budget allocator and shows the educational notice', async () => {
  const source = await readFile(new URL('src/pages/AIAnalysisScreen.jsx', frontendRoot), 'utf8');

  assert.doesNotMatch(source, /getBudgetSuggestions/);
  assert.doesNotMatch(source, /value="budget"/);
  assert.match(source, /Educational information only/);
  assert.match(source, /not investment advice/);
});
```

Delete the old test named `budget error UI imports the alert components it renders`.

- [ ] **Step 2: Run the frontend tests and confirm they fail**

Run:

```bash
cd frontend
node --test tests/frontend-regressions.test.mjs
```

Expected: personalized endpoint and interface assertions fail.

- [ ] **Step 3: Simplify the stock-analysis client**

Change the API function to:

```javascript
export async function analyzeStock(token, symbol) {
  const res = await fetch(`${API_URL}/api/ai/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ symbol })
  });
  return res.json();
}
```

Delete `getPortfolioRecommendations` and `getBudgetSuggestions`.

- [ ] **Step 4: Run the API-focused frontend regression**

Run:

```bash
cd frontend
node --test --test-name-pattern="AI client" tests/frontend-regressions.test.mjs
```

Expected: the AI client test passes. Interface tests remain red until Tasks 5 and 6.

- [ ] **Step 5: Commit the client change and regression tests**

```bash
git add frontend/src/api/ai.js frontend/tests/frontend-regressions.test.mjs
git commit -m "test: block personalized frontend AI calls"
```

---

### Task 5: Remove Portfolio Recommendation Controls

**Files:**
- Modify: `frontend/src/pages/Portfolio.jsx:1-839`
- Test: `frontend/tests/frontend-regressions.test.mjs`

**Interfaces:**
- Consumes: portfolio, holdings, and factual warning APIs
- Produces: portfolio tracking without AI advice requests or advice rendering

- [ ] **Step 1: Remove recommendation state and request code**

Delete:

```text
getPortfolioRecommendations import
aiRecs state
aiLoading state
showAIAnalysis state
fetchAIAnalysis()
setAiRecs(null)
```

Remove unused `Brain` and `Sparkles` icon imports after deleting the interface.

- [ ] **Step 2: Remove the analysis button and modal**

Delete the button whose label is `AI Analysis`. Delete the entire modal headed `AI Portfolio Analysis`, including `overallAssessment`, `allocationAdvice`, action labels, and suggested weights.

Keep market-warning cards. Their source link and factual warning text stay available.

- [ ] **Step 3: Remove obsolete local mock-holdings code**

Delete `INITIAL_MOCK_HOLDINGS` and the unused local `getHoldings(portfolio)` helper. The backend holdings API remains the source of portfolio data.

- [ ] **Step 4: Run the portfolio regression**

Run:

```bash
cd frontend
node --test --test-name-pattern="portfolio page" tests/frontend-regressions.test.mjs
```

Expected: the portfolio recommendation-control test passes.

- [ ] **Step 5: Commit the portfolio interface change**

```bash
git add frontend/src/pages/Portfolio.jsx
git commit -m "feat: remove portfolio advice interface"
```

---

### Task 6: Remove Budget Advice and Add Educational Copy

**Files:**
- Modify: `frontend/src/pages/AIAnalysisScreen.jsx`
- Modify: `frontend/src/pages/Home.jsx:55-136`
- Test: `frontend/tests/frontend-regressions.test.mjs`

**Interfaces:**
- Consumes: market-wide research and `analyzeStock(token, symbol)`
- Produces: research interface with no portfolio or budget personalization

- [ ] **Step 1: Remove budget and portfolio-personalization code**

In `AIAnalysisScreen.jsx`, delete:

```text
getBudgetSuggestions import
getPortfolios import
budget state
portfolios state
selectedPortfolioId state
budgetAdvice state
budgetLoading state
budgetError state
loadPortfolios()
handleBudgetSubmit()
```

Change calls from:

```javascript
analyzeStock(token, symbol, portfolioId)
```

to:

```javascript
analyzeStock(token, symbol)
```

- [ ] **Step 2: Remove the budget tab and its content**

Delete the `TabsTrigger` and `TabsContent` whose value is `budget`. Remove icon and component imports that no remaining code uses, including `DollarSign`, `AlertCircle`, `Alert`, and `AlertDescription` when applicable.

- [ ] **Step 3: Add the educational-use notice**

Place this text under the `AI Stock Analysis` heading and above the tabs:

```jsx
<div className="border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/80">
  Educational information only. Atlas may produce inaccurate or outdated results.
  This content is not investment advice.
</div>
```

- [ ] **Step 4: Replace personalized promises on the home page**

Use:

```text
AI-assisted market research, portfolio tracking, and factual market news.
```

Replace `Personal AI Advisor` with `Stock Research`. Use:

```text
Review market data and educational AI analysis without personalized trade instructions.
```

Remove claims about portfolio optimization, intelligent recommendations, and recommendations based on a portfolio or budget.

- [ ] **Step 5: Run all frontend regressions**

Run:

```bash
cd frontend
node --test tests/frontend-regressions.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit the research-only interface**

```bash
git add frontend/src/pages/AIAnalysisScreen.jsx frontend/src/pages/Home.jsx
git commit -m "feat: present AI output as educational research"
```

---

### Task 7: Repair the Existing Warning-Analysis Tests

**Files:**
- Modify: `backend/services/warning_analysis.py:258-311`
- Modify: `backend/tests/test_warning_analysis.py:18-84`
- Test: `backend/tests/test_warning_analysis.py`

**Interfaces:**
- Consumes: `warning_analysis.analyze_news_event()` and `ai_service._call_multiple_models()`
- Produces: deterministic warning tests that do not contact external AI services

- [ ] **Step 1: Update mocks to match the implementation**

For `test_uses_provider_priority_call_for_validated_event`, patch only:

```python
@patch("services.warning_analysis.ai_service._call_multiple_models")
```

Set that mock's return value to the existing JSON. Assert it was called once.

For `test_fallback_rejects_company_story_without_a_market_driver`, patch:

```python
@patch("services.warning_analysis.ai_service._call_multiple_models", return_value=None)
```

Assert the mock was called once.

- [ ] **Step 2: Require factual warning language**

Add this rule to the AI warning prompt:

```text
- Do not tell the user to buy, sell, hold, trim, change position size, or allocate money.
```

Replace the fallback action strings with:

```python
action = (
    "The article reports a positive market development. Review the cited source and current company filings for context."
    if sentiment == "positive"
    else "The article reports a potential downside risk. Review the cited source and current company filings for context."
)
```

Add this test:

```python
@patch("services.warning_analysis.ai_service._call_multiple_models", return_value=None)
def test_fallback_warning_avoids_trade_instructions(self, _mock_provider):
    warnings = warning_analysis.analyze_news_event(
        {
            "id": "contract-event",
            "title": "NVIDIA announces a major customer contract",
            "description": "The contract may increase revenue.",
            "symbols": ["NVDA"],
            "source_validated": True,
            "article": {"text": "NVIDIA signed the contract."},
        }
    )

    self.assertEqual(len(warnings), 1)
    reasoning = warnings[0]["reasoning"].lower()
    for instruction in ["buy", "sell", "hold", "trim", "position size", "allocate"]:
        self.assertNotIn(instruction, reasoning)
```

- [ ] **Step 3: Run warning tests without network access**

Run:

```bash
cd backend
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tests/test_warning_analysis.py -v
```

Expected: five warning-analysis tests pass and no external provider call appears in output.

- [ ] **Step 4: Commit the warning-language and test repair**

```bash
git add backend/services/warning_analysis.py backend/tests/test_warning_analysis.py
git commit -m "feat: keep portfolio warnings informational"
```

---

### Task 8: Verify the Change and Record Remaining Production Work

**Files:**
- Modify: `README.md`
- Test: all backend and frontend tests

**Interfaces:**
- Consumes: all changes from Tasks 1 through 7
- Produces: verified research-only build and a clear local runbook

- [ ] **Step 1: Document the public product boundary**

Add a `Public Launch Scope` section to `README.md`:

```markdown
## Public Launch Scope

Atlas supports portfolio tracking, factual market-news alerts, and educational
AI-assisted stock research. It does not provide personalized portfolio,
allocation, budget, or trade recommendations.

AI output may be inaccurate or outdated and is not investment advice.
```

- [ ] **Step 2: Install dependencies in the clean copy**

Run:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Run:

```bash
cd frontend
npm ci
```

- [ ] **Step 3: Run the full backend suite**

Run:

```bash
cd backend
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s tests -v
```

Expected: all backend tests pass without external AI or market-data calls.

- [ ] **Step 4: Run the frontend regressions and production build**

Run:

```bash
cd frontend
node --test tests/frontend-regressions.test.mjs
npm run build
```

Expected: all frontend tests pass and Vite creates `dist/`.

- [ ] **Step 5: Run lint and classify the existing baseline**

Run:

```bash
cd frontend
npm run lint
```

Expected for this plan: no personalized-suggestion code remains in lint output. The repository currently has unrelated lint failures in context modules and other pages. Record those failures in the next production-hardening plan instead of hiding them with blanket rule disables.

- [ ] **Step 6: Scan for removed behavior**

Run:

```bash
rg -n "portfolio-recommend|budget-suggest|getPortfolioRecommendations|getBudgetSuggestions|User Portfolio context|AI Portfolio Analysis|suggestedWeight" backend frontend/src
```

Expected: no matches.

- [ ] **Step 7: Review the final diff**

Run:

```bash
git diff origin/main...HEAD --check
git status --short
```

Expected: only the preserved user edit may remain uncommitted. No secrets, databases, dependency folders, or generated build files may appear in Git status.

- [ ] **Step 8: Commit the README update**

```bash
git add README.md
git commit -m "docs: define Atlas public research scope"
```
