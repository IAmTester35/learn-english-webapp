import { notFound } from 'next/navigation';
import { getTestById, getTestCatalog } from '@/server/testRepository';
import { hasGeminiApiKey } from '@/server/gemini';
import { TestRunnerView } from '@/components/TestRunnerView';
import type { SkillSection } from '@/types/test';

const VALID_SECTIONS: SkillSection[] = ['reading', 'listening', 'speaking', 'writing'];

export async function generateStaticParams() {
  try {
    const catalog = await getTestCatalog();
    return catalog.tests.flatMap((t) => [
      { id: t.id, section: [] },
      ...VALID_SECTIONS.map((s) => ({ id: t.id, section: [s] })),
    ]);
  } catch {
    return [];
  }
}

export default async function TestPage(props: {
  params: Promise<{ id: string; section?: string[] }>;
}) {
  const { id, section } = await props.params;
  const test = await getTestById(id);

  if (!test) {
    notFound();
  }

  // If section is provided in path, validate it
  let initialSection: SkillSection | undefined = undefined;
  if (section && section.length > 0) {
    if (section.length > 1) {
      notFound();
    }
    const sec = section[0] as SkillSection;
    if (!VALID_SECTIONS.includes(sec)) {
      notFound();
    }
    initialSection = sec;
  }

  const aiEnabled = hasGeminiApiKey();

  return (
    <TestRunnerView
      test={test}
      aiEnabled={aiEnabled}
      initialSection={initialSection}
    />
  );
}
