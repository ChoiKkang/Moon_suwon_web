-- ================================================================
-- 20260831144218_seed_place_copy_missions.sql
-- 스팟별 editorial 콘텐츠(미션 문구·야간 포인트·포토팁·짧은 이야기·커플 질문) 시드
--
-- 배경: 홈/코스/스팟 상세와 코스 진행 화면은 editorial.place_copy를 통해
-- mission_prompt, mission_type, mission_radius_m, night_highlight, photo_tip,
-- short_story, couple_question을 노출한다. 그런데 이 필드들이 대부분 NULL
-- 이라 진행 화면의 "촬영 미션: {mission_prompt}" 값이 비어 보이는 문제가 있었다.
-- 여기서 8개 대표 스팟에 대해 초기 편집 콘텐츠를 채운다.
--
-- 원칙:
--   • idempotent — 이미 값이 있는 편집 필드는 절대 덮어쓰지 않는다
--     (운영자가 편집 웹에서 손을 대면 우선).
--   • place_copy 행이 없으면 새로 생성.
--   • 미노출 스팟(용연·행리단길처럼 core.places가 없는 것)은 생략.
-- ================================================================

WITH seed(slug, display_name, short_description, mission_type, mission_prompt,
          mission_radius_m, night_highlight, photo_tip, short_story, couple_question) AS (
  VALUES
    (
      'paldalmun',
      '팔달문',
      '수원화성 남쪽 정문. 도심 로터리 한가운데에서 만나는 국보 성문.',
      'photo',
      '로터리 한가운데 선 성문의 조명을 담아보세요.',
      100,
      '로터리 조명 아래 홀로 서 있는 성문 야경',
      '로터리 건너편 인도에서 성문을 정면으로 담으면 좌우 대칭이 살아납니다.',
      '조선 후기 수원 남쪽을 지키던 정문으로, 지금은 도심 속 국보로 남아 있습니다.',
      '이 성문 앞에서 어떤 사진을 남기고 싶어?'
    ),
    (
      'hwaseong-haenggung',
      '화성행궁',
      '정조가 수원화성을 순행하며 머물던 조선 최대 규모의 행궁.',
      'photo',
      '정문 신풍루를 배경으로 사진을 찍어보세요.',
      100,
      '신풍루의 은은한 조명과 정전 앞 넓은 광장',
      '신풍루 정면 계단 아래 중앙에서 좌우 대칭 구도로 촬영해 보세요.',
      '정조가 수원화성을 순행할 때 머물던 조선 최대 규모의 행궁입니다.',
      '오늘 밤 이 행궁에서 정조가 되어 어떤 명령을 내려볼까?'
    ),
    (
      'janganmun',
      '장안문',
      '수원화성 북쪽 정문. 서울로 통하는 관문이었던 국보 성문.',
      'photo',
      '성문 아치 아래에서 위를 올려다보세요.',
      100,
      '두 겹 옹성과 문루가 만드는 웅장한 야간 실루엣',
      '옹성 안쪽 통로에서 문루를 올려다보면 조명이 극적으로 살아납니다.',
      '서울에서 수원화성으로 들어오는 관문이었던 정문입니다.',
      '이 성문을 통과하면 오늘 밤 어떤 여정이 시작될까?'
    ),
    (
      'banghwasuryujeong',
      '방화수류정',
      '용연을 내려다보며 서 있는 화성 최고의 야경 명소이자 국보 정자.',
      'photo',
      '정자와 수면이 함께 보이는 지점을 찾아보세요.',
      80,
      '용연 수면에 비친 정자와 조명의 반영',
      '용연 쪽 데크에서 정자와 수면을 한 프레임에 담아보세요.',
      '군사 시설이면서도 정조가 사랑한 정자로, 수원화성 야경의 상징입니다.',
      '이 야경을 한 문장으로 표현한다면?'
    ),
    (
      'hwahongmun',
      '화홍문',
      '수원천을 가로지르는 7개의 수문. 물과 조명이 어우러지는 야경.',
      'photo',
      '7개의 수문 아치를 한 프레임에 담아보세요.',
      80,
      '7개의 아치 아래로 흐르는 물과 조명의 리듬',
      '수문 정면 다리 위에서 7개의 아치가 모두 보이도록 프레이밍하세요.',
      '수원천이 화성 안팎을 넘나들도록 만든 홍예다리형 수문입니다.',
      '어느 아치가 가장 마음에 들어? 이유는?'
    ),
    (
      'yeonmudae',
      '연무대',
      '군사 훈련장으로 쓰이던 동장대. 원형 성곽 동북공심돈과 이어진다.',
      'photo',
      '동북공심돈의 원형 성곽을 한 컷에 담아보세요.',
      100,
      '동북공심돈의 곡선 성곽이 만드는 부드러운 실루엣',
      '연무대 데크에서 동북공심돈을 왼쪽에 두고 성벽 라인을 살려보세요.',
      '조선 후기 무예를 훈련하던 열린 훈련장입니다.',
      '오늘 밤 우리가 훈련한다면 어떤 미션을 정해볼까?'
    ),
    (
      'changnyongmun',
      '창룡문',
      '수원화성 동쪽 성문. 옹성 곡선이 부드럽게 이어지는 야경 포인트.',
      'photo',
      '옹성 안쪽에서 성문의 곡선을 따라 걸어보세요.',
      100,
      '옹성 곡선과 문루 조명이 만드는 이중 실루엣',
      '옹성 바깥쪽에서 곡선 벽을 따라 앵글을 낮추면 성문이 커 보입니다.',
      '수원화성 4대문 중 동쪽 문으로, 반달 모양 옹성으로 감싸여 있습니다.',
      '이 곡선을 따라 걸으며 오늘 밤 어떤 이야기를 나눠볼까?'
    ),
    (
      'seojangdae',
      '서장대',
      '팔달산 정상에 자리한 지휘소. 수원 시내 야경을 파노라마로 볼 수 있다.',
      'photo',
      '정상에서 수원 시내 야경을 파노라마로 담아보세요.',
      100,
      '팔달산에서 내려다보는 수원 도심 야경',
      '서장대 앞 광장 난간에 카메라를 대고 파노라마로 촬영해 보세요.',
      '정조가 화성 방어를 지휘하던 지휘소. 지금은 수원 최고의 전망대입니다.',
      '이 야경 속에서 오늘 하루를 되돌아본다면?'
    )
),
resolved AS (
  SELECT
    p.id AS place_id,
    s.*
  FROM seed s
  JOIN core.places p ON p.slug = s.slug
)
INSERT INTO editorial.place_copy (
  place_id,
  display_name,
  short_description,
  mission_type,
  mission_prompt,
  mission_radius_m,
  night_highlight,
  photo_tip,
  short_story,
  couple_question,
  updated_at
)
SELECT
  r.place_id,
  r.display_name,
  r.short_description,
  r.mission_type,
  r.mission_prompt,
  r.mission_radius_m,
  r.night_highlight,
  r.photo_tip,
  r.short_story,
  r.couple_question,
  now()
FROM resolved r
ON CONFLICT (place_id) DO UPDATE
SET
  -- 기존에 값이 있으면 편집자 판단을 존중해 유지, NULL/빈 문자열이면 새 값으로 채움.
  display_name      = COALESCE(NULLIF(editorial.place_copy.display_name, ''), EXCLUDED.display_name),
  short_description = COALESCE(NULLIF(editorial.place_copy.short_description, ''), EXCLUDED.short_description),
  mission_type      = COALESCE(NULLIF(editorial.place_copy.mission_type, ''), EXCLUDED.mission_type),
  mission_prompt    = COALESCE(NULLIF(editorial.place_copy.mission_prompt, ''), EXCLUDED.mission_prompt),
  mission_radius_m  = COALESCE(editorial.place_copy.mission_radius_m, EXCLUDED.mission_radius_m),
  night_highlight   = COALESCE(NULLIF(editorial.place_copy.night_highlight, ''), EXCLUDED.night_highlight),
  photo_tip         = COALESCE(NULLIF(editorial.place_copy.photo_tip, ''), EXCLUDED.photo_tip),
  short_story       = COALESCE(NULLIF(editorial.place_copy.short_story, ''), EXCLUDED.short_story),
  couple_question   = COALESCE(NULLIF(editorial.place_copy.couple_question, ''), EXCLUDED.couple_question),
  updated_at        = now();
