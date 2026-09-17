'use server';

import { getRequiredServerEnv } from '@/lib/env/server';
import { KtoClient } from '@/lib/kto/client';
import { normalizeImages, normalizePlace } from '@/lib/kto/normalize';
import { revalidatePath } from 'next/cache';
import { getAdminClient, requireAdmin } from '@/lib/admin/server';

// unknown 타입 오류에서 사용자 노출용 메시지를 안전하게 추출한다
function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

// KtoClient 인스턴스 팩토리
function getKtoClient() {
  return new KtoClient({
    serviceKey: getRequiredServerEnv('KTO_SERVICE_KEY'),
  });
}

/**
 * 어드민 페이지에서 수집 대상 관광지를 선택할 수 있도록
 * 수원시 전체 관광지 목록을 KTO 원천 API에서 운영자 화면용으로 조회합니다.
 */
export async function fetchKTOAttractionsAction() {
  try {
    await requireAdmin();
    const kto = getKtoClient();
    const attractions = await kto.fetchSuwonAttractions();

    return {
      success: true,
      data: attractions.map((item) => ({
        contentId: item.contentid,
        contentTypeId: item.contenttypeid,
        title: item.title,
        address: [item.addr1, item.addr2].filter(Boolean).join(' '),
      })),
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: toErrorMessage(error, '수원 관광지 목록 조회 중 오류가 발생했습니다.'),
    };
  }
}

/**
 * 특정 관광지(contentId)의 KTO 상세 및 이미지 데이터를 조회해 미리보기 구조를 만듭니다.
 */
export async function fetchKTOPlacePreviewAction(contentId: string) {
  try {
    await requireAdmin();
    const kto = getKtoClient();

    // 1. 관광지 리스트 전체 조회하여 매칭되는 기본 데이터 확인
    const attractions = await kto.fetchSuwonAttractions();
    const listItem = attractions.find((item) => item.contentid === contentId);

    if (!listItem) {
      throw new Error(`KTO API 목록에서 ID ${contentId} 관광지를 찾을 수 없습니다.`);
    }

    // 2. 상세 및 이미지 정보 병합 조회
    const detail = await kto.fetchDetail(contentId);
    const images = await kto.fetchImages(contentId);

    // 3. 정규화 객체 생성
    const normalizedPlace = normalizePlace(listItem, detail);
    const normalizedImages = normalizeImages('preview-temp-id', listItem, images);

    return {
      success: true,
      data: {
        place: normalizedPlace,
        images: normalizedImages,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: toErrorMessage(error, '관광지 상세 데이터 호출 중 오류가 발생했습니다.'),
    };
  }
}

/**
 * 관리자가 데이터를 확인하고 승인한 경우, KTO API의 최신 원천 정보로 DB에 적재합니다.
 */
export async function approveAndSavePlaceAction(contentId: string) {
  try {
    await requireAdmin();
    const kto = getKtoClient();
    const adminSupabase = getAdminClient();

    // 1. KTO API로부터 최신 상태 조회
    const attractions = await kto.fetchSuwonAttractions();
    const listItem = attractions.find((item) => item.contentid === contentId);

    if (!listItem) {
      throw new Error(`KTO API 목록에서 ID ${contentId} 관광지를 찾을 수 없습니다.`);
    }

    const detail = await kto.fetchDetail(contentId);
    const normalized = normalizePlace(listItem, detail);

    // 2. core.places 테이블에 Upsert (slug 고유키 기준)
    const { data: place, error: placeError } = await adminSupabase
      .schema('core')
      .from('places')
      .upsert(
        {
          slug: normalized.slug,
          official_name: normalized.official_name,
          address_full: normalized.address_full,
          lat: normalized.lat,
          lng: normalized.lng,
          contact_phone: normalized.contact_phone,
          source_overview_raw: normalized.source_overview_raw,
          source_modified_at: normalized.source_modified_at,
          category: normalized.category,
          is_active: true,
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single();

    if (placeError) {
      throw new Error(`Places 테이블 적재 실패: ${placeError.message}`);
    }

    // 3. core.place_sources 테이블에 매핑 정보 Upsert
    const { error: sourceError } = await adminSupabase
      .schema('core')
      .from('place_sources')
      .upsert(
        {
          place_id: place.id,
          kto_content_id: normalized.kto_content_id,
          kto_content_type_id: normalized.kto_content_type_id,
          sync_enabled: true,
        },
        { onConflict: 'place_id' },
      );

    if (sourceError) {
      throw new Error(`Place Sources 테이블 적재 실패: ${sourceError.message}`);
    }

    // 4. core.place_images 테이블에 이미지들 Upsert
    const images = normalizeImages(place.id, listItem, await kto.fetchImages(contentId));
    if (images.length > 0) {
      const { error: imageError } = await adminSupabase
        .schema('core')
        .from('place_images')
        .upsert(images, { onConflict: 'place_id,source_provider,source_image_id' });

      if (imageError) {
        throw new Error(`Place Images 테이블 적재 실패: ${imageError.message}`);
      }
    }

    // 5. editorial.place_copy 테이블에 기본 복사 문구 삽입 (기존에 없을 때만 초기값 할당)
    const { data: existingCopy } = await adminSupabase
      .schema('editorial')
      .from('place_copy')
      .select('place_id')
      .eq('place_id', place.id)
      .maybeSingle();

    if (!existingCopy) {
      const { error: copyError } = await adminSupabase
        .schema('editorial')
        .from('place_copy')
        .upsert(
          {
            place_id: place.id,
            display_name: normalized.official_name,
            short_description: normalized.source_overview_raw?.slice(0, 120) ?? null,
            og_title: `${normalized.official_name} | 달빛수원`,
            og_description: normalized.source_overview_raw?.slice(0, 150) ?? null,
          },
          { onConflict: 'place_id' },
        );

      if (copyError) {
        throw new Error(`Editorial Place Copy 기본값 생성 실패: ${copyError.message}`);
      }
    }

    // 6. Next.js 라우트 캐시 재유효화
    revalidatePath('/courses');
    revalidatePath('/admin');
    revalidatePath(`/places/${normalized.slug}`);

    return {
      success: true,
      message: `${normalized.official_name} 장소가 성공적으로 승인 및 DB에 적재되었습니다.`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: toErrorMessage(error, '승인 처리 중 오류가 발생했습니다.'),
    };
  }
}
