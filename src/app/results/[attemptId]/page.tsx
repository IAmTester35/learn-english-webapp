'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAttempts } from '@/hooks/useAttempts';
import { ResultsHistoryView } from '@/components/ResultsHistoryView';

export default function AttemptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const attempts = useAttempts();
  const attemptId = typeof params?.attemptId === 'string' ? params.attemptId : null;

  return (
    <ResultsHistoryView
      attempts={attempts}
      selectedAttemptId={attemptId}
      onSelectAttempt={(id) => router.push(`/results/${id}`)}
      onRefreshAttempts={() => {}}
    />
  );
}
