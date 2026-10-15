import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateCompleteTestingSheet() {
  const primaryPath = 'c:/nexcore/Rifah/Rifah_Frontend_Testing_Parameters.xlsx';
  const fallbackPath = 'c:/nexcore/Rifah/Rifah_Frontend_Testing_Parameters_All_Categories.xlsx';
  let outputPath = primaryPath;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RIFAH QA Automation & Engineering Team';
  workbook.created = new Date();
  workbook.modified = new Date();

  const columns = [
    { header: 'Module', key: 'module', width: 22 },
    { header: 'Page / Screen', key: 'screen', width: 26 },
    { header: 'Parameter Category', key: 'category', width: 24 },
    { header: 'Testing Parameter', key: 'parameter', width: 32 },
    { header: 'Test Scenario', key: 'scenario', width: 45 },
    { header: 'Expected Result', key: 'expected', width: 48 },
    { header: 'Actual Result', key: 'actual', width: 24 },
    { header: 'Status (Pass/Fail)', key: 'status', width: 20 },
    { header: 'Severity', key: 'severity', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 32 }
  ];

  // =========================================================================
  // EXHAUSTIVE TEST CASES COVERING ALL 12 CATEGORIES IN EVERY MODULE:
  // 1. UI
  // 2. UX
  // 3. Validation
  // 4. Functionality
  // 5. Performance
  // 6. Navigation
  // 7. Compatibility
  // 8. Responsiveness
  // 9. Security (Client-side)
  // 10. Error Handling
  // 11. Accessibility
  // 12. Browser Console
  // =========================================================================

  const testCases = [
    // =======================================================================
    // MODULE 1: AUTH & ONBOARDING
    // =======================================================================
    {
      module: 'Auth & Onboarding',
      screen: 'Login Page (/login)',
      category: 'UI',
      parameter: 'Form Layout & Branding Consistency',
      scenario: 'Inspect login container card, Rifah brand logo, input field alignments, and Sign In CTA styling',
      expected: 'Elements align to 8px grid system; typography matches Outfit/Inter font; brand colors and button states render correctly',
      severity: 'Major',
      remarks: 'Pixel-perfect UI design check'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login Page (/login)',
      category: 'UX',
      parameter: 'Password Visibility Toggle & Feedback',
      scenario: 'Type password and click the eye icon to toggle visibility between masked dots and clear text',
      expected: 'Password toggles smoothly between type="password" and type="text"; eye icon state toggles; no layout jump',
      severity: 'Major',
      remarks: 'Clear visual state indication'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login Page (/login)',
      category: 'Validation',
      parameter: 'Empty Form & Syntax Validations',
      scenario: 'Click "Sign In" with empty fields, then with malformed email (e.g. "user@domain")',
      expected: 'Submission is halted; inline validation errors appear ("Email is required", "Please enter a valid email or 10-digit mobile")',
      severity: 'Critical',
      remarks: 'Client-side validation before network dispatch'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login Page (/login)',
      category: 'Functionality',
      parameter: 'Credentials Authentication & Google SSO',
      scenario: 'Test valid email/password login and click "Continue with Google" OAuth SSO button',
      expected: 'Both authentication paths succeed; JWT tokens are securely stored; user is redirected to designated role dashboard',
      severity: 'Critical',
      remarks: 'Verify JWT cookie and auth context'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login Page (/login)',
      category: 'Performance',
      parameter: 'Page Load & Time to Interactive (TTI)',
      scenario: 'Measure initial page load and TTI of /login on standard 4G simulation',
      expected: 'Login page loads within 1.8 seconds; input fields are interactive immediately without main-thread blocking',
      severity: 'Major',
      remarks: 'Lighthouse Performance score >= 90'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login Page (/login)',
      category: 'Navigation',
      parameter: 'Deep-Linking Return URL Redirection',
      scenario: 'Attempt direct unauthenticated access to "/biz/branches", then log in successfully',
      expected: 'Redirects to "/login?redirect=/biz/branches"; upon successful login, user is automatically routed to "/biz/branches"',
      severity: 'Major',
      remarks: 'Preserves user intended destination'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login & Register',
      category: 'Compatibility',
      parameter: 'Virtual Keyboard & Autofill Support',
      scenario: 'Open login and registration forms on iOS Safari and Android Chrome, trigger browser autofill',
      expected: 'Virtual keyboard does not obscure inputs or cause layout breaking; autofill fills credentials cleanly without CSS glitch',
      severity: 'Major',
      remarks: 'Check iOS viewport resize behavior'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login & Register',
      category: 'Responsiveness',
      parameter: 'Mobile Viewport Integrity (375px)',
      scenario: 'Inspect Login and Register pages on 375px viewport (iPhone SE)',
      expected: 'Zero horizontal scrollbar; input fields span full container width; action buttons remain comfortably tappable (min 44px height)',
      severity: 'Critical',
      remarks: 'Mobile-first responsive standard'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login & Register',
      category: 'Security (Client-side)',
      parameter: 'Token Storage & Logout Purge',
      scenario: 'Inspect cookies/localStorage after login, then click "Log Out" from profile menu',
      expected: 'Tokens stored securely (HTTP-only cookies where applicable); logging out completely purges auth tokens; Back button blocked',
      severity: 'Critical',
      remarks: 'Prevents session replay attacks'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login Page (/login)',
      category: 'Error Handling',
      parameter: 'Invalid Credentials & Network Drop Alerts',
      scenario: 'Submit incorrect password, then submit login while internet connection is disconnected',
      expected: 'Displays clear non-crashing alert: "Invalid email or password" or "Network connection failed. Please check your internet"',
      severity: 'Critical',
      remarks: 'User-friendly error messages'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login & Register',
      category: 'Accessibility',
      parameter: 'Keyboard Navigation & Form Labels',
      scenario: 'Tab through all form fields and submit form using keyboard Enter key',
      expected: 'Every input has visible focus indicator and associated <label>; pressing Enter submits form cleanly; no focus traps',
      severity: 'Major',
      remarks: 'WCAG 2.1 AA keyboard standard'
    },
    {
      module: 'Auth & Onboarding',
      screen: 'Login & Register',
      category: 'Browser Console',
      parameter: 'Zero Unhandled Errors & Hydration Cleanliness',
      scenario: 'Open DevTools Console and execute complete registration and login flows',
      expected: 'Console remains 100% clean: zero uncaught promise rejections, zero React hydration mismatches, zero deprecation warnings',
      severity: 'Critical',
      remarks: 'Production console hygiene'
    },

    // =======================================================================
    // MODULE 2: APPSHELL & NAVIGATION
    // =======================================================================
    {
      module: 'AppShell & Navigation',
      screen: 'Desktop Sidebar',
      category: 'UI',
      parameter: 'Active Route Styling & Visual Hierarchy',
      scenario: 'Navigate through sidebar routes (Dashboard, Catalogue, Enquiries, Branches, Membership)',
      expected: 'Active route item receives distinct highlighted background and accent color; icon and label remain crisply aligned',
      severity: 'Major',
      remarks: 'Design system compliance'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'Desktop Sidebar',
      category: 'UX',
      parameter: 'Sidebar Collapse Animation & Tooltips',
      scenario: 'Toggle sidebar between full-width and collapsed icon-only mode',
      expected: 'Sidebar collapses with smooth 60fps CSS transition; hovering icons displays accurate tooltip labels; main content width adjusts smoothly',
      severity: 'Major',
      remarks: 'Smooth micro-interactions'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'App Header',
      category: 'Validation',
      parameter: 'Global Search Input Min Length',
      scenario: 'Type 1 character in global search bar (Ctrl+K), then type 3+ characters',
      expected: 'Single character displays helper "Type at least 2 characters to search"; 3+ characters triggers debounced query',
      severity: 'Minor',
      remarks: 'Prevents wasteful short queries'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'App Header & Drawer',
      category: 'Functionality',
      parameter: 'Live Notification & Unread Chat Badges',
      scenario: 'Trigger incoming socket notification and chat message while navigating various pages',
      expected: 'Notification bell and chat icon update with real-time numeric badges without page reload; popover lists unread items',
      severity: 'Critical',
      remarks: 'Real-time WebSocket event listeners'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'AppShell',
      category: 'Performance',
      parameter: 'Navigation Transition & Frame Rate',
      scenario: 'Navigate rapidly between workspace routes and observe rendering performance in DevTools Performance tab',
      expected: 'Page transitions execute within 200ms; zero noticeable frame drops (maintains >= 55fps); no layout thrashing',
      severity: 'Major',
      remarks: 'Next.js route prefetching optimization'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'AppShell',
      category: 'Navigation',
      parameter: 'Breadcrumb Sync & Browser History',
      scenario: 'Navigate deep into `/biz/branches` -> Add Branch, then click browser Back and Forward buttons',
      expected: 'Breadcrumbs reflect exact hierarchy ("Dashboard > Branches"); Back button returns cleanly to previous screen without state loss',
      severity: 'Major',
      remarks: 'History API state integrity'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'AppShell Header & Drawer',
      category: 'Compatibility',
      parameter: 'Sticky Header Across Browsers',
      scenario: 'Scroll long content pages in Safari, Chrome, Firefox, and Edge',
      expected: 'Header bar stays firmly pinned to top with backdrop-filter blur; z-index stacking ensures modals render above header',
      severity: 'Major',
      remarks: 'Cross-browser CSS backdrop-filter check'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'Mobile Shell',
      category: 'Responsiveness',
      parameter: 'Mobile Drawer & Bottom Bar Adaptation',
      scenario: 'View AppShell on mobile screen (< 768px), open hamburger menu, inspect bottom navigation bar',
      expected: 'Drawer slides over with dark backdrop overlay; bottom navigation bar fixes to bottom with iOS safe-area-inset padding',
      severity: 'Critical',
      remarks: 'Mobile-first layout adaptation'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'Navigation Shell',
      category: 'Security (Client-side)',
      parameter: 'Role-Based Navigation Item Suppression',
      scenario: 'Inspect DOM elements of sidebar as a standard member or business owner',
      expected: 'Restricted administrative links (/admin/*) are never rendered into DOM; unauthorized menus are not inspectable or clickable',
      severity: 'Critical',
      remarks: 'Prevents UI-level privilege discovery'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'Global Header',
      category: 'Error Handling',
      parameter: 'WebSocket Disconnection Indicator',
      scenario: 'Simulate WebSocket server disconnect while viewing AppShell',
      expected: 'Notification bell shows subtle reconnecting indicator; app continues to function offline without throwing unhandled exceptions',
      severity: 'Major',
      remarks: 'Graceful real-time fallback'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'Mobile Drawer & Menus',
      category: 'Accessibility',
      parameter: 'Focus Trapping & Escape Key Dismissal',
      scenario: 'Open mobile drawer navigation and press ESC key or Tab key repeatedly',
      expected: 'Focus stays trapped inside drawer while open; pressing ESC closes drawer and restores focus to hamburger toggle button',
      severity: 'Major',
      remarks: 'A11y modal focus trap pattern'
    },
    {
      module: 'AppShell & Navigation',
      screen: 'AppShell',
      category: 'Browser Console',
      parameter: 'Zero React Key & DOM Nesting Warnings',
      scenario: 'Inspect console while collapsing sidebar, switching themes, and opening notifications popover',
      expected: 'Zero "Each child in a list should have a unique key" warnings; zero <div> inside <p> invalid DOM nesting warnings',
      severity: 'Critical',
      remarks: 'React component tree cleanliness'
    },

    // =======================================================================
    // MODULE 3: SUBSCRIPTION TIERS & GATING (TIERS I - IV)
    // =======================================================================
    {
      module: 'Subscription Gating',
      screen: 'Sidebar & Menus',
      category: 'UI',
      parameter: 'Padlock Indicators on Restricted Features',
      scenario: 'Log in as a Tier I (Free) user and inspect sidebar items (Branches, Networking, LMS, Chat)',
      expected: 'Locked features render with small padlock icon next to label; text renders in subtle muted color indicating locked state',
      severity: 'Major',
      remarks: 'Clear visual status for locked features'
    },
    {
      module: 'Subscription Gating',
      screen: 'Sidebar & Modals',
      category: 'UX',
      parameter: 'Locked Feature Click Interception',
      scenario: 'Click on a locked menu item (e.g. "Branches") while on Tier I or Tier II',
      expected: 'Does not render broken screen or 404; opens Plan Upgrade Dialog highlighting Tier III/IV benefits with "Upgrade Now" action',
      severity: 'Critical',
      remarks: 'High-conversion user guidance'
    },
    {
      module: 'Subscription Gating',
      screen: 'Workspace Limits',
      category: 'Validation',
      parameter: 'Tier Quota Limits Validation',
      scenario: 'Test quota limits: Tier I (0 chats, 1 product); Tier II (15 chats, 5 products); Tier III (1 branch, 30 chats)',
      expected: 'Reaching quota disables action button and displays clear inline explanation: "Monthly limit reached. Upgrade to unlock more"',
      severity: 'Critical',
      remarks: 'Strict client-side quota enforcement'
    },
    {
      module: 'Subscription Gating',
      screen: 'Branches (/biz/branches)',
      category: 'Functionality',
      parameter: 'Tier III Branch Unlocking & 2nd Branch Limit',
      scenario: 'Log in as Tier III user: verify Branches unlocked, create 1st branch, then attempt to click "Add New Branch" again',
      expected: 'Tier III allows 1st branch creation; clicking Add Branch for 2nd branch triggers "Branch limit reached (1 max for Tier III). Upgrade to Tier IV for unlimited branches"',
      severity: 'Critical',
      remarks: 'Strict verification of user tier business rules'
    },
    {
      module: 'Subscription Gating',
      screen: 'Global App',
      category: 'Performance',
      parameter: 'Feature Gate Hook (useFeatureAccess) Latency',
      scenario: 'Benchmark execution time of `canAccess(featureKey)` across 50 components on page load',
      expected: 'Evaluation completes in < 5ms via memoization; does not trigger unnecessary re-renders of child components',
      severity: 'Major',
      remarks: 'useMemo & state caching optimization'
    },
    {
      module: 'Subscription Gating',
      screen: 'Route Gate Guard',
      category: 'Navigation',
      parameter: 'Direct Route URL Access Gate Interception',
      scenario: 'Type "http://localhost:3000/biz/branches" directly in browser address bar while logged in as Tier I',
      expected: 'Access is intercepted by UnderApprovalAccessGate / PlanUpgradeDialog; content is not rendered; upgrade prompt is displayed',
      severity: 'Critical',
      remarks: 'Client-side route guard verification'
    },
    {
      module: 'Subscription Gating',
      screen: 'Upgrade Dialog',
      category: 'Compatibility',
      parameter: 'Plan Upgrade Dialog Mobile Layout',
      scenario: 'Trigger Plan Upgrade dialog on Safari iOS and Chrome Android viewports',
      expected: 'Dialog fits within mobile viewport height; features comparison scrolls smoothly; upgrade CTA button remains clickable',
      severity: 'Major',
      remarks: 'Mobile dialog responsive test'
    },
    {
      module: 'Subscription Gating',
      screen: 'Pricing Comparison Table',
      category: 'Responsiveness',
      parameter: '32-Feature Matrix Responsive Table',
      scenario: 'View 32-feature subscriber comparison matrix across mobile, tablet, and desktop screens',
      expected: 'Table provides smooth horizontal swipe on mobile with sticky feature name column; full 4-column grid on desktop',
      severity: 'Major',
      remarks: 'Scrollable table with fixed column'
    },
    {
      module: 'Subscription Gating',
      screen: 'Route & API Client',
      category: 'Security (Client-side)',
      parameter: 'Client-Side State Tampering Prevention',
      scenario: 'Attempt to manually modify `user.subscriberTier` in localStorage or React DevTools state',
      expected: 'Server-side API tokens validate permissions independently; client-side state changes cannot unlock backend-protected operations',
      severity: 'Critical',
      remarks: 'Multi-layered security enforcement'
    },
    {
      module: 'Subscription Gating',
      screen: 'Global Workspace',
      category: 'Error Handling',
      parameter: 'Subscription Expiry Sticky Warning Banner',
      scenario: 'Log in with an account whose subscription expiry date is in the past',
      expected: 'Top sticky alert displays: "Your subscription has expired. Premium features are locked. Renew now"; locked features revert to locked',
      severity: 'Critical',
      remarks: 'checkFeatureAccess isExpired handling'
    },
    {
      module: 'Subscription Gating',
      screen: 'Upgrade Dialog',
      category: 'Accessibility',
      parameter: 'Screen Reader Gating Announcements',
      scenario: 'Navigate locked sidebar items and upgrade dialog using NVDA / VoiceOver',
      expected: 'Screen reader announces "(Locked)" status on restricted items; dialog announces plan pricing and features with proper ARIA attributes',
      severity: 'Major',
      remarks: 'Accessible feature tier indicators'
    },
    {
      module: 'Subscription Gating',
      screen: 'Gating Components',
      category: 'Browser Console',
      parameter: 'Zero Hydration Mismatch on Plan Loading',
      scenario: 'Inspect DevTools console during initial page load while subscription data is loading asynchronously',
      expected: 'Zero React hydration mismatch errors between server render and client tier lookup; clean transitions from Loading to Settled',
      severity: 'Critical',
      remarks: 'planLoading state handles SSR gracefully'
    },

    // =======================================================================
    // MODULE 4: BRANCHES & MULTI-LOCATION MANAGEMENT
    // =======================================================================
    {
      module: 'Branches Management',
      screen: 'Branches Page (/biz/branches)',
      category: 'UI',
      parameter: 'Subscription Header Spacing (gap-4)',
      scenario: 'Inspect header card in Branches page showing "Your Subscription" and "Tier IV (Enterprise)"',
      expected: 'Proper CSS gap spacing (gap-4) is visible between "Your Subscription" text and the tier badge button',
      severity: 'Minor',
      remarks: 'Verified button spacing fix in biz-branches.jsx'
    },
    {
      module: 'Branches Management',
      screen: 'Branches Page (/biz/branches)',
      category: 'UX',
      parameter: 'Optimistic Visibility Toggle Feedback',
      scenario: 'Click visibility toggle switch on a branch card to change state from Active to Hidden',
      expected: 'Toggle flips state immediately with instant badge update; subtle toast confirms "Branch visibility updated"',
      severity: 'Major',
      remarks: 'Optimistic UI update with SWR/React Query'
    },
    {
      module: 'Branches Management',
      screen: 'Add Branch Dialog',
      category: 'Validation',
      parameter: 'Mandatory Fields & URL Regex Validations',
      scenario: 'Attempt submit with empty fields; test invalid phone digits and malformed Google Maps URL',
      expected: 'Form halts submit; highlights missing Name/Address/City; enforces 10-digit phone and valid Google Maps URL format',
      severity: 'Critical',
      remarks: 'Regex check for maps.google.com'
    },
    {
      module: 'Branches Management',
      screen: 'Branches Page (/biz/branches)',
      category: 'Functionality',
      parameter: 'Full Branch CRUD & Quota Counters',
      scenario: 'Test Create Branch with photo, Edit Branch data, and Delete Branch with confirmation alert',
      expected: 'Branch creates and appends to list; edits save and update card; delete frees up branch allowance quota; counter reflects changes',
      severity: 'Critical',
      remarks: 'Full lifecycle multi-location management'
    },
    {
      module: 'Branches Management',
      screen: 'Branches Grid',
      category: 'Performance',
      parameter: 'Storefront Image Lazy Loading & Grid Render',
      scenario: 'Render branch list with 10+ branches containing storefront photos',
      expected: 'Grid renders in < 300ms; images lazy-load on scroll with smooth blur placeholders; memory footprint remains low',
      severity: 'Major',
      remarks: 'next/image optimization'
    },
    {
      module: 'Branches Management',
      screen: 'Branch Card Listing',
      category: 'Navigation',
      parameter: 'Driving Directions Action Link',
      scenario: 'Click "Get Driving Directions" button on branch card',
      expected: 'Opens Google Maps in a new browser tab with branch location coordinates or address pre-filled (target="_blank" rel="noopener noreferrer")',
      severity: 'Major',
      remarks: 'External navigation security'
    },
    {
      module: 'Branches Management',
      screen: 'Add Branch Dialog',
      category: 'Compatibility',
      parameter: 'Storefront Photo Upload on Mobile Browsers',
      scenario: 'Click photo upload button on iOS Safari and Android Chrome',
      expected: 'Native camera / photo picker sheet opens smoothly; selected image compresses and previews without browser crash',
      severity: 'Major',
      remarks: 'Mobile file input compatibility'
    },
    {
      module: 'Branches Management',
      screen: 'Branches Page (/biz/branches)',
      category: 'Responsiveness',
      parameter: 'Branch Cards Multi-Column Grid Collapse',
      scenario: 'Resize browser viewport from 1440px to 768px down to 375px',
      expected: 'Grid adapts smoothly: 3 columns on desktop -> 2 columns on tablet -> 1 column on mobile; card contents remain perfectly readable',
      severity: 'Critical',
      remarks: 'Responsive CSS Grid test'
    },
    {
      module: 'Branches Management',
      screen: 'Branch Form & Card',
      category: 'Security (Client-side)',
      parameter: 'Branch Name & Address XSS Sanitization',
      scenario: 'Enter `<script>alert(1)</script>` into Branch Name and Manager Notes fields and save',
      expected: 'Payload is escaped; text renders as literal string; zero JavaScript executed in DOM on branch card or public directory',
      severity: 'Critical',
      remarks: 'Prevents Stored XSS'
    },
    {
      module: 'Branches Management',
      screen: 'Branches Page (/biz/branches)',
      category: 'Error Handling',
      parameter: 'Save Failure Graceful Degradation',
      scenario: 'Simulate server 500 error while saving or deleting a branch',
      expected: 'Displays non-intrusive error toast: "Failed to save branch. Please check inputs and try again"; user input in modal is NOT lost',
      severity: 'Major',
      remarks: 'Preserves form state on failure'
    },
    {
      module: 'Branches Management',
      screen: 'Branch Card & Modals',
      category: 'Accessibility',
      parameter: 'Aria-Labels on Action Buttons & Focus Trap',
      scenario: 'Inspect Edit/Delete icon buttons and navigate Add Branch dialog using keyboard Tab',
      expected: 'Buttons have clear `aria-label="Edit branch [Name]"`; dialog traps focus when open and returns focus on close',
      severity: 'Major',
      remarks: 'WCAG 2.1 AA dialog compliance'
    },
    {
      module: 'Branches Management',
      screen: 'Branches Page (/biz/branches)',
      category: 'Browser Console',
      parameter: 'Zero React Warnings in Branch List Mapping',
      scenario: 'Add, update, toggle visibility, and delete branches while observing DevTools console',
      expected: 'Zero "Each child in a list should have a unique key" warnings; zero unhandled promise rejections',
      severity: 'Critical',
      remarks: 'Clean state synchronization'
    },

    // =======================================================================
    // MODULE 5: BUSINESS WORKSPACE (BIZ DASHBOARD & OPS)
    // =======================================================================
    {
      module: 'Business Workspace',
      screen: 'Dashboard (/biz)',
      category: 'UI',
      parameter: 'KPI Summary Cards & Copilot Widget Styling',
      scenario: 'Inspect Dashboard metric cards (Leads, Enquiries, Views) and Rifah Copilot AI widget',
      expected: 'Cards render with clean drop-shadows, modern badges, and trend indicators; copilot recommendation cards render distinct accents',
      severity: 'Major',
      remarks: 'Executive dashboard aesthetic'
    },
    {
      module: 'Business Workspace',
      screen: 'Enquiries Inbox (/biz/enquiries)',
      category: 'UX',
      parameter: 'Lead Unlock Confirmation & Balance Feedback',
      scenario: 'Click "Unlock Lead Contact" on an incoming matched buyer enquiry',
      expected: 'Modal asks confirmation: "Unlock buyer contact details? (Uses 1 credit)"; clearly displays remaining monthly lead credits',
      severity: 'Critical',
      remarks: 'Transparent credit consumption UX'
    },
    {
      module: 'Business Workspace',
      screen: 'Catalogue (/biz/catalogue)',
      category: 'Validation',
      parameter: 'Price Numeric & Currency Validation',
      scenario: 'Enter negative price, text characters, or price > 10,00,00,000 in Add Product form',
      expected: 'Input enforces numeric digits >= 0; displays formatted Indian Rupee (₹) symbol prefix; rejects negative numbers',
      severity: 'Major',
      remarks: 'Currency formatting validation'
    },
    {
      module: 'Business Workspace',
      screen: 'Workspace Modules',
      category: 'Functionality',
      parameter: 'Catalogue, Networking & LMS Operations',
      scenario: 'Add catalogue product within tier quota, join networking circle, schedule 1-on-1 meeting, watch LMS video lesson',
      expected: 'Product creates successfully; networking discussion feed updates; meeting invitation sent; course video streams with progress bar',
      severity: 'Critical',
      remarks: 'End-to-end business workspace operations'
    },
    {
      module: 'Business Workspace',
      screen: 'Dashboard (/biz)',
      category: 'Performance',
      parameter: 'KPI Counter Animation Frame Rate',
      scenario: 'Load dashboard and observe StatCountUp numeric animations on metric widgets',
      expected: 'Numbers animate smoothly from 0 to actual value using requestAnimationFrame without locking main thread or dropping frames',
      severity: 'Major',
      remarks: 'Performance animation check'
    },
    {
      module: 'Business Workspace',
      screen: 'Dashboard (/biz)',
      category: 'Navigation',
      parameter: 'Quick Action Shortcut Navigation',
      scenario: 'Click Quick Action shortcuts (e.g. "Add Product", "Post Enquiry", "View Leads") on dashboard',
      expected: 'Routes instantly to respective workspace tab or opens modal with pre-highlighted focus',
      severity: 'Major',
      remarks: 'Seamless internal navigation'
    },
    {
      module: 'Business Workspace',
      screen: 'LMS Academy (/biz/lms)',
      category: 'Compatibility',
      parameter: 'Video Course Player Cross-Browser Playback',
      scenario: 'Play video lesson across Safari, Chrome, Firefox, and Edge on desktop and mobile',
      expected: 'Video plays smoothly with custom play/pause, scrub bar, speed controller, and volume slider; fullscreen mode works cleanly',
      severity: 'Major',
      remarks: 'HTML5 Video player compatibility'
    },
    {
      module: 'Business Workspace',
      screen: 'Workspace Tables',
      category: 'Responsiveness',
      parameter: 'Data Tables Mobile Card View Transformation',
      scenario: 'View enquiries and leads tables on mobile viewport (< 640px)',
      expected: 'Dense tabular data transforms gracefully into mobile card view with clear buyer snippets and action buttons',
      severity: 'Critical',
      remarks: 'Mobile responsive data presentation'
    },
    {
      module: 'Business Workspace',
      screen: 'Profile (/biz/profile)',
      category: 'Security (Client-side)',
      parameter: 'Company PDF Brochure MIME & Size Validation',
      scenario: 'Attempt to upload an executable file (.exe) or PDF > 10MB as company brochure',
      expected: 'Upload is rejected immediately on client side with clear alert: "Only PDF files under 10MB are permitted"',
      severity: 'Critical',
      remarks: 'File upload security check'
    },
    {
      module: 'Business Workspace',
      screen: 'Enquiries (/biz/enquiries)',
      category: 'Error Handling',
      parameter: 'Zero Lead Credits Graceful Handling',
      scenario: 'Attempt to unlock lead when monthly lead unlock quota is 0',
      expected: 'System displays modal: "You have used all lead unlocks for this month. Upgrade your plan for more credits" with upgrade button',
      severity: 'Major',
      remarks: 'Prevents broken UI or uncaught 403 API response'
    },
    {
      module: 'Business Workspace',
      screen: 'LMS Video Player',
      category: 'Accessibility',
      parameter: 'Player Keyboard Shortcuts & Captions Support',
      scenario: 'Control LMS video player using Space (Play/Pause), M (Mute), F (Fullscreen), and Arrow keys (Seek)',
      expected: 'Keyboard shortcuts operate reliably; captions toggle button functions; visual focus indicator active on controls',
      severity: 'Major',
      remarks: 'Media accessibility standard'
    },
    {
      module: 'Business Workspace',
      screen: 'Business Workspace',
      category: 'Browser Console',
      parameter: 'Zero Unhandled API Rejections on Tab Switch',
      scenario: 'Switch rapidly between Feeds, Catalogue, Enquiries, and Verification tabs while data is fetching',
      expected: 'AbortController cancels obsolete network requests cleanly; zero "Unhandled promise rejection" errors in console',
      severity: 'Critical',
      remarks: 'Network cleanup on component unmount'
    },

    // =======================================================================
    // MODULE 6: MEMBERSHIPS, PAYMENTS & CHECKOUT
    // =======================================================================
    {
      module: 'Memberships & Checkout',
      screen: 'Membership (/membership)',
      category: 'UI',
      parameter: 'Pricing Matrix & Chamber Tiers Toggle',
      scenario: 'Toggle between Monthly Subscriber Plans (Tier I-IV) and Chamber Annual Tiers (Silver to Diamond)',
      expected: 'Cards re-render smoothly with distinctive pricing, validity badges (1 to 25 Years), and feature bullet points',
      severity: 'Major',
      remarks: 'Clear visual contrast between plan types'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout (/checkout)',
      category: 'UX',
      parameter: 'Dynamic GST Itemization & Discount Feedback',
      scenario: 'Apply coupon code and observe order summary calculation updates in real time',
      expected: 'Discount deducts before tax; 18% GST recalculates instantly; displays clear itemized CGST/SGST or IGST breakdown',
      severity: 'Critical',
      remarks: 'Transparent billing UX'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout (/checkout)',
      category: 'Validation',
      parameter: 'Coupon Format & Billing State Validation',
      scenario: 'Enter invalid promo code, test empty billing state selection',
      expected: 'Displays error: "Invalid or expired promo code"; billing state selection mandatory for accurate GST (CGST vs IGST) calculation',
      severity: 'Critical',
      remarks: 'Tax compliance validation'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout (/checkout)',
      category: 'Functionality',
      parameter: 'Razorpay Gateway Trigger & Invoice PDF',
      scenario: 'Click "Proceed to Pay", complete payment simulation, and click "Download Tax Invoice"',
      expected: 'Razorpay modal opens securely; payment success updates subscriber tier immediately; downloads valid GST PDF invoice with QR code',
      severity: 'Critical',
      remarks: 'End-to-end payment & invoice flow'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout (/checkout)',
      category: 'Performance',
      parameter: 'Invoice PDF Client-Side Render Speed',
      scenario: 'Click "Download Invoice" and measure time to generate PDF blob',
      expected: 'PDF invoice with logo, itemized tax table, and QR code renders and downloads within 1.5 seconds',
      severity: 'Major',
      remarks: 'Fast client-side PDF generation'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout Confirmation',
      category: 'Navigation',
      parameter: 'Post-Payment Navigation & State Refresh',
      scenario: 'Complete payment and click "Go to Workspace" on payment confirmation screen',
      expected: 'Routes cleanly to Business Workspace with new tier privileges unlocked immediately without requiring manual browser reload',
      severity: 'Critical',
      remarks: 'Context synchronization upon checkout'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Razorpay Overlay',
      category: 'Compatibility',
      parameter: 'UPI & Mobile Wallet Intents on Mobile',
      scenario: 'Trigger checkout modal on mobile device and test UPI payment options (GPay, PhonePe, Paytm)',
      expected: 'UPI app intent links trigger correctly; modal remains fully visible and responsive without iframe cutoff',
      severity: 'Critical',
      remarks: 'Mobile UPI checkout compatibility'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout (/checkout)',
      category: 'Responsiveness',
      parameter: 'Two-Column Checkout Stack on Mobile',
      scenario: 'Inspect checkout page layout on mobile screens (< 768px)',
      expected: 'Plan details and Order Summary stack vertically; sticky payment CTA button stays visible at bottom of mobile screen',
      severity: 'Major',
      remarks: 'Responsive checkout UX'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout (/checkout)',
      category: 'Security (Client-side)',
      parameter: 'Zero Card Data Exposure (PCI-DSS Compliance)',
      scenario: 'Inspect network payload and client state during credit card entry',
      expected: 'Card details are processed exclusively inside Razorpay secure sandboxed iframe; zero card data touches Rifah frontend DOM or memory',
      severity: 'Critical',
      remarks: 'Strict PCI-DSS compliance'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout (/checkout)',
      category: 'Error Handling',
      parameter: 'Payment Modal Dismissal & Gateway Error',
      scenario: 'Close Razorpay modal without paying, or trigger simulated payment failure',
      expected: 'Displays non-blocking alert: "Payment was cancelled. Your card was not charged"; user can retry payment without re-entering data',
      severity: 'Major',
      remarks: 'Graceful payment recovery'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout Summary',
      category: 'Accessibility',
      parameter: 'Aria-Live Price Updates for Screen Readers',
      scenario: 'Apply coupon code and change billing states using screen reader (NVDA / VoiceOver)',
      expected: 'Order summary uses `aria-live="polite"` so screen reader announces new grand total dynamically when price changes',
      severity: 'Major',
      remarks: 'A11y dynamic price announcement'
    },
    {
      module: 'Memberships & Checkout',
      screen: 'Checkout (/checkout)',
      category: 'Browser Console',
      parameter: 'Razorpay Script Load & Unmount Cleanup',
      scenario: 'Navigate to checkout, close checkout, and navigate away while monitoring console',
      expected: 'External Razorpay SDK script loads securely via HTTPS; cleanup listeners remove smoothly on unmount with zero console warnings',
      severity: 'Critical',
      remarks: 'SDK memory leak prevention'
    },

    // =======================================================================
    // MODULE 7: REAL-TIME MESSAGES & CHAT
    // =======================================================================
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'UI',
      parameter: 'Chat Bubble Styling & Presence Indicators',
      scenario: 'Inspect chat thread layout, sender vs receiver bubbles, timestamps, and green online presence indicator dot',
      expected: 'Sender bubbles align right in primary brand color; receiver bubbles align left in neutral gray; timestamps display in relative time',
      severity: 'Major',
      remarks: 'Visual clarity of chat interface'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'UX',
      parameter: 'Auto-Scroll to Bottom & Typing Indicators',
      scenario: 'Receive new message in active thread; observe scroll position and "typing..." indicator',
      expected: 'Chat thread auto-scrolls smoothly to the latest message; typing indicator displays when conversation partner types',
      severity: 'Major',
      remarks: 'Smooth conversational UX'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Validation',
      parameter: 'Empty / Whitespace Message Blocking',
      scenario: 'Attempt to send empty message or string containing only spaces',
      expected: 'Send button remains disabled; pressing Enter does not dispatch message or create empty chat bubble',
      severity: 'Minor',
      remarks: 'Prevents empty message spam'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Functionality',
      parameter: 'Instant Socket Message Dispatch & Image Lightbox',
      scenario: 'Send text message, upload image attachment, and click image bubble to view in full lightbox',
      expected: 'Message transmits instantly via Socket.io with optimistic delivery tick; image attachment previews in responsive lightbox',
      severity: 'Critical',
      remarks: 'Real-time WebSocket communication'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Performance',
      parameter: 'Long Conversation List Virtualization',
      scenario: 'Open chat conversation containing 500+ past messages and scroll through history',
      expected: 'Scroll performance remains steady at 60fps; DOM nodes are recycled/virtualized to avoid browser memory bloat',
      severity: 'Major',
      remarks: 'Chat message list virtualization'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Directory & Profile',
      category: 'Navigation',
      parameter: 'Deep-Linking to Chat from Business Profile',
      scenario: 'Click "Message Business" button on a public business directory profile',
      expected: 'Routes directly to `/biz/messages?contactId=[id]`, auto-selects recipient, and opens conversation thread',
      severity: 'Major',
      remarks: 'Cross-module deep link navigation'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Compatibility',
      parameter: 'WebSocket to Long-Polling Fallback',
      scenario: 'Block WebSocket protocol in browser network settings and reload chat',
      expected: 'Socket.io client falls back automatically to HTTP long-polling transport; messages continue to send and receive reliably',
      severity: 'Critical',
      remarks: 'Network transport fallback'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Responsiveness',
      parameter: 'Mobile View Conversation View Toggle',
      scenario: 'Open Messages on mobile viewport (< 768px), tap a contact, then tap Back button',
      expected: 'Tapping contact transitions to full-screen conversation view; top back button returns to contacts list smoothly',
      severity: 'Critical',
      remarks: 'Master-detail pattern for mobile chat'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Security (Client-side)',
      parameter: 'Strict Message XSS Sanitization',
      scenario: 'Type `<script>alert("XSS")</script>` or `<img src=x onerror=alert(1)>` in chat input and send',
      expected: 'Payload is escaped; renders as literal plain text; zero JavaScript executed in recipient or sender DOM',
      severity: 'Critical',
      remarks: 'DOMPurify / React JSX escaping verification'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Error Handling',
      parameter: 'Disconnection Toast & Auto-Reconnect',
      scenario: 'Disconnect internet while chatting, then reconnect internet',
      expected: 'Subtle warning appears: "Connecting to chat..."; reconnects automatically when online; queues unsent messages',
      severity: 'Major',
      remarks: 'Resilient connection state handling'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Accessibility',
      parameter: 'Screen Reader Incoming Message Announcement',
      scenario: 'Receive message while screen reader is active on chat window',
      expected: 'New incoming messages are announced with sender name via `aria-live="polite"`; chat input accessible via Tab key',
      severity: 'Major',
      remarks: 'Conversational accessibility'
    },
    {
      module: 'Real-Time Chat',
      screen: 'Messages (/biz/messages)',
      category: 'Browser Console',
      parameter: 'Zero Socket Connection Error Spam',
      scenario: 'Monitor console during network reconnection and unmount events',
      expected: 'Socket reconnection attempts do not flood console with uncaught error traces; cleanup handlers disconnect cleanly',
      severity: 'Major',
      remarks: 'Console error throttling'
    },

    // =======================================================================
    // MODULE 8: PUBLIC DIRECTORY, DISCOVERY & EVENTS
    // =======================================================================
    {
      module: 'Public Directory',
      screen: 'Directory (/business)',
      category: 'UI',
      parameter: 'Verified Chamber Badges & Card Layout',
      scenario: 'Inspect business directory cards, verified chamber seals, rating stars, and industry badges',
      expected: 'Badges render with high visual clarity; verified status displays green checkmark; cards maintain uniform height and spacing',
      severity: 'Major',
      remarks: 'Directory trust indicators'
    },
    {
      module: 'Public Directory',
      screen: 'Business Showcase (/business/[slug])',
      category: 'UX',
      parameter: 'Profile Link Share Action & Clipboard Toast',
      scenario: 'Click "Share Profile" button on a public business showcase page',
      expected: 'Copies public profile URL to clipboard with confirmation toast: "Profile link copied!"; triggers native share sheet on mobile',
      severity: 'Major',
      remarks: 'Social sharing user experience'
    },
    {
      module: 'Public Directory',
      screen: 'Send Enquiry Modal',
      category: 'Validation',
      parameter: 'Direct Lead Inquiry Form Validation',
      scenario: 'Submit public inquiry modal without filling Name, 10-digit mobile, or with message < 20 characters',
      expected: 'Form prevents submit; displays inline field errors: "Mobile must be 10 digits", "Requirement details must be at least 20 chars"',
      severity: 'Critical',
      remarks: 'Quality lead capture validation'
    },
    {
      module: 'Public Directory',
      screen: 'Public Events (/events)',
      category: 'Functionality',
      parameter: 'Multi-Filter Search & Digital Event Pass',
      scenario: 'Search directory by keyword/city/industry simultaneously, register for chapter meeting event',
      expected: 'Directory results filter dynamically; event registration generates downloadable digital QR pass with genuine verification code',
      severity: 'Critical',
      remarks: 'Public search and event pass generation'
    },
    {
      module: 'Public Directory',
      screen: 'Homepage (/)',
      category: 'Performance',
      parameter: 'Core Web Vitals & Image Formats',
      scenario: 'Run Lighthouse Core Web Vitals audit on Rifah public homepage and directory',
      expected: 'LCP < 2.5s; CLS < 0.1; INP < 100ms; images load in WebP/AVIF format with width/height attributes to eliminate layout shift',
      severity: 'Major',
      remarks: 'SEO and performance ranking standard'
    },
    {
      module: 'Public Directory',
      screen: 'Directory (/business)',
      category: 'Navigation',
      parameter: 'Search Query Parameter URL Synchronization',
      scenario: 'Select City "Mumbai" and Category "Manufacturing" in directory filters, then copy URL into a new tab',
      expected: 'URL updates to `/business?city=mumbai&category=manufacturing`; opening URL in new tab restores exact filtered view',
      severity: 'Critical',
      remarks: 'Shareable and bookmarkable search URLs'
    },
    {
      module: 'Public Directory',
      screen: 'Business Showcase',
      category: 'Compatibility',
      parameter: 'Google Maps Directions Button Across Devices',
      scenario: 'Click "Get Driving Directions" on desktop and mobile browsers',
      expected: 'Opens Google Maps web on desktop and prompts native Google Maps / Apple Maps app on mobile with exact coordinates',
      severity: 'Major',
      remarks: 'Universal map directions handling'
    },
    {
      module: 'Public Directory',
      screen: 'Directory (/business)',
      category: 'Responsiveness',
      parameter: 'Filter Sidebar to Mobile Drawer Transition',
      scenario: 'View directory page on desktop (> 1024px) vs mobile (< 768px)',
      expected: 'Desktop shows permanent left filter sidebar; mobile hides sidebar and provides "Filter Results" button opening slide-up filter sheet',
      severity: 'Critical',
      remarks: 'Responsive filtering drawer'
    },
    {
      module: 'Public Directory',
      screen: 'Directory Search',
      category: 'Security (Client-side)',
      parameter: 'Search Query Injection & Bot Honeypot',
      scenario: 'Submit special characters (`\' OR 1=1 --`) in search query and test public inquiry form with hidden honeypot field',
      expected: 'Query is sanitized without SQL/DOM error; honeypot field blocks automated spam bot submissions',
      severity: 'Critical',
      remarks: 'Public form bot protection'
    },
    {
      module: 'Public Directory',
      screen: 'Directory (/business)',
      category: 'Error Handling',
      parameter: 'Zero Results Empty State & Filter Reset',
      scenario: 'Search for a non-existent keyword or combination that yields 0 matching businesses',
      expected: 'Renders friendly empty state illustration with helpful text: "No businesses found matching your criteria" and "Reset Filters" button',
      severity: 'Major',
      remarks: 'Prevents dead-end user experience'
    },
    {
      module: 'Public Directory',
      screen: 'Directory & Events',
      category: 'Accessibility',
      parameter: 'Image Alt Attributes & Filter Pill ARIA',
      scenario: 'Inspect directory business logos, event banner images, and industry filter pills with Axe DevTools',
      expected: 'All images possess descriptive `alt` text; industry filter pills have `role="button"` and `aria-pressed="true/false"` state',
      severity: 'Major',
      remarks: 'WCAG 2.1 AA accessibility audit'
    },
    {
      module: 'Public Directory',
      screen: 'Public Directory',
      category: 'Browser Console',
      parameter: 'Zero 404 Image Warnings & Hydration Cleanliness',
      scenario: 'Scroll through 50+ directory cards while monitoring DevTools console',
      expected: 'Fallback placeholder renders if business logo is missing; zero 404 broken image console errors; clean SSR hydration',
      severity: 'Major',
      remarks: 'Image error fallback handler'
    },

    // =======================================================================
    // MODULE 9: ADMIN DESKS & OPERATIONS (/admin/*)
    // =======================================================================
    {
      module: 'Admin Management',
      screen: 'Admin Dashboard (/admin)',
      category: 'UI',
      parameter: 'KPI Metric Grid & High-Density Tables',
      scenario: 'Inspect Admin Dashboard metrics (Active Users, Verified Businesses, MRR Revenue, Pending KYC)',
      expected: 'Dense tabular data renders with clear column headers, zebra striping, status pills, and action icon buttons',
      severity: 'Major',
      remarks: 'Admin operational data layout'
    },
    {
      module: 'Admin Management',
      screen: 'KYC Verification (/admin/verification)',
      category: 'UX',
      parameter: 'Document Lightbox Inspection Viewer',
      scenario: 'Click on uploaded GSTIN / PAN document thumbnail to inspect business registration compliance',
      expected: 'Document opens in full-screen lightbox modal with zoom and rotate controls; compliance officer can verify details comfortably',
      severity: 'Major',
      remarks: 'Compliance inspection UX'
    },
    {
      module: 'Admin Management',
      screen: 'KYC Verification (/admin/verification)',
      category: 'Validation',
      parameter: 'Mandatory Rejection Remarks Enforcement',
      scenario: 'Click "Reject" on a business verification submission without entering rejection remarks',
      expected: 'System blocks rejection and highlights remarks textarea: "Please provide a reason for rejecting verification documents"',
      severity: 'Critical',
      remarks: 'Prevents unexplained rejections'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Desks (/admin/*)',
      category: 'Functionality',
      parameter: 'One-Click KYC Approval & Manual Tier Override',
      scenario: 'Approve business KYC, update member tier dropdown to "Tier IV (Enterprise)", and toggle user suspension',
      expected: 'Business updates to Verified immediately; member gains instant access to Tier IV enterprise features; suspension blocks login',
      severity: 'Critical',
      remarks: 'Central administration operations'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Tables',
      category: 'Performance',
      parameter: 'Large User Table Pagination & Filter Latency',
      scenario: 'Search and paginate through 1,000+ member records in User Management table',
      expected: 'Server-side pagination and debounced filtering return results in < 800ms; table does not freeze UI thread during re-render',
      severity: 'Major',
      remarks: 'High-volume administrative scalability'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Navigation',
      category: 'Navigation',
      parameter: 'Admin Hierarchical Breadcrumbs & Deep Desks',
      scenario: 'Navigate from Central Admin -> Chapters -> Chapter Details -> Member Roster, then back',
      expected: 'Hierarchical breadcrumbs display every step cleanly; clicking any ancestor link navigates immediately with state preserved',
      severity: 'Major',
      remarks: 'Multi-level administrative navigation'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Tables',
      category: 'Compatibility',
      parameter: 'CSV / Excel Data Export Across Browsers',
      scenario: 'Click "Export Members to CSV" in Chrome, Firefox, Safari, and Edge',
      expected: 'Browser downloads valid `.csv` file with UTF-8 BOM encoding; opens cleanly in Microsoft Excel without character corruption',
      severity: 'Major',
      remarks: 'Data export compatibility'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Tables',
      category: 'Responsiveness',
      parameter: 'Touch-Scrollable Tables with Pinned Actions',
      scenario: 'View dense admin tables on tablet (768px - 1024px) or mobile viewports',
      expected: 'Table provides smooth horizontal touch scrolling while "Actions" column remains pinned on the right for easy access',
      severity: 'Major',
      remarks: 'Pinned column responsive table pattern'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Route Security',
      category: 'Security (Client-side)',
      parameter: 'RBAC Admin Route Interception & 403 Page',
      scenario: 'Attempt direct URL navigation to `/admin` while logged in as a normal member or business owner',
      expected: 'System immediately blocks route rendering; redirects user to 403 Forbidden screen or back to `/biz` dashboard',
      severity: 'Critical',
      remarks: 'Strict client-side role guard protection'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Operations',
      category: 'Error Handling',
      parameter: 'Failed Operational Action Rollback Toast',
      scenario: 'Simulate network timeout while executing manual tier override or account suspension',
      expected: 'Displays red error toast: "Failed to update member status. Changes rolled back"; toggle switch returns to original state',
      severity: 'Critical',
      remarks: 'Optimistic state rollback on failure'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Confirmation Dialogs',
      category: 'Accessibility',
      parameter: 'High-Risk Action Modal Focus Management',
      scenario: 'Trigger "Suspend Member Account" confirmation modal using keyboard Tab and Enter keys',
      expected: 'Focus moves directly to "Cancel" button by default (preventing accidental submit); ESC key cancels modal safely',
      severity: 'Major',
      remarks: 'Accessible high-risk confirmation pattern'
    },
    {
      module: 'Admin Management',
      screen: 'Admin Desks',
      category: 'Browser Console',
      parameter: 'Zero React Key Warnings in Audit Log Tables',
      scenario: 'Navigate through Audit Logs, Revenue Sharing, and Role Permissions tabs while observing console',
      expected: 'Zero unique key warnings; zero memory leak warnings on unmounted table components; pristine console logs',
      severity: 'Critical',
      remarks: 'Admin panel code quality'
    },

    // =======================================================================
    // MODULE 10: NON-FUNCTIONAL & CROSS-CUTTING STANDARDS
    // =======================================================================
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'UI',
      parameter: 'Design System Typography & Color Token Parity',
      scenario: 'Audit font families, H1-H6 heading hierarchy, button hover states, and color tokens across all pages',
      expected: 'Consistent typography (Inter/Outfit); primary/secondary/neutral tokens applied systematically without ad-hoc inline styles',
      severity: 'Major',
      remarks: 'Enterprise design system compliance'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'UX',
      parameter: 'Skeleton Loading Placeholders',
      scenario: 'Observe visual feedback while async data is loading across Dashboard, Catalogue, and Directory pages',
      expected: 'Shimmering skeleton placeholder cards render during fetch; prevents sudden content shifts or blank flashes',
      severity: 'Major',
      remarks: 'Smooth perceived loading speed'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Validation',
      parameter: 'Universal Client-Side Form Sanitization',
      scenario: 'Test all input fields across portal with leading/trailing whitespaces and extreme character lengths (10,000+ chars)',
      expected: 'Inputs trim excessive whitespaces; enforce defined maxLength attributes; prevent input buffer overflow',
      severity: 'Major',
      remarks: 'Universal input constraint checking'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Functionality',
      parameter: 'Global Offline Network Detection Toast',
      scenario: 'Toggle offline mode in browser DevTools Network tab while navigating the application',
      expected: 'Persistent, non-intrusive banner appears: "You are currently offline. Please check your connection"; reconnects automatically',
      severity: 'Critical',
      remarks: 'Offline listener event handling'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Performance',
      parameter: 'Next.js Bundle Splitting & Dynamic Imports',
      scenario: 'Inspect Network tab JS chunk sizes during initial load and subsequent route navigation',
      expected: 'Heavy modals (Checkout, Crop image, Course player) are dynamically imported (`next/dynamic`); initial JS bundle < 250KB',
      severity: 'Major',
      remarks: 'Code splitting performance optimization'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Navigation',
      parameter: 'Branded 404 & 500 Error Recovery Boundaries',
      scenario: 'Navigate to an invalid route `/xyz-does-not-exist` and trigger simulated component render error',
      expected: 'Renders custom branded 404 / 500 recovery screens with Rifah illustration and "Back to Dashboard" button',
      severity: 'Critical',
      remarks: 'Custom not-found.js and error.js boundaries'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Compatibility',
      parameter: 'Cross-Browser Parity (Chrome, Firefox, Safari, Edge)',
      scenario: 'Test all critical flows across latest Chrome, Firefox, Safari, Edge, Android Chrome, and iOS Safari',
      expected: 'Layouts, typography, form controls, modals, and CSS transitions render consistently across all major browsers',
      severity: 'Critical',
      remarks: 'Multi-browser cross-platform standard'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Responsiveness',
      parameter: 'Multi-Device Breakpoint Coverage (375px to 1920px)',
      scenario: 'Test portal on 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1024px (iPad Pro), 1440px, and 1920px viewports',
      expected: 'Zero horizontal scrollbars; content wraps and stacks cleanly; touch targets maintain min 44x44px across all touchscreens',
      severity: 'Critical',
      remarks: 'Full spectrum responsive audit'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Security (Client-side)',
      parameter: 'Universal DOM-Based XSS Protection',
      scenario: 'Submit HTML/script payloads into search boxes, profile descriptions, and product titles',
      expected: 'All inputs are sanitized before rendering into the DOM; payloads render harmlessly as escaped text strings',
      severity: 'Critical',
      remarks: 'Prevent Stored and Reflected XSS'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Error Handling',
      parameter: 'Global React ErrorBoundary Recovery',
      scenario: 'Trigger unhandled runtime exception inside a nested component',
      expected: 'ErrorBoundary isolates crash to that specific widget; renders "Something went wrong" card with "Try Again" without crashing entire app',
      severity: 'Critical',
      remarks: 'Component-level fault isolation'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Accessibility',
      parameter: 'WCAG 2.1 AA Color Contrast & ARIA Labels',
      scenario: 'Run full Axe / Lighthouse Accessibility audit across all pages in dark and light modes',
      expected: 'Color contrast achieves minimum 4.5:1 ratio; all interactive buttons have descriptive `aria-label`; accessibility score >= 95',
      severity: 'Major',
      remarks: 'WCAG 2.1 AA certified compliance'
    },
    {
      module: 'Cross-Cutting Standards',
      screen: 'All Screens',
      category: 'Browser Console',
      parameter: 'Zero Production Console Warnings & Errors',
      scenario: 'Inspect DevTools console across entire portal traversal',
      expected: 'Console is completely pristine: 0 uncaught exceptions, 0 unhandled promise rejections, 0 unique React key warnings',
      severity: 'Critical',
      remarks: 'Gold standard console hygiene'
    }
  ];

  // Helper to format and populate a worksheet with test cases
  function populateWorksheet(ws, items) {
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.columns = columns;

    items.forEach((tc, idx) => {
      const row = ws.addRow({
        module: tc.module,
        screen: tc.screen,
        category: tc.category,
        parameter: tc.parameter,
        scenario: tc.scenario,
        expected: tc.expected,
        actual: '',
        status: '',
        severity: tc.severity,
        remarks: tc.remarks
      });

      row.height = 36;
      const isEven = idx % 2 === 0;
      const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBgColor }
        };

        cell.font = {
          name: 'Segoe UI',
          size: 10,
          color: { argb: 'FF1E293B' }
        };

        if (colNumber === 3 || colNumber === 8 || colNumber === 9) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }

        // Severity badge styling
        if (colNumber === 9) {
          if (tc.severity === 'Critical') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF991B1B' } };
          } else if (tc.severity === 'Major') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF92400E' } };
          } else if (tc.severity === 'Minor') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF075985' } };
          }
        }

        // Parameter Category styling
        if (colNumber === 3) {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E3A8A' } };
        }

        // Testing Parameter bold
        if (colNumber === 4) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        }
      });
    });

    // Style Header Row
    const headerRow = ws.getRow(1);
    headerRow.height = 32;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' }
      };
      cell.font = {
        name: 'Segoe UI',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'medium', color: { argb: 'FF2563EB' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } }
      };
    });

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: items.length + 1, column: 10 }
    };
  }

  // ==========================================
  // 1. EXECUTIVE SUMMARY SHEET
  // ==========================================
  const summaryWs = workbook.addWorksheet('Executive_Summary');
  summaryWs.views = [{ showGridLines: true }];
  summaryWs.columns = [
    { width: 5 },
    { width: 34 },
    { width: 24 },
    { width: 48 }
  ];

  summaryWs.mergeCells('B2:D2');
  const titleCell = summaryWs.getCell('B2');
  titleCell.value = 'RIFAH CONNECT - FRONTEND QA TESTING SUITE';
  titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  summaryWs.getRow(2).height = 30;

  summaryWs.mergeCells('B3:D3');
  const subCell = summaryWs.getCell('B3');
  subCell.value = 'Full 12-Category Parameter Matrix Enforced across Every Module (UI, UX, Validation, Functionality, Performance, Navigation, Compatibility, Responsiveness, Security, Error Handling, Accessibility, Browser Console)';
  subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } };
  summaryWs.getRow(3).height = 20;

  summaryWs.getCell('B5').value = 'Test Suite Metrics';
  summaryWs.getCell('B5').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };

  const summaryData = [
    ['Total Test Cases Formulated', testCases.length, 'Every Module Tests All 12 Standard Categories'],
    ['Critical Severity Cases', testCases.filter(t => t.severity === 'Critical').length, 'Zero-Tolerance for Production Deployment'],
    ['Major Severity Cases', testCases.filter(t => t.severity === 'Major').length, 'Core Workflows, Responsiveness & Compatibility'],
    ['Minor Severity Cases', testCases.filter(t => t.severity === 'Minor').length, 'Visual Polish, Tooltips & Cosmetic Enhancements'],
    ['Standard Categories per Sheet', '12 of 12 (100% Coverage)', 'UI, UX, Validation, Functionality, Performance, Navigation, Compatibility, Responsiveness, Security, Error Handling, Accessibility, Browser Console'],
    ['Workbook Organization', 'Dedicated Tab per Module', '10 Module Tabs + Master Sheet + Executive Summary']
  ];

  let curRow = 6;
  summaryData.forEach(([label, val, desc]) => {
    const r = summaryWs.getRow(curRow);
    r.height = 24;
    summaryWs.getCell(`B${curRow}`).value = label;
    summaryWs.getCell(`B${curRow}`).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF334155' } };
    summaryWs.getCell(`C${curRow}`).value = val;
    summaryWs.getCell(`C${curRow}`).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    summaryWs.getCell(`C${curRow}`).alignment = { horizontal: 'center' };
    summaryWs.getCell(`D${curRow}`).value = desc;
    summaryWs.getCell(`D${curRow}`).font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF64748B' } };

    ['B', 'C', 'D'].forEach(col => {
      summaryWs.getCell(`${col}${curRow}`).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
    curRow++;
  });

  // Module Breakdown & Navigation Index
  curRow += 2;
  summaryWs.getCell(`B${curRow}`).value = 'Module Sheets Quick Index';
  summaryWs.getCell(`B${curRow}`).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
  curRow++;

  const moduleSheetDefinitions = [
    { sheetName: 'Auth_Onboarding', moduleName: 'Auth & Onboarding', title: '1. Auth & Onboarding' },
    { sheetName: 'AppShell_Navigation', moduleName: 'AppShell & Navigation', title: '2. AppShell & Navigation' },
    { sheetName: 'Subscription_Gating', moduleName: 'Subscription Gating', title: '3. Subscription Tiers & Gating (Tiers I-IV)' },
    { sheetName: 'Branches_Management', moduleName: 'Branches Management', title: '4. Branches & Multi-Location Management' },
    { sheetName: 'Business_Workspace', moduleName: 'Business Workspace', title: '5. Business Workspace (/biz/*)' },
    { sheetName: 'Memberships_Checkout', moduleName: 'Memberships & Checkout', title: '6. Memberships, Pricing & Checkout' },
    { sheetName: 'RealTime_Chat', moduleName: 'Real-Time Chat', title: '7. Real-Time Messages & Chat' },
    { sheetName: 'Public_Directory', moduleName: 'Public Directory', title: '8. Public Directory & Showcase' },
    { sheetName: 'Admin_Management', moduleName: 'Admin Management', title: '9. Admin Desks & Operations (/admin/*)' },
    { sheetName: 'CrossCutting_Standards', moduleName: 'Cross-Cutting Standards', title: '10. Non-Functional & Cross-Cutting' }
  ];

  moduleSheetDefinitions.forEach(m => {
    const count = testCases.filter(t => t.module === m.moduleName).length;
    const r = summaryWs.getRow(curRow);
    r.height = 22;
    summaryWs.getCell(`B${curRow}`).value = m.title;
    summaryWs.getCell(`B${curRow}`).font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
    summaryWs.getCell(`C${curRow}`).value = `${count} Scenarios (All 12 Cats)`;
    summaryWs.getCell(`C${curRow}`).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF2563EB' } };
    summaryWs.getCell(`C${curRow}`).alignment = { horizontal: 'center' };
    summaryWs.getCell(`D${curRow}`).value = `Sheet Tab: "${m.sheetName}"`;
    summaryWs.getCell(`D${curRow}`).font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF475569' } };

    ['B', 'C', 'D'].forEach(col => {
      summaryWs.getCell(`${col}${curRow}`).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
    curRow++;
  });

  // QA Sign-Off
  curRow += 2;
  summaryWs.getCell(`B${curRow}`).value = 'QA Sign-Off Authorization';
  summaryWs.getCell(`B${curRow}`).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
  curRow++;

  const signOffRows = [
    ['Lead QA Engineer', '', 'Date & Signature'],
    ['Frontend Lead Engineer', '', 'Date & Signature'],
    ['Product Manager', '', 'Date & Signature']
  ];

  signOffRows.forEach(([role, empty, note]) => {
    const r = summaryWs.getRow(curRow);
    r.height = 26;
    summaryWs.getCell(`B${curRow}`).value = role;
    summaryWs.getCell(`B${curRow}`).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF334155' } };
    summaryWs.getCell(`C${curRow}`).value = empty;
    summaryWs.getCell(`D${curRow}`).value = note;
    summaryWs.getCell(`D${curRow}`).font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } };

    ['B', 'C', 'D'].forEach(col => {
      summaryWs.getCell(`${col}${curRow}`).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
    curRow++;
  });

  // ==========================================
  // 2. CONSOLIDATED MASTER SHEET: All_Frontend_Testing
  // ==========================================
  const masterWs = workbook.addWorksheet('All_Frontend_Testing');
  populateWorksheet(masterWs, testCases);

  // ==========================================
  // 3. INDIVIDUAL DEDICATED MODULE SHEETS
  // ==========================================
  moduleSheetDefinitions.forEach(def => {
    const filteredCases = testCases.filter(tc => tc.module === def.moduleName);
    const modWs = workbook.addWorksheet(def.sheetName);
    populateWorksheet(modWs, filteredCases);
  });

  try {
    await workbook.xlsx.writeFile(primaryPath);
    console.log(`Testing parameter sheet successfully generated at: ${primaryPath}`);
  } catch (err) {
    if (err.code === 'EBUSY') {
      console.warn(`Primary file is currently open in Excel: ${primaryPath}`);
      await workbook.xlsx.writeFile(fallbackPath);
      console.log(`Saved updated workbook to: ${fallbackPath}`);
    } else {
      throw err;
    }
  }
}

generateCompleteTestingSheet().catch(err => {
  console.error('Error generating complete testing sheet:', err);
  process.exit(1);
});
