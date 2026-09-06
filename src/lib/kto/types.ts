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
      totalCount?: number;
      pageNo?: number;
      numOfRows?: number;
    };
  };
  resultCode?: string;
  resultMsg?: string;
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
