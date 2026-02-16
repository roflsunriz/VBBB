/**
 * Chrome DevTools Protocol (CDP) テスト
 * Chrome DevTools MCP が内部で使うCDPプロトコルと同等の操作を
 * Playwright の CDP セッション経由で直接テストする
 */
import { chromium, type Browser, type CDPSession, type Page } from 'playwright';

const BASE_URL = 'http://127.0.0.1:8765';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, status: 'PASS' | 'FAIL', detail: string): void {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '[OK]' : '[NG]';
  console.log(`${icon} ${name}: ${detail}`);
}

async function main(): Promise<void> {
  let browser: Browser | undefined;
  try {
    // CDP接続可能なブラウザを起動
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    // CDP セッション取得
    const cdp: CDPSession = await page.context().newCDPSession(page);

    console.log('\n=== CDP Test 1: ページナビゲーション ===');
    await page.goto(BASE_URL);
    // CDP で Page.getNavigationHistory を呼ぶ
    const navHistory = await cdp.send('Page.getNavigationHistory') as {
      currentIndex: number;
      entries: Array<{ url: string; title: string }>;
    };
    const currentEntry = navHistory.entries[navHistory.currentIndex];
    record(
      'CDP: ナビゲーション履歴',
      currentEntry?.url === `${BASE_URL}/` ? 'PASS' : 'FAIL',
      `URL: ${currentEntry?.url ?? 'N/A'}, title: ${currentEntry?.title ?? 'N/A'}`,
    );

    console.log('\n=== CDP Test 2: DOM 検査 (DOM.getDocument) ===');
    const domResult = await cdp.send('DOM.getDocument', { depth: 2 }) as {
      root: { nodeId: number; nodeName: string; childNodeCount: number };
    };
    record(
      'CDP: DOM.getDocument',
      domResult.root.nodeName === '#document' ? 'PASS' : 'FAIL',
      `root: ${domResult.root.nodeName}, childNodes: ${String(domResult.root.childNodeCount)}`,
    );

    console.log('\n=== CDP Test 3: Runtime.evaluate ===');
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true,
    }) as { result: { type: string; value: unknown } };
    record(
      'CDP: Runtime.evaluate (title)',
      evalResult.result.value === 'MCP Debug Test Page' ? 'PASS' : 'FAIL',
      `値: "${String(evalResult.result.value)}"`,
    );

    // カウンター値取得
    const counterResult = await cdp.send('Runtime.evaluate', {
      expression: 'window.getCounterValue()',
      returnByValue: true,
    }) as { result: { value: unknown } };
    record(
      'CDP: Runtime.evaluate (counter)',
      counterResult.result.value === 0 ? 'PASS' : 'FAIL',
      `値: ${String(counterResult.result.value)}`,
    );

    console.log('\n=== CDP Test 4: Runtime.evaluate でDOM操作 ===');
    // フォーム入力をCDP経由で実行
    await cdp.send('Runtime.evaluate', {
      expression: `
        document.getElementById('username').value = 'CDP Test User';
        document.getElementById('email').value = 'cdp@test.com';
        'done';
      `,
      returnByValue: true,
    });
    const formCheck = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify(window.getFormData())`,
      returnByValue: true,
    }) as { result: { value: unknown } };
    const formJson = JSON.parse(String(formCheck.result.value)) as Record<string, string>;
    record(
      'CDP: DOM操作 (フォーム入力)',
      formJson['name'] === 'CDP Test User' && formJson['email'] === 'cdp@test.com' ? 'PASS' : 'FAIL',
      `name: "${formJson['name'] ?? ''}", email: "${formJson['email'] ?? ''}"`,
    );

    console.log('\n=== CDP Test 5: カウンター操作 via CDP ===');
    await cdp.send('Runtime.evaluate', {
      expression: 'increment(); increment(); increment();',
      returnByValue: true,
    });
    const counterAfter = await cdp.send('Runtime.evaluate', {
      expression: 'window.getCounterValue()',
      returnByValue: true,
    }) as { result: { value: unknown } };
    record(
      'CDP: カウンター操作',
      counterAfter.result.value === 3 ? 'PASS' : 'FAIL',
      `値: ${String(counterAfter.result.value)}`,
    );

    console.log('\n=== CDP Test 6: コンソールログ監視 (Runtime.consoleAPICalled) ===');
    const consoleLogs: string[] = [];
    cdp.on('Runtime.consoleAPICalled', (event: { type: string; args: Array<{ value?: unknown }> }) => {
      const text = event.args.map(a => String(a.value ?? '')).join(' ');
      consoleLogs.push(`[${event.type}] ${text}`);
    });
    await cdp.send('Runtime.enable');

    await cdp.send('Runtime.evaluate', {
      expression: "console.log('CDP-INFO: test log'); console.warn('CDP-WARN: test warn'); console.error('CDP-ERROR: test error');",
      returnByValue: true,
    });
    // 少し待つ
    await page.waitForTimeout(300);

    const hasInfo = consoleLogs.some(l => l.includes('CDP-INFO'));
    const hasWarn = consoleLogs.some(l => l.includes('CDP-WARN'));
    const hasError = consoleLogs.some(l => l.includes('CDP-ERROR'));
    record('CDP: consoleログ(info)', hasInfo ? 'PASS' : 'FAIL', consoleLogs.filter(l => l.includes('CDP-INFO')).join('; '));
    record('CDP: consoleログ(warn)', hasWarn ? 'PASS' : 'FAIL', consoleLogs.filter(l => l.includes('CDP-WARN')).join('; '));
    record('CDP: consoleログ(error)', hasError ? 'PASS' : 'FAIL', consoleLogs.filter(l => l.includes('CDP-ERROR')).join('; '));

    console.log('\n=== CDP Test 7: Network.enable (ネットワーク監視) ===');
    const requests: string[] = [];
    cdp.on('Network.requestWillBeSent', (event: { request: { url: string } }) => {
      requests.push(event.request.url);
    });
    await cdp.send('Network.enable');
    // ページリロードしてネットワークリクエストを捕捉
    await page.reload();
    await page.waitForTimeout(500);
    const hasPageRequest = requests.some(r => r.includes('127.0.0.1:8765'));
    record(
      'CDP: Network監視',
      hasPageRequest ? 'PASS' : 'FAIL',
      `捕捉リクエスト数: ${String(requests.length)}, URL例: ${requests[0] ?? 'N/A'}`,
    );

    console.log('\n=== CDP Test 8: Page.captureScreenshot ===');
    const screenshotResult = await cdp.send('Page.captureScreenshot', {
      format: 'png',
    }) as { data: string };
    const hasData = typeof screenshotResult.data === 'string' && screenshotResult.data.length > 100;
    record(
      'CDP: スクリーンショット',
      hasData ? 'PASS' : 'FAIL',
      `Base64データ長: ${String(screenshotResult.data.length)} 文字`,
    );

    console.log('\n=== CDP Test 9: CSS.getComputedStyleForNode ===');
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const doc = await cdp.send('DOM.getDocument') as { root: { nodeId: number } };
    const queryResult = await cdp.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#page-title',
    }) as { nodeId: number };
    const computedStyle = await cdp.send('CSS.getComputedStyleForNode', {
      nodeId: queryResult.nodeId,
    }) as { computedStyle: Array<{ name: string; value: string }> };
    const colorProp = computedStyle.computedStyle.find((s: { name: string }) => s.name === 'color');
    record(
      'CDP: CSS検査',
      colorProp !== undefined ? 'PASS' : 'FAIL',
      `#page-title color: ${colorProp?.value ?? 'N/A'}`,
    );

    console.log('\n=== CDP Test 10: Performance.getMetrics ===');
    await cdp.send('Performance.enable');
    const metricsResult = await cdp.send('Performance.getMetrics') as {
      metrics: Array<{ name: string; value: number }>;
    };
    const domNodes = metricsResult.metrics.find((m: { name: string }) => m.name === 'Nodes');
    const jsHeapSize = metricsResult.metrics.find((m: { name: string }) => m.name === 'JSHeapUsedSize');
    record(
      'CDP: パフォーマンスメトリクス',
      metricsResult.metrics.length > 0 ? 'PASS' : 'FAIL',
      `DOMノード数: ${String(domNodes?.value ?? 'N/A')}, JSヒープ: ${String(Math.round((jsHeapSize?.value ?? 0) / 1024))}KB`,
    );

    // ========================================
    // 結果サマリー
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('CDP テスト結果サマリー');
    console.log('='.repeat(60));
    const passCount = results.filter(r => r.status === 'PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;
    console.log(`合計: ${String(results.length)} テスト | PASS: ${String(passCount)} | FAIL: ${String(failCount)}`);
    console.log('-'.repeat(60));
    for (const r of results) {
      const icon = r.status === 'PASS' ? 'OK' : 'NG';
      console.log(`  [${icon}] ${r.name}: ${r.detail}`);
    }
    console.log('='.repeat(60));

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('テスト実行エラー:', message);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

void main();
