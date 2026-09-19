export type KtoListItem = {
  contentid: string;
  contenttypeid: string;
  title: string;
  addr1?: string;
  addr2?: string;
  mapx?: string;
  mapy?: string;
  tel?: string;
  firstimage?: string;
  firstimage2?: string;
  modifiedtime?: string;
};

export type KtoDetailItem = KtoListItem & {
  overview?: string;
  homepage?: string;
  telname?: string;
  createdtime?: string;
};

export type KtoImageItem = {
  contentid: string;
  originimgurl: string;
  smallimageurl?: string;
  imgname?: string;
  serialnum?: string;
  cpyrhtDivCd?: string;
};

export type KtoIntroItem = {
  contentid: string;
  usetime?: string;
  restdate?: string;
  parking?: string;
  infocenter?: string;
  // 음식점(39) uses its own field names for the same facts. KTO leaves the
  // 관광지 fields empty on these rows, so a food place reports its hours only
  // through opentimefood.
  opentimefood?: string;
  restdatefood?: string;
  firstmenu?: string;
  treatmenu?: string;
  infocenterfood?: string;
  // 문화시설(14) likewise reports the same facts under its own suffix.
  usetimeculture?: string;
  restdateculture?: string;
  infocenterculture?: string;
  // 숙박(32) has no daily opening hours; it publishes check-in/out instead.
  checkintime?: string;
  checkouttime?: string;
  infocenterlodging?: string;
  // 레포츠(28) mirrors the 관광지 wording with its own suffix.
  usetimeleports?: string;
  restdateleports?: string;
  infocenterleports?: string;
};

/**
 * 무장애 여행 정보. KorWithService2/detailWithTour2가 장소별 접근성을 자유 문장으로
 * 보낸다. "출입구까지 완만한 경사로가 설치되어 있음"처럼 서술형이라 등급으로
 * 환산하지 않고 원문을 보존한다.
 */
export type KtoWithTourItem = {
  contentid: string;
  route?: string;
  exit?: string;
  elevator?: string;
  parking?: string;
  publictransport?: string;
  wheelchair?: string;
  braileblock?: string;
  brailepromotion?: string;
  audioguide?: string;
  bigprint?: string;
  helpdog?: string;
  restroom?: string;
  lactationroom?: string;
  stroller?: string;
  infantsfamilyetc?: string;
  handicapetc?: string;
};

export type KtoPetTourItem = {
  contentid: string;
  acmpyPsblCpam?: string;
  acmpyNeedMtr?: string;
  etcAcmpyInfo?: string;
  acmpyTypeCd?: string;
  relaRntlPrdlst?: string;
  relaFrnshPrdlst?: string;
  relaPurcPrdlst?: string;
  relaAcdntRiskMtr?: string;
  relaPosesFclty?: string;
};

export type KtoPetListItem = KtoListItem & {
  contenttypeid: string;
};

export type KtoFestivalItem = {
  contentid: string;
  title: string;
  eventstartdate?: string;
  eventenddate?: string;
  addr1?: string;
  addr2?: string;
  mapx?: string;
  mapy?: string;
  firstimage?: string;
  firstimage2?: string;
  tel?: string;
  eventplace?: string;
  playtime?: string;
  usetimefestival?: string;
  program?: string;
  modifiedtime?: string;
};

export type KtoCrowdForecastItem = {
  cnctrRate: string;
  baseYmd: string;
  areaCd: string;
  areaNm?: string;
  signguCd: string;
  signguNm?: string;
  tAtsNm: string;
};

export type KtoApiResponse<T> = {
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      items?:
        | {
            item?: T | T[];
          }
        | string;
      totalCount?: number | string;
      pageNo?: number | string;
      numOfRows?: number | string;
    };
  };
  resultCode?: string;
  resultMsg?: string;
};

export type KtoPage<T> = {
  items: T[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
};

export type NormalizedPlace = {
  slug: string;
  official_name: string;
  address_full: string | null;
  lat: number;
  lng: number;
  contact_phone: string | null;
  source_overview_raw: string | null;
  source_modified_at: string | null;
  category: string | null;
  kto_content_id: string;
  kto_content_type_id: string;
};

export type NormalizedEvent = {
  content_id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  venue_address: string | null;
  lat: number | null;
  lng: number | null;
  hero_image_url: string | null;
  contact_phone: string | null;
  event_place: string | null;
  play_time: string | null;
  usage_fee: string | null;
  program_raw: string | null;
  source_modified_at: string | null;
};
