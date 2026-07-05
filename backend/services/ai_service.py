import os
import json
import operator
import requests
import random
from typing_extensions import TypedDict
from typing import Annotated
from langgraph.graph import StateGraph, START, END
try:
    from langgraph.types import Send
except ImportError:
    try:
        from langgraph.graph import Send
    except ImportError:
        Send = None  # type: ignore



# Load API Keys from environment
CLAUDE_API_KEY = os.environ.get('CLAUDE_API_KEY') or os.environ.get('ANTHROPIC_API_KEY')
CLAUDE_VERSION = "2023-06-01"
CLAUDE_MODEL = "claude-3-5-sonnet-20241022"
BASE_URL = "https://api.anthropic.com/v1/messages"

NVIDIA_API_KEY = os.environ.get('NVIDIA_API_KEY')
NVIDIA_MODEL = "deepseek-ai/deepseek-v4-pro"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
OPENAI_MODEL = "gpt-4o-mini"
OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions"


def _call_nvidia(system_prompt, user_prompt):
    """Internal helper to call NVIDIA NIM API (OpenAI-compatible) with system and user prompts."""
    if not NVIDIA_API_KEY:
        return None

    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": NVIDIA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 1500,
        "chat_template_kwargs": {"thinking": False}
    }

    try:
        response = requests.post(NVIDIA_BASE_URL, headers=headers, json=payload, timeout=60)
        if response.status_code == 200:
            result = response.json()
            choices = result.get('choices', [])
            if choices and len(choices) > 0:
                text_response = choices[0].get('message', {}).get('content', '').strip()
                # Clean up json wrapping if Llama returns it in code blocks
                if text_response.startswith("```json"):
                    text_response = text_response.split("```json", 1)[1]
                    if text_response.endswith("```"):
                        text_response = text_response.rsplit("```", 1)[0]
                elif text_response.startswith("```"):
                    text_response = text_response.split("```", 1)[1]
                    if text_response.endswith("```"):
                        text_response = text_response.rsplit("```", 1)[0]
                return text_response.strip()
        else:
            print(f"NVIDIA API returned status {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Error calling NVIDIA API: {e}")
    
    return None


def _call_openai(system_prompt, user_prompt):
    """Internal helper to call OpenAI API (OpenAI-compatible) with system and user prompts."""
    if not OPENAI_API_KEY:
        return None

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 1500
    }

    try:
        response = requests.post(OPENAI_BASE_URL, headers=headers, json=payload, timeout=30)
        if response.status_code == 200:
            result = response.json()
            choices = result.get('choices', [])
            if choices and len(choices) > 0:
                text_response = choices[0].get('message', {}).get('content', '').strip()
                # Clean up json wrapping if returned in code blocks
                if text_response.startswith("```json"):
                    text_response = text_response.split("```json", 1)[1]
                    if text_response.endswith("```"):
                        text_response = text_response.rsplit("```", 1)[0]
                elif text_response.startswith("```"):
                    text_response = text_response.split("```", 1)[1]
                    if text_response.endswith("```"):
                        text_response = text_response.rsplit("```", 1)[0]
                return text_response.strip()
        else:
            print(f"OpenAI API returned status {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
    
    return None


def _call_claude(system_prompt, user_prompt):
    """Internal helper to call AI models. Prefers Claude, then OpenAI, then NVIDIA NIM, then simulation."""
    # 1. Try Claude first
    if CLAUDE_API_KEY:
        headers = {
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": CLAUDE_VERSION,
            "content-type": "application/json"
        }

        payload = {
            "model": CLAUDE_MODEL,
            "max_tokens": 1500,
            "temperature": 0.2,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_prompt}
            ]
        }

        try:
            response = requests.post(BASE_URL, headers=headers, json=payload, timeout=20)
            if response.status_code == 200:
                result = response.json()
                content = result.get('content', [])
                if content and len(content) > 0:
                    text_response = content[0].get('text', '').strip()
                    # Clean up json wrapping if Claude returns it in code blocks
                    if text_response.startswith("```json"):
                        text_response = text_response.split("```json", 1)[1]
                        if text_response.endswith("```"):
                            text_response = text_response.rsplit("```", 1)[0]
                    elif text_response.startswith("```"):
                        text_response = text_response.split("```", 1)[1]
                        if text_response.endswith("```"):
                            text_response = text_response.rsplit("```", 1)[0]
                    return text_response.strip()
            else:
                print(f"Claude API returned status {response.status_code}: {response.text}")
        except Exception as e:
            print(f"Error calling Claude API: {e}")

    # 2. Try OpenAI second
    if OPENAI_API_KEY:
        openai_res = _call_openai(system_prompt, user_prompt)
        if openai_res:
            return openai_res

    # 3. Try NVIDIA NIM third
    if NVIDIA_API_KEY:
        nvidia_res = _call_nvidia(system_prompt, user_prompt)
        if nvidia_res:
            return nvidia_res

    print("No active/valid AI API keys (CLAUDE_API_KEY, OPENAI_API_KEY, NVIDIA_API_KEY) found. Using simulation fallback.")
    return None


def analyze_stock(stock_info, portfolio_context=None):
    """
    Analyzes a single stock's fundamentals and provides structured buy/sell suggestions.
    Optionally personalizes recommendations using the user's active holdings.
    """
    ticker = stock_info['symbol']
    company_name = stock_info.get('name', ticker)
    price = stock_info.get('price', 0.0)
    pe = stock_info.get('pe_ratio')
    sector = stock_info.get('sector', 'Unknown')
    industry = stock_info.get('industry', 'Unknown')
    cap = stock_info.get('market_cap', 0)
    div_yield = stock_info.get('dividend_yield', 0)
    eps = stock_info.get('eps', 0)
    h52 = stock_info.get('week_52_high', price)
    l52 = stock_info.get('week_52_low', price)
    description = stock_info.get('description', '')

    # Prepare portfolio text if provided
    portfolio_str = "None"
    if portfolio_context and 'holdings' in portfolio_context:
        holdings = portfolio_context['holdings']
        if holdings:
            p_details = []
            for h in holdings:
                p_details.append(f"{h['symbol']}: {h['shares']} shares bought at ${h['buy_price']} (Current Price: ${h.get('current_price', h['buy_price'])})")
            portfolio_str = ", ".join(p_details)

    system_prompt = (
        "You are an expert financial analysis AI. You analyze stock fundamentals and generate detailed, objective investment recommendations. "
        "Your recommendation must be one of: 'strong_buy', 'buy', 'hold', 'sell', 'strong_sell'. "
        "You must respond ONLY with a single JSON block. Do not include any conversational text before or after the JSON."
    )

    user_prompt = f"""
    Analyze the following stock:
    Ticker: {ticker}
    Name: {company_name}
    Current Price: ${price}
    P/E Ratio: {pe}
    Sector: {sector}
    Industry: {industry}
    Market Cap: ${cap}
    Dividend Yield: {div_yield}%
    EPS: {eps}
    52-Week High: ${h52}
    52-Week Low: ${l52}
    Description: {description}

    User Portfolio context (the user holds these assets): {portfolio_str}

    Provide an analysis JSON matching this exact structure:
    {{
      "ticker": "{ticker}",
      "companyName": "{company_name}",
      "currentPrice": {price},
      "prediction": "bullish" | "bearish" | "neutral",
      "recommendation": "strong_buy" | "buy" | "hold" | "sell" | "strong_sell",
      "confidence": 0-100 (integer),
      "targetPrice": float (12-month projection),
      "timeframe": "6-12 months",
      "summary": "High level paragraph summarizing the analysis, noting if the stock is a fit for the user's portfolio and why.",
      "pros": ["bullet point 1", "bullet point 2", "etc (up to 5 points)"],
      "cons": ["bullet point 1", "bullet point 2", "etc (up to 5 points)"],
      "riskFactors": ["risk 1", "risk 2"]
    }}
    """

    response_text = _call_multiple_models(system_prompt, user_prompt)
    if response_text:
        try:
            res = json.loads(response_text)
            res["isSimulated"] = False
            return res
        except Exception as e:
            print(f"Error parsing AI stock analysis response: {e}")

    # --- FALLBACK SIMULATION GENERATOR ---
    return _simulate_stock_analysis(stock_info, portfolio_context)


def recommend_portfolio(portfolio_context):
    """
    Analyzes an entire portfolio's holdings and suggests optimizations (buy/sell/hold adjustments).
    """
    holdings = portfolio_context.get('holdings', [])
    summary = portfolio_context.get('summary', {})
    portfolio_name = portfolio_context.get('portfolio_name', 'My Portfolio')

    if not holdings:
        return {
            "portfolioName": portfolio_name,
            "overallAssessment": "Your portfolio is currently empty. To get started, add some stock holdings below.",
            "allocationAdvice": "Consider starting with broad market index funds or solid large-cap stocks across different sectors to build a diversified base.",
            "recommendations": []
        }

    holdings_str = json.dumps([
        {
            "symbol": h['symbol'],
            "shares": h['shares'],
            "buy_price": h['buy_price'],
            "current_price": h.get('current_price', h['buy_price']),
            "amount_invested": h.get('amount_invested'),
            "current_value": h.get('current_value'),
            "gain_loss_pct": h.get('gain_loss_pct')
        } for h in holdings
    ], indent=2)

    system_prompt = (
        "You are an institutional portfolio manager AI. You analyze a user's stock portfolio and make strategic optimization recommendations (what to buy more of, hold, or sell). "
        "You must respond ONLY with a single JSON block. Do not include any conversational text."
    )

    user_prompt = f"""
    Analyze this portfolio:
    Portfolio Name: {portfolio_name}
    Total Invested: ${summary.get('total_invested')}
    Total Value: ${summary.get('total_value')}
    Total Gain/Loss: ${summary.get('total_gain_loss')} ({summary.get('total_gain_loss_pct')}%)

    Holdings:
    {holdings_str}

    Provide optimization recommendation matching this exact JSON schema:
    {{
      "portfolioName": "{portfolio_name}",
      "overallAssessment": "Detailed paragraph describing overall health, performance, diversification and strengths of the portfolio.",
      "allocationAdvice": "Advice on sector concentration, risk level, and cash deployment.",
      "recommendations": [
        {{
          "ticker": "AAPL",
          "action": "buy" | "hold" | "sell" | "trim",
          "currentWeight": float (percentage representation like 15.4),
          "suggestedWeight": float (recommended weight),
          "reasoning": "Specific reason why the user should perform this action based on their existing position and market factors."
        }}
      ]
    }}
    """

    response_text = _call_multiple_models(system_prompt, user_prompt)
    if response_text:
        try:
            res = json.loads(response_text)
            res["isSimulated"] = False
            return res
        except Exception as e:
            print(f"Error parsing portfolio recommendations: {e}")

    # --- FALLBACK SIMULATION GENERATOR ---
    return _simulate_portfolio_analysis(portfolio_context)


def suggest_buys(budget, portfolio_context=None, available_stocks=None):
    """
    Recommends a list of stocks to buy within a specific budget, taking current portfolio holdings into account to ensure sector diversification.
    """
    if not available_stocks:
        available_stocks = []

    holdings_str = "None"
    if portfolio_context and 'holdings' in portfolio_context:
        holdings = portfolio_context['holdings']
        if holdings:
            holdings_str = ", ".join([f"{h['symbol']} ({h['shares']} shares)" for h in holdings])

    # Convert available stocks to a simple text representation
    stocks_summary = json.dumps([
        {
            "symbol": s['symbol'],
            "name": s['name'],
            "price": s['price'],
            "sector": s['sector'],
            "pe_ratio": s['pe_ratio']
        } for s in available_stocks[:20]  # Limit to top 20 to save prompt space
    ], indent=2)

    system_prompt = (
        "You are a financial planning AI. You suggest specific quantities of stocks to purchase given a cash budget. "
        "You must respond ONLY with a single JSON block. Do not include any conversational text."
    )

    user_prompt = f"""
    Cash Budget to Invest: ${budget}
    Existing User Holdings: {holdings_str}

    Select from these available stocks to recommend:
    {stocks_summary}

    Determine the best allocation of the ${budget} budget to purchase shares of these stocks. Recommend 2 to 4 stocks, allocating the cash logically.
    Ensure that the recommendations do not over-concentrate the user in a sector they already own heavily.

    Respond with this exact JSON structure:
    {{
      "budget": {budget},
      "totalAllocated": float (sum of recommended purchases),
      "remainingCash": float (cash left over),
      "reasoning": "A paragraph explaining why this selection makes sense given their budget and portfolio diversification needs.",
      "purchases": [
        {{
          "ticker": "MSFT",
          "sharesToBuy": integer,
          "pricePerShare": float,
          "cost": float,
          "sector": "sector name",
          "reason": "Brief explanation of why this stock is recommended."
        }}
      ]
    }}
    """

    response_text = _call_multiple_models(system_prompt, user_prompt)
    if response_text:
        try:
            res = json.loads(response_text)
            res["isSimulated"] = False
            return res
        except Exception as e:
            print(f"Error parsing budget suggestions: {e}")

    # --- FALLBACK SIMULATION GENERATOR ---
    return _simulate_budget_suggestions(budget, portfolio_context, available_stocks)


# =====================================================================
# FALLBACK SIMULATOR IMPLEMENTATIONS
# =====================================================================

def _simulate_stock_analysis(stock_info, portfolio_context):
    ticker = stock_info['symbol'].upper()
    company_name = stock_info.get('name', ticker)
    price = stock_info.get('price', 100.0)
    pe = stock_info.get('pe_ratio')
    sector = stock_info.get('sector', 'Technology')
    industry = stock_info.get('industry', 'Software')
    dividend = stock_info.get('dividend_yield', 0.0)
    eps = stock_info.get('eps', 5.0)

    # Simple logic to determine recommendation based on PE and random factors
    pe_val = float(pe) if pe else 20.0
    div_val = float(dividend) if dividend else 0.0

    if pe_val < 15:
        prediction = "bullish"
        recommendation = "buy"
        confidence = random.randint(78, 88)
        potential = random.uniform(15.0, 30.0)
    elif pe_val > 35:
        prediction = "neutral" if pe_val < 50 else "bearish"
        recommendation = "hold" if pe_val < 50 else "sell"
        confidence = random.randint(65, 82)
        potential = random.uniform(-10.0, 15.0)
    else:
        prediction = "bullish" if random.choice([True, False]) else "neutral"
        recommendation = "buy" if prediction == "bullish" else "hold"
        confidence = random.randint(70, 85)
        potential = random.uniform(5.0, 22.0)

    # Check if user already holds a large amount of this ticker
    personalization_note = ""
    if portfolio_context and 'holdings' in portfolio_context:
        matching = [h for h in portfolio_context['holdings'] if h['symbol'] == ticker]
        if matching:
            h = matching[0]
            personalization_note = f" Since you already own {h['shares']} shares of {ticker}, it is recommended to "
            if recommendation in ["buy", "strong_buy"]:
                recommendation = "hold"
                personalization_note += "hold your current position to maintain portfolio balance and avoid over-concentration."
            else:
                personalization_note += f"maintain your current position."

    target_price = round(price * (1 + (potential / 100.0)), 2)

    # Generate pros and cons based on sector and numbers
    pros = [
        f"Solid competitive position within the {industry} market.",
        f"Healthy EPS of ${eps} demonstrates core profitability.",
    ]
    if div_val > 1.5:
        pros.append(f"Attractive dividend yield of {div_val}% provides passive income stability.")
    if pe_val < 18:
        pros.append(f"Relatively low P/E ratio of {pe_val} suggests favorable valuation vs. peers.")
    else:
        pros.append("Strong revenue momentum and market share gains.")

    cons = [
        f"Subject to macro headwinds and cyclical shifts in the {sector} sector.",
        "Increased R&D and capital expenditure requirements to maintain innovation margins."
    ]
    if pe_val > 35:
        cons.append(f"High P/E ratio of {pe_val} creates a premium valuation risk with high expectations.")
    if div_val == 0.0:
        cons.append("Does not provide a dividend yield, offering capital appreciation potential only.")

    risk_factors = [
        f"Rapid technological obsolescence and competitor entry in the {industry} space.",
        "Regulatory environment shifts and compliance expenditures."
    ]

    summary = (
        f"{company_name} ({ticker}) exhibits a {prediction} outlook based on its current financial profile. "
        f"Trading at ${price} with a P/E ratio of {pe_val}, the stock demonstrates robust fundamental metrics. "
        f"{personalization_note if personalization_note else 'We recommend a ' + recommendation.upper() + ' stance for long term growth.'}"
    )

    return {
        "ticker": ticker,
        "companyName": company_name,
        "currentPrice": price,
        "prediction": prediction,
        "recommendation": recommendation,
        "confidence": confidence,
        "targetPrice": target_price,
        "timeframe": "6-12 months",
        "summary": summary,
        "pros": pros,
        "cons": cons,
        "riskFactors": risk_factors,
        "isSimulated": True
    }


def _simulate_portfolio_analysis(portfolio_context):
    holdings = portfolio_context.get('holdings', [])
    summary = portfolio_context.get('summary', {})
    portfolio_name = portfolio_context.get('portfolio_name', 'My Portfolio')
    total_val = summary.get('total_value', 0)

    recs = []
    for h in holdings:
        symbol = h['symbol']
        current_val = h.get('current_value', h['shares'] * h['buy_price'])
        weight = round((current_val / total_val) * 100, 1) if total_val > 0 else 0.0
        
        # Decide action based on gain/loss
        gain_pct = h.get('gain_loss_pct', 0.0)
        
        if weight > 30.0:
            action = "trim"
            suggested_weight = round(weight * 0.6, 1)
            reasoning = f"Your position in {symbol} represents {weight}% of your portfolio, creating high concentration risk. Trim to reduce vulnerability."
        elif gain_pct < -20.0:
            action = "sell"
            suggested_weight = 0.0
            reasoning = f"Position is down {gain_pct}% from purchase price. Consider selling to reallocate capital into higher-momentum stocks."
        elif gain_pct > 25.0:
            action = "hold"
            suggested_weight = weight
            reasoning = f"Strong performer (+{gain_pct}%). Maintain holding to ride the current bullish momentum while securing partial profits if desired."
        else:
            action = "hold"
            suggested_weight = weight
            reasoning = f"Fundamentals remain stable. Keep existing allocation of {weight}% unchanged for the next quarter."
            
        recs.append({
            "ticker": symbol,
            "action": action,
            "currentWeight": weight,
            "suggestedWeight": suggested_weight,
            "reasoning": reasoning
        })

    assessment = (
        f"Your {portfolio_name} portfolio is valued at ${total_val:,.2f} with a total net return of "
        f"{summary.get('total_gain_loss_pct', 0.0)}%. The portfolio shows moderate asset concentration. "
        "Review recommendations below to align with standard asset diversification targets."
    )

    return {
        "portfolioName": portfolio_name,
        "overallAssessment": assessment,
        "allocationAdvice": "Avoid having any single equity exceed 20% of your total portfolio value. Consider expanding holdings into cyclical sectors like Industrials or Energy if heavily focused in Technology.",
        "recommendations": recs,
        "isSimulated": True
    }


def _simulate_budget_suggestions(budget, portfolio_context, available_stocks):
    if not available_stocks:
        # Generate some default stocks
        available_stocks = [
            {"symbol": "MSFT", "name": "Microsoft Corp", "price": 420.0, "sector": "Technology", "pe_ratio": 35.0},
            {"symbol": "AAPL", "name": "Apple Inc", "price": 185.0, "sector": "Technology", "pe_ratio": 28.0},
            {"symbol": "NVDA", "name": "NVIDIA Corp", "price": 900.0, "sector": "Technology", "pe_ratio": 65.0},
            {"symbol": "AMZN", "name": "Amazon.com Inc", "price": 180.0, "sector": "Consumer Discretionary", "pe_ratio": 40.0},
            {"symbol": "JNJ", "name": "Johnson & Johnson", "price": 160.0, "sector": "Health Care", "pe_ratio": 16.0},
            {"symbol": "KO", "name": "Coca-Cola Co", "price": 60.0, "sector": "Consumer Staples", "pe_ratio": 24.0},
            {"symbol": "XOM", "name": "Exxon Mobil Corp", "price": 115.0, "sector": "Energy", "pe_ratio": 12.0},
        ]

    # Filter out sectors the user already holds to improve diversification
    owned_sectors = set()
    if portfolio_context and 'holdings' in portfolio_context:
        # Just map symbols to sectors roughly
        sector_map = {s['symbol']: s['sector'] for s in available_stocks}
        for h in portfolio_context['holdings']:
            sect = sector_map.get(h['symbol'])
            if sect:
                owned_sectors.add(sect)

    # Sort available stocks by PE ratio (prefer lower PE for budget suggestions, to represent value/stability)
    stocks_to_pick = sorted(available_stocks, key=lambda x: float(x.get('pe_ratio', 25.0)) if x.get('pe_ratio') else 25.0)

    purchases = []
    remaining = float(budget)
    
    for s in stocks_to_pick:
        price = float(s['price'])
        if price <= remaining:
            # Decide shares
            shares = int(remaining // price)
            if shares > 0:
                # Cap shares so we buy multiple stocks
                if len(purchases) < 2 and shares > 2:
                    shares = max(1, shares // 2)
                
                cost = shares * price
                remaining -= cost
                purchases.append({
                    "ticker": s['symbol'],
                    "sharesToBuy": shares,
                    "pricePerShare": price,
                    "cost": round(cost, 2),
                    "sector": s['sector'],
                    "reason": f"Offers strong value profile in the {s['sector']} sector. Good choice for budget entry."
                })
        if remaining < 10.0 or len(purchases) >= 3:
            break

    total_allocated = round(float(budget) - remaining, 2)

    return {
        "budget": budget,
        "totalAllocated": total_allocated,
        "remainingCash": round(remaining, 2),
        "reasoning": f"We allocated ${total_allocated} of your budget into {len(purchases)} high-quality assets. This list prioritizes lower P/E ratios and sector diversification, avoiding over-exposure.",
        "purchases": purchases,
        "isSimulated": True
    }


# ── Multi-Model LangGraph Workflow ──
class MultiModelState(TypedDict, total=False):
    system_prompt: str
    user_prompt: str
    responses: Annotated[list, operator.add]
    final_report: str


def _extract_json(text):
    """Extract and parse JSON from model response text."""
    if not text:
        return None
    text = text.strip()
    if text.startswith("```json"):
        text = text.split("```json", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    elif text.startswith("```"):
        text = text.split("```", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        return None


def _nvidia_fundamentalist_node(state: MultiModelState) -> dict:
    system = (
        "You are a fundamental analyst. Examine financial statements, earnings, "
        "balance sheets, and business fundamentals. Respond ONLY with a single JSON block."
    )
    text = _call_nvidia(system, state["user_prompt"])
    return {"responses": [{"provider": "nvidia_fundamentalist", "data": _extract_json(text)}]}


def _nvidia_quant_node(state: MultiModelState) -> dict:
    system = (
        "You are a quantitative analyst. Evaluate technical indicators, momentum, "
        "and historical volatility. Respond ONLY with a single JSON block."
    )
    text = _call_nvidia(system, state["user_prompt"])
    return {"responses": [{"provider": "nvidia_quant", "data": _extract_json(text)}]}


def _nvidia_risk_node(state: MultiModelState) -> dict:
    system = (
        "You are a risk manager. Identify macroeconomic threats, regulatory changes, "
        "and downside risks. Respond ONLY with a single JSON block."
    )
    text = _call_nvidia(system, state["user_prompt"])
    return {"responses": [{"provider": "nvidia_risk", "data": _extract_json(text)}]}


# TODO: Make the consensus node using AI, rather than using code logic
def _consensus_node(state: MultiModelState) -> dict:
    from collections import Counter

    responses = [r for r in state.get("responses", []) if r.get("data") is not None]

    if not responses:
        return {"final_report": ""}

    if len(responses) == 1:
        return {"final_report": json.dumps(responses[0]["data"])}

    # Multi-Model consensus
    results = [(r["provider"], r["data"]) for r in responses]

    # 1. Vote on recommendation
    rec_counts = Counter(d.get('recommendation', 'hold') for p, d in results)
    winner_rec = rec_counts.most_common(1)[0][0]
    print(f"[LangGraph] Recommendation vote: {dict(rec_counts)} -> winner: {winner_rec}")

    # 2. Vote on prediction
    pred_counts = Counter(d.get('prediction', 'neutral') for p, d in results)
    winner_pred = pred_counts.most_common(1)[0][0]

    # 3. Base result: highest-confidence response matching winning recommendation
    best_candidates = [(p, d) for p, d in results if d.get('recommendation') == winner_rec]
    best_provider, best_data = max(best_candidates, key=lambda x: x[1].get('confidence', 0))

    # 4. Average confidence
    avg_conf = round(sum(d.get('confidence', 50) for p, d in results) / len(results))

    # 5. Median targetPrice
    prices = sorted([d.get('targetPrice', 0) for p, d in results if d.get('targetPrice', 0) > 0])
    if prices:
        mid = len(prices) // 2
        median_price = prices[mid] if (len(prices) % 2 == 1) else (prices[mid - 1] + prices[mid]) / 2
    else:
        median_price = best_data.get('targetPrice', 0)

    # 6. Merge lists and deduplicate
    all_pros = list(dict.fromkeys([item for p, d in results for item in d.get('pros', [])]))[:5]
    all_cons = list(dict.fromkeys([item for p, d in results for item in d.get('cons', [])]))[:5]
    all_risks = list(dict.fromkeys([item for p, d in results for item in d.get('riskFactors', [])]))[:4]

    # 7. Build consensus
    consensus = dict(best_data)
    consensus['recommendation'] = winner_rec
    consensus['prediction'] = winner_pred
    consensus['confidence'] = avg_conf
    consensus['targetPrice'] = round(median_price, 2)
    if all_pros:
        consensus['pros'] = all_pros
    if all_cons:
        consensus['cons'] = all_cons
    if all_risks:
        consensus['riskFactors'] = all_risks

    return {"final_report": json.dumps(consensus)}


# Compile the LangGraph workflow once at import time
_mm_workflow = StateGraph(MultiModelState)
_mm_workflow.add_node("nvidia_fundamentalist", _nvidia_fundamentalist_node)
_mm_workflow.add_node("nvidia_quant", _nvidia_quant_node)
_mm_workflow.add_node("nvidia_risk", _nvidia_risk_node)
_mm_workflow.add_node("consensus", _consensus_node)
_mm_workflow.add_edge(START, "nvidia_fundamentalist")
_mm_workflow.add_edge(START, "nvidia_quant")
_mm_workflow.add_edge(START, "nvidia_risk")
_mm_workflow.add_edge("nvidia_fundamentalist", "consensus")
_mm_workflow.add_edge("nvidia_quant", "consensus")
_mm_workflow.add_edge("nvidia_risk", "consensus")
_mm_workflow.add_edge("consensus", END)
_multi_model_graph = _mm_workflow.compile()


def _call_multiple_models(system_prompt, user_prompt):
    try:
        result = _multi_model_graph.invoke({
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
        })
        return result.get("final_report", "")
    except Exception as e:
        print(f"[LangGraph Multi-Model] Error: {e}")
        return None
