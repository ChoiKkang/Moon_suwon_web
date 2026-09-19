# 달빛수원 앱 공개 관광 데이터 계약

`public.get_place_by_slug(p_slug text)`는 기존 필드를 삭제하거나 이름을 바꾸지 않고, 검수된 공공데이터 블록을 추가한다. 모바일 앱은 모르는 키를 무시하고 필요한 블록부터 점진적으로 사용할 수 있다.

## 공통 블록 형태

새 블록 6개는 모두 다음 형태다.

```json
{
  "items": [],
  "data_status": "unknown",
  "source_updated_at": null,
  "fetched_at": null
}
```

- `items`: 데이터가 없으면 항상 빈 배열이다.
- `data_status`: `fresh`, `stale`, `expired`, `unknown` 중 하나다. `expired`는 5분 캐시가 지난 버스 정보에만 쓰며 만료된 항목 자체는 응답하지 않는다.
- `source_updated_at`: 공급자가 제공한 기준 시각이다. 공급자가 시각을 주지 않으면 `null`이다.
- `fetched_at`: 달빛수원이 마지막으로 수집한 시각이다.

클라이언트는 `data_status === "fresh"`만 전제로 삼지 말고, `items`가 비어 있으면 해당 UI를 숨긴다. `stale`은 시각을 함께 표시한 뒤 참고 정보로 쓸 수 있다.

## 채워진 응답 예시

```json
{
  "id": "d6dcf2a5-0000-4000-8000-000000000001",
  "slug": "수원화성",
  "display_name": "수원화성",
  "pet_policy": "conditional",
  "crowd_forecast": { "forecast_date": "2026-09-20", "rate": 62, "level": "보통" },
  "images": [],
  "approved_photos": {
    "items": [{
      "id": "2814fb65-0000-4000-8000-000000000001",
      "title": "수원화성 야경",
      "image_url": "https://example.test/photo.jpg",
      "thumbnail_url": "https://example.test/thumb.jpg",
      "copyright_code": "제1유형",
      "photographer": "한국관광공사",
      "source_url": "https://example.test/source"
    }],
    "data_status": "fresh",
    "source_updated_at": "2026-09-19T00:00:00Z",
    "fetched_at": "2026-09-20T00:05:00Z"
  },
  "wellness_tags": {
    "items": [{ "name": "수원화성", "tags": ["산책", "치유"] }],
    "data_status": "fresh",
    "source_updated_at": "2026-09-19T00:00:00Z",
    "fetched_at": "2026-09-20T00:05:00Z"
  },
  "related_places": {
    "items": [{
      "id": "8fbe1837-0000-4000-8000-000000000002",
      "slug": "화성행궁",
      "display_name": "화성행궁",
      "relation_score": 0.91
    }],
    "data_status": "fresh",
    "source_updated_at": null,
    "fetched_at": "2026-09-20T00:05:00Z"
  },
  "weather_summary": {
    "items": [{
      "forecast_at": "2026-09-20T12:00:00Z",
      "category": "TMP",
      "value_text": "24",
      "value_number": 24,
      "unit": "°C"
    }],
    "data_status": "fresh",
    "source_updated_at": "2026-09-20T02:00:00Z",
    "fetched_at": "2026-09-20T02:05:00Z"
  },
  "mid_weather_summary": {
    "items": [{
      "forecast_at": "2026-09-24T00:00:00+09:00",
      "category": "WF_AM",
      "value_text": "맑음",
      "value_number": null,
      "unit": null
    }],
    "data_status": "fresh",
    "source_updated_at": "2026-09-20T06:00:00+09:00",
    "fetched_at": "2026-09-20T06:05:00+09:00"
  },
  "nearby_bus_arrivals": {
    "items": [{
      "station_id": "200000001",
      "station_name": "화성행궁",
      "route_id": "200000101",
      "route_name": "11",
      "arrival_order": 1,
      "arrival_seconds": 180,
      "remaining_stops": 2
    }],
    "data_status": "fresh",
    "source_updated_at": "2026-09-20T02:09:00Z",
    "fetched_at": "2026-09-20T02:09:00Z"
  }
}
```

## 데이터가 없는 응답 예시

각 블록은 키 자체를 생략하지 않는다.

```json
{
  "related_places": { "items": [], "data_status": "unknown", "source_updated_at": null, "fetched_at": null },
  "approved_photos": { "items": [], "data_status": "unknown", "source_updated_at": null, "fetched_at": null },
  "wellness_tags": { "items": [], "data_status": "unknown", "source_updated_at": null, "fetched_at": null },
  "weather_summary": { "items": [], "data_status": "unknown", "source_updated_at": null, "fetched_at": null },
  "mid_weather_summary": { "items": [], "data_status": "unknown", "source_updated_at": null, "fetched_at": null },
  "nearby_bus_arrivals": { "items": [], "data_status": "unknown", "source_updated_at": null, "fetched_at": null }
}
```

## 공개·검수 규칙

- 사진, 웰니스, 연관 관광지는 `review_status = approved`인 행만 공개한다.
- 연관 관광지는 활성화되어 있고 게시 승인된 장소만 노출한다.
- 버스는 운영자가 승인한 장소-정류장 매핑만 사용하고, 수집 후 5분이 지난 도착 정보는 노출하지 않는다.
- 두루누비는 수원 교차 코스가 검수 승인되기 전까지 장소 상세에 영향을 주지 않는다.
- 지역 방문자 수는 집계·운영 분석용이다. 혼잡도나 현재 현장 인원으로 표현하지 않으며 익명 공개 RPC에서 제외한다.
- 혼잡 예측은 기존 `crowd_forecast` 계약을 유지한다. 방문자 통계와 혼합해 실시간 혼잡이라고 표시하지 않는다.

내부 운영 집계는 서비스 역할만 실행할 수 있는 `admin_get_regional_visitor_summary(p_from, p_to)`를 사용한다.
