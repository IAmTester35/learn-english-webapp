import { NextRequest, NextResponse } from 'next/server';
import { getTestById } from '@/server/testRepository';
import { hasGeminiApiKey } from '@/server/gemini';
import { gradeSingleWritingTaskWithAi } from '@/server/writingGrader';
import { checkRateLimit } from '@/server/rateLimit';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // 1. Rate limiting by IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
  const rateLimitResult = checkRateLimit(ip);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu chấm bài. Vui lòng thử lại sau.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) },
      }
    );
  }

  // 2. Parse & validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body yêu cầu phải là JSON hợp lệ.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Payload không hợp lệ.' }, { status: 400 });
  }

  const { testId, taskId, userText } = body as Record<string, unknown>;

  if (typeof testId !== 'string' || !testId.trim()) {
    return NextResponse.json({ error: 'Trường testId là bắt buộc.' }, { status: 400 });
  }

  if (typeof taskId !== 'string' || !taskId.trim()) {
    return NextResponse.json({ error: 'Trường taskId là bắt buộc.' }, { status: 400 });
  }

  if (typeof userText !== 'string') {
    return NextResponse.json({ error: 'Trường userText phải là chuỗi.' }, { status: 400 });
  }

  // Length constraint: max 10,000 characters
  if (userText.length > 10000) {
    return NextResponse.json(
      { error: 'Bài làm quá dài (vượt quá giới hạn 10.000 ký tự).' },
      { status: 400 }
    );
  }

  // 3. Check AI capability
  if (!hasGeminiApiKey()) {
    return NextResponse.json(
      { error: 'Tính năng AI chấm bài chưa được kích hoạt trên hệ thống.' },
      { status: 503 }
    );
  }

  // 4. Load test & find task from Single Source of Truth
  try {
    const testDoc = await getTestById(testId);
    if (!testDoc) {
      return NextResponse.json({ error: `Không tìm thấy bài thi "${testId}".` }, { status: 404 });
    }

    const task = testDoc.sections.writing.tasks.find((t) => t.id === taskId);
    if (!task) {
      return NextResponse.json(
        { error: `Không tìm thấy phần Writing task "${taskId}" trong bài thi.` },
        { status: 404 }
      );
    }

    // 5. Grade with AI
    const result = await gradeSingleWritingTaskWithAi({
      title: task.title,
      prompt: task.prompt,
      minWords: task.minWords,
      rubric: task.rubric,
      userText,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(`Lỗi khi chấm AI bài thi ${testId} - task ${taskId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi hệ thống khi chấm bài bằng AI.' },
      { status: 500 }
    );
  }
}
