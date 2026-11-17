# Home Scroll Scenes Design

Rework the scroll-driven intro on the Atlas home page. The first version (branch `feat/home-scroll-intro`) has the right structure, but scrolling does not advance it: the stage freezes with the ATLAS title half-folded and no feature scene ever appears. This version keeps the structure, fixes the scroll, and makes each scene clearly show what its feature does, with an obvious button to open it.

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

## Layout

Desktop (1024px and wider): a pinned full-viewport stage. Text on the left, illustration on the right, both left-aligned, sharing the baseline.

```
+--------------------------------------------------------------+
|  o                                                           |
|  o   Portfolio Management          ┌───────────────────────┐ |
|  ●   Track multiple portfolios     │  illustration          │ |
|  o   with real-time performance    │                        │ |
|  o   metrics and AI-driven         │                        │ |
|  o   insights.                     │                        │ |
|      ((Open portfolios))           │                        │ |
|  ────────────────────────────── baseline ─────────────────── |
+--------------------------------------------------------------+
```

The column of `o` marks is the progress rail: six small lucide icons (the same icons the grid uses), with the active one in Chalk and the rest at Mist. Clicking an icon scrolls to that scene. No numbers.

Mobile (below 768px): illustration on top (about 45% of the viewport height), then headline, description and button. No horizontal scrolling at 390px.

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

## The pulsing call to action

Each scene has exactly one button, the most noticeable thing in the scene:

- A real link (a router `Link`) with the button text from the table, in Chalk on a 1px Signal border, with a soft Signal glow.
- A sonar pulse: a Signal ring expands outward from the button and fades, every 1.6 seconds, continuously while the scene is active. This is the only looping animation on the page.
- Hover and keyboard focus brighten the border to full Signal and pause the pulse. The focus ring is clearly visible.
- The button stays clickable while its scene is on screen. The stage itself may ignore pointer events, but the buttons and progress icons must not.
- Tabbing to a scene's button scrolls the page so that scene is active.

## Scroll and timing

- Make the scroll section tall enough to read each scene: about 60vh for the title fold, about 110vh per scene, and about 40vh to release the stage, roughly 760vh in total.
- Scroll progress must actually drive the scenes. The first version froze because its progress value never updated. Fix the root cause; don't just retune numbers. The app's root containers use `overflow-hidden`, which breaks `position: sticky`. Either compute progress yourself from the wrapper's position (a passive scroll listener throttled with `requestAnimationFrame`, writing a `motion` value) or switch only the containers that need it to `overflow-x: clip`. Verify in a real browser.
- Hand-offs: the outgoing scene retracts into the baseline over the last 15% of its range while the next grows out of it. No hard cuts.
- After the sixth scene the stage releases, the baseline fades, and the existing feature grid scrolls into view unchanged.
- Animate only `transform`, `opacity` and SVG `pathLength`. No layout-changing properties per frame.

## Reduced motion

With `prefers-reduced-motion: reduce`, drop the pinned sequence entirely. Show the six scenes as a simple vertical list of their final frames, each with its title, description and button (no pulse; a static Signal ring instead), followed by the feature grid. The wrapper must not be taller than one and a half viewports.

## Test contract

The workflow's browser check relies on these attributes. Keep them exactly:

| Attribute | Element |
| --- | --- |
| `data-home-intro` | The tall scroll wrapper (present in both motion modes) |
| `data-intro-title` | The ATLAS title element |
| `data-intro-scene="<key>"` | Each scene, keys `portfolio`, `stock-data`, `ai-analysis`, `advisor`, `profile`, `insights` |
| `data-intro-cta` | The button inside each scene |

The browser check scrolls the page in 60 steps and fails if any of these are true:

- A scene never becomes fully visible.
- The scenes don't appear in grid order.
- A scene's button isn't visible while its scene is.
- ATLAS is still visible when the first scene appears.
- A button doesn't navigate to its route. Protected pages may redirect to `/login`.
- The reduced-motion version is still pinned.
- The page scrolls sideways at 390px.
- The home page logs console errors.

Screenshots of every scene go to the reviewer. Also add node:test checks in `frontend/tests` for the scene list, routes and button text, and for the reduced-motion path.

## Scope

In scope: `frontend/src/pages/Home.jsx` and `frontend/src/components/home/` (rework the existing files freely), tests in `frontend/tests`, and, only if needed for the scroll fix, changing `overflow-hidden` to `overflow-x-clip` on the home page and app root containers.

Out of scope: the backend, other pages, the Navbar, routing, `package.json` and new dependencies, and changes to the feature grid below the intro.
