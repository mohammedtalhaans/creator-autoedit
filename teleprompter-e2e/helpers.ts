import { expect, type Page, type TestInfo } from '@playwright/test';

export const sampleScript = [
  'One small idea can become a clear story when the words stay close to the lens.',
  'Take a breath, keep your place, and let the next sentence arrive naturally.',
  'This sample is deliberately long enough to exercise scrolling, pauses, and retakes.',
].join(' ');

export async function settlePage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

export async function openPrompter(page: Page, title = `QA script ${Date.now()}`, text = sampleScript): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Record with teleprompter' }).click();
  await expect(page.locator('.tp-studio')).toBeVisible();
  await page.locator('.tp-title-field input').fill(title);
  await page.locator('.tp-body-field textarea').fill(text);
  // Script and capture settings are debounced before they are committed to
  // IndexedDB. Let the commit settle before a reload or recording begins.
  await page.waitForTimeout(450);
  await settlePage(page);
}

export async function choosePromptMode(page: Page, label: 'Fixed pace' | 'Finish in' | 'Manual' | 'Voice-follow'): Promise<void> {
  const settingsToggle = page.locator('.tp-script-panel .tp-settings-toggle button').first();
  if ((await settingsToggle.getAttribute('aria-expanded')) !== 'true') await settingsToggle.click();
  const picker = page.locator('.tp-script-panel .tp-settings-panel').first().locator('.tp-mode-picker');
  await picker.getByRole('button', { name: label, exact: true }).click();
}

export async function promptSliderValue(page: Page, name: string): Promise<string> {
  return page.locator('.tp-script-panel .slider-field').filter({ hasText: name }).first().locator('[role="slider"]').getAttribute('aria-valuenow').then((value) => value ?? '');
}

export async function setPromptSlider(page: Page, name: string, value: number): Promise<void> {
  const slider = page.locator('.tp-script-panel .slider-field').filter({ hasText: name }).first().locator('[role="slider"]');
  const minimum = Number(await slider.getAttribute('aria-valuemin') ?? 0);
  const maximum = Number(await slider.getAttribute('aria-valuemax') ?? 1);
  const root = slider.locator('..').locator('..');
  await root.scrollIntoViewIfNeeded();
  const box = await root.boundingBox();
  if (!box) throw new Error(`Prompt slider ${name} is not laid out.`);
  const ratio = Math.max(0, Math.min(1, (value - minimum) / Math.max(1, maximum - minimum)));
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
  await page.waitForTimeout(180);
}

export async function currentPromptWord(page: Page): Promise<string> {
  return (await page.locator('.tp-token[aria-current="true"]').first().innerText()).trim();
}

export async function openCamera(page: Page): Promise<void> {
  const cta = page.getByRole('button', { name: 'Record with camera', exact: true });
  if (await cta.isVisible()) await cta.click();
  else await page.getByRole('tab', { name: 'Record', exact: true }).click();
  await expect(page.locator('video[aria-label="Camera preview"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const video = document.querySelector('video[aria-label="Camera preview"]') as HTMLVideoElement | null;
    return Boolean(video?.srcObject && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
  }, undefined, { timeout: 20_000 });
}

export async function startTake(page: Page, seconds = 2.2): Promise<void> {
  await page.getByRole('button', { name: /Start recording|Record another take/, exact: false }).click();
  await expect(page.getByRole('button', { name: /Stop & save take/, exact: true })).toBeVisible();
  await page.waitForTimeout(seconds * 1_000);
}

export async function stopTake(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop & save take', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Take saved to your local library/i })).toBeVisible({ timeout: 45_000 });
}

export async function openTakes(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Takes', exact: true }).click();
  await expect(page.locator('.tp-takes-panel')).toBeVisible();
}

export async function saveScreenshot(page: Page, info: TestInfo, filename: string): Promise<void> {
  await settlePage(page);
  await page.screenshot({ path: info.outputPath(filename), fullPage: true });
}

/*
 * A tiny uncompressed DOCX fixture. Mammoth only needs the standard package
 * parts below for extractRawText, and keeping it in the test avoids adding a
 * fixture dependency outside the repository.
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function wordXml(text: string): string {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return escaped.split(/\r?\n/).map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`).join('');
}

function u16(value: number): number[] { return [value & 0xff, (value >>> 8) & 0xff]; }
function u32(value: number): number[] { return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]; }

export function minimalDocx(text: string): Buffer {
  const parts: Array<[string, string]> = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${wordXml(text)}<w:sectPr/></w:body></w:document>`],
  ];
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of parts) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const header = Buffer.from([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc32(data)), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)]);
    const local = Buffer.concat([header, nameBytes, data]);
    chunks.push(local);
    const directory = Buffer.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc32(data)), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]);
    central.push(Buffer.concat([directory, nameBytes]));
    offset += local.length;
  }
  const centralData = Buffer.concat(central);
  const localData = Buffer.concat(chunks);
  const end = Buffer.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(parts.length), ...u16(parts.length), ...u32(centralData.length), ...u32(localData.length), ...u16(0)]);
  return Buffer.concat([localData, centralData, end]);
}
