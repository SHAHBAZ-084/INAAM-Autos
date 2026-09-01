# INAAM Autos Dashboard — Design Plan

## Color
Reuse existing red (#C8102E), black (#0A0A0A / #111), off-white (#F4F4F4) tokens from `theme.css`.
New derived variables only where needed (both light/dark):
- `--dashboard-hero-bg` — dark command-surface (connects visually to nav / quick-actions)
- `--dashboard-hero-border` — red accent edge on the command zone
- `--dashboard-hero-text` / `--dashboard-hero-muted` — legible text on dark hero
- `--dashboard-collection-bg` — tinted strip for payment collection (subordinate to hero)
- `--dashboard-section-bg` — flat inset surface for charts/tables inside “More details”

No new hex in TSX; all via CSS variables.

## Type
App uses **Inter** (system-ui stack in `index.css`); no new font imports.
Scale:
| Role | Size / weight |
|------|----------------|
| Hero KPI value | 1.75–2rem, bold, tabular-nums |
| Secondary KPI value | 1.125rem, semibold |
| Section heading | 0.9375rem, semibold (sentence case) |
| KPI / body label | 0.8125rem, medium |
| Muted helper | 0.75rem, regular |

Avoid ALL-CAPS labels and tracked-out eyebrows.

## Layout
1. **Command hero** (single dark band): Period picker + 5 KPIs — one “at a glance” moment, not three equal white cards.
2. **Featured metric**: Net Sales (or period sales label) is visually dominant (hero tile); other four KPIs are smaller gauge-style tiles in the same band.
3. **Collection strip**: “How sales were collected” — flat tinted band below hero, lighter weight than a Panel card.
4. **More details**: Collapsible flat section; inside it, metric grid + charts/tables use inset panels (less shadow, clearer nesting).

## Principles — INAAM Autos / workshop feel
- Bold numerals like gauge readouts; red reserved for signal (active period, accent bar, primary CTA path).
- Dark command zone echoes sidebar + quick-actions chrome (automotive dashboard energy).
- Differentiate sections by **contrast and size**, not identical rounded white boxes.
- No “View details →” on every tile; link hint only on hover where needed.
- No decorative arrows on every link.

## Anti-patterns avoided
- Identical `Panel` + shadow stack for every block
- Left-border as sole accent
- ALL-CAPS / eyebrow labels
- Arrow suffix on every link
