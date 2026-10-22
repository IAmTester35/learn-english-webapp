import { getTestCatalog } from '@/server/testRepository';
import { TestCatalogView } from '@/components/TestCatalogView';

export default async function HomePage() {
  const catalog = await getTestCatalog();

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6">
      <TestCatalogView catalog={catalog} />
    </main>
  );
}
