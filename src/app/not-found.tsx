import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="max-w-2xl mx-auto p-6 my-12">
      <div className="border-2 border-black p-8 bg-[#fffdf5] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center space-y-6">
        <div className="inline-block border-2 border-black px-4 py-1 bg-amber-300 font-mono font-black text-sm uppercase">
          Lỗi 404
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-black tracking-tight">
          Trang không tồn tại
        </h1>
        <p className="text-sm sm:text-base font-semibold text-neutral-800 leading-relaxed max-w-md mx-auto">
          Đường dẫn bạn đang truy cập không tồn tại, bài thi đã bị đổi mã định danh hoặc đã bị gỡ bỏ khỏi hệ thống.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="w-full sm:w-auto border-2 border-black px-5 py-2.5 bg-black text-[#fffdf5] font-black text-sm hover:bg-neutral-800 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-center cursor-pointer"
          >
            Về danh mục bài thi
          </Link>
          <Link
            href="/results"
            className="w-full sm:w-auto border-2 border-black px-5 py-2.5 bg-[#fcf8ed] text-black font-black text-sm hover:bg-neutral-100 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-center cursor-pointer"
          >
            Xem lịch sử làm bài
          </Link>
        </div>
      </div>
    </main>
  );
}
