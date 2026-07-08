# Portfolio and Sell Component Props

Handoff spec for Issue `#5`, broken into component-level props for the frontend engineer. This doc is intentionally implementation-facing: it defines the data each component needs, the events it must emit, and the copy/state rules that come from the PRD and wireframes.

## Scope

This covers:

- Market-detail sell sidebar
- Empty and disabled sell states
- Portfolio page layout
- Group headers
- Lot rows
- Locked-share display
- Sell-all confirmation dialog
- Expand/collapse accessibility
- Error and success messaging

This does not redefine backend behavior. It assumes the backend will provide:

- A positions list with lots grouped by market and outcome
- Per-lot `committedShares`
- Current `bestBid` for sell value calculation
- Sell endpoints for one lot and sell-all

## Shared Data Contracts

These are the view-model shapes the frontend should consume after fetching backend data.

```ts
export type PositionLotView = {
  id: string;
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  status: "OPEN" | "WON" | "LOST" | "VOIDED" | "SOLD";
  stake: string;
  shares: string;
  committedShares: string;
  availableShares: string;
  entryPrice: string;
  purchasedAt: string;
  exitPrice?: string;
  exitedAt?: string;
};

export type PositionGroupView = {
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  status: PositionLotView["status"];
  lots: PositionLotView[];
  totalStake: string;
  totalShares: string;
  committedShares: string;
  availableShares: string;
  averageEntryPrice: string;
  currentSellValue?: string;
  realizedPoints?: string;
  bestBid?: string | null;
  marketClosed?: boolean;
};
```

Frontend-owned derived fields:

- `currentSellValue` should be computed from available shares and `bestBid`.
- `realizedPoints` only applies to settled groups.
- `availableShares` should never go negative; if it does, treat it as a backend contract bug.

## 1. Market Detail Sell Sidebar

### Component

`<MarketSellPanel />`

### Props

```ts
type MarketSellPanelProps = {
  marketId: string;
  marketQuestion: string;
  outcomeLabel: string;
  bestBid: string | null;
  marketClosed: boolean;
  priceLastSyncedAt?: string;
  group: PositionGroupView | null;
  sellState: SellState;
  onSellLot: (lotId: string) => Promise<void>;
  onSellAll: (groupId: string) => Promise<void>;
  onOpenSellAllConfirm: () => void;
};
```

### Behavior

- Show the current sell price first.
- If a group exists, show the grouped position summary and lot list.
- If no position exists, show the empty state for this market/outcome.
- If the market is closed, the panel becomes read-only.
- If `bestBid` is null, the panel is disabled and explains why.

### Sell states

```ts
type SellState =
  | { kind: "sellable" }
  | { kind: "no-position" }
  | { kind: "all-locked" }
  | { kind: "market-closed" }
  | { kind: "price-unavailable" }
  | { kind: "loading" }
  | { kind: "error"; message: string };
```

### Required copy

- `Sell at`
- `Current value if sold now`
- `Sell lot`
- `Sell all available`
- `This market is closed.`
- `No available shares to sell.`
- `All shares are locked into parlays.`
- `Current sell price is unavailable.`

## 2. Sell Panel Empty / Disabled States

### Component

`<SellPanelState />`

### Props

```ts
type SellPanelStateProps = {
  kind: SellState["kind"];
  availableShares?: string;
  lockedShares?: string;
  reason?: string;
};
```

### Rules

- `no-position`: show the prompt to buy first.
- `all-locked`: show that shares exist, but all sellable shares are committed.
- `market-closed`: show read-only state and no action buttons.
- `price-unavailable`: show a muted warning, not an error toast.
- `loading`: use skeletons or placeholder blocks, not a spinner.

## 3. Portfolio Page Overall Layout

### Component

`<PortfolioPage />`

### Props

```ts
type PortfolioPageProps = {
  openGroups: PositionGroupView[];
  settledGroups: PositionGroupView[];
  activeParlays: Array<{
    id: string;
    name: string;
    statusLabel: string;
    activeLegLabel: string;
    href: string;
  }>;
  balance: number;
  loading?: boolean;
};
```

### Layout rules

- If the bankruptcy stipend was granted for the current UTC day, show a dismissible `StipendNotice` above the open positions section.
- Primary section order: `Open positions`, `Settled positions`, `Your parlays`.
- Desktop uses tables or table-like rows.
- Mobile uses grouped cards with the same semantic order.
- No global summary hero and no marketing-style framing.

## 4. Group Header Content Spec

### Component

`<PositionGroupRow />`

### Props

```ts
type PositionGroupRowProps = {
  group: PositionGroupView;
  expanded: boolean;
  onToggleExpanded: (groupId: string) => void;
  onSellAll?: (groupId: string) => void;
  onSellLot?: (lotId: string) => void;
  canSellAll: boolean;
  canSellLots: boolean;
  showRealizedResult?: boolean;
};
```

### Required visible fields

- Market question
- Outcome label
- Average entry price
- Total shares
- Locked shares
- Available shares
- Current value if sold now, or realized points if settled

### Header action rules

- Open groups can expose `Sell all`.
- Settled groups do not show sell actions.
- The expand control is part of the header row, not a separate floating control.

## 5. Lot Row Content Spec

### Component

`<PositionLotRow />`

### Props

```ts
type PositionLotRowProps = {
  lot: PositionLotView;
  showSellAction: boolean;
  onSell: (lotId: string) => void;
  sellLabel?: string;
};
```

### Required visible fields

- Purchased at
- Entry price
- Shares
- Locked shares
- Available shares
- Exit price and exit time when settled

### Rules

- Show one row per purchase lot.
- Do not merge lot history into a single synthetic row.
- `Sell lot` appears only when `availableShares > 0` and the market is open.

## 6. Locked-Share Visual Treatment

### Component

`<LockedShareValue />`

### Props

```ts
type LockedShareValueProps = {
  lockedShares: string;
  availableShares: string;
  className?: string;
};
```

### Visual rules

- Use a lock icon or lock badge, not color alone.
- Locked shares should stay legible, but visually quieter than sellable shares.
- The text must make it obvious that locked shares are excluded from sell calculations.
- Do not hide locked shares behind hover-only disclosure.

## 7. Sell-All Confirmation Dialog

### Component

`<SellAllDialog />`

### Props

```ts
type SellAllDialogProps = {
  open: boolean;
  group: PositionGroupView | null;
  availableShares: string;
  lotCount: number;
  estimatedValue: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  pending?: boolean;
  errorMessage?: string | null;
};
```

### Required copy

- `Sell all available shares?`
- `You will sell X purchases of this position, Y available shares total, at the current sell price.`
- `Shares locked into parlays are not included.`
- Primary action: `Sell all available`

### Dialog behavior

- It must trap focus.
- It must return focus to the triggering button on close.
- It must not let the user confuse this with per-lot sell.

## 8. Accessibility Spec

### Component

`<ExpandableGroupHeader />`

### Props

```ts
type ExpandableGroupHeaderProps = {
  groupId: string;
  expanded: boolean;
  onToggle: (groupId: string) => void;
  label: string;
  detailsId: string;
};
```

### Requirements

- `aria-expanded` on the toggle button.
- `aria-controls` pointing to the expanded content container.
- Stable ids for the header and detail region.
- Focus stays on the toggle after expand/collapse.
- Disabled sell controls need an explicit reason in text, not just visual dimming.

### Confirmation dialog rules

- Focus moves into the dialog on open.
- Focus returns to the invoker on close.
- The scope of the action is part of the accessible description.

## 9. Sell Error / Success Messaging

### Component

`<SellFeedback />`

### Props

```ts
type SellFeedbackProps = {
  state: "idle" | "success" | "error";
  soldShares?: string;
  creditedPoints?: string;
  errorCode?:
    | "NO_AVAILABLE_SHARES"
    | "SHARES_LOCKED"
    | "MARKET_CLOSED"
    | "PRICE_UNAVAILABLE"
    | "POSITION_NOT_FOUND"
    | "UNKNOWN";
};
```

### Copy mapping

- Success: `Sold X available shares for Y pts.`
- `NO_AVAILABLE_SHARES`: `No available shares to sell.`
- `SHARES_LOCKED`: `These shares are locked into parlays.`
- `MARKET_CLOSED`: `This market is closed.`
- `PRICE_UNAVAILABLE`: `Current sell price is unavailable.`
- `POSITION_NOT_FOUND`: `You do not own this position.`
- `UNKNOWN`: `Sell failed. Try again.`

## 10. Backend Handshake

The frontend engineer should expect these backend responses:

- `GET /api/positions` returns open and settled lots with `committedShares`, `availableShares`, and enough market data to compute sell values.
- `GET /api/markets/:marketId` or the market-detail page query returns `bestBid` and `marketClosed`.
- `POST /api/positions/:id/sell` returns the sold lot, updated balance, and credited points.
- `POST /api/positions/sell-all` returns the affected lot ids, total available shares sold, and credited points.

Frontend should not infer sellability from client-only state. If the backend says a lot is locked, the UI must treat it as locked.

## 11. Implementation Order

Recommended build order for the frontend engineer:

1. Wire the data model and portfolio page layout.
2. Build group headers and expandable lot rows.
3. Add sell action states and locked-share treatment.
4. Add sell-all dialog and success/error feedback.
5. Reuse the same group-row model in the market-detail sidebar.
