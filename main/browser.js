const { BrowserWindow } = require('electron');

const PAGE_TIMEOUT = 25000;
const RENDER_WAIT = 3000;
const MAX_TEXT_LENGTH = 80000;

async function analyzePage(urlStr) {
  if (!urlStr) return { success: false, output: 'URL vacía' };

  let targetUrl = urlStr.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        javascript: true,
        images: false,
        offscreen: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });

    await win.loadURL(targetUrl, { timeout: PAGE_TIMEOUT });

    await new Promise(resolve => setTimeout(resolve, RENDER_WAIT));

    const text = await win.webContents.executeJavaScript(`
      (() => {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('script, style, noscript, iframe, svg, canvas, nav, footer, header, aside, .sidebar, .menu, .ad, .advertisement').forEach(el => el.remove());
        return clone.innerText || '';
      })()
    `);

    const pageInfo = await win.webContents.executeJavaScript(`
      ({
        title: document.title || '',
        url: location.href,
        description: (document.querySelector('meta[name="description"]')?.content || document.querySelector('meta[property="og:description"]')?.content || '').trim(),
        language: document.documentElement.lang || navigator.language || '',
        charset: document.characterSet || 'UTF-8'
      })
    `);

    let truncated = (text || '').trim().substring(0, MAX_TEXT_LENGTH);
    if (truncated.length === 0) truncated = '(no se pudo extraer texto visible)';

    const image = await win.webContents.capturePage();
    const screenshotBase64 = image.toJPEG(70).toString('base64');

    win.destroy();
    win = null;

    return {
      success: true,
      output: truncated,
      meta: pageInfo,
      screenshot: screenshotBase64,
      length: text ? text.length : 0
    };
  } catch (err) {
    if (win) {
      try { win.destroy(); } catch {}
    }
    return { success: false, output: `Error al analizar la página: ${err.message}` };
  }
}

module.exports = { analyzePage };
