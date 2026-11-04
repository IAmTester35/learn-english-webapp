import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyAdminSession } from '@/server/auth';
import { toggleTestVisibility } from '@/server/testRepository';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Yêu cầu quyền quản trị viên.' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { error: 'Mã bài thi không hợp lệ.' },
      { status: 400 }
    );
  }

  try {
    const result = await toggleTestVisibility(id);

    try {
      revalidatePath('/', 'layout');
      revalidatePath('/test');
      revalidatePath('/admin');
    } catch {
      // Revalidation might be skipped in non-cache contexts
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái bài thi.' },
      { status: 500 }
    );
  }
}
