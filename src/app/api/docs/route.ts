import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  let filename = '';
  if (type === 'cefr') {
    filename = 'test-authoring-guide.md';
  } else if (type === 'hsk') {
    filename = 'hsk-test-authoring-guide.md';
  } else {
    return NextResponse.json(
      { error: 'Loại tài liệu không hợp lệ. Vui lòng chọn "cefr" hoặc "hsk".' },
      { status: 400 }
    );
  }

  try {
    const filePath = path.join(process.cwd(), 'docs', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return NextResponse.json(
      { type, filename, content },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('Lỗi khi đọc file tài liệu:', err);
    return NextResponse.json(
      { error: 'Không thể đọc file tài liệu hướng dẫn.' },
      { status: 500 }
    );
  }
}
