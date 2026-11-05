import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  deleteTestById,
  getTestById,
  getTestCatalog,
  saveTestDocument,
} from '@/server/testRepository';
import { validateTestDocument } from '@/domain/validator';
import { SAMPLE_TEST_TEMPLATE } from '@/services/testTemplate';
import { verifyAdminSession } from '@/server/auth';
import { triggerBackgroundTts } from '@/server/ttsService';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTemplateRequest = searchParams.get('template') === 'true';
  const singleTestId = searchParams.get('id');

  if (isTemplateRequest) {
    return NextResponse.json(SAMPLE_TEST_TEMPLATE, {
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  }

  try {
    const isAdmin = await verifyAdminSession();

    if (singleTestId) {
      const doc = await getTestById(singleTestId.trim(), { allowHidden: isAdmin });
      if (!doc) {
        return NextResponse.json(
          { error: `Không tìm thấy đề thi "${singleTestId}".` },
          { status: 404 }
        );
      }
      return NextResponse.json({ test: doc });
    }

    const wantsAdmin = searchParams.get('admin') === 'true';
    const includeHidden = isAdmin || (wantsAdmin && isAdmin);

    const catalog = await getTestCatalog({ includeHidden });
    return NextResponse.json(catalog, {
      headers: {
        'Cache-Control': includeHidden
          ? 'private, no-store'
          : 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không thể lấy danh mục bài thi.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Bạn cần đăng nhập quyền quản trị viên để tải lên đề thi mới.' },
      { status: 401 }
    );
  }

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
  const overwrite = Boolean(payload.overwrite);

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
    const result = await saveTestDocument(validation.data, { overwrite });

    try {
      revalidatePath('/', 'layout');
      revalidatePath('/test');
      revalidatePath(`/test/${result.id}`);
      revalidatePath('/admin');
    } catch {
      // Revalidation might be skipped in non-cache contexts
    }

    // Auto-run Pipeline: Tự động chạy TTS nền trên Supabase nếu đề thi có phần nghe
    try {
      if (
        validation.data.sections?.listening?.parts?.some((p) => p.transcript?.trim())
      ) {
        triggerBackgroundTts(result.id);
      }
    } catch (ttsErr) {
      console.warn('[Auto-run TTS] Không thể khởi chạy background TTS:', ttsErr);
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      isNew: result.isNew,
      message: result.message,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Lỗi hệ thống khi lưu đề thi.';
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

export async function DELETE(request: NextRequest) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Yêu cầu quyền quản trị viên để xóa đề thi.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id || !id.trim()) {
    return NextResponse.json(
      { error: 'Thiếu mã ID đề thi cần xóa.' },
      { status: 400 }
    );
  }

  try {
    const result = await deleteTestById(id.trim());
    try {
      revalidatePath('/', 'layout');
      revalidatePath('/test');
      revalidatePath(`/test/${result.id}`);
      revalidatePath('/admin');
    } catch {
      // ignore revalidate error
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không thể xóa đề thi.' },
      { status: 500 }
    );
  }
}
