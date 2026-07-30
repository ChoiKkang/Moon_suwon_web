import os
import requests

SERVICE_KEY = os.environ.get("KTO_SERVICE_KEY")

if not SERVICE_KEY:
    raise RuntimeError("KTO_SERVICE_KEY environment variable is required")

# 2. apis.data.go.kr 게이트웨이 HTTPS 이슈(503) 우회를 위해 http 프로토콜 사용
BASE_URL = 'http://apis.data.go.kr/B551011/KorService2'

def fetch_spots(area_code='31', sigungu_code='2'):
    # endpoint와 기본 파라미터 구성
    endpoint = f'{BASE_URL}/areaBasedList2'
    
    # 공공데이터포털 게이트웨이 파싱 오류 방지를 위해 serviceKey를 쿼리 파라미터 맨 뒤에 직접 이어 붙임
    params = {
        'numOfRows': '10',
        'pageNo': '1',
        'MobileOS': 'web',
        'MobileApp': 'moonsuwon',
        '_type': 'json',
        'areaCode': area_code,
        'sigunguCode': sigungu_code
    }
    
    # 쿼리 스트링 조립 후 serviceKey 추가
    url = f"{endpoint}?{requests.compat.urlencode(params)}&serviceKey={SERVICE_KEY}"
    
    print(f"[Request URL]: {endpoint}?query=[REDACTED]&serviceKey=[REDACTED]")
    
    # 타임아웃을 넉넉히 10초로 지정
    response = requests.get(url, timeout=10)
    
    print(f"[Status Code]: {response.status_code}")
    if response.status_code != 200:
        print(f"[Error Response]: {response.text}")
        return None
        
    return response.json()

if __name__ == '__main__':
    try:
        data = fetch_spots()
        if data:
            import json
            print("[API Response Body]:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"[Exception Occurred]: {e}")
