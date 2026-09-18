import type { CourseCopyDraft, ValidatedCourseCandidate } from './course-copy-schema';
import { validateCourseCopy } from './course-copy-schema';

export interface CourseCopyProvider {
  generate(input: ValidatedCourseCandidate): Promise<CourseCopyDraft>;
}

export class DeterministicCourseCopyProvider implements CourseCopyProvider {
  async generate(input: ValidatedCourseCandidate): Promise<CourseCopyDraft> {
    const title = `${input.theme} 추천 코스`;
    const subtitle = `${input.stops.length}곳을 잇는 검수 대기 동선`;
    const summary = input.stops.map((stop) => stop.displayName).join(' → ');
    const stopReasons = input.stops.map((stop) => ({
      placeId: stop.placeId,
      text: stop.evidence[0] ?? '공개 장소 데이터 기반 후보',
    }));
    const warnings = [
      input.distanceKind === 'straight_line_estimate'
        ? `직선거리 ${input.distanceKm.toFixed(2)}km 추정치이며 실제 도보 동선과 다를 수 있습니다.`
        : '승인된 경로 제공자의 경로를 사용했습니다.',
      input.petReadyFlag ? '반려동물 정책이 확인된 장소만 포함했습니다.' : '반려동물 동반 여부는 장소별 최신 안내를 확인해 주세요.',
    ];
    return { title, subtitle, summary, stopReasons, warnings };
  }
}

export async function generateSafeCourseCopy(input: ValidatedCourseCandidate, provider = new DeterministicCourseCopyProvider()): Promise<CourseCopyDraft> {
  const output = await provider.generate(input);
  const validation = validateCourseCopy(input, output);
  if (!validation.valid) return new DeterministicCourseCopyProvider().generate(input);
  return output;
}

export function courseAiEnabled(): boolean {
  return process.env.COURSE_AI_ENABLED === 'true';
}
