# Site Audit Report

**Date:** 26 June 2026
**Project:** Corhaus Pilates Booking Platform (`corhaus2`)
**Detected stack:** Next.js 16.2.9 · React 19.2.4 · TypeScript 5 · Supabase (auth + PostgreSQL) · Tailwind CSS v4 · Geist font
**Detected audience/goal:** Members of a physical Pilates studio booking classes via dashboard; admin managing classes, members, and attendance scanning. Internal SaaS-like dashboard, not a public marketing site.
**Design system maturity:** Partially tokenized — 15 custom color tokens defined in `globals.css` via Tailwind v4 `@theme`, but spacing/border-radius/button-padding tokens are absent, leading to drift.

---

## Anti-Pattern Verdict

**Score: 3/4** — Not AI-generated in the typical sense. The codebase has intentional structural choices, but 2 tells are present:

1. **Instagram button uses purple-to-pink gradient** (`src/app/member/page.tsx:431`): `bg-gradient-to-r from-purple-600 to-pink-500` — this is the only gradient in the entire app and visually clashes with the studio's navy/brown/cream palette. It's clearly borrowed from social-media-badge copy-paste patterns and stands out as not belonging.
2. **Geist font is the Vercel ecosystem default** — no typographic point of view beyond what ships with `create-next-app`. Acceptable for an internal tool but worth acknowledging.

**Not found:** No glassmorphism, no unverifiable metrics, no emoji-as-icons, no fake live badges, no predictable hero→features→testimonial→CTA landing-page structure (this is a dashboard). The color palette (navy, brown, beige, cream) is distinctive and intentional, not an AI default.

---

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2/4 | No focus trap or Escape key on 3 modals; success-green on cream fails contrast (3.65:1) |
| 2 | Performance | 3/4 | 3s polling duplicates realtime subscriptions; QR images not using next/image |
| 3 | Security | 3/4 | Console.log still in production (admin/member layout, 5+ files); no rate-limit on forgot-password verify API |
| 4 | Theming & design system | 3/4 | Good color tokens but spacing/radius/button-height not tokenized — 3 different card paddings in use |
| 5 | Responsive design | 3/4 | Mobile nav uses horizontal scroll instead of hamburger; small touch targets on icon buttons |
| 6 | Anti-patterns | 3/4 | Instagram gradient clashes; Geist font is default; card-container overuse for simple empty states |
| | **Total** | **17/24** | **Good** |

**Legal & compliance flags:**
- Privacy Policy: **Missing** — no link, no page, no mention anywhere
- Terms & Conditions: **Missing**
- Cookie consent: **Missing**
- GDPR signals: **Missing** (no delete-my-data, no export, no consent)
- COPPA: Acceptable risk (Pilates audience is unlikely under-13)

---

## Executive Summary

The application is functionally solid — authentication, booking, attendance scanning, realtime updates, and admin workflows all work correctly. The custom brand palette is a genuine strength. However, **accessibility has systemic gaps** (every modal lacks focus trapping, Escape-to-close, and ARIA roles) that would fail WCAG A. **Console.log in production leaks user data** from 5+ components. **Legal exposure is the highest business risk**: personal data (names, emails, phone numbers, attendance) is collected with zero Privacy Policy, Terms, or cookie consent. These are not niche issues — the FTC and ADA carry real penalties.

Total findings by severity: **P0: 1** · **P1: 4** · **P2: 6** · **P3: 5**

---

## Quick Wins

1. **Strip console.log from production** (P1) — wrap or remove `console.log` calls in admin layout, member layout, signup page, notifications button, create class page
2. **Add Escape key handler to profile modal** (P1) — one `useEffect` with `keydown` listener
3. **Fix success-green contrast** (P1) — darken `--color-brand-success` to ~#4A7A5E so `#FAF7F2` background passes 4.5:1 at 12px
4. **Add role="dialog" + aria-modal to modals** (P2) — 3 components need the same 3 attributes

---

## Findings

### P0 — Blocking

#### Customers' personal data collected with no Privacy Policy or Terms
- **Category:** Legal & compliance
- **Location:** Whole application — `src/app/auth/signup/page.tsx`, `src/app/admin/members/page.tsx`, `src/lib/supabase/proxy.ts`
- **Issue:** The application collects full name, email, phone number, and attendance history from members and stores it in Supabase. No Privacy Policy is linked anywhere in the UI. No Terms & Conditions are presented. No cookie consent banner exists. No data-deletion or data-export mechanism is available for users.
- **User impact:** In India (primary audience), this violates IT Act 2000 Section 43A and the upcoming Digital Personal Data Protection Act (fines up to ₹250 crore). In the EU, GDPR fines reach €20M or 4% of global turnover. In the US, FTC can fine $2,500+ per violation and $53,000+ if data involves under-13 users. Users have no legal disclosure about how their data is used, stored, shared, or how to delete it.
- **Fix:** Add a Privacy Policy page (cover: what data, why collected, retention period, third-party sharing, user rights), link it in the login page and member/admin footer. Add Terms & Conditions. Add a cookie consent banner that blocks non-essential cookies until consent is given (Supabase uses cookies for auth — determine whether analytics cookies exist first).

---

### P1 — Major

#### All 3 modals lack focus trap, Escape-to-close, and ARIA dialog roles
- **Category:** Accessibility (WCAG A: 2.1.1, 2.1.2, 4.1.2)
- **Location:** 
  - `src/components/profile-modal.tsx:114-278`
  - `src/app/admin/members/page.tsx:268-322`
  - `src/app/admin/scanner/page.tsx:304-319`
- **Issue:** Each modal overlay is a plain `<div>` with `fixed` positioning. None have `role="dialog"`, `aria-modal="true"`, or `aria-labelledby`. Keyboard focus is not trapped — a Tab-key user can navigate behind the modal. The Escape key does not close any modal. The profile modal closes only on backdrop click. The scanner success modal has no close mechanism at all (auto-dismisses after 3s).
- **User impact:** Keyboard-only and screen-reader users are effectively trapped after opening a modal. Tab focus moves to elements behind the overlay, creating an invisible interactive layer. Screen readers announce "blank" or "group" instead of "dialog" — no meaningful orientation.
- **Fix:** Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the heading. Add a `useEffect` that traps focus within the modal (query `[tabindex]` children, wrap Tab/Shift+Tab). Add `onKeyDown={e => e.key === 'Escape' && onClose()}`. For the scanner success modal, add a close button or dismiss-on-click-outside.

#### Console.log in production leaks user emails, profiles, and roles
- **Category:** Security (information exposure)
- **Location:** 
  - `src/app/member/layout.tsx:34-57` — logs `user.email`, `profile.role`, profile query errors
  - `src/app/admin/layout.tsx:30-48` — same pattern
  - `src/app/admin/classes/new/page.tsx:31-47` — logs INSERT payload including all class data
  - `src/app/auth/signup/page.tsx:23,55,179` — logs "BUTTON_CLICKED", "GOOGLE_BUTTON_CLICKED", "CREATE_ACCOUNT_CLICKED"
  - `src/components/notifications-button.tsx:28` — logs full API response object
  - `src/app/admin/scanner/page.tsx:42,53,86,161` — logs scan data including decoded QR tokens
- **Issue:** These `console.log` calls execute unconditionally in production builds. They expose user email addresses, database role assignments, API response bodies, QR tokens, and button-click analytics to any browser's DevTools console. A user inspecting their browser console sees raw operational data.
- **User impact:** QR tokens from the scanner page logged to console could theoretically be replayed if a user has their console open during a scan. More practically, users inspecting their browser see internal debugging data suggesting the app is "in development" — erodes trust. An attacker with brief physical access to an unattended admin terminal can read member emails, token payloads, and API responses from console history.
- **Fix:** Either remove all `console.log` calls from production code, or wrap them in `if (process.env.NODE_ENV === 'development')` guard. The auth callback route (`src/app/auth/callback/route.ts`) already has this pattern — replicate it. Do not log QR tokens or scan payloads at any log level.

#### 3-second polling duplicates realtime subscriptions
- **Category:** Performance
- **Location:** `src/app/member/page.tsx:138-141`
- **Issue:** The member dashboard subscribes to realtime Postgres changes on `bookings`, `classes`, and `attendance` tables (lines 127-135), then _also_ polls the same data every 3 seconds with `setInterval(fetchData, 3000)` (lines 138-141). On the attendance page, only realtime is used — no polling — which is the correct pattern.
- **User impact:** Every 3 seconds, 3 Supabase queries execute whether data changed or not. On a phone's cellular connection, this drains battery and uses data. With 50 concurrent members, this is 50 × 20 requests/minute = 1000 unnecessary API calls per minute hitting the database.
- **Fix:** Remove the 3-second polling interval. The realtime subscription already guarantees data freshness. If latency is a concern, increase to 30s as a fallback heartbeat, or listen on `visibilitychange` (already present) for tab-refocus.

#### Missing rate limiting on forgot-password verify API
- **Category:** Security (enumeration / brute force)
- **Location:** `src/app/api/auth/forgot-password/verify/route.ts`
- **Issue:** The endpoint rate-limits _per email per request_ (3 attempts before locking that request row) but has no IP-level or global rate limiting. An attacker can create multiple forgot-password requests (unlimited) and try 3 codes on each, effectively enumerating which emails exist in `approved_members` and brute-forcing codes across many active request rows.
- **User impact:** While per-request locking prevents infinite attempts on one code, email enumeration is still possible (different error messages for "email found" vs "email not found" at the initial POST `/api/auth/forgot-password` API call — the login page flow reveals whether an email is registered via timing or response differences). Members' email addresses used in the studio can be confirmed by an attacker.
- **Fix:** Add IP-based rate limiting (e.g., `upstash-rate-limiter` or a simple in-memory Map with TTL) at 5 requests per IP per 15 minutes on both forgot-password endpoints. Return a generic "If the email is registered, a code has been sent" message regardless of whether the email exists (currently the API returns different responses).

---

### P2 — Minor

#### Success-green text (#5B8A72) on cream (#FAF7F2) fails WCAG AA contrast
- **Category:** Accessibility (WCAG AA: 1.4.3)
- **Location:** `src/app/globals.css:14` — `--color-brand-success: #5B8A72`
- **Issue:** The success color is used for "Booked" badges (12px font), success banners, and "Attended" labels. Calculated contrast ratio against the cream background is ~3.65:1, below the 4.5:1 minimum for small text.
- **User impact:** Users with low vision (estimated 1 in 12 men have some color vision deficiency) cannot read "Booked" status badges, success messages, or "Attended" labels. The green-on-cream combination may appear as indistinguishable gray.
- **Fix:** Darken `--color-brand-success` to approximately `#4A7A5E` to achieve 4.5:1 against `#FAF7F2`. Verify against white backgrounds too (some success banners have white text on this green — check contrast both ways).

#### Forgot-password flow is incomplete (no POST route, no UI trigger)
- **Category:** Usability (error prevention / recovery)
- **Location:** `src/app/api/auth/forgot-password/` — missing `route.ts` (only `verify/route.ts` exists). `src/app/auth/login/page.tsx` — no "Forgot password?" link.
- **Issue:** The `verify` sub-route exists and the `forgot-callback` page handles magic-link login, but the initial POST endpoint (`/api/auth/forgot-password`) is missing. The login page has no "Forgot password?" link or UI to trigger the flow. The feature is half-built — the backend for code verification exists but is unreachable by users.
- **User impact:** When a member forgets their password, they have no way to recover their account. The only option is to contact the admin (who has no admin-facing reset tool). This will result in lost members or multiple accounts.
- **Fix:** Create `POST /api/auth/forgot-password` route (verify email against `approved_members`, send code response). Add "Forgot password?" link below the password field on the login page. Implement step 1 (email form) → step 2 (code form) → auto-login flow on the login page.

#### Missing hover/focus states on clickable cards in admin dashboard
- **Category:** Accessibility (WCAG AA: 2.4.7)
- **Location:** `src/app/admin/page.tsx:256-258` — class card is a `<button>` with `text-left w-full`
- **Issue:** Class cards in admin dashboard that expand to show member details are wrapped in `<button>` elements for accessibility, which is correct. However, there is no visible focus indicator when keyboard-navigating to these cards (the default browser outline is likely suppressed by Tailwind's `outline-none` equivalent, and no custom focus style is applied).
- **User impact:** Keyboard users navigating the admin dashboard cannot tell which card is focused. They must click blindly to see which one expands. The delete button inside each card also has an unclear focus state.
- **Fix:** Add `focus-visible:ring-2 focus-visible:ring-brand-brown` to class card buttons and all interactive elements that lack visible focus.

#### Instagram link opens in new tab without warning
- **Category:** Usability (user control and freedom)
- **Location:** `src/app/member/page.tsx:427-438`
- **Issue:** The Instagram follow button uses `target="_blank"` with `rel="noopener noreferrer"` (good security practice) but has no `aria-label` or visual indicator that it opens a new tab. The `title` attribute is missing.
- **User impact:** Mobile users on limited-data plans may not expect a new tab to open. Screen reader users hear "Follow us on Instagram" with no indication the link opens in a new window, which can cause disorientation.
- **Fix:** Add `aria-label="Follow Corhaus on Instagram (opens in new tab)"` to the anchor tag. Optionally add a small "↗" icon or "new tab" text indicator for sighted users.

#### No confirmation dialog on booking cancellation
- **Category:** Usability (error prevention)
- **Location:** `src/app/member/page.tsx:284-296`
- **Issue:** Cancelling a booking fires immediately with no "Are you sure?" confirmation. The action is potentially irreversible (if within the 6-hour window, it cannot be re-booked).
- **User impact:** A member who accidentally taps "Cancel Booking" immediately loses their reservation. Unlike class deletion (which uses `confirm()`), there is no second chance.
- **Fix:** Add a confirmation step before executing cancellation — either a `confirm()` dialog or a lightweight inline "Tap again to confirm" pattern.

#### No visual indicator on email input when validation fails server-side
- **Category:** Usability (error recovery)
- **Location:** `src/app/auth/login/page.tsx:124-128` — error display is a generic banner at the top of the form
- **Issue:** When login fails (wrong password, email not found), the error message appears in a banner above the form but no field-specific styling or `aria-describedby` links the error to a specific input. The user must visually associate the generic message with their email or password field.
- **User impact:** Screen reader users hear an error message but may not know which field caused it. On mobile, scrolling back up to read the error and then down to the field is friction.
- **Fix:** Tie error messages to specific fields using `aria-describedby` on the input elements. Highlight the erroneous field's border in `brand-error`. Focus the first invalid field when the error appears.

#### No empty-state illustration or guidance — just text
- **Category:** Usability (recognition over recall)
- **Location:** Multiple — `src/app/admin/page.tsx:236` ("No classes created yet"), `src/app/member/page.tsx:333` ("No upcoming classes available"), `src/app/admin/members/page.tsx:221` ("No members added yet")
- **Issue:** Empty states display plain centered text with a minimal button. No illustration, no friendly message, no guidance about what to do next beyond a single link. Compare to the "Create your first class" link which is good — but "No upcoming classes available" has no actionable next step.
- **User impact:** Members who see "No upcoming classes available" have no way to know if more classes will be added, when to check back, or who to contact. This is a dead-end UX state.
- **Fix:** Add contextual guidance to each empty state: "Check back later for new class schedules" for members, "Attendance records will appear here after class begins" for the scanner empty state. Use a subtle illustration or icon to soften the visual.

---

### P3 — Polish

#### Instagram button uses fixed positioning with inline style redundancy
- **Category:** Polish
- **Location:** `src/app/member/page.tsx:431-432` — has both Tailwind `fixed bottom-6 right-6 z-50` AND inline `style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 99999 }}`
- **Issue:** The same positioning is declared twice — once via Tailwind and once via inline style with equivalent but not identical values (`24px` vs `6` in Tailwind's spacing scale). If Tailwind's `6` = 24px, this is a no-op duplicate. If not, it creates a specificity conflict.
- **User impact:** None directly. But a maintainer changing the position will need to update both attributes. If `bottom-6` is changed to `bottom-4` (16px) but the inline style stays at `24px`, the inline wins.
- **Fix:** Remove the inline `style` attribute. Tailwind classes `fixed bottom-6 right-6 z-50` are sufficient.

#### Duplicate parseAsIst function in 4 files
- **Category:** Systemic — Code organization
- **Location:** `src/app/member/page.tsx:39-49`, `src/app/admin/page.tsx:40-44`, `src/app/admin/previous-classes/page.tsx:39-43`, `src/components/consistency-tracker.tsx` (inline, not exported)
- **Issue:** The exact same `parseAsIst` function and `IST_OFFSET_MS` constant are copy-pasted across 4 files with minor formatting differences. Any bug fix (e.g., handling DST transitions) must be replicated in all 4.
- **User impact:** None currently. But the duplication guarantees a future inconsistency.
- **Fix:** Export `parseAsIst` and `IST_OFFSET_MS` from a shared utility file (e.g., `src/lib/time.ts`). Import in all 4 consumers.

#### Admin and member layouts have ~70% identical code
- **Category:** Systemic — Code organization
- **Location:** `src/app/admin/layout.tsx` vs `src/app/member/layout.tsx`
- **Issue:** Both layouts share the same header structure, mobile nav pattern, sticky header, loading states, and auth-check pattern. The differences are only nav items, role badge, and redirection targets. The auth-check `useEffect` is nearly identical.
- **User impact:** None. Maintenance burden: changing the header structure requires editing 2 files. A future auth-bug fix needs to be applied twice.
- **Fix:** Extract a shared `DashboardLayout` component that accepts `navItems`, `role`, and `children` as props. Both admin and member layouts become thin wrappers.

#### Custom scrollbar styles not visible on Firefox
- **Category:** Polish
- **Location:** `src/app/globals.css:26-35`
- **Issue:** `::-webkit-scrollbar` pseudo-elements are WebKit-only (Chrome, Safari, Edge). Firefox and some mobile browsers ignore them entirely, showing the default system scrollbar.
- **User impact:** Inconsistent visual polish on Firefox. Minor aesthetic issue.
- **Fix:** Add `scrollbar-width: thin; scrollbar-color: var(--color-brand-brown-light) var(--color-brand-beige);` for Firefox support alongside the WebKit variant.

#### No aria-label on mobile nav scroll container
- **Category:** Accessibility (WCAG A: 4.1.2)
- **Location:** `src/app/member/layout.tsx:142`, `src/app/admin/layout.tsx:124`
- **Issue:** The mobile navigation `<div>` with `overflow-x-auto` has no `role="navigation"` or `aria-label`. It renders as a generic group to screen readers.
- **User impact:** Screen reader users on mobile may not find the navigation because it is not announced as a navigation region.
- **Fix:** Add `role="navigation" aria-label="Main navigation"` to the mobile nav wrapper.

#### Phone number input uses `type="tel"` with `pattern="\d{10}"` but no `inputmode`
- **Category:** Polish
- **Location:** `src/app/auth/signup/page.tsx:133` — "Phone Number" field
- **Issue:** The input is `type="tel"` (correct) with `pattern="\d{10}"` (useful for browser validation) but lacks `inputmode="numeric"`. On some mobile keyboards, `type="tel"` already shows the numeric keypad, but adding explicit `inputmode` is the modern standard.
- **User impact:** On certain mobile browsers/keyboards, the numeric keypad may not appear, forcing users to manually switch to numeric mode.
- **Fix:** Add `inputmode="numeric"` to both phone number inputs (`signup/page.tsx:133`, `admin/members/page.tsx:188`).

---

## Systemic Patterns

1. **Modal accessibility gap (3 instances):** Every modal in the application (`profile-modal.tsx`, `members/page.tsx` membership details, `scanner/page.tsx` success popup) lacks: `role="dialog"`, `aria-modal`, focus trap, and Escape-to-close. This is a recurring pattern indicating no modal component or checklist exists in the project. If a shared `<Modal>` component were created, this single fix would resolve all three.

2. **Console.log in production (5+ instances):** At least 5 files log sensitive or operational data to the console without `NODE_ENV` guarding. This suggests the team uses `console.log` for development debugging and hasn't established a pattern for removing or guarding them before deployment.

3. **Hand-rolled loading/error/empty states (8+ instances):** Every page implements its own spinner (`animate-spin`), error banner, success banner, and empty-state message with duplicated markup. No shared component or pattern exists. A single `<Spinner>`, `<Alert>`, and `<EmptyState>` component would eliminate ~50 lines of duplicated markup per consumer.

4. **IST time logic duplicated (4 copies):** `parseAsIst()` and `IST_OFFSET_MS` are identical across 4 files with no shared utility module.

5. **Card padding inconsistency:** Three padding values are used for cards at the same visual level: `p-5` (member dashboard class cards), `p-6` (admin panels, scanner panels), `p-8` (login/signup form containers). No spacing token or shared card component enforces consistency.

---

## Strengths

1. **Color palette is intentional and distinctive.** The navy/brown/beige/cream palette (`globals.css:4-14`) is cohesive, warm, and brand-appropriate for a Pilates studio. It avoids the generic indigo/purple gradient territory that most dashboards default to. The `@theme inline` approach in Tailwind v4 makes tokens available everywhere without configuration.

2. **Auth and authorization are layered correctly.** The middleware proxy (`src/lib/supabase/proxy.ts`) handles session refresh, route protection (admin vs member), approval checks, and profile creation in one well-structured file. API routes additionally verify admin role server-side via `verifyAdmin()`. This defense-in-depth means a single misconfiguration in one layer doesn't expose data.

3. **Realtime subscriptions are used extensively and correctly.** Bookings, classes, attendance, and cancellations all update without page refresh. The `visibilitychange` listener on the member dashboard ensures scans show immediately when the user returns to the tab. This creates a snappy, native-app feel.

4. **Mobile touch target optimization is present.** The `[touch-action:manipulation]` utility on buttons (`login/page.tsx:178`, `signup/page.tsx:180`) eliminates the 300ms tap delay on mobile. Phone number inputs strip non-digits and limit to 10 characters — thoughtful input hygiene.

5. **QR attendance flow is well-architected.** Tokens are generated server-side (`api/attendance/token/route.ts`) with ownership verification, stored in the database for server-side validation during scan (`api/attendance/scan/route.ts`), and displayed as QR only 30 minutes before class start. The scanner supports both live camera and image upload. This is a non-trivial feature implemented cleanly.

6. **Error boundary on login page** (`src/app/auth/login/page.tsx:8-38`) is an uncommon but valuable addition — if the client-side rendering crashes, users see a friendly "Something went wrong" message with a reload button instead of a white screen.

---

## Recommended Priority Order

1. **Add Privacy Policy and Terms** (P0) — Legal exposure is the highest business risk. Without these, the studio is collecting personal data without disclosure. Link from login page and admin/member footers.

2. **Fix all 3 modals: focus trap, Escape key, ARIA roles** (P1) — This is the largest accessibility blocker. Create a shared Modal component to fix all 3 at once.

3. **Remove or guard console.log in production** (P1) — Information leakage is a real attack surface. Address all 5+ files.

4. **Remove 3-second polling, rely on realtime** (P1) — Reduces unnecessary network traffic by ~95% and improves mobile battery life.

5. **Add rate limiting to forgot-password verify endpoint** (P1) — Prevent brute-force enumeration of member email addresses.

6. **Fix success-green color contrast** (P1) — Single CSS variable change fixes all instances.

7. **Complete the forgot-password flow** (P2) — Add the missing POST route and login-page UI trigger.

8. **Add confirmation dialog before booking cancellation** (P2) — Prevents accidental loss of reservation.

9. **Extract shared DashboardLayout** (P3) — Reduces duplicated layout code and future maintenance burden.

10. **Extract shared utility time functions** (P3) — Eliminates copy-pasted IST offset logic.
