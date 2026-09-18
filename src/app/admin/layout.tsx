import { redirect } from 'next/navigation';
import { LogOut, Moon } from 'lucide-react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/server';
import { AdminMobileNav, AdminNav } from '@/components/admin/admin-nav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('인증 오류')) {
      redirect('/?auth-error=true');
    }
    if (message.includes('관리자 권한')) {
      redirect('/?admin-error=true');
    }
    redirect('/?admin-error=true');
  }

  return (
    <div className="bg-[#0b1326] text-[#dae2fd] font-sans min-h-screen flex selection:bg-yellow-500/20 selection:text-yellow-200">
      {/* SideNavBar */}
      <aside className="hidden md:flex flex-col h-full py-8 fixed left-0 top-0 h-screen w-[280px] border-r border-[#4d4732]/30 shadow-lg bg-[#171f33] backdrop-blur-2xl z-50">
        {/* Brand / Header */}
        <div className="px-6 pb-8 border-b border-[#4d4732]/20 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 flex-shrink-0 border border-[#999077]/30 flex items-center justify-center">
              {/* Profile Image Mockup with initials */}
              <span className="font-extrabold text-[#ffd700]">A</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-[#fff6df] flex items-center gap-1.5">
                <Moon className="w-4 h-4 text-[#ffd700]" />
                관리자 콘솔
              </h1>
              <p className="text-xs text-[#d0c6ab]">달빛수원 서비스 관리</p>
            </div>
          </div>
          
          <Link href="/admin/courses?new=1" className="w-full py-3 px-4 bg-[#ffd700] text-[#3a3000] font-bold text-xs rounded hover:bg-[#ffe16d] transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98">
            <span>새 코스 추가</span>
          </Link>
        </div>

        <AdminNav />

        {/* Footer Link */}
        <div className="mt-auto px-2 pt-6 border-t border-[#4d4732]/20">
          <Link 
            href="/"
            className="flex items-center gap-3 text-[#d0c6ab] px-4 py-3 text-sm font-semibold hover:bg-red-950/20 hover:text-red-400 transition-all border-l-4 border-transparent rounded-r"
          >
            <LogOut className="w-4 h-4" />
            <span>메인 페이지로</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:ml-[280px] min-h-screen flex flex-col">
        <AdminMobileNav />
        {children}
      </div>
    </div>
  );
}
