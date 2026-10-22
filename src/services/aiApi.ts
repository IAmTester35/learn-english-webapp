export interface GradeResult {
  score: string;
  notes: string;
}

export async function gradeWritingTaskWithServer(params: {
  testId: string;
  taskId: string;
  userText: string;
}): Promise<GradeResult | null> {
  const trimmed = params.userText.trim();
  if (!trimmed) {
    return {
      score: '0/10',
      notes: 'Thí sinh chưa nhập bài làm cho phần thi này.',
    };
  }

  const response = await fetch('/api/grade-writing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      testId: params.testId,
      taskId: params.taskId,
      userText: trimmed,
    }),
  });

  if (response.status === 503) {
    // AI is not configured or disabled on server
    return null;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Lỗi server (${response.status}) khi chấm bài.`);
  }

  return response.json();
}
