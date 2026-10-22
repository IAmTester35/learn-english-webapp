import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TestCatalog, TestDocument } from '../types/test';
import { validateTestDocument } from '../domain/validator';

const TESTS_DIR = path.join(process.cwd(), 'public', 'tests');

export async function getTestCatalog(): Promise<TestCatalog> {
  const indexPath = path.join(TESTS_DIR, 'index.json');
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tests)) {
      throw new Error('Định dạng public/tests/index.json không hợp lệ: thiếu mảng "tests".');
    }
    return parsed as TestCatalog;
  } catch (err) {
    console.error('Lỗi khi đọc danh mục bài thi:', err);
    throw new Error('Không thể nạp danh mục bài thi từ server.');
  }
}

export async function getTestById(id: string): Promise<TestDocument | null> {
  // Validate id: only alphanumeric, dashes and underscores, no slashes or dots
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return null;
  }

  const catalog = await getTestCatalog();
  const catalogItem = catalog.tests.find((item) => item.id === id);
  if (!catalogItem) {
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
    return validation.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}
