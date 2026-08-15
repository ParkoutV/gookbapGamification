#!/usr/bin/env python3
"""부산 기준 ISO 주차별 일출·일몰 시각 표를 생성한다.

`app/lib/daylight.ts`의 상수 배열이 이 스크립트의 출력이다.
**표는 연도와 무관하다** — 주차로만 색인하며 매년 재사용한다.
주차별 일출·일몰의 연도 간 차이는 몇 분 수준이라 배경 전환 용도에 영향이 없다.

ISO 주차는 53까지 있다(2026년이 그렇다). 53주차는 52주차와 사실상 같은 시기이므로
같은 값을 넣는다 — 없으면 호출부가 undefined를 읽는다.

알고리즘은 NOAA sunrise/sunset. 검증: 2026-01-01 일출 07:33
(부산 신년 일출로 알려진 07:32와 일치).
"""
import math, datetime

LAT, LON, TZ = 35.1796, 129.0756, 9  # 부산시청

def sun_times(d):
    n = d.toordinal() - datetime.date(2000, 1, 1).toordinal() + 0.0008
    Jstar = n - LON / 360.0
    M = (357.5291 + 0.98560028 * Jstar) % 360
    C = (1.9148 * math.sin(math.radians(M)) + 0.0200 * math.sin(math.radians(2 * M))
         + 0.0003 * math.sin(math.radians(3 * M)))
    L = (M + C + 180 + 102.9372) % 360
    Jtransit = (2451545.0 + Jstar + 0.0053 * math.sin(math.radians(M))
                - 0.0069 * math.sin(math.radians(2 * L)))
    decl = math.asin(math.sin(math.radians(L)) * math.sin(math.radians(23.4397)))
    cos_w = ((math.sin(math.radians(-0.833)) - math.sin(math.radians(LAT)) * math.sin(decl))
             / (math.cos(math.radians(LAT)) * math.cos(decl)))
    w = math.degrees(math.acos(max(-1.0, min(1.0, cos_w))))
    def kst_minutes(J):
        return round((((J + 0.5) % 1.0) * 24 + TZ) % 24 * 60)
    return kst_minutes(Jtransit - w / 360.0), kst_minutes(Jtransit + w / 360.0)

# 대표 연도로 주차별 수요일을 쓴다. 53주차가 있는 해를 골라야 한다.
YEAR = 2026
jan4 = datetime.date(YEAR, 1, 4)
week1_mon = jan4 - datetime.timedelta(days=jan4.weekday())

rises, sets = [], []
for wk in range(1, 54):
    wed = week1_mon + datetime.timedelta(weeks=wk - 1, days=2)
    r, s = sun_times(wed)
    rises.append(r)
    sets.append(s)

def fmt(mins):
    return f"{mins // 60:02d}:{mins % 60:02d}"

print(f"// 부산(35.18N, 129.08E) ISO 주차별 일출·일몰 (KST 분 단위, 자정 기준)")
print(f"// docs/gen-daylight-table.py 로 생성. 연도 무관 — 매년 재사용한다.")
print(f"// 검증: W01 일출 {fmt(rises[0])} / 하지 무렵 {fmt(min(rises))} / 동지 무렵 {fmt(max(rises))}")
print(f"export const SUNRISE_MIN = [{', '.join(str(m) for m in rises)}];")
print(f"export const SUNSET_MIN = [{', '.join(str(m) for m in sets)}];")
