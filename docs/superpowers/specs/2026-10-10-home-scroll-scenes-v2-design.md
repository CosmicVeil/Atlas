# Home Scroll Scenes Design, Version 2

This builds on branch `feat/home-scroll-scenes`, which already has the six scenes, the shared baseline, the pulsing buttons, the progress rail, the reduced-motion version and a passing browser check. Keep all of that. Version 2 changes three things:

1. **Longer transitions:** each hand-off between scenes gets its own stretch of scroll, about 70vh instead of about 16vh, and becomes a choreographed move rather than a quick crossfade.
2. **Boxes that move:** scenes no longer share one layout. The text box and the illustration box travel to new positions between scenes.
3. **More interaction:** every scene has at least two things a visitor can click, drag or hover that visibly change the illustration.

Sections marked *(v2)* are new or changed. Everything else is unchanged from version 1 and still applies.

## Goal

A visitor scrolls the home page and, in order:

1. Sees ATLAS fold down into a single horizontal line.
2. Watches that line become the baseline for six scenes, one per feature card, in grid order. Each scene illustrates its card's description and offers one pulsing button that opens the feature.
3. Reaches the existing feature grid, unchanged.

## Audience and job

Individual investors and students visiting Atlas for the first time. The intro's job is to show, concretely, what each feature does with sample data, then make the next step obvious.

## Visual system

The brief fixes the base look: black background, thin white type, white/5 borders. Everything below works inside it.

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#000000` | Page and stage background (same as `bg-black`) |
| Chalk | `#F5F5F2` | Headlines, figures, primary lines |
| Mist | `rgba(245,245,242,0.55)` | Descriptions and secondary text |
| Hairline | `rgba(255,255,255,0.05)` and `0.10` | Borders, grid lines, axes |
| Signal | `#9FB7FF` | Only the call-to-action buttons, their pulse and focus rings |
| Gain / Loss | `#5FBF93` / `#E07A6A` | Only inside charts, to mean up and down |

Signal is never used for data, and Gain/Loss are never used for buttons, so "click this" and "price went up" never look alike.

Type: keep the site's existing sans-serif family; add no web fonts. Use `font-light` for the scene headline (40px desktop, 28px mobile, tight tracking), 16px for descriptions at Mist, and `tabular-nums` for every figure so ticking numbers don't jitter. Sentence case everywhere. No all-caps labels, no numbered 01/02 markers, and no arrow characters appended to button text.

## The memorable element: one baseline

ATLAS folds down letter by letter until it is a single 1px Chalk line across the middle of the stage. That line stays on screen through all six scenes and is the thing each illustration grows from:

| Scene | What the baseline becomes |
| --- | --- |
| Portfolio | The x-axis of the value chart |
| Stock data | The candlestick time axis |
| AI analysis | The sweep line that scans the stock field |
| Advisor | The underline of the question being typed |
| Profile | The risk-tolerance slider track |
| Insights | The zero line of the best/worst bar chart |

Between scenes, the outgoing illustration retracts into the line and the next one grows out of it. This continuity is the one bold idea; keep everything around it quiet.

## Layout *(v2)*

Three layouts rotate through the scenes. Each scene element carries `data-intro-layout` with its layout's letter.

```
Layout A                         Layout B                         Layout C
+---------------------------+    +---------------------------+    +---------------------------+
| o                         |    | o                         |    | o  ┌─────────────────────┐ |
| o  Title       ┌────────┐ |    | o ┌────────┐  Title      |    | o  │  wide illustration  │ |
| ●  Text        │  art   │ |    | ● │  art   │  Text       |    | ●  └─────────────────────┘ |
| o  ((Button))  └────────┘ |    | o └────────┘  ((Button)) |    | o  ───────── baseline ──── |
| o  ──────── baseline ──── |    | o ──────── baseline ──── |    | o  Title   Text  ((Button))|
+---------------------------+    +---------------------------+    +---------------------------+
```

| Scene | Layout | Why |
| --- | --- | --- |
| Portfolio | A | Text first, then the portfolio rows |
| Stock data | B | The chart leads; text follows |
| AI analysis | C | The 1,000-dot field needs the full width |
| Advisor | A | The conversation reads left to right |
| Profile | B | The slider and chips sit beside the text |
| Insights | C | The best/worst bars need the full width |

Text stays left-aligned in every layout. The progress rail stays on the left edge throughout.

Mobile (below 768px) keeps one stacked layout (illustration, then text, then button) for every scene, so `data-intro-layout` may stay `A` there. No horizontal scrolling at 390px.

## Scenes

Each scene uses the card's exact title and description text, sample data (static, no API calls), and one button. The illustration is driven by scroll progress within that scene, so scrolling back up rewinds it.

| # | Feature | Illustration (scroll-scrubbed) | Button text | Route |
| --- | --- | --- | --- | --- |
| 1 | Portfolio Management: "Track multiple portfolios with real-time performance metrics and AI-driven insights." | Three portfolio rows (Retirement, Growth, Dividends) slide up from the baseline, each with a value counting up and a sparkline drawing. A value line draws along the baseline. A factual insight tag appears last, such as "Largest holding: NVDA, 18%". | Open portfolios | `/portfolio` |
| 2 | Stock Data Explorer: "Access comprehensive market data, historical charts, and real-time analytics." | Candlesticks grow left to right from the baseline, with volume bars under it. A crosshair scans across while an open/high/low/close readout updates. Timeframe chips (1D, 1M, 1Y) switch as the scene progresses. | Explore stock data | `/stock-data` |
| 3 | AI Market Analysis: "Daily analysis of top 1000 stocks with recommendations and risk assessment." | A field of 1,000 small dots (40 by 25) sits above the baseline. The baseline sweeps up through it; scanned dots resolve to buy, hold or sell shades while a counter reaches "1,000 stocks analysed". A shortlist of five tickers with Low, Medium or High risk labels slides out. | See today's analysis | `/ai-analysis` |
| 4 | Personal AI Advisor: "Custom stock analysis and recommendations based on your portfolio and budget." | A question types itself on the baseline ("How does AAPL fit my portfolio?"), then an analysis card builds above it: a one-line summary, two pros and two cons as short bars. | Ask about a stock | `/ai-analysis` |
| 5 | User Profile: "Manage preferences, risk tolerance, and investment goals in one place." | The baseline becomes a slider whose handle moves from Conservative to Growth. Goal chips (Retirement, House, Education) toggle on, and a currency control switches USD to EUR. | Open your profile | `/profile` |
| 6 | Market Insights: "Best and worst performing stocks with detailed AI-generated explanations." | The baseline is a zero line: green bars grow up for the best three tickers and red bars grow down for the worst three. The top row then expands and a one-sentence explanation types out. | View market insights | `/market-news` |

Keep sample copy factual. Atlas no longer shows personalized buy or sell advice, so tags and summaries describe data ("Largest holding: NVDA, 18%") rather than telling the visitor what to do.

## The call to action: a live beacon *(v3)*

Each scene's call to action is part of its illustration, not a separate button. A pulsing Signal beacon sits on the data point that matters most, and a dashed leader line runs from it to a small labelled link with the button text from the scene table. The beacon and the label both navigate. The label is the keyboard and screen-reader target; the beacon repeats it and stays out of the tab order.

| Scene | Beacon sits on | It moves when the visitor |
| --- | --- | --- |
| Portfolio | The tip of the value line | Selects a portfolio |
| Stock data | The latest candle's close | Switches 1D, 1M or 1Y |
| AI analysis | A highlighted stock in the dot field | Pins a different dot |
| Advisor | The end of the typed question | Picks a suggested question |
| Profile | An avatar whose ring fills with the risk setting | Moves the risk slider |
| Insights | The tip of the top gainer's bar | Picks a bar; the bar's percentage moves beside the beacon |

- Two staggered sonar rings expand from the beacon every 1.6 seconds while its scene is active. This is the only looping animation. Hovering or focusing the link pauses it; reduced motion shows a still ring instead.
- Positions come from `getCtaSpec` in `frontend/src/components/home/ctaSpec.js`, in the illustration's own units, so they stay inside the illustration at every size.
- `data-intro-cta` stays on the labelled link, so the browser check still finds and clicks it.

## Interaction *(v2)*

Every scene has at least two interactive elements besides its button. Each carries `data-intro-interactive` and changes the illustration visibly when used. Visitor input takes over from scroll for that element until the visitor scrolls into a different scene; scrolling still advances the page while the pointer is over an interactive element.

| Scene | Interactions |
| --- | --- |
| Portfolio | Clicking a portfolio row switches the value line and headline value to that portfolio. Hovering a row highlights its sparkline and shows its change since last month. |
| Stock data | The 1D, 1M and 1Y chips are buttons that redraw the candles. Moving the pointer over the chart moves the crosshair and updates the open/high/low/close readout. |
| AI analysis | Clicking a shortlist ticker expands a one-line note on its risk label. Hovering the dot field shows the sample ticker under the pointer. |
| Advisor | Three suggested questions are chips; clicking one types that question on the baseline and builds its matching answer card. |
| Profile | The risk slider can be dragged, and moved with the arrow keys when focused. Goal chips toggle on click. A currency switch (USD, EUR, GBP) changes a sample portfolio value. |
| Insights | Clicking or hovering a bar expands that ticker's one-sentence explanation. |

- The art box tilts gently toward the pointer on desktop (at most 4 degrees, eased). Turn this off for touch devices and reduced motion.
- Every interactive element is a real `button` (or a slider with `role="slider"` and `aria-valuenow`), focusable with a visible focus ring, and usable with the keyboard.
- Interactive elements and buttons accept pointer events while their scene is visible, even if the stage itself ignores pointer events.
- In the reduced-motion version, the interactions still work, without animated transitions.

## Scroll and timing *(v2)*

- Scroll budget: about 70vh for the title fold, about 100vh to hold each scene, about 70vh for each of the five transitions, and about 50vh to release the stage. That's roughly 1,070vh in total. Keep the constants in one place (`introPhases.js`) so they are easy to tune.
- Each transition plays in three beats, all scrubbed by scroll so scrolling back up rewinds them:
  1. **Retract (first third):** the outgoing illustration folds back into the baseline, and the outgoing headline, description and button slide out along the baseline and fade. Nothing from the incoming scene is visible yet.
  2. **Travel (middle third):** the baseline moves to the incoming layout's position and length. The empty text and art boxes glide to their new positions, so a visitor sees the layout rearrange. This is the "boxes moving around" moment.
  3. **Grow (last third):** the incoming illustration grows out of the baseline. Its headline, description and button slide in from the opposite direction.
- At no point are two headlines visible on top of each other. Version 1's screenshots showed overlapping copy during hand-offs; version 2 must not.
- Keep version 1's scroll-progress approach (`useIntroProgress.js`), which works. Animate only `transform`, `opacity` and SVG `pathLength`. Box travel uses transforms, not layout properties.

## Reduced motion

With `prefers-reduced-motion: reduce`, drop the pinned sequence entirely. Show the six scenes as a simple vertical list of their final frames, each with its title, description and button (no pulse; a static Signal ring instead), followed by the feature grid. The wrapper must not be taller than one and a half viewports.

## Test contract *(v2)*

The workflow's browser check relies on these attributes. Keep them exactly:

| Attribute | Element |
| --- | --- |
| `data-home-intro` | The tall scroll wrapper (present in both motion modes) |
| `data-intro-title` | The ATLAS title element |
| `data-intro-scene="<key>"` | Each scene: `portfolio`, `stock-data`, `ai-analysis`, `advisor`, `profile`, `insights` |
| `data-intro-layout="A"`, `"B"` or `"C"` | On each scene element (desktop), following the layout table |
| `data-intro-heading` | Each scene's headline |
| `data-intro-copy` | Each scene's text box (headline, description, button) |
| `data-intro-art` | Each scene's illustration box |
| `data-intro-cta` | The button inside each scene |
| `data-intro-interactive` | Each interactive element; use `data-intro-interactive="slider"` for the risk slider |

The browser check scrolls the page in 120 steps and fails if:

- Any of version 1's conditions fail (scenes in order, buttons visible and navigating, ATLAS gone before the first scene, reduced motion not pinned, no sideways scrolling at 390px, no console errors).
- The wrapper is shorter than nine viewports.
- Fewer than four scroll steps separate one scene being fully shown from the next scene being fully shown.
- Two headlines are visible and overlapping at the same time.
- Fewer than three distinct `data-intro-layout` values are used, or a scene's text box sits in the same place as the previous scene's.
- A scene has fewer than two `data-intro-interactive` elements, or using the first one (click, or the arrow key for a slider) changes nothing in the scene, or changes the page's URL.

Add node:test checks in `frontend/tests` for the layout table, the transition timing constants and each scene's interactions.

## Scope

In scope: `frontend/src/pages/Home.jsx` and `frontend/src/components/home/` (rework freely), and tests in `frontend/tests`.

Out of scope: the backend, other pages, the Navbar, routing, `package.json` and new dependencies, and changes to the feature grid below the intro.
