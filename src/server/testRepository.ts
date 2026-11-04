import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TestCatalog, TestCatalogItem, TestDocument } from '../types/test';
import { validateTestDocument } from '../domain/validator';

const TESTS_DIR = path.join(process.cwd(), 'public', 'tests');

const LEGACY_ID_ALIASES: Record<string, string> = {
  'test-01': 'a2-key-english-test-01',
  'test-02': 'b1-plus-applied-english-test-01',
  'test-03': 'c1-advanced-academic-test-01',
  'test-04': 'b1-intermediate-english-test-01',
};

/**
 * Lấy danh mục bài thi từ public/tests/index.json.
 * Mặc định lọc bỏ các bài bị ẩn trừ khi options.includeHidden = true.
 */
export async function getTestCatalog(options?: { includeHidden?: boolean }): Promise<TestCatalog> {
  const indexPath = path.join(TESTS_DIR, 'index.json');
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tests)) {
      throw new Error('Định dạng public/tests/index.json không hợp lệ: thiếu mảng "tests".');
    }

    const allTests = parsed.tests as TestCatalogItem[];
    const tests = options?.includeHidden
      ? allTests
      : allTests.filter((item) => item.hidden !== true);

    return { tests };
  } catch (err) {
    console.error('Lỗi khi đọc danh mục bài thi:', err);
    throw new Error('Không thể nạp danh mục bài thi từ server.');
  }
}

/**
 * Lấy nội dung chi tiết bài thi theo ID.
 * Nếu bài bị ẩn mà không có options.allowHidden = true, trả về null để bảo mật.
 */
export async function getTestById(
  id: string,
  options?: { allowHidden?: boolean }
): Promise<TestDocument | null> {
  // Validate id: only alphanumeric, dashes and underscores, no slashes or dots
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return null;
  }

  const resolvedId = LEGACY_ID_ALIASES[id] || id;
  // Đọc danh mục đầy đủ (gồm bài ẩn) để kiểm tra chính xác trạng thái ẩn/hiện
  const catalog = await getTestCatalog({ includeHidden: true });

  // 1. Match directly against catalog item ID (e.g., "a2-key-english-test-01")
  let catalogItem = catalog.tests.find((item) => item.id === resolvedId);

  // 2. Fallback: match by catalog item's file basename without extension
  if (!catalogItem) {
    catalogItem = catalog.tests.find((item) => {
      const base = path.basename(item.file, path.extname(item.file));
      return base === resolvedId || base === id;
    });
  }

  // 3. Fallback: match by internal document id within the JSON files
  if (!catalogItem) {
    for (const item of catalog.tests) {
      try {
        const itemFilename = path.basename(item.file);
        const itemPath = path.join(TESTS_DIR, itemFilename);
        const itemRaw = await fs.readFile(itemPath, 'utf-8');
        const itemParsed = JSON.parse(itemRaw);
        if (itemParsed && (itemParsed.id === resolvedId || itemParsed.id === id)) {
          catalogItem = item;
          break;
        }
      } catch {
        // Continue searching
      }
    }
  }

  if (!catalogItem) {
    return null;
  }

  // Nếu bài đang ở trạng thái ẩn và không được phép truy cập bài ẩn, trả về null
  if (catalogItem.hidden === true && !options?.allowHidden) {
    return null;
  }

  // Ensure filePath resolves inside TESTS_DIR
  const filename = path.basename(catalogItem.file);
  const targetPath = path.join(TESTS_DIR, filename);

  try {
    const raw = await fs.readFile(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validation = validateTestDocument(parsed);
    if (!validation.valid || !validation.data) {
      console.error(`Lỗi quy chuẩn JSON bài thi ${id}:`, validation.errors);
      throw new Error(`Đề thi "${id}" không đạt chuẩn dữ liệu.`);
    }

    // SSOT: Normalize document ID to match catalogItem.id so all URLs,
    // progress storage keys, and router navigation remain consistent.
    validation.data.id = catalogItem.id;
    return validation.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Đảo ngược trạng thái hiển thị (hidden) của đề thi trong public/tests/index.json
 */
export async function toggleTestVisibility(
  id: string
): Promise<{ success: boolean; id: string; hidden: boolean }> {
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Mã bài thi "${id}" không hợp lệ.`);
  }

  const indexPath = path.join(TESTS_DIR, 'index.json');
  let raw: string;
  try {
    raw = await fs.readFile(indexPath, 'utf-8');
  } catch {
    throw new Error('Không thể đọc file danh mục bài thi public/tests/index.json.');
  }

  let catalog: TestCatalog;
  try {
    catalog = JSON.parse(raw) as TestCatalog;
  } catch {
    throw new Error('Dữ liệu public/tests/index.json không đúng định dạng JSON.');
  }

  if (!catalog || !Array.isArray(catalog.tests)) {
    throw new Error('Định dạng public/tests/index.json không hợp lệ: thiếu danh mục "tests".');
  }

  const resolvedId = LEGACY_ID_ALIASES[id] || id;
  const index = catalog.tests.findIndex(
    (item) =>
      item.id === resolvedId ||
      item.id === id ||
      path.basename(item.file, path.extname(item.file)) === resolvedId
  );

  if (index === -1) {
    throw new Error(`Không tìm thấy bài thi với mã ID "${id}".`);
  }

  const targetItem = catalog.tests[index];
  const newHidden = !targetItem.hidden;
  targetItem.hidden = newHidden;

  await fs.writeFile(indexPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

  return {
    success: true,
    id: targetItem.id,
    hidden: newHidden,
  };
}

export async function saveTestDocument(
  doc: unknown,
  _options?: { overwrite?: boolean }
): Promise<{ success: boolean; isNew: boolean; message: string; id: string }> {
  // 1. Validate against Domain Validator (SSOT)
  const validation = validateTestDocument(doc);
  if (!validation.valid || !validation.data) {
    throw new Error(`Dữ liệu đề thi không đạt chuẩn quy định:\n- ${validation.errors.join('\n- ')}`);
  }

  const validDoc = validation.data;

  // 2. Read existing catalog (bao gồm cả bài ẩn để tránh trùng ID)
  const catalog = await getTestCatalog({ includeHidden: true });
  const existingIdx = catalog.tests.findIndex(
    (t) => t.id === validDoc.id || path.basename(t.file, path.extname(t.file)) === validDoc.id
  );

  if (existingIdx >= 0) {
    throw new Error(`Đề thi với mã ID "${validDoc.id}" đã tồn tại trên hệ thống. Hệ thống không cho phép ghi đè bài thi đã có.`);
  }

  const filename = `${validDoc.id}.json`;
  const filePath = path.join(TESTS_DIR, filename);

  // 3. Write individual test JSON file
  await fs.writeFile(filePath, JSON.stringify(validDoc, null, 2), 'utf-8');

  // 4. Update catalog
  const catalogEntry: TestCatalogItem = {
    id: validDoc.id,
    title: validDoc.title,
    description: validDoc.description,
    file: `/tests/${filename}`,
  };

  catalog.tests.push(catalogEntry);

  // 5. Write updated index.json
  const indexPath = path.join(TESTS_DIR, 'index.json');
  await fs.writeFile(indexPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

  return {
    success: true,
    isNew: true,
    id: validDoc.id,
    message: `Đã thêm thành công đề thi "${validDoc.title}" (ID: ${validDoc.id}).`,
  };
}
