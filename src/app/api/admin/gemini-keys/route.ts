import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/server/auth';
import {
  addGeminiKeyToSupabase,
  deleteGeminiKeyFromSupabase,
  listGeminiKeysForAdmin,
  probeAllGeminiKeysHealth,
  probeSingleGeminiKeyHealth,
  resetAllKeyCooldownsInSupabase,
  toggleGeminiKeyStatusInSupabase,
} from '@/server/geminiKeyManager';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized: Yêu cầu quyền quản trị viên.' },
      { status: 401 }
    );
  }

  try {
    const keys = await listGeminiKeysForAdmin();
    return NextResponse.json({ keys });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không thể lấy danh sách Gemini API Keys.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized: Yêu cầu quyền quản trị viên.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const action = body?.action;

    if (action === 'add') {
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      const label = typeof body.label === 'string' ? body.label.trim() : undefined;
      if (!apiKey) {
        return NextResponse.json({ error: 'Vui lòng nhập Gemini API Key.' }, { status: 400 });
      }
      const created = await addGeminiKeyToSupabase({ apiKey, label });
      // Probe health immediately after adding
      let checked = created;
      try {
        checked = await probeSingleGeminiKeyHealth(created.id);
      } catch {
        // Return created if probe fails
      }
      return NextResponse.json({ success: true, key: checked });
    }

    if (action === 'delete') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) {
        return NextResponse.json({ error: 'Thiếu ID của key cần xóa.' }, { status: 400 });
      }
      await deleteGeminiKeyFromSupabase(id);
      return NextResponse.json({ success: true });
    }

    if (action === 'toggle') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const disabled = Boolean(body.disabled);
      if (!id) {
        return NextResponse.json({ error: 'Thiếu ID của key.' }, { status: 400 });
      }
      const updated = await toggleGeminiKeyStatusInSupabase(id, disabled);
      return NextResponse.json({ success: true, key: updated });
    }

    if (action === 'probe') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (id) {
        const key = await probeSingleGeminiKeyHealth(id);
        return NextResponse.json({ success: true, key });
      }
      const keys = await probeAllGeminiKeysHealth();
      return NextResponse.json({ success: true, keys });
    }

    if (action === 'reset_cooldowns') {
      await resetAllKeyCooldownsInSupabase();
      const keys = await listGeminiKeysForAdmin();
      return NextResponse.json({ success: true, keys });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi khi xử lý Gemini API Key.' },
      { status: 500 }
    );
  }
}
