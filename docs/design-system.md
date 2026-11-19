# Design System — White, Black, Blue

**Parent design:** [`design.md`](./design.md)
**Status:** Design contract. No components have been built.

## 1. Principles

1. **White is the canvas.** Content sits on white; pale blue-gray surfaces create grouping without noise.
2. **Black is structure.** Typography, borders, and high-emphasis non-primary actions are black.
3. **Blue is action.** Blue marks the thing to do, the selected state, or the present state. It is not decoration.
4. **One primary action per view.** The save/confirm action is obvious; everything else is secondary or ghost.
5. **Status is never color alone.** Every Present/Absent/error state has a label and an icon.
6. **Calm over clever.** No gradients, glass effects, or auto-playing motion. The register must be fast to read at a glance.

## 2. Color Tokens

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#FFFFFF` | Page background, input background |
| `--color-surface` | `#F8FAFC` | Cards, table headers, secondary panels |
| `--color-primary-soft` | `#DBEAFE` | Selected row, active nav background, info surface |
| `--color-ink` | `#0A0A0A` | Primary text, black buttons, borders |
| `--color-ink-muted` | `#52525B` | Secondary text, helper text |
| `--color-border` | `#E4E4E7` | Dividers, input borders, card borders |
| `--color-primary` | `#1D4ED8` | Primary buttons, links, present state |
| `--color-primary-hover` | `#1E40AF` | Hover/pressed primary |
| `--color-on-primary` | `#FFFFFF` | Text/icons on blue or black |
| `--color-focus` | `#2563EB` | Keyboard focus ring |
| `--color-absent` | `#18181B` | Absent state |
| `--color-disabled` | `#A1A1AA` | Disabled decoration only; never body text |

### Contrast

- `#0A0A0A` on `#FFFFFF`: approximately 19:1.
- `#1D4ED8` on `#FFFFFF`: approximately 6.7:1.
- `#FFFFFF` on `#1D4ED8`: approximately 6.7:1.
- `#52525B` on `#FFFFFF`: approximately 7.7:1.
- `#1D4ED8` on `#DBEAFE`: approximately 5.5:1.
- `#A1A1AA` is below text contrast; use it only for disabled decoration, never for meaningful text.

### No other accent colors

There is no red, green, orange, yellow, or purple in the product. This includes charts, error states, and status badges.

- Present: blue.
- Absent: black.
- Unmarked: neutral outline.
- Error: black banner with white text and an alert icon.
- Success: blue confirmation with a check icon.
- Warning: black outline with an alert icon.

The label and icon carry the meaning; color reinforces it.

## 3. Tailwind CSS 4 Mapping

```css
@import "tailwindcss";

@theme {
  --color-bg: #FFFFFF;
  --color-surface: #F8FAFC;
  --color-primary-soft: #DBEAFE;
  --color-ink: #0A0A0A;
  --color-ink-muted: #52525B;
  --color-border: #E4E4E7;
  --color-primary: #1D4ED8;
  --color-primary-hover: #1E40AF;
  --color-on-primary: #FFFFFF;
  --color-focus: #2563EB;
  --color-absent: #18181B;
  --color-disabled: #A1A1AA;

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
```

Usage examples: `bg-bg`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-border`, `bg-primary`, `hover:bg-primary-hover`, `text-on-primary`, `ring-focus`, `bg-primary-soft`, `text-absent`.

Do not use arbitrary hex values in components. Add a token first if a new role is truly needed.

## 4. Typography

- **Family:** Inter for UI and prose. Roll numbers and numeric tables use tabular numerals (`font-variant-numeric: tabular-nums`).
- **Weights:** 400 body, 500 labels, 600 headings/buttons, 700 rare emphasis.
- **Base size:** 16px. Do not go below 14px for body content.
- **Scale:**
  - 12px: metadata, helper text.
  - 14px: secondary labels, table cells.
  - 16px: body, inputs, buttons.
  - 18px: section lead.
  - 24px: card heading.
  - 30px: page section heading.
  - 36–48px: page title, responsive.
- **Line height:** 1.4–1.6 for body; 1.1–1.2 for headings.
- **Measure:** 60–70 characters for long prose.
- **Case:** sentence case for headings and buttons. No all-caps labels except tiny eyebrow text with letter spacing.

## 5. Spacing, Radius, Borders, Shadows

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px (4px grid).
- Page padding: 16px mobile, 24px tablet, 32px desktop.
- Content max width: 1200px; reading column max 720px.
- Radius: 6px inputs/buttons, 10px cards, 14px large panels. Do not mix radii randomly.
- Borders: 1px `--color-border`; 2px black for a high-emphasis outline; 2px blue for focus.
- Shadows: avoid decorative shadows. Use a subtle `0 1px 2px rgb(10 10 10 / 0.05)` only when a floating layer needs separation.
- Dividers: 1px `--color-border`.

## 6. Layout

### App shell

- Left sidebar: 240px on desktop, white background, 1px right border.
- Wordmark: black text, blue dot/accent.
- Active nav item: `--color-primary-soft` background, blue left border or icon, black text.
- Top bar: 64px, white, page title on the left, user menu on the right.
- Main content: white canvas, max 1200px, 32px desktop padding.
- Mobile: sidebar becomes a slide-over or top menu; the main content fills the width.

### Attendance screen

- Page header: course code/title, term, session date/time.
- Two-column desktop layout:
  - Main: roster list/table with student name, roll number, Present/Absent segmented control.
  - Right: session summary card with present/absent/unmarked counts and recent sessions.
- Save bar: sticky at the bottom of the main panel; status text on the left, primary Save button on the right.
- Mobile: one column; student rows become cards; save bar fixed at the bottom.

### Tables

- Header: `--color-surface` background, 12px uppercase-ish labels only if needed, muted text.
- Rows: white, 1px bottom border, generous 12–16px vertical padding.
- Hover: `--color-primary-soft` at low emphasis.
- Selected: `--color-primary-soft`.
- Numeric columns: right-aligned, tabular numerals.
- Census: use semantic `<table>` for reports; use a list of cards for the roll-call control if it improves keyboard flow on mobile.
- Horizontal scroll is allowed on small screens, with a visible scroll hint; do not squash columns below readability.

## 7. Components

### Buttons

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| Primary | `--color-primary` | `--color-on-primary` | none | Save attendance, create |
| Secondary | `--color-bg` | `--color-ink` | `--color-ink` | Cancel, secondary action |
| Ghost | transparent | `--color-primary` | none | Tertiary action |
| Destructive | `--color-ink` | `--color-on-primary` | none | Deactivate, archive (with confirmation) |

- Minimum height 44px; padding 10–16px horizontally.
- Focus-visible: 2px `--color-focus` ring with 2px offset.
- Hover only on enabled controls; disabled controls do not use hover.
- Loading: keep width stable, show a small spinner or “Saving…”, disable duplicate submits.

### Inputs and selects

- White background, 1px border, 6px radius, 44px minimum height.
- Label above, 14px 500; helper text 12–14px muted.
- Focus: 2px blue ring.
- Error: 2px black border, black error text, alert icon; not color alone.
- Native `<input type="date">` and `<select>` are preferred over custom pickers.
- Password fields provide a show/hide control with an accessible label.

### Cards

- White background, 1px border, 10px radius, 16–24px padding.
- Heading 18–24px; body 14–16px.
- No heavy shadow; the border does the grouping.
- A card has one job. Do not nest cards more than one level.

### Status badges and controls

- Present badge: `--color-primary-soft` background, `--color-primary` text, check icon, “Present”.
- Absent badge: white background, `--color-absent` border/text, minus icon, “Absent”.
- Unmarked: white background, `--color-border` border, muted text, dash icon, “Unmarked”.
- Segmented control: two buttons in a group; `aria-pressed`; selected Present uses blue fill, selected Absent uses black fill; unselected uses white with border.
- Do not rely on a blue dot alone to mean present.

### Save bar

- White or `--color-surface` background, 1px top border.
- Left: status text (“3 of 6 marked”, “Saved”, “Unsaved changes”, “Newer version available”).
- Right: primary Save button.
- Disabled until all students are marked and there are unsaved changes.
- On mobile, stick to the bottom with safe-area padding.

### Alerts and toasts

- Success: blue left border/icon, white/surface background, black text.
- Error: black background, white text, alert icon, retry action.
- Rate limit: black or surface banner with countdown; disable the action until reset.
- Conflict: surface banner, black text, “Reload saved register” primary/secondary action.
- Do not use red or green.

### Dialogs

- Use a native `<dialog>` or an accessible primitive.
- Title, short body, Cancel and one primary action.
- Destructive confirmation uses a black destructive button and names the object.
- Focus is trapped; Escape closes unless the action is in progress.

### Empty, loading, and error states

- Empty: short explanation and one next action; no decorative illustration required.
- Loading: skeleton rows for tables; a small progress indicator for saves.
- Error: what happened, what to do next, and a retry control. Preserve unsaved data.

## 8. Screen Specifications

### Login

- Split layout on desktop: black brand panel on the left with the product name and a short line; white form panel on the right.
- Mobile: black header with wordmark, white form below.
- Fields: email, password. No signup link.
- States: idle, submitting, invalid credentials (generic), rate limited (countdown), service unavailable.
- After login: if `mustChangePassword`, go to the password-change screen; otherwise go to the role dashboard.

### Password change

- Current password, new password, confirm new password.
- Password rules shown as helper text, not a checklist that turns red/green.
- Success message and sign-out/sign-in prompt.
- Rate-limited state uses a countdown.

### Dashboard

- Greeting with name and role.
- Summary cards: courses, today’s sessions, saved sessions this week, attendance rate (role-scoped).
- Teacher: “Today’s sessions” list with status (draft/saved), next action.
- Student: attendance summary by course.
- Admin: user/course counts and quick actions.
- Empty state for a new term.

### Courses

- Search by code/title; filter by term; archived filter for admins.
- Table on desktop: code, title, teacher, enrollment count, actions.
- Cards on mobile.
- Teacher sees “Take attendance”; admin sees “Manage”; student sees course attendance summary.

### Attendance roll call

- Header: course code/title, term, session date/time.
- Date/time selector: native input; teacher can create a session for a date/time.
- Roster list: name, roll number, Present/Absent segmented control.
- “Mark all present” secondary action; it does not auto-save.
- Live totals: present, absent, unmarked; percentage only when all marked.
- Save bar with state: loading, ready, saving, saved, conflict, error.
- Recent sessions: last three, with date and present count.
- Conflict state: preserve marks, show “This session changed on another device”, offer reload.
- Unsaved changes: warn before leaving the page.
- Keyboard: tab through students; P/A shortcuts are optional and must not fire while typing in an input.

### Reports

- Course selector and date range.
- Summary figures: saved sessions, students, overall attendance.
- Per-student table: name, roll, present, counted sessions, percentage.
- `dataAsOf` timestamp and “Updated from read replica” note.
- Zero sessions: percentage displays an em dash, not 0%.
- Sort by name or percentage; no color-only sorting indicator.
- Empty state: “No saved sessions yet.”

### Admin users

- Table: name, email, role, active, last change, actions.
- Create user dialog: email, full name, role, temporary password.
- Reset password: confirmation, temporary password, force change.
- Deactivate: destructive confirmation; last-admin rule.
- Filters: role, active/inactive, search.

### Admin courses and enrollments

- Create course: code, title, term, teacher.
- Archive/restore with confirmation.
- Enrollment: search students, multi-select, enroll/drop; show current enrollment window.
- No hard-delete of attendance history.

### Student self-view

- Course cards with attendance percentage and present/counted counts.
- Course detail: session history with present/absent badges.
- Empty state: “No saved sessions yet.”
- No access to classmates or other courses.

## 9. Interaction States

| State | Behavior |
|---|---|
| Loading | Skeletons for lists; button labels stay stable |
| Empty | Explanation + one next action |
| Error | What happened + retry; preserve unsaved marks |
| Success | Blue check + confirmation; no modal for routine saves |
| Disabled | Lower emphasis, still readable; explain why if not obvious |
| Rate limited | Countdown, disabled action, no auto-retry |
| Conflict | Preserve marks; offer reload; never silently overwrite |
| Offline/network failure | Preserve marks; retry; do not clear the form |
| Password change required | Redirect to the password-change screen; block other actions |
| Expired session | Redirect to login with a return path |

## 10. Responsive Behavior

- Breakpoints: 640px (small), 768px (medium), 1024px (large), 1280px (wide).
- Below 1024px: sidebar collapses; content uses full width.
- Below 720px:
  - Attendance roster becomes stacked cards with 44px controls.
  - Save bar is fixed to the bottom with safe-area padding.
  - Tables scroll horizontally; the first column stays readable.
  - Page title drops one step in the type scale.
- At 320px: no content may overflow the viewport except intentionally scrollable tables; buttons wrap, never clip.
- Touch targets: at least 44×44px; spacing between adjacent targets at least 8px.
- Hover effects are optional enhancements; nothing depends on hover.

## 11. Accessibility

Target: WCAG 2.2 AA.

- Every input has a visible label and an accessible name.
- Present/Absent controls are buttons with `aria-pressed`; the student name is in the accessible name.
- Save status is announced through `aria-live="polite"`.
- Errors are associated with fields via `aria-describedby`; focus moves to the first error.
- Tables use `<caption>`, `<th scope="col">`, and `<th scope="row">` where appropriate.
- Focus is always visible; never remove the outline without a replacement.
- Keyboard-only flow: login → dashboard → course → roll call → save → logout.
- Do not use color alone for present/absent/error/warning.
- Respect `prefers-reduced-motion`; no auto-playing animation.
- Support 200% zoom and reflow without loss of content.
- Contrast: 4.5:1 for body text; 3:1 for large text and UI boundaries.
- Provide a skip link to main content.
- Use semantic landmarks: header, nav, main, footer.

## 12. Motion

- 120–180ms ease-out for hover, focus, and state changes.
- No entrance animations on form controls.
- A save confirmation may fade in; it must not block interaction.
- Respect reduced motion by removing transforms and shortening fades.

## 13. Do / Don't

| Do | Don't |
|---|---|
| Use blue for the primary action | Use blue for every link and border |
| Use black for absent and structure | Use red for absent or errors |
| Use text + icon for status | Rely on a colored dot alone |
| Use native date/select inputs | Build a custom picker for a standard field |
| Keep one primary action per view | Compete with multiple blue buttons |
| Preserve unsaved marks on failure | Clear the form after a failed save |
| Show `dataAsOf` on reports | Claim reports are live |
| Use 44px targets | Use tiny icon-only controls without labels |
| Use the border for grouping | Add heavy shadows everywhere |

## 14. Screen Inventory

- `/login`
- `/change-password`
- `/dashboard`
- `/courses`
- `/courses/[courseId]`
- `/courses/[courseId]/attendance`
- `/reports`
- `/students/[studentId]`
- `/admin/users`
- `/admin/courses`
- `/admin/courses/[courseId]/enrollments`

Routes are the planned structure, not yet implemented.
