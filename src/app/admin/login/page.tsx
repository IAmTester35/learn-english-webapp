'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Vui lòng nhập đầy đủ Email và Mật khẩu quản trị.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Đăng nhập thất bại.');
      }

      router.push(redirectUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi xác thực.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md border-2 border-black bg-[#fffdf5] shadow-[6px_6px_0px_0px_#000] p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-1 text-black">
        <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Khu Vực Quản Trị</h1>
      </div>

      {error && (
        <div className="mb-5 p-3 bg-red-100 border-2 border-red-600 text-red-900 text-xs sm:text-sm flex items-start gap-2 font-medium">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-700" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="admin-email"
            className="block text-xs font-bold uppercase tracking-wider mb-1.5 text-black"
          >
            Email Quản trị
          </label>
          <div className="relative">
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your email"
              className="w-full border-2 border-black bg-white px-3.5 py-2.5 pr-9 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black"
              disabled={isLoading}
              required
            />
            <Mail className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="block text-xs font-bold uppercase tracking-wider mb-1.5 text-black"
          >
            Mật khẩu quản trị
          </label>
          <div className="relative">
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu quản trị..."
              className="w-full border-2 border-black bg-white px-3.5 py-2.5 pr-9 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black"
              disabled={isLoading}
              autoFocus
              required
            />
            <Lock className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-2 border-2 border-black bg-black text-[#fffdf5] hover:bg-[#222] py-2.5 px-4 font-bold text-sm flex items-center justify-center gap-2 transition-transform active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-[#fffdf5] border-t-transparent rounded-full animate-spin" />
              <span>Đang xác thực...</span>
            </>
          ) : (
            <>
              <span>Đăng nhập Quản trị</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="min-h-[calc(100vh-140px)] flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md border-2 border-black bg-[#fffdf5] p-8 text-center">
            <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm font-bold">Đang tải...</p>
          </div>
        }
      >
        <AdminLoginForm />
      </Suspense>
    </main>
  );
}
