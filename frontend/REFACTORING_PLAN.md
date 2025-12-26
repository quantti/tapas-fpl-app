# Frontend Architecture Refactoring Plan

**Project:** Tapas FPL App
**Date:** 2025-12-25
**Status:** Ready for Implementation
**Last Updated:** 2025-12-26 (Added new components: PitchLayout, LeagueTemplateTeam)

---

## Executive Summary

The current frontend has **21 components** with code duplication. Following the [Functional vs Feature Components](https://dev.to/luke/functional-components-vs-feature-components-1cjd) pattern, we should separate:

- **UI Components** (reusable, function-specific) - Serve predictable, repeatable needs
- **Feature Components** (domain-specific) - Tied to FPL business logic

### Verified Duplication (Expert Analysis)

| Pattern | Originally Estimated | Verified Actual |
|---------|---------------------|-----------------|
| Card container + title | ~400 CSS | **~154 CSS** |
| Ranked row | ~100 CSS | **~90 CSS** |
| Clickable row + chevron | ~60 CSS | **~66 CSS** |
| Loading/error states | ~150 TSX | **~85 TSX** |
| **Total** | ~950 lines | **~395 lines** |

**Note:** Original estimates were ~60% higher than verified actual. Plan has been revised accordingly.

---

## Current State Analysis

### Directory Structure (Before)

```
src/
├── components/           # 21 files, mixed concerns
│   ├── BenchPoints.tsx
│   ├── CaptainSuccess.tsx
│   ├── CaptainDifferentialModal.tsx
│   ├── ChipsRemaining.tsx
│   ├── FixturesTest.tsx          # Debug/test component
│   ├── GameweekCountdown.tsx
│   ├── GameweekDetails.tsx
│   ├── Header.tsx
│   ├── LeaguePositionChart.tsx
│   ├── LeagueStandings.tsx
│   ├── LeagueTemplateTeam.tsx    # NEW: Most owned starting XI
│   ├── ManagerModal.tsx
│   ├── Modal.tsx
│   ├── PitchLayout.tsx           # NEW: Extracted from ManagerModal
│   ├── PlayerOwnership.tsx
│   ├── PlayerOwnershipModal.tsx
│   ├── RecommendedPlayers.tsx
│   ├── StatsCards.tsx
│   └── ThemeToggle.tsx
├── hooks/                # Domain-specific hooks
├── views/                # 3 page components
├── services/             # API layer
├── types/                # TypeScript types
└── utils/                # Utilities
```

### Unit Test Coverage (Before Refactoring)

| Component | Has Unit Tests | Test Count |
|-----------|----------------|------------|
| GameweekCountdown | ✅ | 5 |
| PlayerOwnership | ✅ | 13 |
| BenchPoints | ❌ | - |
| CaptainSuccess | ❌ | - |
| ChipsRemaining | ❌ | - |
| StatsCards | ❌ | - |
| RecommendedPlayers | ❌ | - |
| LeagueTemplateTeam | ❌ | - |
| PitchLayout | ❌ | - |

**Hooks/Utils tested:** useTheme (8), useLiveScoring (12), liveScoring utils (19)
**Total:** 57 tests passing

**Safety net:** E2E snapshot tests cover visual regressions.

---

## Verified Duplication Patterns

### Pattern 1: Card Container + Title (HIGH PRIORITY)

**Verified in 7 components:**
- `BenchPoints.module.css` (lines 1-5, 7-17)
- `CaptainSuccess.module.css` (lines 1-5, 7-17)
- `PlayerOwnership.module.css` (lines 1-5, 7-17)
- `ChipsRemaining.module.css` (lines 1-5, 8-14)
- `StatsCards.module.css` (lines 11-18, 20-30)
- `RecommendedPlayers.module.css` (lines 11-18, 32-42)
- `LeaguePositionChart.module.css` (lines 1-5, 13-23)

**Duplicated CSS (~154 lines):**
```css
/* Card root - 5 lines × 7 components = 35 lines */
.ComponentName {
  background: var(--color-background);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-16);
}

/* Title - 10 lines × 6 components = 60 lines */
.title {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 var(--space-12) 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* List container - 4 lines × 6 components = 24 lines */
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

**Solution:** Extract `<Card>` and `<CardHeader>` components.

---

### Pattern 2: Ranked List Row (HIGH PRIORITY)

**Verified in 4 components:**
- `BenchPoints.module.css` (lines 33-60)
- `CaptainSuccess.module.css` (lines 55-71)
- `StatsCards.module.css` (lines 38-66)
- `GameweekDetails.module.css` (lines 187-214)

**Duplicated CSS (~90 lines):**
```css
.row {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-4) 0;
  font-size: var(--font-size-sm);
}

.rank {
  width: 20px;
  color: var(--color-text-muted);
  font-weight: 500;
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.value {
  font-weight: 600;
  flex-shrink: 0;
}
```

**Solution:** Extract `<RankedRow>` component.

---

### Pattern 3: Clickable Row with Chevron (MEDIUM PRIORITY)

**Verified in 2 components:**
- `CaptainSuccess.module.css` (lines 25-53)
- `PlayerOwnership.module.css` (lines 80-115)

**Duplicated CSS (~66 lines):**
```css
.rowClickable {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-4) var(--space-8);
  margin: 0 calc(-1 * var(--space-8));
  width: calc(100% + var(--space-16));
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--color-surface-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  &:hover .chevron {
    transform: translateX(2px);
  }
}

.chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform 0.15s ease;
}
```

**Solution:** Extract `<ListRowButton>` component.

---

### Pattern 4: Loading/Error/Empty States (LOWER PRIORITY)

**Verified in 6 components** with two distinct patterns:

**A) Inline conditional (BenchPoints, CaptainSuccess, LeaguePositionChart):**
```tsx
{loading && <p className={styles.loading}>Loading...</p>}
{!loading && error && <p className={styles.error}>{error}</p>}
{!loading && !error && <Content />}
```

**B) Early return (RecommendedPlayers, ManagerModal, FixturesTest):**
```tsx
if (loading) return <LoadingState />
if (error) return <ErrorState />
return <Content />
```

**Actual duplication: ~85 TSX lines** (not 150 as originally estimated)

**Note:** Components have computed empty states (e.g., `totalDifferentialPicks === 0`), not just `data.length === 0`. A wrapper component would need to be flexible.

**Solution:** Defer to future consideration. Current patterns work well.

---

## Proposed Architecture

### Directory Structure (After)

**Simplified structure** - avoid over-engineering for 18 components:

```
src/
├── components/
│   ├── ui/                      # Reusable UI primitives only
│   │   ├── Card.tsx
│   │   ├── Card.module.css
│   │   ├── CardHeader.tsx
│   │   ├── CardHeader.module.css
│   │   ├── RankedRow.tsx
│   │   ├── RankedRow.module.css
│   │   ├── ListRowButton.tsx
│   │   ├── ListRowButton.module.css
│   │   ├── Modal.tsx            # (moved from root)
│   │   ├── Modal.module.css
│   │   ├── ThemeToggle.tsx      # (moved from root)
│   │   ├── ThemeToggle.module.css
│   │   ├── PitchLayout.tsx      # NEW: Reusable pitch visualization
│   │   └── PitchLayout.module.css
│   │
│   ├── BenchPoints.tsx          # Feature components stay flat
│   ├── CaptainSuccess.tsx
│   ├── ChipsRemaining.tsx
│   ├── ... (other feature components)
│   │
├── views/                       # (unchanged)
├── hooks/                       # (unchanged)
├── services/                    # (unchanged)
├── types/                       # (unchanged)
└── utils/                       # (unchanged)
```

**Rationale:** Feature folder structure (`features/standings/`, `features/stats/`) is over-engineering for this codebase size. Keep domain components flat until the project grows significantly.

---

## UI Component Specifications

### 1. `<Card>` - Simple Wrapper

**API Design:**
```tsx
<Card>
  <CardHeader icon={<Armchair />}>Bench Points</CardHeader>
  <div className={styles.list}>
    {items.map(item => <RankedRow key={item.id} {...item} />)}
  </div>
</Card>

// With scrollable content
<Card scrollable maxHeight={400}>
  <CardHeader icon={<Users />}>Player Ownership</CardHeader>
  <div className={styles.list}>{/* content */}</div>
</Card>
```

**Props:**
```typescript
interface CardProps {
  children: React.ReactNode
  className?: string
  scrollable?: boolean
  maxHeight?: number
}
```

---

### 2. `<CardHeader>` - Title with Icon

**API Design:**
```tsx
<CardHeader icon={<Crown size={16} />}>Differential Captains</CardHeader>
<CardHeader icon={<Crown size={16} />} action={<InfoTooltip />}>
  Differential Captains
</CardHeader>
```

**Props:**
```typescript
interface CardHeaderProps {
  icon?: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode  // Optional right-side action
}
```

---

### 3. `<RankedRow>` - Ranked List Item

**API Design:**
```tsx
<RankedRow rank={1} name="Manager Name" value="100 pts" />
<RankedRow rank={2} name="Manager Name" value={-12} valueColor="error" />
<RankedRow rank={3} name="Manager Name">
  <CustomValue />
</RankedRow>
```

**Props:**
```typescript
interface RankedRowProps {
  rank: number
  name: string
  value?: string | number
  valueColor?: 'default' | 'success' | 'warning' | 'error'
  children?: React.ReactNode  // Custom value content
}
```

---

### 4. `<ListRowButton>` - Clickable List Row

**API Design:**
```tsx
<ListRowButton onClick={() => openModal(id)}>
  <span className={styles.name}>{name}</span>
  <span className={styles.value}>{value}</span>
</ListRowButton>
```

**Props:**
```typescript
interface ListRowButtonProps {
  onClick: () => void
  children: React.ReactNode
  className?: string
}
```

**Features:**
- Hover background transition
- Focus-visible outline
- Animated chevron icon (auto-included)
- Accessible button semantics

---

## Implementation Phases

### Phase 1: UI Primitives (DO FIRST)

| Task | Saves | Priority |
|------|-------|----------|
| Create `ui/Card.tsx` + `Card.module.css` | ~35 CSS | High |
| Create `ui/CardHeader.tsx` + `CardHeader.module.css` | ~60 CSS | High |
| Create `ui/RankedRow.tsx` + `RankedRow.module.css` | ~90 CSS | High |
| Create `ui/ListRowButton.tsx` + `ListRowButton.module.css` | ~66 CSS | Medium |
| Add unit tests for new UI components | - | Required |

**Total estimated savings: ~250 CSS lines**

---

### Phase 2: Feature Migration (ONE AT A TIME)

Migrate in this order (simplest to most complex):

| Order | Component | Uses | Test Coverage |
|-------|-----------|------|---------------|
| 1 | BenchPoints | Card, CardHeader, RankedRow | E2E snapshots |
| 2 | StatsCards | Card, CardHeader, RankedRow | E2E snapshots |
| 3 | ChipsRemaining | Card, CardHeader | E2E snapshots |
| 4 | CaptainSuccess | Card, CardHeader, RankedRow, ListRowButton | E2E snapshots |
| 5 | PlayerOwnership | Card, CardHeader, ListRowButton | Unit + E2E |
| 6 | LeaguePositionChart | Card, CardHeader | E2E snapshots |

**After each migration:**
1. Run `npm run css:types` to regenerate CSS types
2. Run `npm test` to verify unit tests pass
3. Run `npm run test:e2e:docker` to verify visual regressions
4. Update snapshots if intentional visual changes occurred

---

### Phase 3: Cleanup

| Task | Impact |
|------|--------|
| Move `Modal.tsx` to `ui/Modal.tsx` | Organization |
| Move `ThemeToggle.tsx` to `ui/ThemeToggle.tsx` | Organization |
| Delete unused CSS from migrated components | ~250 lines removed |

---

## Testing Strategy

### Before Implementation

**Current coverage:**
- 57 unit tests passing
- E2E snapshots for all pages (dashboard, statistics, analytics)
- `PlayerOwnership.test.tsx` provides component testing pattern

### During Implementation

**For new UI components (Card, CardHeader, RankedRow, ListRowButton):**

```tsx
// Example: RankedRow.test.tsx
describe('RankedRow', () => {
  it('renders rank, name, and value', () => {
    render(<RankedRow rank={1} name="Test" value="100" />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('applies value color class', () => {
    render(<RankedRow rank={1} name="Test" value={-12} valueColor="error" />)
    expect(screen.getByText('-12')).toHaveClass('error')
  })

  it('renders custom children instead of value', () => {
    render(<RankedRow rank={1} name="Test"><span>Custom</span></RankedRow>)
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })
})
```

### After Migration

- E2E snapshots verify no visual regressions
- If snapshots change, review and update with `npm run test:e2e:docker:update`

---

## Success Metrics

| Metric | Before | Target | Notes |
|--------|--------|--------|-------|
| CSS duplication | ~310 lines | ~60 lines | ~250 lines saved |
| TSX duplication | ~85 lines | ~85 lines | Defer AsyncDataView |
| UI component tests | 0 | 12+ | New tests for primitives |
| UI components | 3 (Modal, ThemeToggle, PitchLayout) | 7 | +Card, CardHeader, RankedRow, ListRowButton |

---

## Future Considerations

These items are **deferred** for now but should be revisited as the project grows:

### 1. Feature Folder Structure

When component count exceeds ~30, consider:
```
src/components/features/
├── standings/
├── stats/
├── gameweek/
└── manager/
```

**Trigger:** Adding new major features or reaching 30+ components.

### 2. AsyncDataView Wrapper

A generic loading/error wrapper component:
```tsx
<AsyncDataView loading={loading} error={error}>
  {isEmpty ? <EmptyState /> : <Content />}
</AsyncDataView>
```

**Trigger:** Adding more async components with similar patterns.

### 3. Path Aliases

Add TypeScript path aliases for cleaner imports:
```json
{
  "paths": {
    "@/components/*": ["src/components/*"],
    "@/hooks/*": ["src/hooks/*"]
  }
}
```

**Trigger:** Deep nesting or frequent cross-directory imports.

### 4. Barrel Exports

Add `index.ts` files for cleaner imports:
```typescript
// src/components/ui/index.ts
export { Card } from './Card'
export { CardHeader } from './CardHeader'
export { RankedRow } from './RankedRow'
```

**Trigger:** Multiple imports from same directory becoming repetitive.

### 5. Additional UI Components

**Already extracted:**
- `<PitchLayout>` - Reusable pitch visualization (used by LeagueTemplateTeam; ManagerModal still uses inline pitch)

**Extract when second use case emerges:**
- `<PositionBadge>` - Currently only in RecommendedPlayers
- `<InfoTooltip>` - Currently only in RecommendedPlayers
- `<Badge>` - Chip badges, hit badges (GameweekDetails, ChipsRemaining)

### 6. Storybook

Add component documentation and visual testing:
```bash
npx storybook@latest init
```

**Trigger:** Onboarding new developers or needing isolated component development.

### 7. React 19 Features

When upgrading to React 19, consider:
- `useActionState` for form handling
- `useOptimistic` for optimistic UI updates
- React Compiler for automatic memoization (removes need for useMemo/useCallback)

---

## References

- [Functional Components vs Feature Components](https://dev.to/luke/functional-components-vs-feature-components-1cjd)
- [React Folder Structure in 5 Steps (2025)](https://www.robinwieruch.de/react-folder-structure/)
- [Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure)
- [React 19 Official Blog](https://react.dev/blog/2024/12/05/react-19)
- [React Component Architecture Best Practices](https://rtcamp.com/handbook/react-best-practices/component-architecture/)

---

## Next Steps

1. ✅ **Expert review completed** - Estimates verified, plan revised
2. ✅ **PitchLayout extracted** - Reusable pitch component created for LeagueTemplateTeam
3. **Refactor ManagerModal** - Migrate to use shared PitchLayout component
4. **Create branch** - `refactor/ui-components`
5. **Phase 1** - Create Card, CardHeader, RankedRow, ListRowButton with tests
6. **Phase 2** - Migrate BenchPoints first (simplest use case)
7. **Iterate** - One component at a time, verify with E2E snapshots
