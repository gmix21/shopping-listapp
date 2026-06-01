const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function waitForItemCount(page, count) {
  await page.waitForFunction(n => {
    const items = document.querySelectorAll('.list .item:not(.empty)');
    return items.length === n;
  }, count, { timeout: 3000 }).catch(() => {});
}

async function addItem(page, text) {
  await page.fill('#input', text);
  await page.press('#input', 'Enter');
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(FILE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#input');

  console.log('\n🛒 쇼핑 리스트 앱 자동 테스트 시작\n');
  console.log('━'.repeat(50));

  console.log('\n[1] 아이템 추가 테스트');

  await addItem(page, '사과');
  await waitForItemCount(page, 1);
  let items = await page.$$('.item');
  assert(items.length === 1, '아이템 1개 추가됨');

  const firstText = await page.locator('.item-text').first().textContent();
  assert(firstText.trim() === '사과', '추가된 텍스트가 "사과"임');

  await addItem(page, '바나나');
  await addItem(page, '우유');
  await waitForItemCount(page, 3);
  items = await page.$$('.item');
  assert(items.length === 3, 'Enter 키로 추가 포함 총 3개');

  await addItem(page, '   ');
  await page.waitForTimeout(200);
  items = await page.$$('.item');
  assert(items.length === 3, '빈 입력은 추가되지 않음');

  const stats = await page.textContent('#stats');
  assert(stats.includes('3'), '헤더에 총 3개 표시됨');

  console.log('\n[2] 체크(완료) 토글 테스트');

  const firstItemCheckbox = page.locator('.item').first().locator('input[type="checkbox"]');
  await firstItemCheckbox.click();
  await page.waitForTimeout(200);

  let isChecked = await page.locator('.item').first().evaluate(el => el.classList.contains('checked'));
  assert(isChecked, '체크 시 .checked 클래스 추가됨');

  const strikeStyle = await page.locator('.item').first().locator('.item-text')
    .evaluate(el => getComputedStyle(el).textDecoration);
  assert(strikeStyle.includes('line-through'), '완료 항목에 취소선 적용됨');

  await firstItemCheckbox.click();
  await page.waitForTimeout(200);
  isChecked = await page.locator('.item').first().evaluate(el => el.classList.contains('checked'));
  assert(!isChecked, '다시 클릭 시 체크 해제됨');

  console.log('\n[3] 필터 테스트');

  await page.locator('.item').nth(0).locator('input[type="checkbox"]').click();
  await page.waitForTimeout(300);
  await page.locator('.item').nth(1).locator('input[type="checkbox"]').click();
  await page.waitForTimeout(300);

  await page.locator('.filter-btn').filter({ hasText: /^완료$/ }).click();
  await page.waitForTimeout(200);
  items = await page.$$('.item');
  assert(items.length === 2, '완료 필터: 체크된 2개만 표시됨');

  await page.locator('.filter-btn').filter({ hasText: /^미완료$/ }).click();
  await page.waitForTimeout(200);
  items = await page.$$('.item');
  assert(items.length === 1, '미완료 필터: 미체크 1개만 표시됨');

  await page.locator('.filter-btn').filter({ hasText: /^전체$/ }).click();
  await waitForItemCount(page, 3);
  items = await page.$$('.item');
  assert(items.length === 3, '전체 필터: 3개 모두 표시됨');

  console.log('\n[4] 개별 삭제 테스트');

  await page.locator('.del-btn').first().click();
  await waitForItemCount(page, 2);

  items = await page.$$('.item');
  assert(items.length === 2, '삭제 후 2개 남음');

  const statsAfterDel = await page.textContent('#stats');
  assert(statsAfterDel.includes('2'), '헤더 통계가 2개로 업데이트됨');

  console.log('\n[5] 완료 항목 일괄 삭제 테스트');

  await page.locator('.item').last().locator('input[type="checkbox"]').click();
  await page.waitForTimeout(300);

  const checkedCount = await page.locator('.item.checked').count();
  assert(checkedCount === 2, '일괄 삭제 전 체크된 항목 2개 확인');

  page.once('dialog', dialog => dialog.accept());
  await page.click('button:has-text("완료 항목 삭제")');
  await waitForItemCount(page, 0);
  await page.waitForTimeout(200);

  items = await page.$$('.item');
  const emptyMsg = await page.$$('.empty');
  assert(items.length === 0 && emptyMsg.length === 1, '완료 항목 전부 삭제 후 목록 비어있음');

  const remaining = await page.$$('.item.checked');
  assert(remaining.length === 0, '남은 항목에 완료 항목 없음');

  console.log('\n[6] localStorage 데이터 유지 테스트');

  await addItem(page, '새 아이템 A');
  await addItem(page, '새 아이템 B');
  await waitForItemCount(page, 2);

  await page.reload();
  await page.waitForSelector('#input');
  await waitForItemCount(page, 2);

  items = await page.$$('.item');
  assert(items.length === 2, '새로고침 후 2개 아이템 유지됨');

  const savedTexts = await page.locator('.item-text').allTextContents();
  assert(
    savedTexts.some(t => t.includes('새 아이템 A')) && savedTexts.some(t => t.includes('새 아이템 B')),
    '저장된 아이템 텍스트가 올바르게 복원됨'
  );

  console.log('\n' + '━'.repeat(50));
  console.log(`\n📊 테스트 결과: ${passed + failed}개 중 ${passed}개 통과, ${failed}개 실패\n`);

  if (failed === 0) {
    console.log('🎉 모든 테스트 통과!\n');
  } else {
    console.log(`⚠️  ${failed}개 실패 항목 확인 필요\n`);
  }

  await page.waitForTimeout(1500);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();