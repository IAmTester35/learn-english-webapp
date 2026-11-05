import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAudioForTest } from '../src/server/ttsService';
import { getTestCatalog } from '../src/server/testRepository';
import { resetAllKeyCooldownsInSupabase } from '../src/server/geminiKeyManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadDotEnv(): void {
  const envFiles = [
    path.join(ROOT_DIR, '.env'),
    path.join(ROOT_DIR, '.env.local'),
  ];
  for (const file of envFiles) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (key && val && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

async function main() {
  loadDotEnv();

  const force = process.argv.includes('--force');
  const resetHealth = process.argv.includes('--reset-health');
  const testArg = process.argv.find((a) => a.startsWith('--test='));
  const targetTestId = testArg ? testArg.split('=')[1]?.trim() : undefined;

  if (resetHealth) {
    await resetAllKeyCooldownsInSupabase();
    console.log('🔄 Đã reset trạng thái Cooldown của toàn bộ API Keys.');
  }

  const catalog = await getTestCatalog({ includeHidden: true });
  const tests = targetTestId
    ? catalog.tests.filter((t) => t.id === targetTestId)
    : catalog.tests;

  if (tests.length === 0) {
    console.log('⚠️ Không tìm thấy đề thi nào cần tạo audio.');
    return;
  }

  console.log(
    `🎙️ Bắt đầu kiểm tra & tạo Audio TTS trực tiếp cho ${tests.length} đề thi...`
  );

  let totalGenerated = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const test of tests) {
    console.log(`\n📘 Đề thi: [${test.id}] ${test.title}`);
    const stats = await generateAudioForTest(test.id, { force });
    totalGenerated += stats.generated;
    totalSkipped += stats.skipped;
    for (const err of stats.errors) {
      allErrors.push(`[${test.id}] ${err}`);
    }
    console.log(
      `   ✅ Xong ${test.id}: Tạo mới ${stats.generated}, Có sẵn ${stats.skipped}, Lỗi ${stats.errors.length}`
    );
  }

  console.log('\n============================================================');
  console.log(
    `🎉 Hoàn tất TTS: Đã tạo mới ${totalGenerated} phần, Bỏ qua (đã có) ${totalSkipped} phần.`
  );
  if (allErrors.length > 0) {
    console.warn(`⚠️ Có ${allErrors.length} lỗi:\n- ${allErrors.join('\n- ')}`);
  }
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('❌ Lỗi tiến trình tạo TTS:', err);
  process.exit(1);
});
