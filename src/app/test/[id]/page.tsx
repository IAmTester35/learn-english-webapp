import { notFound } from 'next/navigation';
import { getTestById, getTestCatalog } from '@/server/testRepository';
import { hasGeminiApiKey } from '@/server/gemini';
import { TestRunnerView } from '@/components/TestRunnerView';

export async function generateStaticParams() {
  try {
    const catalog = await getTestCatalog();
    return catalog.tests.map((t) => ({ id: t.id }));
  } catch {
    return [];
  }
}

export default async function TestPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const test = await getTestById(id);

  if (!test) {
    notFound();
  }

  const aiEnabled = hasGeminiApiKey();

  return <TestRunnerView test={test} aiEnabled={aiEnabled} />;
}
