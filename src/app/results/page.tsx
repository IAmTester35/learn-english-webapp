'use client';

import { useRouter } from 'next/navigation';
import { useAttempts } from '@/hooks/useAttempts';
import { ResultsHistoryView } from '@/components/ResultsHistoryView';

export default function ResultsPage() {
  const router = useRouter();
  const attempts = useAttempts();

  return (
    <ResultsHistoryView
      attempts={attempts}
      selectedAttemptId={attempts[0]?.id || null}
      onSelectAttempt={(id) => router.push(`/results/${id}`)}
      onRefreshAttempts={() => {}}
    />
  );
}
