import { isTauri } from '../storage'

/**
 * Checks GitHub for a newer release on launch and installs it in the
 * background. The update only takes effect on restart, so the writer is never
 * interrupted: `onReady` gets the new version and a function that restarts
 * into it, and the app decides how quietly to say so.
 *
 * Every failure is swallowed. No network, a release still uploading or a bad
 * signature all mean "no update today", which is the right answer for an app
 * whose job is to stay out of the way.
 */
export async function installUpdateInBackground(
  onReady: (version: string, restart: () => Promise<void>) => void,
): Promise<void> {
  if (!isTauri()) return
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return
    await update.downloadAndInstall()
    onReady(update.version, async () => {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    })
  } catch (error) {
    console.error('Update check failed:', error)
  }
}
