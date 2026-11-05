import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import type { TestCatalogItem, TestDocument } from '../src/types/test';
import {
  buildListeningAudioMetadata,
  extractTestDocumentMetadata,
} from '../src/domain/testMetadata';
import { validateTestDocument } from '../src/domain/validator';

function getEncryptionKeyBuffer(): Buffer {
  const rawSecret =
    process.env.KEY_ENCRYPTION_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'l-testlab-supabase-gemini-key-secret-2026';
  return crypto.scryptSync(rawSecret, 'l-testlab-salt-v1', 32);
}

function encryptApiKey(plainKey: string): string {
  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey.trim(), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function hashApiKey(plainKey: string): string {
  return crypto.createHash('sha256').update(plainKey.trim()).digest('hex');
}

function maskApiKey(plainKey: string): string {
  const clean = plainKey.trim();
  if (clean.length <= 12) return `${clean.slice(0, 3)}...${clean.slice(-2)}`;
  return `${clean.slice(0, 7)}...${clean.slice(-4)}`;
}

function loadEnvGeminiKeys(): Array<{ label: string; apiKey: string }> {
  const result: Array<{ label: string; apiKey: string }> = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (/^GEMINI_API_KEY(_\w+)?$/i.test(key) && typeof value === 'string') {
      const trimmedVal = value.trim();
      if (
        trimmedVal.length > 0 &&
        !trimmedVal.toLowerCase().startsWith('your_gemini_api_key') &&
        !seen.has(trimmedVal)
      ) {
        seen.add(trimmedVal);
        result.push({ label: key, apiKey: trimmedVal });
      }
    }
  }
  return result;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT_DIR, 'public', 'tests');
const AUDIO_DIR = path.join(TESTS_DIR, 'audio');
const AUDIO_BUCKET = 'test-audio';

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

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@ltestlab.local').trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '❌ Thiếu secret key'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`🚀 Bắt đầu đồng bộ dữ liệu (${supabaseUrl})...\n`);

  const { data: usersData, error: listUsersErr } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 10 });
  if (listUsersErr) {
    throw new Error(`Không thể kiểm tra danh sách users: ${listUsersErr.message}`);
  }

  const existingUsers = usersData?.users || [];
  if (existingUsers.length === 0) {
    if (!adminPassword) {
      throw new Error('Thiếu ADMIN_PASSWORD trong .env để tạo tài khoản Admin.');
    }
    const { data: createdUser, error: createErr } =
      await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { is_single_admin: true },
      });
    if (createErr) {
      throw new Error(`Lỗi khi tạo tài khoản Admin: ${createErr.message}`);
    }
    console.log(
      `   ✅ Đã tạo tài khoản Admin duy nhất: ${createdUser.user?.email} (ID: ${createdUser.user?.id})`
    );
  } else {
    const adminUser = existingUsers[0];
    if (adminPassword) {
      await supabase.auth.admin.updateUserById(adminUser.id, {
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });
    }
    console.log(
      `   ✅ Tài khoản Admin duy nhất đã sẵn sàng: ${adminUser.email} (ID: ${adminUser.id})`
    );
  }

  // 2. Seed Gemini API Keys into public.gemini_api_keys
  console.log('\n2️⃣  Đồng bộ Pool Gemini API Keys vào public.gemini_api_keys...');
  const envKeys = loadEnvGeminiKeys();
  if (envKeys.length > 0) {
    const rows = envKeys.map((item) => ({
      label: item.label,
      key_masked: maskApiKey(item.apiKey),
      key_hash: hashApiKey(item.apiKey),
      encrypted_key: encryptApiKey(item.apiKey),
      status: 'healthy',
    }));
    const { error: keyErr } = await supabase
      .from('gemini_api_keys')
      .upsert(rows, { onConflict: 'key_hash' });
    if (keyErr) {
      console.warn(`   ⚠️ Không thể seed Gemini keys: ${keyErr.message}`);
    } else {
      console.log(`   ✅ Đã mã hóa AES-256 & lưu ${rows.length} Gemini API Keys.`);
    }
  }

  // 3. Migrate Tests & Audio Files + Rich Metadata
  console.log('\n3️⃣  Đưa toàn bộ bài Test & Audio kèm Metadata chuẩn...');
  const indexPath = path.join(TESTS_DIR, 'index.json');
  const indexRaw = fs.readFileSync(indexPath, 'utf-8');
  const catalogItems: TestCatalogItem[] = JSON.parse(indexRaw).tests || [];

  const allJsonFiles = fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json');

  // Ensure every JSON test file in public/tests is included in migration order
  const orderedFiles: Array<{ file: string; hidden: boolean }> = [];
  const seenFiles = new Set<string>();

  for (const item of catalogItems) {
    const baseFile = path.basename(item.file);
    if (fs.existsSync(path.join(TESTS_DIR, baseFile)) && !seenFiles.has(baseFile)) {
      seenFiles.add(baseFile);
      orderedFiles.push({ file: baseFile, hidden: Boolean(item.hidden) });
    }
  }
  for (const f of allJsonFiles) {
    if (!seenFiles.has(f)) {
      seenFiles.add(f);
      orderedFiles.push({ file: f, hidden: false });
    }
  }

  let migratedTestsCount = 0;
  let migratedAudioCount = 0;

  for (const entry of orderedFiles) {
    const filePath = path.join(TESTS_DIR, entry.file);
    const fileBase = path.basename(entry.file, '.json');
    const rawDoc = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const validation = validateTestDocument(rawDoc);
    if (!validation.valid || !validation.data) {
      console.error(`   ❌ Bỏ qua ${entry.file} do lỗi cấu trúc:`, validation.errors);
      continue;
    }

    const doc: TestDocument = validation.data;
    const testId = doc.id;
    const listeningParts = doc.sections?.listening?.parts || [];
    const pendingAudioMetas = [];

    console.log(`\n   📘 Đang xử lý đề thi: [${testId}] "${doc.title}"`);

    // Upload audio files for each listening part first so doc.content has Supabase CDN URLs
    for (let partIdx = 0; partIdx < listeningParts.length; partIdx++) {
      const part = listeningParts[partIdx];
      const candidates = [
        path.join(AUDIO_DIR, `${testId}-${part.id}.mp3`),
        path.join(AUDIO_DIR, `${fileBase}-${part.id}.mp3`),
        part.audioUrl ? path.join(ROOT_DIR, 'public', part.audioUrl) : '',
      ].filter(Boolean);

      const diskAudioPath = candidates.find(
        (p) => fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 44
      );

      if (!diskAudioPath) {
        console.warn(`      ⚠️ Chưa có file audio cục bộ cho phần ${part.id}`);
        continue;
      }

      const ext = path.extname(diskAudioPath).toLowerCase() === '.wav' ? 'wav' : 'mp3';
      const mimeType = ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      const storagePath = `${testId}/${part.id}.${ext}`;
      const audioBytes = new Uint8Array(fs.readFileSync(diskAudioPath));

      const { error: uploadErr } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(storagePath, audioBytes, {
          contentType: mimeType,
          cacheControl: '31536000',
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(
          `Lỗi upload audio ${storagePath} lên Supabase Storage: ${uploadErr.message}`
        );
      }

      const { data: pubUrlData } = supabase.storage
        .from(AUDIO_BUCKET)
        .getPublicUrl(storagePath);

      part.audioUrl = pubUrlData.publicUrl;

      const audioMeta = buildListeningAudioMetadata({
        testId,
        part,
        partIndex: partIdx,
        storageBucket: AUDIO_BUCKET,
        storagePath,
        publicUrl: pubUrlData.publicUrl,
        format: ext,
        fileSizeBytes: audioBytes.byteLength,
        bitrateKbps: 192,
        sampleRate: 24000,
      });

      pendingAudioMetas.push(audioMeta);
      migratedAudioCount++;
      console.log(
        `      🎵 Đã tải lên Storage: ${storagePath} (${(
          audioBytes.byteLength / 1024
        ).toFixed(1)} KB, ~${audioMeta.durationSeconds}s, ${audioMeta.languageCode})`
      );
    }

    // Extract full test metadata now that part.audioUrl points to Supabase Storage CDN
    const meta = extractTestDocumentMetadata(doc);
    const nowIso = new Date().toISOString();

    const { error: upsertTestErr } = await supabase.from('tests').upsert(
      {
        id: doc.id,
        schema_version: doc.schemaVersion || '1.0.0',
        title: doc.title,
        description: doc.description,
        hidden: entry.hidden,
        language: meta.language,
        exam_system: meta.examSystem,
        level: meta.level,
        reading_passage_count: meta.readingPassageCount,
        reading_question_count: meta.readingQuestionCount,
        listening_part_count: meta.listeningPartCount,
        listening_question_count: meta.listeningQuestionCount,
        speaking_task_count: meta.speakingTaskCount,
        writing_task_count: meta.writingTaskCount,
        total_questions: meta.totalQuestions,
        audio_ready_count: meta.audioReadyCount,
        metadata: meta.metadataJson,
        content: doc,
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );

    if (upsertTestErr) {
      throw new Error(`Lỗi lưu đề thi ${doc.id}: ${upsertTestErr.message}`);
    }
    migratedTestsCount++;
    console.log(
      `      ✅ Đã lưu đề thi vào public.tests: [${meta.examSystem} ${meta.level}] ${meta.totalQuestions} câu hỏi, ${meta.audioReadyCount}/${meta.listeningPartCount} audio`
    );

    // Upsert audio metadata rows into public.test_audio
    for (const audioMeta of pendingAudioMetas) {
      const { error: audioMetaErr } = await supabase.from('test_audio').upsert(
        {
          test_id: audioMeta.testId,
          part_id: audioMeta.partId,
          part_index: audioMeta.partIndex,
          part_title: audioMeta.partTitle,
          storage_bucket: audioMeta.storageBucket,
          storage_path: audioMeta.storagePath,
          public_url: audioMeta.publicUrl,
          mime_type: audioMeta.mimeType,
          format: audioMeta.format,
          file_size_bytes: audioMeta.fileSizeBytes,
          duration_seconds: audioMeta.durationSeconds,
          sample_rate: audioMeta.sampleRate,
          bitrate_kbps: audioMeta.bitrateKbps,
          channels: audioMeta.channels,
          language_code: audioMeta.languageCode,
          scenario: audioMeta.scenario || null,
          accent: audioMeta.accent || null,
          pacing: audioMeta.pacing || null,
          speakers: audioMeta.speakers,
          transcript_hash: audioMeta.transcriptHash,
          transcript_char_count: audioMeta.transcriptCharCount,
          turn_count: audioMeta.turnCount,
          tts_model: audioMeta.ttsModel,
          metadata: {
            migratedFromLocal: true,
            updatedAt: nowIso,
          },
          updated_at: nowIso,
        },
        { onConflict: 'test_id,part_id' }
      );

      if (audioMetaErr) {
        throw new Error(
          `Lỗi lưu metadata audio ${audioMeta.testId}/${audioMeta.partId}: ${audioMetaErr.message}`
        );
      }
    }
  }

  console.log('\n============================================================');
  console.log(`🎉 HOÀN TẤT ĐỒNG BỘ!`);
  console.log(`   - Tài khoản Admin duy nhất: ${adminEmail}`);
  console.log(`   - Tổng số đề thi (public.tests): ${migratedTestsCount} đề`);
  console.log(`   - Tổng số file audio (storage.test-audio & public.test_audio): ${migratedAudioCount} files`);
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('❌ Lỗi khi migrate dữ liệu lên:', err);
  process.exit(1);
});
