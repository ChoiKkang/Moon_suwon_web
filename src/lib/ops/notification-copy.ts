/**
 * 디스코드 알림 문구를 한글로 만든다.
 *
 * 워크플로는 job=audio, fetched=130 같은 기계값을 내보낸다. 실행 로그를 여는
 * 사람에게는 충분하지만, 운영자가 휴대폰 알림만 보고 조치할지 판단하기에는
 * 읽히지 않는다. 잡 이름과 상태를 한글 라벨로 바꾸고 숫자에 단위를 붙인다.
 */

/** 수집 잡 이름을 운영자가 쓰는 말로. */
const JOB_LABELS: Record<string, string> = {
  content: '장소·이미지',
  events: '축제·행사',
  crowd: '방문 집중도 예측',
  pet: '반려동물 정보',
  access: '무장애 정보',
  audio: '오디오 해설',
};

/** GitHub Actions와 수집 스크립트가 함께 쓰는 상태값. */
const STATUS_LABELS: Record<string, string> = {
  success: '성공',
  completed: '성공',
  failure: '실패',
  failed: '실패',
  partial: '부분 성공',
  cancelled: '취소됨',
  skipped: '건너뜀',
  healthy: '정상',
  review: '확인 권장',
  action_required: '조치 필요',
  unknown: '알 수 없음',
};

export function jobLabel(job: string): string {
  const key = job.trim();
  return JOB_LABELS[key] ?? key;
}

export function statusLabel(status: string): string {
  const key = status.trim().toLowerCase();
  return STATUS_LABELS[key] ?? status.trim();
}

export type SyncSummaryInput = {
  job: string;
  status: string;
  itemsFetched: string;
  itemsUpserted: string;
  errorCount: string;
  shouldRun: string;
};

/**
 * 수집 실행 결과를 한 문단으로.
 *
 * 0건 저장은 실패가 아닐 수 있다. 반려동물 정보는 수원에 원천 데이터가 거의
 * 없어 정상 실행에도 0건이 나온다. 숫자만 보고 장애로 오해하지 않도록
 * 조회 건수와 저장 건수를 함께 적는다.
 */
export function buildSyncSummary(input: SyncSummaryInput): string {
  if (input.shouldRun.trim() === 'false') {
    return `${jobLabel(input.job)} 수집을 건너뛰었습니다. 서울 기준 실행 날짜 조건에 맞지 않습니다.`;
  }

  const fetched = toCount(input.itemsFetched);
  const upserted = toCount(input.itemsUpserted);
  const errors = toCount(input.errorCount);

  const lines = [
    `**${jobLabel(input.job)}** 수집 ${statusLabel(input.status)}`,
    `조회 ${fetched}건 · 저장 ${upserted}건 · 오류 ${errors}건`,
  ];

  if (errors > 0) {
    lines.push('오류가 있습니다. 관리자 콘솔의 운영 현황에서 실패한 항목을 확인해 주세요.');
  } else if (upserted === 0 && fetched > 0) {
    lines.push('조회는 됐지만 새로 저장할 내용이 없습니다. 원천에 변경이 없거나 해당 정보가 등록되지 않은 상태입니다.');
  }

  return lines.join('\n');
}

export type DraftSummaryInput = {
  candidateCount: string;
  writtenCount: string;
  mode: string;
  status?: string;
};

export function buildDraftSummary(input: DraftSummaryInput): string {
  const candidates = toCount(input.candidateCount);
  const written = toCount(input.writtenCount);
  const dryRun = input.mode.trim() === 'dry-run';
  const failed = ['failure', 'failed', 'cancelled'].includes(input.status?.trim().toLowerCase() ?? '');

  const lines = [
    failed ? '**코스 초안 생성** 실행 실패' : dryRun ? '**코스 초안 생성** 미리보기' : '**코스 초안 생성** 완료',
    `후보 ${candidates}개 검토 · 초안 ${written}개 ${dryRun ? '생성 예정' : '작성'}`,
  ];

  if (!failed && !dryRun && written > 0) {
    lines.push('초안은 비공개 상태입니다. 관리자 콘솔이나 `/달빛 코스`에서 확인 후 공개해 주세요.');
  }

  return lines.join('\n');
}

function toCount(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
