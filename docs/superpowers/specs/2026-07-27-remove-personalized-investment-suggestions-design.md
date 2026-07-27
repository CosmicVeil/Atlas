# Remove Personalized Investment Suggestions

Date: 2026-07-27
Status: Approved

## Context

Atlas will launch as a public website in Canada. Users may track portfolios and read market research. The first public release will not give advice based on a user's holdings, purchase history, or budget.

This change is the first part of the production-readiness work. Server hardening, database migration, authentication changes, deployment automation, monitoring, and legal documents need separate plans.

## Goals

- Keep accounts, portfolios, holdings, gain and loss calculations, and factual portfolio news alerts.
- Remove personalized buy, sell, hold, trim, allocation, and budget suggestions.
- Prevent Atlas from sending portfolio holdings or purchase details to an AI provider.
- Keep market-wide stock research and label AI-generated material as educational, potentially inaccurate, and not investment advice.
- Preserve the old implementation in Git history.

## Out of Scope

- Atlas will not execute trades or connect to brokerage accounts.
- This change will not decide whether market-wide recommendation labels such as `buy` or `sell` can remain in the final Canadian product. A Canadian securities lawyer must review that question.
- This change will not replace SQLite, redesign authentication, or create the DigitalOcean deployment.

## Frontend Design

### Portfolio Page

The portfolio page will continue to show:

- portfolio names and holdings;
- invested value, current value, and gain or loss;
- market news linked to held symbols.

The page will remove:

- the portfolio recommendation request;
- recommendation loading and error state;
- the recommendation button and results;
- buy, sell, hold, trim, suggested-weight, and allocation language.

### AI Analysis Page

The page will keep market-wide analysis and individual stock research. It will remove the budget tab, budget form, portfolio selector used for personalization, purchase quantities, allocation results, and calls to the budget-suggestion API.

### Public Copy

Atlas will remove text that promises recommendations based on a portfolio or budget. Pages that show AI-generated research will include a visible notice:

> Educational information only. Atlas may produce inaccurate or outdated results. This content is not investment advice.

## Backend Design

The Flask API will remove:

- `POST /api/ai/portfolio-recommend`;
- `POST /api/ai/budget-suggest`;
- the helper that builds portfolio context for AI prompts;
- portfolio and budget recommendation service functions;
- simulated portfolio and budget recommendation functions.

`POST /api/ai/analyze` will accept a stock symbol without a portfolio ID. The route will not load a user's portfolio or send holdings, share counts, purchase prices, or gains and losses to an AI provider.

General stock-analysis functions will stop accepting portfolio context. Their prompts and simulated fallback output will not refer to a user's holdings.

Portfolio news alerts may still filter factual news by symbols in a portfolio. They will avoid trade instructions and allocation advice.

## Data Flow

1. A signed-in user creates a portfolio and records holdings.
2. Atlas stores those records for tracking and performance calculations.
3. A user may request research for a stock symbol.
4. Atlas sends stock and market information to the AI provider.
5. Atlas does not attach the user's portfolio data to that request.
6. Atlas displays the result with the educational-use notice.

## Error Handling

- Removed API paths will return `404`.
- The frontend will stop calling removed paths.
- General analysis failures will return a clear error without exposing provider responses, API keys, or stack traces.
- Fallback analysis will identify itself as simulated and display the same educational-use notice.

## Testing

Backend tests will verify that:

- removed recommendation endpoints do not exist;
- stock analysis calls the AI service without portfolio context;
- portfolio identifiers and holdings do not appear in AI prompts;
- portfolio tracking and portfolio news authorization still work;
- warning-analysis tests mock the provider helper that the implementation uses.

Frontend tests will verify that:

- no client function calls either removed endpoint;
- the portfolio page contains no personalized recommendation controls;
- the AI page contains no budget-allocation controls;
- the educational-use notice appears with AI research;
- the production build and focused regression tests pass.

The repository-wide lint backlog predates this change. A separate production-hardening plan will resolve it rather than mixing unrelated page refactors into this feature removal.

## Acceptance Criteria

- A user can create portfolios and manage holdings.
- A user cannot request portfolio or budget recommendations through the interface or API.
- AI provider requests contain no portfolio data.
- Atlas displays educational-use notices with AI research.
- Backend tests, frontend regression tests, and the production build pass.

## Rollback

Git history retains the removed code. Restoring personalized investment suggestions requires a new design, legal review, tests, and an explicit release decision. Atlas will not restore the feature by toggling a production setting.
