---
description: "Generate and run E2E tests with Playwright. Create test journeys, capture screenshots/videos on failure."
---

# E2E

Generate and run E2E tests with Playwright.

## Usage

```bash
# Generate E2E test for a flow
/jikime:e2e Test login flow

# Run existing E2E tests
/jikime:e2e --run

# Run specific test
/jikime:e2e --run @tests/e2e/auth.spec.ts

# Debug mode
/jikime:e2e --run --debug

# Specify URL directly (skip server detection)
/jikime:e2e --url http://localhost:4000
```

## Options

| Option | Description |
|--------|-------------|
| `[description]` | User flow to test |
| `--run` | Run existing tests |
| `--debug` | Debug mode (headed browser) |
| `--headed` | Show browser window |
| `--url <url>` | Target URL (skip server detection) |

## Dev Server Auto Detection

**Pre-execution Step**: Before running tests, automatically detect running dev servers.

### Detection Logic

```bash
# Scan common dev server ports
COMMON_PORTS=(3000 3001 5173 5174 8080 4200 8000 8888)

# Check each port for running server
for port in ${COMMON_PORTS[@]}; do
  if lsof -i :$port -sTCP:LISTEN >/dev/null 2>&1; then
    # Server found on this port
  fi
done
```

### Behavior Based on Detection

| Scenario | Action |
|----------|--------|
| **1 server found** | Use automatically, inform user |
| **Multiple servers found** | Ask user which one to use |
| **No servers found** | Ask for URL or offer to help start server |
| **`--url` provided** | Skip detection, use provided URL |

### Example Interactions

**Single Server Detected:**
```
Detected dev server running on http://localhost:3000
Using this URL for E2E tests.
```

**Multiple Servers Detected:**
```
Detected multiple dev servers:
1. http://localhost:3000
2. http://localhost:5173
3. http://localhost:8080

Which server should be used for E2E tests?
```

**No Server Detected:**
```
No running dev server detected.

Options:
1. Enter URL manually
2. Help start the dev server (npm run dev)
3. Cancel and start server yourself
```

### Port Detection Priority

| Port | Common Framework |
|------|------------------|
| 3000 | Next.js, Create React App |
| 3001 | Next.js (alt) |
| 5173 | Vite |
| 5174 | Vite (alt) |
| 8080 | Vue CLI, generic |
| 4200 | Angular |
| 8000 | Django, generic |
| 8888 | Jupyter, generic |

## Test Generation

```typescript
// Generated: tests/e2e/login.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Login Flow', () => {
  test('user can login with credentials', async ({ page }) => {
    // 1. Navigate to login page
    await page.goto('/login')

    // 2. Fill credentials
    await page.fill('[data-testid="email"]', 'test@example.com')
    await page.fill('[data-testid="password"]', 'password123')

    // 3. Submit form
    await page.click('[data-testid="submit"]')

    // 4. Verify redirect
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('h1')).toContainText('Dashboard')
  })
})
```

## Best Practices

### DO ✅
- Use `data-testid` attributes
- Wait for API responses (not timeouts)
- Page Object Model pattern
- Test critical user journeys

### DON'T ❌
- Select by CSS class (changes frequently)
- Test implementation details
- Test on production environment
- E2E for all edge cases (use unit tests instead)

## Artifacts

Auto-captured on test failure:
- 📸 Screenshot
- 📹 Video recording
- 🔍 Trace file (step-by-step)

```bash
# View trace
npx playwright show-trace artifacts/trace.zip

# View report
npx playwright show-report
```

## Output

```markdown
## E2E Test Results

### Summary
- Total: 5 tests
- Passed: 4 (80%)
- Failed: 1
- Duration: 12.3s

### Failed Tests
❌ login.spec.ts:15 - user can login
   Error: Timeout waiting for '[data-testid="submit"]'
   Screenshot: artifacts/login-failure.png

### Artifacts
📸 Screenshots: 2 files
📹 Videos: 1 file
📊 HTML Report: playwright-report/index.html
```

## Quick Commands

```bash
# Install Playwright
npx playwright install

# Run all tests
npx playwright test

# Run headed
npx playwright test --headed

# Generate test code
npx playwright codegen http://localhost:3000
```

## Critical Flows to Test

**Critical (Must Pass):**
1. Login/Logout
2. Sign up
3. Core feature flow

**Important:**
1. User profile
2. Settings changes
3. Responsive layout

## Related Commands

- `/jikime:test` - Unit/Integration tests
- `/jikime:1-plan` - Identify flows to test
- `/jikime:security` - Review test code

---

Version: 1.1.0
