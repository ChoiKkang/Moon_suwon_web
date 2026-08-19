import { getAdminCourses } from '@/lib/admin/queries';
import { CourseManager } from '@/components/admin/course-manager';

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; new?: string }>;
}) {
  const [{ data, error }, params] = await Promise.all([getAdminCourses(), searchParams]);

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 p-6 md:p-12 xl:p-16">
      <header className="mb-8">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ffd700]">Route Curation</p>
        <h1 className="mt-3 text-3xl font-black text-[#fff6df] md:text-5xl">코스 생성·수정</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#d0c6ab]">실제 공개 장소를 연결하고, 운영 문구와 노출 순서를 관리합니다. 새 코스는 비공개로 저장됩니다.</p>
      </header>
      {error ? <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">코스 운영 데이터를 불러오지 못했습니다. {error}</div> : <CourseManager courses={data.courses} places={data.places} initialCourseId={params.course} initialNew={params.new === '1'} />}
    </main>
  );
}
