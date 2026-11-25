import { expect, test, type Page } from '@playwright/test'

async function freshApp(page: Page) {
  await page.goto('/app')
  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('blank')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })
  await page.reload()
  await page.waitForSelector('.cm-content')
  await page.locator('.cm-content').click()
}

/** Pastes in one go: typing would trigger list continuation on Enter. */
async function seed(page: Page, text: string) {
  await page.evaluate((t) => {
    const data = new DataTransfer()
    data.setData('text/plain', t)
    document
      .querySelector('.cm-content')
      ?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
  // Park the caret on a plain last line so every line above renders as preview.
  await page.keyboard.press('Control+End')
}

function line(page: Page, n: number) {
  return page.locator('.cm-line').nth(n)
}

const DOC = [
  '# Heading one', //                       0
  '### Heading three ###', //               1
  'Some **bold**, *italic*, ~~gone~~ and `code` and [a link](https://example.com).', // 2
  '- bullet', //                            3
  '1. first', //                            4
  '- [ ] open task', //                     5
  '- [x] done task', //                     6
  '> quoted', //                            7
  '---', //                                 8
  'end', //                                 9
].join('\n')

test.describe('live preview', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page)
    await seed(page, DOC)
  })

  test('hides heading hashes off the active line and shows them on it', async ({ page }) => {
    await expect(line(page, 0)).toHaveText('Heading one')
    await expect(line(page, 1)).toHaveText('Heading three')
    await page.keyboard.press('Control+Home')
    await expect(line(page, 0)).toHaveText('# Heading one')
    await expect(line(page, 1)).toHaveText('Heading three')
  })

  test('hides inline markers but keeps their styling', async ({ page }) => {
    await expect(line(page, 2)).toHaveText('Some bold, italic, gone and code and a link.')
    const weight = await line(page, 2)
      .getByText('bold', { exact: true })
      .evaluate((el) => getComputedStyle(el).fontWeight)
    expect(Number(weight)).toBeGreaterThanOrEqual(700)
  })

  test('renders bullets, numbers, checkboxes, quotes and rules', async ({ page }) => {
    await expect(line(page, 3).locator('.cm-blank-bullet')).toHaveText('•')
    await expect(line(page, 3)).toHaveText('• bullet')
    await expect(line(page, 4).locator('.cm-blank-ol')).toHaveText('1.')
    await expect(line(page, 5).locator('.cm-blank-checkbox')).toHaveAttribute('aria-checked', 'false')
    await expect(line(page, 5)).toHaveText('open task')
    await expect(line(page, 6).locator('.cm-blank-checkbox')).toHaveAttribute('aria-checked', 'true')
    await expect(line(page, 7)).toHaveClass(/cm-blank-quote/)
    await expect(line(page, 7)).toHaveText('quoted')
    await expect(line(page, 8).locator('.cm-blank-hr')).toHaveCount(1)
    const radius = await line(page, 5)
      .locator('.cm-blank-checkbox')
      .evaluate((el) => getComputedStyle(el).borderRadius)
    expect(radius).toBe('50%')
  })

  test('clicking a checkbox toggles the file text without moving the caret', async ({ page }) => {
    await line(page, 5).locator('.cm-blank-checkbox').click()
    await expect(line(page, 5).locator('.cm-blank-checkbox')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Control+a')
    await expect(line(page, 5)).toHaveText('- [x] open task')
  })

  test('never changes the stored text', async ({ page }) => {
    // Selecting everything puts every line under the selection, so all raw.
    await page.keyboard.press('Control+a')
    const text = await page.locator('.cm-line').allTextContents()
    expect(text.join('\n')).toBe(DOC)
  })
})
