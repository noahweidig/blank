import { expect, test } from '@playwright/test'

test.describe('install guide', () => {
  test('is served at /install', async ({ page }) => {
    await page.goto('/install')
    await expect(page).toHaveTitle(/Installing Blank/i)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Installing Blank')
  })

  test('covers macOS only', async ({ page }) => {
    await page.goto('/install')
    await expect(page.locator('#macos')).toBeVisible()
    await expect(page.locator('main')).not.toContainText(/Windows|Linux/)
  })

  test('walks through the macOS first-launch block', async ({ page }) => {
    await page.goto('/install')
    const steps = page.locator('#macos .step')
    await expect(steps).toHaveCount(4)

    const text = (await steps.allTextContents()).join(' ')
    // The route that actually works on a current Mac.
    expect(text).toContain('Privacy')
    expect(text).toContain('Open Anyway')
    // "Move to Bin" deletes the app, so the guide must steer away from it.
    expect(text).toContain('Move to Bin')
  })

  test('says plainly that right-click no longer works', async ({ page }) => {
    await page.goto('/install')
    // Mentioning it is fine — recommending it is not. Apple removed the bypass
    // in macOS 15, and the old advice points at the button that deletes the app.
    const notice = await page.locator('#macos .notice').innerText()
    expect(notice).toMatch(/right-click[^.]*no longer works/i)
  })

  test('offers the browser as a no-install option', async ({ page }) => {
    await page.goto('/install')
    await page.getByRole('link', { name: 'Try it in the browser' }).click()
    await page.waitForSelector('.cm-content')
  })

  test('gets back to the landing page', async ({ page }) => {
    await page.goto('/install')
    await page.locator('footer').getByRole('link', { name: 'Home' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('A blank canvas')
  })

  test('renders with no console errors and no sideways scroll on a phone', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/install', { waitUntil: 'networkidle' })
    expect(errors).toEqual([])
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
