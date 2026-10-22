import Link from 'next/link';
import { getTestCatalog } from '@/server/testRepository';

export default async function HomePage() {
  const catalog = await getTestCatalog();

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <section className="border-2 border-black p-6 bg-white space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">Kỳ thi trực tuyến 4 kỹ năng</h2>
        <p className="text-neutral-700 leading-relaxed text-sm">
          Tất cả dữ liệu đề bài được nạp trực tiếp từ file dữ liệu JSON trên server.
          Lịch sử bài làm được lưu trữ cục bộ trên trình duyệt (Local Storage), hoàn toàn bảo mật và không yêu cầu đăng nhập.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs font-mono">
          <div className="border border-black p-2 text-center bg-white">
            <span className="block font-bold">READING</span>
            <span>Chấm tự động tức thì</span>
          </div>
          <div className="border border-black p-2 text-center bg-white">
            <span className="block font-bold">LISTENING</span>
            <span>Chấm tự động tức thì</span>
          </div>
          <div className="border border-black p-2 text-center bg-white">
            <span className="block font-bold">SPEAKING</span>
            <span>Lưu & chấm đối chiếu</span>
          </div>
          <div className="border border-black p-2 text-center bg-white">
            <span className="block font-bold">WRITING</span>
            <span>Chấm AI theo Rubric</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="available-tests-heading" className="space-y-4">
        <h3 id="available-tests-heading" className="text-xl font-bold border-b-2 border-black pb-2">
          Danh sách đề thi có sẵn ({catalog.tests.length})
        </h3>

        {catalog.tests.length === 0 ? (
          <p className="text-neutral-600 italic">Chưa có bài thi nào trong hệ thống.</p>
        ) : (
          <div className="grid gap-4">
            {catalog.tests.map((test) => (
              <article
                key={test.id}
                className="border-2 border-black p-5 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <div className="space-y-1">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 border border-black inline-block">
                    {test.id}
                  </span>
                  <h4 className="text-lg font-bold">{test.title}</h4>
                  <p className="text-sm text-neutral-700">{test.description}</p>
                  <p className="text-xs text-neutral-500 font-mono">ID bài thi: {test.id}</p>
                </div>

                <div className="shrink-0">
                  <Link
                    href={`/test/${test.id}`}
                    className="w-full md:w-auto px-6 py-2.5 bg-black text-white font-bold border-2 border-black hover:bg-white hover:text-black transition-colors focus-visible:outline-2 text-center inline-block cursor-pointer"
                  >
                    Bắt đầu làm bài &rarr;
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
