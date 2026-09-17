'use client';

import { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import {
  fetchKTOAttractionsAction,
  fetchKTOPlacePreviewAction,
  approveAndSavePlaceAction,
} from '@/app/actions/kto';
import {
  Sparkles,
  Compass,
  MapPin,
  CheckCircle,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  BookOpen,
} from 'lucide-react';

interface KTOListItem {
  contentId: string;
  contentTypeId: string;
  title: string;
  address: string;
}

interface NormalizedPlace {
  slug: string;
  official_name: string;
  address_full: string | null;
  lat: number;
  lng: number;
  contact_phone: string | null;
  source_overview_raw: string | null;
  kto_content_id: string;
  kto_content_type_id: string;
}

interface NormalizedImage {
  image_url: string;
  thumbnail_url: string | null;
  alt_text: string | null;
  is_hero: boolean;
}

interface KTOPreviewData {
  place: NormalizedPlace;
  images: NormalizedImage[];
}

export function KTOImportPanel() {
  const [attractions, setAttractions] = useState<KTOListItem[]>([]);
  const [selectedContentId, setSelectedContentId] = useState<string>('');
  const [previewData, setPreviewData] = useState<KTOPreviewData | null>(null);
  
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isPending, startTransition] = useTransition();
  const heroImage = previewData?.images.find((image) => image.is_hero) ?? null;

  // 1. 컴포넌트 마운트 시 수원 관광지 전체 리스트 가져오기
  useEffect(() => {
    async function loadList() {
      setIsLoadingList(true);
      const res = await fetchKTOAttractionsAction();
      setIsLoadingList(false);

      if (res.success && res.data) {
        setAttractions(res.data);
      } else {
        setActionMessage({
          type: 'error',
          text: res.error || 'KTO 관광지 리스트를 불러오지 못했습니다.',
        });
      }
    }
    loadList();
  }, []);

  // 2. 관광지 선택 시 프리뷰 데이터 로드
  const handleSelectAttraction = async (contentId: string) => {
    setSelectedContentId(contentId);
    setPreviewData(null);
    setActionMessage(null);

    if (!contentId) return;

    setIsLoadingPreview(true);
    const res = await fetchKTOPlacePreviewAction(contentId);
    setIsLoadingPreview(false);

    if (res.success && res.data) {
      setPreviewData(res.data as KTOPreviewData);
    } else {
      setActionMessage({
        type: 'error',
        text: res.error || '관광지 상세 프리뷰를 가져오지 못했습니다.',
      });
    }
  };

  // 3. 승인 및 DB 적재 요청 (React 19 useTransition 연동)
  const handleApprove = () => {
    if (!selectedContentId) return;

    setActionMessage(null);
    startTransition(async () => {
      const res = await approveAndSavePlaceAction(selectedContentId);
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: res.message || '승인 처리 완료되었습니다.',
        });
        // 적재 완료 후 프리뷰 데이터 초기화
        setPreviewData(null);
        setSelectedContentId('');
      } else {
        setActionMessage({
          type: 'error',
          text: res.error || 'DB 적재에 실패했습니다.',
        });
      }
    });
  };

  return (
    <div className="bg-[#1e293b]/40 backdrop-blur-md border border-white/10 rounded-xl p-6 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-[#ffd700]" />
        <h3 className="text-xl font-bold text-[#ffd700]">KTO 원천 데이터 조회 및 승인</h3>
      </div>
      <p className="text-xs text-[#d0c6ab] mb-6 leading-relaxed">
        공공데이터(KTO) 원천 API를 조회하여 미리보기 형태로 내용을 확인하고, 관리자 승인을 통해 데이터베이스에 반영합니다. 이 화면의 조회는 자동 동기화와 별개로 필요할 때 실행됩니다.
      </p>

      {/* 셀렉트 리스트 및 로딩바 */}
      <div className="space-y-4 mb-6">
        <label className="block text-xs font-bold text-[#d0c6ab] uppercase tracking-wider">
          수집할 수원 관광지 선택
        </label>
        <div className="relative">
          <select
            value={selectedContentId}
            onChange={(e) => handleSelectAttraction(e.target.value)}
            disabled={isLoadingList || isPending}
            className="w-full bg-[#0b1326] border border-[#3e495d]/60 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-[#ffd700] disabled:opacity-50 appearance-none"
          >
            <option value="">-- 관광지를 선택하세요 --</option>
            {attractions.map((item) => (
              <option key={item.contentId} value={item.contentId}>
                {item.title} ({item.address ? item.address.slice(0, 18) + '...' : '주소없음'})
              </option>
            ))}
          </select>
          {isLoadingList && (
            <div className="absolute right-4 top-3.5 flex items-center">
              <Loader2 className="w-4 h-4 text-[#ffd700] animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* 액션 상태 피드백 */}
      {actionMessage && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border mb-6 text-sm ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/20 border-red-500/30 text-red-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span className="font-semibold leading-relaxed">{actionMessage.text}</span>
        </div>
      )}

      {/* 프리뷰 로딩 */}
      {isLoadingPreview && (
        <div className="flex flex-col items-center justify-center py-20 flex-1">
          <Loader2 className="w-8 h-8 text-[#ffd700] animate-spin mb-4" />
          <p className="text-sm font-bold text-[#d0c6ab]">KTO 원천 데이터 조회 중...</p>
        </div>
      )}

      {/* 미리보기 영역 */}
      {!isLoadingPreview && previewData && (
        <div className="flex-1 flex flex-col gap-6 animate-fadeIn overflow-y-auto max-h-[500px] pr-2">
          {/* 대표 히어로 이미지 미리보기 */}
          {previewData.place.slug && heroImage && (
            <div className="relative rounded-2xl overflow-hidden h-48 border border-zinc-800">
              <Image
                src={heroImage.image_url}
                alt={previewData.place.official_name}
                fill
                sizes="(max-width: 768px) 100vw, 640px"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326] via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 bg-[#ffd700] text-[#3a3000] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                Hero Image
              </span>
            </div>
          )}

          {/* 메인 정보 */}
          <div className="space-y-4">
            <h4 className="text-2xl font-black text-white">{previewData.place.official_name}</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 bg-[#0b1326]/60 border border-[#3e495d]/30 rounded-xl p-3">
                <MapPin className="w-4 h-4 text-[#ffd700] shrink-0" />
                <div className="truncate">
                  <p className="text-[#8f9bb3] font-bold">공식 주소</p>
                  <p className="text-white font-semibold truncate mt-0.5">
                    {previewData.place.address_full || '주소 정보 없음'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-[#0b1326]/60 border border-[#3e495d]/30 rounded-xl p-3">
                <Compass className="w-4 h-4 text-[#ffd700] shrink-0" />
                <div>
                  <p className="text-[#8f9bb3] font-bold">위도 / 경도</p>
                  <p className="text-white font-semibold mt-0.5">
                    {previewData.place.lat.toFixed(6)}, {previewData.place.lng.toFixed(6)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 이미지 갤러리 */}
          {previewData.images.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-[#d0c6ab]">
                <ImageIcon className="w-4 h-4 text-[#ffd700]" />
                <span className="font-bold">추가 이미지 갤러리 ({previewData.images.length - 1}개)</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {previewData.images
                  .filter((img) => !img.is_hero)
                  .slice(0, 8)
                  .map((img, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800">
                      <Image
                        src={img.image_url}
                        alt="갤러리 서브 이미지"
                        fill
                        sizes="96px"
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 설명 본문 개요 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-[#d0c6ab]">
              <BookOpen className="w-4 h-4 text-[#ffd700]" />
              <span className="font-bold">KTO 공식 개요 원문</span>
            </div>
            <div className="bg-[#0b1326]/75 border border-[#3e495d]/30 rounded-xl p-4 text-xs leading-relaxed text-[#d0c6ab] max-h-[160px] overflow-y-auto">
              {previewData.place.source_overview_raw || '설명글이 등록되어 있지 않습니다.'}
            </div>
          </div>

          {/* 승인 CTA 버튼 */}
          <button
            onClick={handleApprove}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 bg-[#ffd700] hover:bg-[#ffe16d] text-[#3a3000] font-black py-4 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-lg shadow-yellow-500/10 active:scale-[0.98]"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#3a3000]" />
                <span>데이터베이스 적재 처리 중...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-[#3a3000]" />
                <span>이 데이터 검토 완료 및 최종 승인</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
