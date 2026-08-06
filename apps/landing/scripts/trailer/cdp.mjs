// A minimal Chrome driver over CDP. playwright is NOT installed in this repo (and shouldn't be added
// for two screenshot scripts), so this drives the Chrome-for-Testing that playwright's cache already
// holds, using Node's global WebSocket.
import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ width, height, dsf = 2, port = 9333 } = {}) {
  if (!existsSync(CHROME)) throw new Error(`Chrome-for-Testing missing at ${CHROME}`)
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-color-profile=srgb', `--user-data-dir=/tmp/trailer-chrome-${port}`,
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' })

  let wsUrl
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl }
    catch { await sleep(250) }
  }
  if (!wsUrl) { chrome.kill(); throw new Error('chrome never came up on the debug port') }

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let msgId = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (!m.id || !pending.has(m.id)) return
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(`${m.error.message} ${JSON.stringify(m.error.data ?? '')}`)) : res(m.result)
  }
  // Every request is time-boxed. A Runtime.evaluate issued while the page is swapping execution
  // contexts (right after a navigate) can get no reply at all — an un-timed await there hangs the
  // whole script silently, which is exactly how the first re-shoot stalled for ten minutes.
  const raw = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const id = ++msgId
      const timer = setTimeout(() => {
        pending.delete(id)
        rej(new Error(`${method} timed out after 15s`))
      }, 15_000)
      pending.set(id, { res: (v) => { clearTimeout(timer); res(v) }, rej: (e) => { clearTimeout(timer); rej(e) } })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })

  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => raw(method, params, sessionId)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  if (width) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile: false })

  return {
    send,
    setCookie: (cookie) => send('Network.setCookie', cookie),
    goto: (url) => send('Page.navigate', { url }),
    setContent: async (html) => {
      const { frameTree } = await send('Page.getFrameTree')
      await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html })
    },
    // Returns the expression's value; throws with the page-side stack when the expression itself throws.
    evaluate: async (expression) => {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'evaluate failed')
      return result.value
    },
    resize: (w, h, scale = dsf) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false }),
    shoot: async (file, { transparent = false } = {}) => {
      if (transparent) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      if (transparent) await send('Emulation.setDefaultBackgroundColorOverride', {})
      writeFileSync(file, Buffer.from(data, 'base64'))
    },
    // Reject anything still in flight and hard-kill chrome: a lingering socket or child keeps node's
    // event loop alive, so the script would never exit after its last shot.
    close: () => { for (const { rej } of pending.values()) rej(new Error('closed')); pending.clear(); ws.close(); chrome.kill('SIGKILL') },
  }
}
