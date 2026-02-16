/**
 * Playwright MCP テスト用スクリプト
 * MCPが提供する操作（ナビゲーション、スナップショット、要素操作、コンソール実行）を
 * Playwright APIで直接エミュレートしてテストする
 */
import { chromium, type Browser, type Page } from 'playwright';

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
    // ブラウザ起動
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    // ========================================
    // Test 1: ページナビゲーション
    // ========================================
    console.log('\n=== Test 1: ページナビゲーション ===');
    const response = await page.goto(BASE_URL);
    if (response !== null && response.ok()) {
      record('ナビゲーション', 'PASS', `ステータス ${String(response.status())}`);
    } else {
      record('ナビゲーション', 'FAIL', `レスポンスなし or エラー`);
    }

    // ========================================
    // Test 2: スナップショット（ページ構造確認）
    // ========================================
    console.log('\n=== Test 2: ページ構造確認 ===');
    const title = await page.title();
    record('ページタイトル', title === 'MCP Debug Test Page' ? 'PASS' : 'FAIL', `"${title}"`);

    const h1Text = await page.locator('#page-title').textContent();
    record('H1テキスト', h1Text === 'MCP Debug Test Page' ? 'PASS' : 'FAIL', `"${h1Text ?? ''}"`);

    const sectionCount = await page.locator('.card').count();
    record('セクション数', sectionCount === 5 ? 'PASS' : 'FAIL', `${String(sectionCount)} セクション`);

    // ========================================
    // Test 3: フォーム入力
    // ========================================
    console.log('\n=== Test 3: フォーム入力 ===');
    await page.fill('#username', 'テストユーザー');
    await page.fill('#email', 'test@example.com');
    await page.selectOption('#category', 'bug');
    await page.fill('#message', 'これはMCPテストです');

    const formData = await page.evaluate(`({
      username: document.getElementById('username').value,
      email: document.getElementById('email').value,
      category: document.getElementById('category').value,
      message: document.getElementById('message').value,
    })`) as { username: string; email: string; category: string; message: string };

    record('ユーザー名入力', formData.username === 'テストユーザー' ? 'PASS' : 'FAIL', `"${formData.username}"`);
    record('メール入力', formData.email === 'test@example.com' ? 'PASS' : 'FAIL', `"${formData.email}"`);
    record('カテゴリ選択', formData.category === 'bug' ? 'PASS' : 'FAIL', `"${formData.category}"`);
    record('メッセージ入力', formData.message === 'これはMCPテストです' ? 'PASS' : 'FAIL', `"${formData.message}"`);

    // ========================================
    // Test 4: ボタンクリック（フォーム送信）
    // ========================================
    console.log('\n=== Test 4: フォーム送信 ===');
    await page.click('#submit-btn');
    const statusText = await page.locator('#form-status').textContent();
    const hasSuccess = statusText?.includes('送信成功') ?? false;
    record('フォーム送信', hasSuccess ? 'PASS' : 'FAIL', `"${statusText ?? ''}"`);

    // ========================================
    // Test 5: カウンター操作
    // ========================================
    console.log('\n=== Test 5: カウンター操作 ===');
    // +1 を 3 回
    for (let i = 0; i < 3; i++) {
      await page.click('button:text("+1")');
    }
    let counterVal = await page.locator('#counter').textContent();
    record('カウンター +1 x3', counterVal === '3' ? 'PASS' : 'FAIL', `値: ${counterVal ?? ''}`);

    // -1 を 1 回
    await page.click('button:text("-1")');
    counterVal = await page.locator('#counter').textContent();
    record('カウンター -1', counterVal === '2' ? 'PASS' : 'FAIL', `値: ${counterVal ?? ''}`);

    // リセット
    await page.click('#counter-section button.danger');
    counterVal = await page.locator('#counter').textContent();
    record('カウンターリセット', counterVal === '0' ? 'PASS' : 'FAIL', `値: ${counterVal ?? ''}`);

    // ========================================
    // Test 6: チェックボックス操作
    // ========================================
    console.log('\n=== Test 6: チェックボックス操作 ===');
    await page.check('#checkbox-list input[value="item1"]');
    await page.check('#checkbox-list input[value="item3"]');
    const checkedText = await page.locator('#checked-output').textContent();
    const checkOk = checkedText?.includes('item1') && checkedText.includes('item3');
    record('チェックボックス', checkOk ? 'PASS' : 'FAIL', `"${checkedText ?? ''}"`);

    // ========================================
    // Test 7: データテーブル読み込み
    // ========================================
    console.log('\n=== Test 7: データテーブル ===');
    await page.click('button:text("データ読み込み")');
    const rowCount = await page.locator('#table-body tr').count();
    record('テーブル行数', rowCount === 3 ? 'PASS' : 'FAIL', `${String(rowCount)} 行`);

    const firstCell = await page.locator('#table-body tr:first-child td:nth-child(2)').textContent();
    record('テーブルデータ', firstCell === 'タスクA' ? 'PASS' : 'FAIL', `先頭: "${firstCell ?? ''}"`);

    // ========================================
    // Test 8: コンソール実行 (evaluate)
    // ========================================
    console.log('\n=== Test 8: JavaScript コンソール実行 ===');
    const docTitle = await page.evaluate('document.title') as string;
    record('document.title', docTitle === 'MCP Debug Test Page' ? 'PASS' : 'FAIL', `"${docTitle}"`);

    const counterFromJs = await page.evaluate('window.getCounterValue()') as number;
    record('getCounterValue()', counterFromJs === 0 ? 'PASS' : 'FAIL', `${String(counterFromJs)}`);

    const formFromJs = await page.evaluate('window.getFormData()') as Record<string, string>;
    record('getFormData()', formFromJs['name'] === 'テストユーザー' ? 'PASS' : 'FAIL', JSON.stringify(formFromJs));

    // ========================================
    // Test 9: コンソールログ監視
    // ========================================
    console.log('\n=== Test 9: コンソールログ監視 ===');
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    
    await page.click('button:text("Info ログ")');
    await page.click('button:text("Warn ログ")');
    await page.click('button:text("Error ログ")');
    await page.waitForTimeout(500);
    
    const hasInfo = consoleLogs.some(l => l.includes('INFO'));
    const hasWarn = consoleLogs.some(l => l.includes('WARN'));
    const hasError = consoleLogs.some(l => l.includes('ERROR'));
    record('Infoログ捕捉', hasInfo ? 'PASS' : 'FAIL', consoleLogs.filter(l => l.includes('INFO')).join('; '));
    record('Warnログ捕捉', hasWarn ? 'PASS' : 'FAIL', consoleLogs.filter(l => l.includes('WARN')).join('; '));
    record('Errorログ捕捉', hasError ? 'PASS' : 'FAIL', consoleLogs.filter(l => l.includes('ERROR')).join('; '));

    // ========================================
    // Test 10: スクリーンショット
    // ========================================
    console.log('\n=== Test 10: スクリーンショット ===');
    const screenshotPath = 'tests/mcp-test/screenshot.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    record('スクリーンショット', 'PASS', `保存先: ${screenshotPath}`);

    // ========================================
    // Test 11: 複数タブ操作
    // ========================================
    console.log('\n=== Test 11: 複数タブ操作 ===');
    const page2 = await context.newPage();
    await page2.goto('about:blank');
    const pages = context.pages();
    record('複数タブ', pages.length >= 2 ? 'PASS' : 'FAIL', `タブ数: ${String(pages.length)}`);
    await page2.close();

    // ========================================
    // 結果サマリー
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('テスト結果サマリー');
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
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

void main();
