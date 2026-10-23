import { getTestCatalog } from '@/server/testRepository';
import { getServerProgressSummaries, getServerAttemptSummaries } from '@/server/serverStorage';
import { TestCatalogOverview } from '@/components/catalog/TestCatalogOverview';
import { TestResumeBanner } from '@/components/catalog/TestResumeBanner';
import { TestCatalogContainer } from '@/components/catalog/TestCatalogContainer';

export default async function HomePage() {
  const [catalog, serverProgressList, serverAttemptList] = await Promise.all([
    getTestCatalog(),
    getServerProgressSummaries(),
    getServerAttemptSummaries(),
  ]);

  const totalTests = catalog.tests.length;
  const inProgressCount = serverProgressList.length;
  const completedCount = new Set(serverAttemptList.map((a) => a.testId)).size;
  const attemptsCount = serverAttemptList.length;

  return (
    <main className="max-w-5xl mx-auto p-3 sm:p-4 md:p-6 space-y-6 w-full min-w-0 overflow-x-hidden">
      {/* 1. Server Component: Pure SSR, Zero Client JS */}
      <TestCatalogOverview totalTests={totalTests} />

      {/* 2. Interactive Island: In-progress resume banner */}
      <TestResumeBanner initialProgressList={serverProgressList} />

      {/* 3. Interactive Island: Search, filter, view switcher, and card actions */}
      <TestCatalogContainer
        tests={catalog.tests}
        initialProgressList={serverProgressList}
        initialAttemptList={serverAttemptList}
      />
    </main>
  );
}
