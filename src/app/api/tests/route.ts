import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getTestCatalog, saveTestDocument } from '@/server/testRepository';
import { validateTestDocument } from '@/domain/validator';
import { SAMPLE_TEST_TEMPLATE } from '@/services/testTemplate';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTemplateRequest = searchParams.get('template') === 'true';

  if (isTemplateRequest) {
    return NextResponse.json(SAMPLE_TEST_TEMPLATE);
  }

  try {
    const catalog = await getTestCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không thể lấy danh mục bài thi.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Nội dung gửi lên phải là định dạng JSON hợp lệ.' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Dữ liệu gửi lên không đúng định dạng đối tượng.' },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  const rawTest = ('test' in payload ? payload.test : payload) as unknown;

  // Validate on the server side (Verification gate / Never trust client)
  const validation = validateTestDocument(rawTest);
  if (!validation.valid || !validation.data) {
    return NextResponse.json(
      {
        error: 'Đề thi không đạt chuẩn quy định dữ liệu.',
        details: validation.errors,
      },
      { status: 422 }
    );
  }

  try {
    const result = await saveTestDocument(validation.data);

    // Invalidate cached catalog and pages
    try {
      revalidatePath('/', 'layout');
      revalidatePath('/test');
      revalidatePath(`/test/${result.id}`);
    } catch {
      // Revalidation might be skipped in non-cache contexts
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      isNew: result.isNew,
      message: result.message,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Lỗi hệ thống khi lưu đề thi.';
    const isConflict = errorMessage.includes('đã tồn tại');
    return NextResponse.json(
      {
        error: errorMessage,
        conflict: isConflict,
        existingId: validation.data.id,
      },
      { status: isConflict ? 409 : 500 }
    );
  }
}
