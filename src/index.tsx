import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

app.use('/static/*', serveStatic({ root: './public' }))

// ── Types ─────────────────────────────────────────────────────────────────
interface Extinguisher {
  id: string
  name: string
  buildingId: string
  floor: number
  location: { x: number; y: number } // % on floor plan
  lastInspected: string
  nextInspection: string
  inspector: string
  type: string   // ABC분말, CO2, 할론 등
  capacity: string // 3.3kg, 6.8kg 등
  manufacture: string // 제조연월
  status: 'good' | 'warning' | 'danger'
}

interface Building {
  id: string
  name: string
  shortName: string
  floors: number
  mapX: number  // % on satellite map
  mapY: number
  mapW: number
  mapH: number
  color: string
}

// ── Buildings data ─────────────────────────────────────────────────────────
// 좌표 기준: factory_map.jpg (1992×1588)
// 이미지 분석 기반 정밀 좌표:
// - 공장 부지: x=2~92%, y=5~97% (검정 배경은 우상단 + 외곽)
// - 좌상단 파란지붕 군: x=0~38%, y=0~32%
// - 중앙 설비 구역: x=15~65%, y=35~72%
// - 우측 대형건물: x=60~90%, y=28~68%
// - 하단 녹색지붕: x=16~58%, y=72~100%
// - BKLS 라벨: x=11~14%, y=39~43%  → 관리동/BK동 위치
// - BK 라벨: x=17~20%, y=45~49%
// - AK/CK 라벨: x=26~31%, y=59~65%
// - SK1,2 라벨: x=57~61%, y=39~44%
// - SK3-9 라벨: x=83~87%, y=56~63%
const buildings: Building[] = [
  // ── 좌중단 관리/사무 클러스터 (BKLS/BK 라벨 위치 기준) ──
  { id: 'bkls',       name: 'BKLS동',        shortName: 'BKLS',      floors: 2, mapX: 9,  mapY: 37, mapW: 7,  mapH: 6,  color: '#3b82f6' },
  { id: 'bk-office',  name: 'BK사무실',       shortName: 'BK사무실',  floors: 2, mapX: 15, mapY: 43, mapW: 7,  mapH: 6,  color: '#06b6d4' },
  { id: 'admin',      name: '관리동',          shortName: '관리동',    floors: 2, mapX: 3,  mapY: 43, mapW: 6,  mapH: 5,  color: '#8b5cf6' },
  // ── 좌하단 생산동군 (AK/CK 라벨, 좌하단 녹색지붕 위) ──
  { id: 'ak-plant',   name: 'AK공장',          shortName: 'AK',        floors: 1, mapX: 24, mapY: 57, mapW: 10, mapH: 9,  color: '#f59e0b' },
  { id: 'ck-plant',   name: 'CK공장',          shortName: 'CK',        floors: 1, mapX: 17, mapY: 53, mapW: 9,  mapH: 8,  color: '#ef4444' },
  // ── 하단 녹색지붕 건물군 ──
  { id: 'green-a',    name: '제품창고 A',       shortName: '창고A',     floors: 1, mapX: 16, mapY: 73, mapW: 14, mapH: 12, color: '#10b981' },
  { id: 'green-b',    name: '제품창고 B',       shortName: '창고B',     floors: 1, mapX: 30, mapY: 76, mapW: 14, mapH: 12, color: '#84cc16' },
  { id: 'green-c',    name: '출하동',           shortName: '출하동',    floors: 1, mapX: 44, mapY: 74, mapW: 10, mapH: 10, color: '#a78bfa' },
  // ── 중앙 설비/공정 구역 ──
  { id: 'util-center',name: '유틸리티센터',     shortName: '유틸',      floors: 1, mapX: 33, mapY: 42, mapW: 12, mapH: 10, color: '#f97316' },
  // ── 우측 SK 1,2호기 (x=57~61%, y=39~44%) ──
  { id: 'sk12',       name: 'SK 1,2호기',       shortName: 'SK1,2',     floors: 1, mapX: 54, mapY: 36, mapW: 14, mapH: 12, color: '#ec4899' },
  // ── 우측 대형건물 (x=60~89%, y=28~68%) ──
  { id: 'main-plant', name: '메인공장동',        shortName: '메인공장',  floors: 1, mapX: 62, mapY: 27, mapW: 24, mapH: 20, color: '#f59e0b' },
  // ── SK 3-9호기 (x=83~87%, y=56~63%) ──
  { id: 'sk39',       name: 'SK 3-9호기',        shortName: 'SK3-9',     floors: 1, mapX: 78, mapY: 53, mapW: 13, mapH: 12, color: '#06b6d4' },
]

// ── Extinguishers data ─────────────────────────────────────────────────────
function calcStatus(nextDate: string): 'good' | 'warning' | 'danger' {
  const today = new Date()
  const next = new Date(nextDate)
  const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return diff < 0 ? 'danger' : diff <= 30 ? 'warning' : 'good'
}

const extinguishers: Extinguisher[] = [
  // BKLS동
  { id: 'EXT-BKLS-01', name: '소화기 #1', buildingId: 'bkls', floor: 1, location: { x: 20, y: 55 }, lastInspected: '2025-01-15', nextInspection: '2025-07-15', inspector: '홍길동', type: 'ABC분말', capacity: '3.3kg', manufacture: '2022-06', status: 'good' },
  { id: 'EXT-BKLS-02', name: '소화기 #2', buildingId: 'bkls', floor: 2, location: { x: 70, y: 45 }, lastInspected: '2025-02-10', nextInspection: '2025-04-30', inspector: '김철수', type: 'ABC분말', capacity: '3.3kg', manufacture: '2021-11', status: 'warning' },
  // BK사무실
  { id: 'EXT-BK-01', name: '소화기 #1', buildingId: 'bk-office', floor: 1, location: { x: 25, y: 60 }, lastInspected: '2025-03-15', nextInspection: '2025-09-15', inspector: '이영희', type: 'ABC분말', capacity: '3.3kg', manufacture: '2023-03', status: 'good' },
  { id: 'EXT-BK-02', name: '소화기 #2', buildingId: 'bk-office', floor: 2, location: { x: 65, y: 40 }, lastInspected: '2024-11-20', nextInspection: '2025-04-15', inspector: '박민수', type: 'CO2', capacity: '6.8kg', manufacture: '2021-05', status: 'danger' },
  // 관리동
  { id: 'EXT-ADM-01', name: '소화기 #1', buildingId: 'admin', floor: 1, location: { x: 30, y: 55 }, lastInspected: '2025-02-28', nextInspection: '2025-08-28', inspector: '최지영', type: 'ABC분말', capacity: '3.3kg', manufacture: '2022-12', status: 'good' },
  { id: 'EXT-ADM-02', name: '소화기 #2', buildingId: 'admin', floor: 2, location: { x: 60, y: 40 }, lastInspected: '2024-10-01', nextInspection: '2025-04-01', inspector: '홍길동', type: 'CO2', capacity: '6.8kg', manufacture: '2020-03', status: 'danger' },
  // AK공장
  { id: 'EXT-AK-01', name: '소화기 #1', buildingId: 'ak-plant', floor: 1, location: { x: 20, y: 35 }, lastInspected: '2025-01-10', nextInspection: '2025-05-10', inspector: '김철수', type: 'ABC분말', capacity: '6.8kg', manufacture: '2022-08', status: 'warning' },
  { id: 'EXT-AK-02', name: '소화기 #2', buildingId: 'ak-plant', floor: 1, location: { x: 55, y: 60 }, lastInspected: '2025-03-01', nextInspection: '2025-09-01', inspector: '이영희', type: 'ABC분말', capacity: '6.8kg', manufacture: '2023-01', status: 'good' },
  { id: 'EXT-AK-03', name: '소화기 #3', buildingId: 'ak-plant', floor: 1, location: { x: 80, y: 35 }, lastInspected: '2024-09-15', nextInspection: '2025-03-15', inspector: '박민수', type: 'CO2', capacity: '9.1kg', manufacture: '2020-07', status: 'danger' },
  // CK공장
  { id: 'EXT-CK-01', name: '소화기 #1', buildingId: 'ck-plant', floor: 1, location: { x: 25, y: 40 }, lastInspected: '2025-02-15', nextInspection: '2025-08-15', inspector: '최지영', type: 'ABC분말', capacity: '6.8kg', manufacture: '2022-11', status: 'good' },
  { id: 'EXT-CK-02', name: '소화기 #2', buildingId: 'ck-plant', floor: 1, location: { x: 70, y: 65 }, lastInspected: '2025-01-25', nextInspection: '2025-04-25', inspector: '홍길동', type: 'ABC분말', capacity: '3.3kg', manufacture: '2022-05', status: 'warning' },
  // 제품창고 A
  { id: 'EXT-GA-01', name: '소화기 #1', buildingId: 'green-a', floor: 1, location: { x: 20, y: 45 }, lastInspected: '2025-03-10', nextInspection: '2025-09-10', inspector: '김철수', type: 'ABC분말', capacity: '6.8kg', manufacture: '2023-02', status: 'good' },
  { id: 'EXT-GA-02', name: '소화기 #2', buildingId: 'green-a', floor: 1, location: { x: 75, y: 55 }, lastInspected: '2025-02-05', nextInspection: '2025-05-05', inspector: '이영희', type: 'CO2', capacity: '9.1kg', manufacture: '2021-09', status: 'warning' },
  // SK 1,2호기
  { id: 'EXT-SK12-01', name: '소화기 #1', buildingId: 'sk12', floor: 1, location: { x: 20, y: 40 }, lastInspected: '2025-03-20', nextInspection: '2025-09-20', inspector: '박민수', type: 'ABC분말', capacity: '6.8kg', manufacture: '2023-04', status: 'good' },
  { id: 'EXT-SK12-02', name: '소화기 #2', buildingId: 'sk12', floor: 1, location: { x: 55, y: 35 }, lastInspected: '2025-01-05', nextInspection: '2025-04-20', inspector: '최지영', type: 'CO2', capacity: '9.1kg', manufacture: '2021-11', status: 'warning' },
  { id: 'EXT-SK12-03', name: '소화기 #3', buildingId: 'sk12', floor: 1, location: { x: 80, y: 65 }, lastInspected: '2024-08-01', nextInspection: '2025-02-01', inspector: '홍길동', type: 'ABC분말', capacity: '6.8kg', manufacture: '2020-12', status: 'danger' },
  // 메인공장동
  { id: 'EXT-MP-01', name: '소화기 #1', buildingId: 'main-plant', floor: 1, location: { x: 15, y: 30 }, lastInspected: '2025-03-05', nextInspection: '2025-09-05', inspector: '이영희', type: 'ABC분말', capacity: '9.1kg', manufacture: '2023-01', status: 'good' },
  { id: 'EXT-MP-02', name: '소화기 #2', buildingId: 'main-plant', floor: 1, location: { x: 45, y: 50 }, lastInspected: '2025-01-30', nextInspection: '2025-05-20', inspector: '김철수', type: 'CO2', capacity: '9.1kg', manufacture: '2022-06', status: 'warning' },
  { id: 'EXT-MP-03', name: '소화기 #3', buildingId: 'main-plant', floor: 1, location: { x: 75, y: 30 }, lastInspected: '2025-02-20', nextInspection: '2025-08-20', inspector: '박민수', type: 'ABC분말', capacity: '6.8kg', manufacture: '2022-09', status: 'good' },
  { id: 'EXT-MP-04', name: '소화기 #4', buildingId: 'main-plant', floor: 1, location: { x: 85, y: 65 }, lastInspected: '2024-07-15', nextInspection: '2025-01-15', inspector: '최지영', type: 'CO2', capacity: '9.1kg', manufacture: '2020-03', status: 'danger' },
  // SK 3-9호기
  { id: 'EXT-SK39-01', name: '소화기 #1', buildingId: 'sk39', floor: 1, location: { x: 20, y: 40 }, lastInspected: '2025-03-18', nextInspection: '2025-09-18', inspector: '이영희', type: 'ABC분말', capacity: '6.8kg', manufacture: '2023-03', status: 'good' },
  { id: 'EXT-SK39-02', name: '소화기 #2', buildingId: 'sk39', floor: 1, location: { x: 70, y: 60 }, lastInspected: '2025-01-12', nextInspection: '2025-04-28', inspector: '홍길동', type: 'CO2', capacity: '9.1kg', manufacture: '2021-07', status: 'warning' },
]
// auto-recalculate status
extinguishers.forEach(e => { e.status = calcStatus(e.nextInspection) })

// ── API ────────────────────────────────────────────────────────────────────
app.get('/api/buildings', (c) => c.json(buildings))
app.get('/api/extinguishers', (c) => c.json(extinguishers))

app.get('/api/extinguishers/building/:bid/floor/:floor', (c) => {
  const bid   = c.req.param('bid')
  const floor = parseInt(c.req.param('floor'))
  return c.json(extinguishers.filter(e => e.buildingId === bid && e.floor === floor))
})

app.post('/api/extinguishers/:id/inspect', async (c) => {
  const id  = c.req.param('id')
  const ext = extinguishers.find(e => e.id === id)
  if (!ext) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json() as { inspector: string; nextInspection: string }
  ext.lastInspected  = new Date().toISOString().split('T')[0]
  ext.nextInspection = body.nextInspection
  ext.inspector      = body.inspector
  ext.status         = calcStatus(ext.nextInspection)
  return c.json({ success: true, extinguisher: ext })
})

// ── Main HTML ──────────────────────────────────────────────────────────────
app.get('/', (c) => c.html(HTML))

const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>소화기 점검 시스템 – 태경비케이 단양1공장</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"/>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
<style>
/* ── reset & base ── */
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Apple SD Gothic Neo',Malgun Gothic,sans-serif;background:#0f172a;color:#e2e8f0;overflow:hidden;height:100vh}

/* ── top nav ── */
#topnav{height:52px;background:#1e293b;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:100;position:relative}

/* ── layout ── */
#app{display:flex;height:calc(100vh - 52px)}

/* ── MAP VIEWPORT ── */
#map-viewport{flex:1;overflow:hidden;position:relative;background:#0a0f1a;cursor:grab}
#map-viewport.grabbing{cursor:grabbing}
#map-canvas{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}
#factory-img{display:block;width:100%;height:auto;user-select:none;pointer-events:none}

/* ── building overlays (on satellite map) ── */
.bld-overlay{
  position:absolute;
  border:2px solid transparent;
  border-radius:4px;
  cursor:pointer;
  transition:background 0.15s,border-color 0.15s,transform 0.1s;
  display:flex;align-items:flex-end;justify-content:center;
  padding-bottom:2px;
  overflow:visible;
}
.bld-overlay:hover{transform:scale(1.04);z-index:20}
.bld-overlay .bld-label{
  font-size:10px;font-weight:700;color:#fff;
  text-shadow:0 0 6px rgba(0,0,0,1),0 0 3px rgba(0,0,0,1);
  white-space:nowrap;pointer-events:none;line-height:1;
  background:rgba(0,0,0,0.55);padding:1px 4px;border-radius:3px;
}
.bld-overlay.selected{z-index:30}

/* ── zoom controls ── */
#zoom-controls{
  position:absolute;bottom:20px;right:20px;z-index:50;
  display:flex;flex-direction:column;gap:4px;
}
.zoom-btn{
  width:36px;height:36px;background:#1e293b;border:1px solid #475569;
  color:#e2e8f0;border-radius:8px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  font-size:18px;font-weight:700;transition:background 0.15s;
}
.zoom-btn:hover{background:#334155}

/* ── status badges on map ── */
.bld-badge{
  position:absolute;top:-8px;right:-8px;
  width:16px;height:16px;border-radius:50%;border:2px solid #0f172a;
  font-size:9px;color:#fff;font-weight:900;
  display:flex;align-items:center;justify-content:center;
  pointer-events:none;
}

/* ── RIGHT PANEL ── */
#right-panel{
  width:360px;min-width:320px;background:#1e293b;border-left:1px solid #334155;
  display:flex;flex-direction:column;overflow:hidden;
  transition:width 0.3s;
}
#right-panel.collapsed{width:0;min-width:0;border:none}

/* ── panel views ── */
.panel-view{display:none;flex:1;overflow-y:auto;flex-direction:column}
.panel-view.active{display:flex}

/* ── breadcrumb ── */
#breadcrumb{
  padding:10px 14px;background:#0f172a;border-bottom:1px solid #1e293b;
  font-size:12px;color:#64748b;display:flex;align-items:center;gap:4px;flex-wrap:wrap;
}
.bc-item{cursor:pointer;color:#94a3b8;transition:color 0.15s}
.bc-item:hover{color:#e2e8f0}
.bc-item.active{color:#e2e8f0;font-weight:600;cursor:default}

/* ── floor plan canvas ── */
#floor-plan-wrap{
  position:relative;background:#0f172a;
  display:flex;align-items:center;justify-content:center;
  min-height:220px;border-bottom:1px solid #334155;overflow:hidden;
}
#floor-plan-svg{width:100%;max-height:240px}

/* ── ext markers on floor plan ── */
.fp-marker{
  cursor:pointer;transition:r 0.15s;
}
.fp-marker:hover{filter:drop-shadow(0 0 4px #fff)}

/* ── ext list cards ── */
.ext-card{
  background:#0f172a;border:1px solid #1e293b;border-radius:10px;
  padding:10px 12px;cursor:pointer;transition:border-color 0.15s,background 0.15s;
  display:flex;align-items:center;gap:10px;
}
.ext-card:hover{border-color:#475569;background:#1e293b}
.ext-card.selected{border-color:#3b82f6;background:#1e3a5f}

/* ── status dot ── */
.s-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.s-dot.good{background:#16a34a}
.s-dot.warning{background:#d97706}
.s-dot.danger{background:#dc2626;animation:pulse-r 1.5s infinite}
@keyframes pulse-r{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.7)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}

/* ── detail panel ── */
.info-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1e293b;font-size:13px}
.info-row:last-child{border:none}
.info-key{color:#64748b}
.info-val{color:#e2e8f0;font-weight:600}
.dday-chip{
  display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;
}
.dday-chip.good{background:#14532d;color:#4ade80}
.dday-chip.warning{background:#451a03;color:#fbbf24}
.dday-chip.danger{background:#450a0a;color:#f87171}

/* ── mini stats ── */
.mini-stat{background:#0f172a;border-radius:8px;padding:8px;text-align:center}
.mini-stat .val{font-size:22px;font-weight:800;line-height:1}
.mini-stat .lbl{font-size:10px;color:#64748b;margin-top:2px}

/* ── toast ── */
#toast{
  position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
  background:#1e293b;border:1px solid #475569;color:#e2e8f0;
  padding:10px 20px;border-radius:999px;font-size:13px;
  z-index:9999;display:none;white-space:nowrap;
  box-shadow:0 4px 20px rgba(0,0,0,.6);
}

/* ══════════════════════════════════════════
   POLYGON TOOL
══════════════════════════════════════════ */
/* 툴 토글 버튼 - 지도 좌측 하단 줌 버튼 위 */
#poly-tool-btn{
  position:absolute;bottom:72px;left:16px;z-index:60;
  background:#7c3aed;border:1px solid #a78bfa;color:#fff;
  border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;
  cursor:pointer;display:flex;align-items:center;gap:6px;
  box-shadow:0 4px 14px rgba(124,58,237,.5);transition:background .15s;
  white-space:nowrap;
}
#poly-tool-btn:hover{background:#6d28d9}
#poly-tool-btn.active{background:#dc2626;border-color:#f87171;box-shadow:0 4px 14px rgba(220,38,38,.5)}

/* SVG 오버레이 - viewport 위에 직접 (스케일 무관하게 % 좌표 표시) */
#poly-svg{
  position:absolute;top:0;left:0;width:100%;height:100%;
  pointer-events:none;z-index:40;overflow:visible;
}
#poly-svg.active{ pointer-events:all; cursor:crosshair; }

/* 실시간 좌표 툴팁 */
#poly-cursor-tip{
  position:fixed;z-index:9000;
  background:rgba(15,23,42,0.92);border:1px solid #7c3aed;
  color:#a78bfa;font-family:monospace;font-size:11px;font-weight:600;
  padding:3px 8px;border-radius:6px;pointer-events:none;
  display:none;white-space:nowrap;
  box-shadow:0 2px 8px rgba(0,0,0,.6);
}

/* 폴리곤 툴 패널 - 화면 우측 하단 fixed (right panel 왼쪽) */
#poly-panel{
  position:fixed;
  bottom:20px;
  right:380px;
  z-index:500;
  width:310px;background:#0f172a;border:1px solid #475569;
  border-radius:14px;overflow:hidden;
  box-shadow:0 8px 32px rgba(0,0,0,.85);
  display:none;flex-direction:column;
  max-height:calc(100vh - 80px);
}
#poly-panel.open{display:flex}

#poly-panel-header{
  background:#1e293b;padding:9px 13px;
  display:flex;align-items:center;justify-content:space-between;
  border-bottom:1px solid #334155;flex-shrink:0;
}
#poly-panel-header .title{font-size:13px;font-weight:700;color:#e2e8f0;display:flex;align-items:center;gap:6px}
#poly-panel-close{background:none;border:none;color:#64748b;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;transition:color .15s}
#poly-panel-close:hover{color:#e2e8f0;background:#334155}

/* 상태 표시바 */
#poly-status-bar{
  background:#0a0f1a;padding:5px 13px;
  border-bottom:1px solid #1e293b;
  font-size:11px;color:#64748b;
  display:flex;align-items:center;justify-content:space-between;
  flex-shrink:0;
}
#poly-status-bar .pts-count{color:#a78bfa;font-weight:700}
#poly-status-bar .closed-tag{
  background:#14532d;color:#4ade80;
  padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700;
  display:none;
}
#poly-status-bar .closed-tag.show{display:inline}

/* 이름 입력 */
#poly-name-row{padding:7px 12px;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:6px;flex-shrink:0}
#poly-name-input{
  flex:1;background:#1e293b;border:1px solid #334155;border-radius:7px;
  padding:5px 9px;color:#e2e8f0;font-size:12px;outline:none;
}
#poly-name-input:focus{border-color:#7c3aed;box-shadow:0 0 0 2px rgba(124,58,237,.25)}
#poly-name-input::placeholder{color:#475569}

/* 툴바 */
#poly-toolbar{
  padding:7px 11px;display:flex;align-items:center;
  gap:5px;border-bottom:1px solid #1e293b;flex-wrap:wrap;flex-shrink:0;
}
.poly-action-btn{
  flex:1;padding:5px 6px;border-radius:7px;font-size:11px;font-weight:600;
  border:1px solid #334155;cursor:pointer;transition:all .15s;
  display:flex;align-items:center;justify-content:center;gap:3px;
  white-space:nowrap;min-width:0;
}
.poly-action-btn.undo{background:#1e293b;color:#94a3b8}.poly-action-btn.undo:hover{background:#334155;color:#fff}
.poly-action-btn.clear{background:#1e293b;color:#f87171;border-color:#7f1d1d}.poly-action-btn.clear:hover{background:#7f1d1d;color:#fff}
.poly-action-btn.close-poly{background:#1e293b;color:#4ade80;border-color:#14532d}.poly-action-btn.close-poly:hover{background:#14532d;color:#fff}
.poly-action-btn.copy{background:#7c3aed;color:#fff;border-color:#a78bfa}.poly-action-btn.copy:hover{background:#6d28d9}

/* 좌표 출력 */
#poly-coords-box{
  padding:9px 12px;overflow-y:auto;max-height:150px;flex-shrink:0;
}
#poly-coords-output{
  background:#0a0f1a;border:1px solid #1e293b;border-radius:8px;
  padding:8px 10px;font-size:10.5px;font-family:monospace;color:#a78bfa;
  line-height:1.7;min-height:44px;white-space:pre-wrap;word-break:break-all;
  user-select:all;cursor:text;
}
#poly-coords-output:hover{border-color:#334155}

/* 포인트 카운트 */
#poly-count{font-size:11px;color:#64748b;padding:0 12px 6px;text-align:right;flex-shrink:0}

/* 저장된 폴리곤 목록 */
#poly-saved-list{
  border-top:1px solid #1e293b;padding:6px 12px 10px;
  max-height:140px;overflow-y:auto;flex-shrink:0;
}
#poly-saved-list .saved-header{font-size:10px;color:#475569;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
#poly-saved-list .saved-item{
  display:flex;align-items:center;gap:5px;
  padding:4px 0;border-bottom:1px solid #0f172a;font-size:11px;
}
#poly-saved-list .saved-item:last-child{border:none}
#poly-saved-list .saved-name{color:#cbd5e1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#poly-saved-list .saved-actions{display:flex;gap:3px;flex-shrink:0}
#poly-saved-list .sa-btn{
  background:#1e293b;border:1px solid #334155;color:#94a3b8;
  padding:2px 7px;border-radius:5px;font-size:10px;cursor:pointer;
  transition:all .15s;
}
#poly-saved-list .sa-btn:hover{background:#334155;color:#fff}
#poly-saved-list .sa-btn.del{border-color:#7f1d1d;color:#f87171}
#poly-saved-list .sa-btn.del:hover{background:#7f1d1d;color:#fff}

/* 안내 텍스트 */
#poly-guide{
  padding:6px 12px 8px;font-size:10px;color:#475569;
  border-top:1px solid #1e293b;line-height:1.6;flex-shrink:0;
}
</style>
</head>
<body>

<!-- polygon cursor tooltip -->
<div id="poly-cursor-tip"></div>

<!-- ═══ TOP NAV ═══ -->
<nav id="topnav">
  <div class="flex items-center gap-3">
    <div class="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
      <i class="fas fa-fire-extinguisher text-white text-sm"></i>
    </div>
    <div>
      <div class="text-white font-bold text-sm leading-none">소화기 점검 관리 시스템</div>
      <div class="text-gray-400 text-xs">태경비케이 단양1공장</div>
    </div>
  </div>
  <div class="flex items-center gap-3">
    <div id="nav-stats" class="hidden sm:flex items-center gap-3 text-xs">
      <span class="flex items-center gap-1.5"><span class="s-dot good"></span><span id="ns-good" class="text-gray-300">0 정상</span></span>
      <span class="flex items-center gap-1.5"><span class="s-dot warning"></span><span id="ns-warn" class="text-gray-300">0 주의</span></span>
      <span class="flex items-center gap-1.5"><span class="s-dot danger"></span><span id="ns-danger" class="text-gray-300">0 위험</span></span>
    </div>
    <button onclick="App.resetView()" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-gray-300 transition flex items-center gap-1.5">
      <i class="fas fa-compress-alt"></i><span class="hidden sm:inline">전체보기</span>
    </button>
  </div>
</nav>

<!-- ═══ APP ═══ -->
<div id="app">

  <!-- ── MAP VIEWPORT ── -->
  <div id="map-viewport">
    <div id="map-canvas">
      <img id="factory-img" src="/static/factory_map.jpg" alt="공장 전경" draggable="false"/>
      <!-- building overlays injected by JS -->
      <div id="overlays-layer"></div>
    </div>

    <!-- zoom controls -->
    <div id="zoom-controls">
      <button class="zoom-btn" onclick="App.zoom(0.25)" title="줌인">+</button>
      <button class="zoom-btn" style="font-size:13px" onclick="App.resetView()" title="전체보기"><i class="fas fa-home"></i></button>
      <button class="zoom-btn" onclick="App.zoom(-0.25)" title="줌아웃">−</button>
    </div>

    <!-- map hint -->
    <div id="map-hint" class="absolute top-3 left-3 bg-black/50 text-white text-xs px-3 py-1.5 rounded-lg pointer-events-none">
      <i class="fas fa-hand-pointer mr-1"></i>건물을 클릭하면 층/소화기를 선택할 수 있습니다
    </div>


    <!-- ── POLYGON TOOL: SVG overlay on map-viewport ── -->
    <svg id="poly-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>

    <!-- ── Polygon tool toggle button ── -->
    <button id="poly-tool-btn" onclick="PolyTool.toggle()" title="폴리곤 좌표 따기">
      <i class="fas fa-draw-polygon"></i> 좌표 따기
    </button>

    <!-- ── Polygon tool panel (fixed bottom-right, left of right-panel) ── -->
    <div id="poly-panel">
      <div id="poly-panel-header">
        <span class="title"><i class="fas fa-draw-polygon" style="color:#a78bfa"></i> 폴리곤 좌표 추출</span>
        <button id="poly-panel-close" onclick="PolyTool.toggle()" title="닫기"><i class="fas fa-times"></i></button>
      </div>

      <!-- 상태바 -->
      <div id="poly-status-bar">
        <span>점: <span class="pts-count" id="poly-pts-num">0</span>개</span>
        <span class="closed-tag" id="poly-closed-tag">● 닫힘</span>
      </div>

      <!-- 이름 입력 -->
      <div id="poly-name-row">
        <i class="fas fa-tag" style="color:#64748b;font-size:11px"></i>
        <input id="poly-name-input" type="text" placeholder="구역 이름 (예: 관리동)" />
      </div>

      <!-- 툴바 -->
      <div id="poly-toolbar">
        <button class="poly-action-btn close-poly" onclick="PolyTool.closePoly()" title="폴리곤 닫기">
          <i class="fas fa-vector-square"></i> 닫기
        </button>
        <button class="poly-action-btn undo" onclick="PolyTool.undo()" title="마지막 점 취소">
          <i class="fas fa-undo"></i> 되돌리기
        </button>
        <button class="poly-action-btn clear" onclick="PolyTool.clear()" title="전체 초기화">
          <i class="fas fa-trash"></i> 초기화
        </button>
      </div>

      <!-- 좌표 출력 -->
      <div id="poly-coords-box">
        <div id="poly-coords-output">📍 지도 위를 클릭하여 점을 추가하세요</div>
      </div>
      <div id="poly-count">점: 0개</div>

      <!-- 저장 / 복사 버튼 -->
      <div style="padding:0 11px 8px;display:flex;gap:5px">
        <button class="poly-action-btn copy" style="flex:2" onclick="PolyTool.save()">
          <i class="fas fa-save"></i> 저장
        </button>
        <button class="poly-action-btn copy" style="flex:3;background:#0f4c81;border-color:#1e6fba" onclick="PolyTool.copyJSON()">
          <i class="fas fa-copy"></i> JSON 복사
        </button>
      </div>

      <!-- 저장된 목록 -->
      <div id="poly-saved-list" style="display:none">
        <div class="saved-header">저장된 구역</div>
        <div id="poly-saved-items"></div>
      </div>

      <!-- 안내 -->
      <div id="poly-guide">
        <i class="fas fa-info-circle" style="color:#7c3aed;margin-right:4px"></i>
        클릭 → 점 추가 &nbsp;|&nbsp; 첫번째 점 클릭 or 더블클릭 → 닫기<br/>
        좌표는 이미지 기준 퍼센트(%) 값입니다
      </div>
    </div>
  </div>

  <!-- ── RIGHT PANEL ── -->
  <aside id="right-panel">

    <!-- breadcrumb -->
    <div id="breadcrumb">
      <span class="bc-item active" id="bc-home" onclick="App.goHome()"><i class="fas fa-map mr-1"></i>전체 지도</span>
    </div>

    <!-- VIEW 0: home (no selection) -->
    <div id="view-home" class="panel-view active flex-col p-4 gap-4">
      <div class="text-sm text-gray-400 text-center pt-6">
        <i class="fas fa-arrow-left text-2xl text-slate-500 block mb-3"></i>
        지도에서 건물을 클릭하면<br/>상세 정보가 표시됩니다
      </div>
      <div class="grid grid-cols-3 gap-2 mt-4">
        <div class="mini-stat"><div class="val text-white" id="hs-total">0</div><div class="lbl">전체 소화기</div></div>
        <div class="mini-stat"><div class="val text-yellow-400" id="hs-warn">0</div><div class="lbl">점검 주의</div></div>
        <div class="mini-stat"><div class="val text-red-400" id="hs-danger">0</div><div class="lbl">기한 초과</div></div>
      </div>
      <!-- building list -->
      <div class="text-xs text-gray-500 mt-2 mb-1 px-1">건물 목록</div>
      <div id="home-bld-list" class="space-y-1.5"></div>
    </div>

    <!-- VIEW 1: building selected → floor list -->
    <div id="view-building" class="panel-view flex-col">
      <div class="p-4 border-b border-slate-700">
        <div class="flex items-center gap-3">
          <div id="vb-icon" class="w-10 h-10 rounded-xl flex items-center justify-center">
            <i class="fas fa-building text-white text-lg"></i>
          </div>
          <div>
            <div id="vb-name" class="text-white font-bold text-base"></div>
            <div id="vb-sub"  class="text-gray-400 text-xs"></div>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-3">
          <div class="mini-stat"><div class="val text-white" id="vb-total">0</div><div class="lbl">소화기</div></div>
          <div class="mini-stat"><div class="val text-yellow-400" id="vb-warn">0</div><div class="lbl">주의</div></div>
          <div class="mini-stat"><div class="val text-red-400" id="vb-danger">0</div><div class="lbl">위험</div></div>
        </div>
      </div>
      <div class="p-4">
        <div class="text-xs text-gray-500 mb-2">층 선택</div>
        <div id="floor-list" class="grid grid-cols-2 gap-2"></div>
      </div>
    </div>

    <!-- VIEW 2: floor selected → floor plan + ext list -->
    <div id="view-floor" class="panel-view flex-col">
      <!-- floor plan -->
      <div id="floor-plan-wrap">
        <svg id="floor-plan-svg" viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="220" fill="#0f172a"/>
          <rect x="20" y="15" width="360" height="190" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
          <text x="200" y="116" text-anchor="middle" fill="#475569" font-size="13">평면도 준비중</text>
          <text x="200" y="134" text-anchor="middle" fill="#334155" font-size="11">이미지를 업로드하면 표시됩니다</text>
          <g id="fp-markers"></g>
        </svg>
        <div id="fp-legend" class="absolute bottom-2 left-3 flex gap-2 text-xs">
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-green-600 border border-white/30 inline-block"></span>정상</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-yellow-600 border border-white/30 inline-block"></span>주의</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-red-600 border border-white/30 inline-block"></span>위험</span>
        </div>
      </div>
      <!-- ext list -->
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        <div class="text-xs text-gray-500 mb-1 px-1" id="floor-ext-header">소화기 목록</div>
        <div id="floor-ext-list" class="space-y-2"></div>
      </div>
    </div>

    <!-- VIEW 3: extinguisher detail -->
    <div id="view-ext" class="panel-view flex-col">
      <div class="p-4 space-y-4">
        <div class="flex items-center gap-3">
          <div id="ve-icon" class="w-12 h-12 rounded-full flex items-center justify-center">
            <i class="fas fa-fire-extinguisher text-white text-xl"></i>
          </div>
          <div>
            <div id="ve-name" class="text-white font-bold text-base"></div>
            <div id="ve-loc"  class="text-gray-400 text-xs"></div>
          </div>
        </div>

        <div id="ve-dday-wrap" class="text-center py-3 rounded-xl bg-slate-800">
          <div class="text-gray-400 text-xs mb-1">다음 점검까지</div>
          <div id="ve-dday" class="text-4xl font-black"></div>
        </div>

        <div class="bg-slate-800 rounded-xl p-3 space-y-0">
          <div class="info-row"><span class="info-key">소화기 ID</span><span class="info-val" id="ve-id"></span></div>
          <div class="info-row"><span class="info-key">종류</span><span class="info-val" id="ve-type"></span></div>
          <div class="info-row"><span class="info-key">용량</span><span class="info-val" id="ve-cap"></span></div>
          <div class="info-row"><span class="info-key">제조연월</span><span class="info-val" id="ve-mfg"></span></div>
          <div class="info-row"><span class="info-key">최근 점검일</span><span class="info-val" id="ve-last"></span></div>
          <div class="info-row"><span class="info-key">다음 점검일</span><span class="info-val" id="ve-next"></span></div>
          <div class="info-row"><span class="info-key">점검자</span><span class="info-val" id="ve-inspector"></span></div>
          <div class="info-row"><span class="info-key">상태</span><span id="ve-status-chip"></span></div>
        </div>

        <button id="inspect-btn" onclick="openInspectForm()"
          class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm">
          <i class="fas fa-clipboard-check"></i> 점검 완료 기록
        </button>
        <button onclick="App.goToFloor()" 
          class="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 rounded-xl transition text-sm">
          <i class="fas fa-arrow-left mr-1"></i> 목록으로
        </button>
      </div>
    </div>

  </aside>
</div>

<!-- ═══ INSPECT MODAL ═══ -->
<div id="inspect-modal" class="hidden fixed inset-0 bg-black/60 z-[600] flex items-center justify-center">
  <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border border-slate-600 space-y-4">
    <h3 class="text-white font-bold text-lg flex items-center gap-2">
      <i class="fas fa-clipboard-check text-green-400"></i> 점검 완료 기록
    </h3>
    <div class="space-y-3">
      <div>
        <label class="text-gray-400 text-xs mb-1 block">점검자 이름</label>
        <input id="form-inspector" type="text" placeholder="홍길동"
          class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400"/>
      </div>
      <div>
        <label class="text-gray-400 text-xs mb-1 block">다음 점검 예정일</label>
        <input id="form-next-date" type="date"
          class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400"/>
      </div>
    </div>
    <div class="flex gap-3">
      <button onclick="closeInspectForm()"
        class="flex-1 bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 rounded-xl transition text-sm">취소</button>
      <button onclick="submitInspect()"
        class="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-xl transition text-sm">저장</button>
    </div>
  </div>
</div>

<!-- ═══ TOAST ═══ -->
<div id="toast"></div>

<script>
// ═══════════════════════════════════════════════════════════════════
//  APP STATE
// ═══════════════════════════════════════════════════════════════════
const State = {
  buildings: [],
  extinguishers: [],
  selectedBuilding: null,
  selectedFloor: null,
  selectedExt: null,
  // map transform
  scale: 1,
  tx: 0,
  ty: 0,
  imgNaturalW: 0,
  imgNaturalH: 0,
  viewW: 0,
  viewH: 0,
}

// ═══════════════════════════════════════════════════════════════════
//  MAP INTERACTION
// ═══════════════════════════════════════════════════════════════════
const App = (() => {
  const vp     = () => document.getElementById('map-viewport')
  const canvas = () => document.getElementById('map-canvas')

  let drag = false, sx=0, sy=0, ox=0, oy=0

  function applyTransform() {
    canvas().style.transform = \`translate(\${State.tx}px,\${State.ty}px) scale(\${State.scale})\`
  }

  // 줌아웃 최소값 = 이미지가 뷰포트를 꽉 채우는 스케일 → 여백 완전 차단
  function minScale() {
    const vpW = State.viewW || vp().clientWidth
    const vpH = State.viewH || vp().clientHeight
    const iw  = State.imgNaturalW || 1992
    const ih  = State.imgNaturalH || 1588
    // contain 방식: 이미지 전체가 보이도록 더 작은 비율 사용
    return Math.min(vpW / iw, vpH / ih)
  }

  function clampTranslate() {
    const vpW = State.viewW, vpH = State.viewH
    const imgW = State.imgNaturalW * State.scale
    const imgH = State.imgNaturalH * State.scale
    // contain 모드: 이미지가 뷰포트 안에서 중앙 고정
    if (imgW <= vpW) {
      State.tx = (vpW - imgW) / 2
    } else {
      State.tx = Math.min(0, Math.max(vpW - imgW, State.tx))
    }
    if (imgH <= vpH) {
      State.ty = (vpH - imgH) / 2
    } else {
      State.ty = Math.min(0, Math.max(vpH - imgH, State.ty))
    }
  }

  function resetView() {
    const vpW = State.viewW = vp().clientWidth
    const vpH = State.viewH = vp().clientHeight
    const iw  = State.imgNaturalW || 1992
    const ih  = State.imgNaturalH || 1588
    // contain: 이미지 전체가 보이도록 (더 작은 비율 기준)
    const sc  = Math.min(vpW/iw, vpH/ih)
    State.scale = sc
    // 중앙 정렬
    State.tx = (vpW - iw*sc)/2
    State.ty = (vpH - ih*sc)/2
    applyTransform()
  }

  function zoom(delta, cx, cy) {
    const vpW = State.viewW = vp().clientWidth
    const vpH = State.viewH = vp().clientHeight
    cx = cx ?? vpW/2;  cy = cy ?? vpH/2
    const oldScale = State.scale
    // 최소: contain 스케일 / 최대: 8배
    State.scale = Math.min(8, Math.max(minScale(), State.scale + delta))
    const ratio = State.scale / oldScale
    State.tx = cx - ratio*(cx - State.tx)
    State.ty = cy - ratio*(cy - State.ty)
    clampTranslate()
    applyTransform()
  }

  function goHome() {
    State.selectedBuilding = null
    State.selectedFloor    = null
    State.selectedExt      = null
    document.querySelectorAll('.bld-overlay').forEach(el => el.classList.remove('selected'))
    showView('home')
    updateBreadcrumb()
  }

  function goToFloor() {
    State.selectedExt = null
    showFloorView(State.selectedBuilding, State.selectedFloor)
  }

  // init
  function init() {
    const img = document.getElementById('factory-img')
    function onLoad() {
      State.imgNaturalW = img.naturalWidth  || img.offsetWidth
      State.imgNaturalH = img.naturalHeight || img.offsetHeight
      State.viewW = vp().clientWidth
      State.viewH = vp().clientHeight
      resetView()
      renderOverlays()
    }
    if (img.complete && img.naturalWidth) onLoad()
    else img.addEventListener('load', onLoad)

    // drag
    vp().addEventListener('mousedown', e => {
      if (e.target.closest('.bld-overlay')) return
      // PolyTool 활성 시 drag 허용하되 PolyTool이 mousedown/up을 공유 처리
      drag=true; sx=e.clientX; sy=e.clientY; ox=State.tx; oy=State.ty
      if (!document.getElementById('poly-svg').classList.contains('active')) {
        vp().classList.add('grabbing')
      }
    })
    window.addEventListener('mousemove', e => {
      if (!drag) return
      State.tx = ox + (e.clientX-sx)
      State.ty = oy + (e.clientY-sy)
      clampTranslate(); applyTransform()
    })
    window.addEventListener('mouseup', () => { drag=false; vp().classList.remove('grabbing') })

    // touch drag
    let touches0=null
    vp().addEventListener('touchstart', e => {
      if (e.touches.length===1) {
        const t=e.touches[0]; drag=true; sx=t.clientX; sy=t.clientY; ox=State.tx; oy=State.ty
      } else if (e.touches.length===2) {
        drag=false; touches0=e.touches
      }
    },{passive:true})
    vp().addEventListener('touchmove', e => {
      if (e.touches.length===1 && drag) {
        const t=e.touches[0]
        State.tx = ox+(t.clientX-sx); State.ty = oy+(t.clientY-sy)
        clampTranslate(); applyTransform()
      } else if (e.touches.length===2 && touches0) {
        const d0=Math.hypot(touches0[0].clientX-touches0[1].clientX,touches0[0].clientY-touches0[1].clientY)
        const d1=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)
        const cx=(e.touches[0].clientX+e.touches[1].clientX)/2
        const cy=(e.touches[0].clientY+e.touches[1].clientY)/2
        zoom((d1-d0)/State.imgNaturalW*State.scale, cx, cy)
        touches0=e.touches
      }
    },{passive:true})
    vp().addEventListener('touchend', () => { drag=false; touches0=null })

    // wheel zoom
    vp().addEventListener('wheel', e => {
      e.preventDefault()
      zoom(e.deltaY < 0 ? 0.15 : -0.15, e.clientX-vp().getBoundingClientRect().left, e.clientY-vp().getBoundingClientRect().top)
    },{passive:false})

    window.addEventListener('resize', resetView)
  }

  return { init, resetView, zoom: (d) => zoom(d), goHome, goToFloor }
})()

// ═══════════════════════════════════════════════════════════════════
//  RENDER BUILDING OVERLAYS
// ═══════════════════════════════════════════════════════════════════
function renderOverlays() {
  const layer = document.getElementById('overlays-layer')
  layer.innerHTML = ''
  const img = document.getElementById('factory-img')
  const iw  = img.offsetWidth || State.imgNaturalW || 500

  State.buildings.forEach(b => {
    const exts = State.extinguishers.filter(e => e.buildingId === b.id)
    const dangerCount   = exts.filter(e => e.status==='danger').length
    const warningCount  = exts.filter(e => e.status==='warning').length

    const div = document.createElement('div')
    div.className = 'bld-overlay'
    div.id = 'bld-' + b.id
    div.style.left    = b.mapX + '%'
    div.style.top     = b.mapY + '%'
    div.style.width   = b.mapW + '%'
    div.style.height  = b.mapH + '%'
    div.style.background = b.color + '40'  // 25% opacity
    div.style.borderColor = b.color

    // label
    const lbl = document.createElement('span')
    lbl.className = 'bld-label'
    lbl.textContent = b.shortName
    div.appendChild(lbl)

    // 숫자박스 제거됨

    div.addEventListener('click', (e) => {
      e.stopPropagation()
      selectBuilding(b.id)
      // zoom to building center
      zoomToBuilding(b)
    })
    layer.appendChild(div)
  })
}

function zoomToBuilding(b) {
  const vpEl = document.getElementById('map-viewport')
  const img  = document.getElementById('factory-img')
  const iw   = State.imgNaturalW || img.naturalWidth || 2048
  const ih   = State.imgNaturalH || img.naturalHeight || 1536
  const vpW  = vpEl.clientWidth
  const vpH  = vpEl.clientHeight

  // contain 기준 최소 스케일 (이미지 전체가 보이는 최소)
  const containScale = Math.min(vpW/iw, vpH/ih)

  // 건물 중심에 줌 (건물 너비가 뷰포트의 ~40%를 차지하도록)
  const targetScale = Math.min(8, Math.max(
    containScale,
    Math.max(State.scale, (vpW * 0.4) / (b.mapW/100 * iw))
  ))
  State.scale = targetScale

  // 건물 중심을 뷰포트 중앙으로
  const bx = (b.mapX + b.mapW/2)/100 * iw * State.scale
  const by = (b.mapY + b.mapH/2)/100 * ih * State.scale
  State.tx = vpW/2 - bx
  State.ty = vpH/2 - by

  // contain 모드 clamp: 이미지가 뷰포트 안에 유지
  const iws = iw * State.scale
  const ihs = ih * State.scale
  if (iws <= vpW) { State.tx = (vpW - iws) / 2 }
  else { State.tx = Math.min(0, Math.max(vpW - iws, State.tx)) }
  if (ihs <= vpH) { State.ty = (vpH - ihs) / 2 }
  else { State.ty = Math.min(0, Math.max(vpH - ihs, State.ty)) }

  document.getElementById('map-canvas').style.transition = 'transform 0.45s cubic-bezier(0.25,0.46,0.45,0.94)'
  document.getElementById('map-canvas').style.transform  = \`translate(\${State.tx}px,\${State.ty}px) scale(\${State.scale})\`
  setTimeout(() => { document.getElementById('map-canvas').style.transition = '' }, 460)
}

// ═══════════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════════
function showView(name) {
  document.querySelectorAll('.panel-view').forEach(v => v.classList.remove('active'))
  document.getElementById('view-'+name).classList.add('active')
}

function updateBreadcrumb() {
  const bc = document.getElementById('breadcrumb')
  const b  = State.selectedBuilding
  const f  = State.selectedFloor
  const e  = State.selectedExt

  let html = \`<span class="bc-item \${!b?'active':''}" onclick="App.goHome()"><i class="fas fa-map mr-1"></i>전체 지도</span>\`
  if (b) {
    html += \`<span class="text-slate-600">›</span>
      <span class="bc-item \${b&&!f?'active':''}" onclick="selectBuilding('\${b.id}')">
        \${b.name}
      </span>\`
  }
  if (f) {
    html += \`<span class="text-slate-600">›</span>
      <span class="bc-item \${f&&!e?'active':''}" onclick="showFloorView(State.selectedBuilding,\${f})">
        \${f}층
      </span>\`
  }
  if (e) {
    html += \`<span class="text-slate-600">›</span>
      <span class="bc-item active">\${e.id}</span>\`
  }
  bc.innerHTML = html
}

function selectBuilding(bid) {
  const b = State.buildings.find(b => b.id===bid)
  if (!b) return
  State.selectedBuilding = b
  State.selectedFloor    = null
  State.selectedExt      = null

  // highlight
  document.querySelectorAll('.bld-overlay').forEach(el => el.classList.remove('selected'))
  const el = document.getElementById('bld-'+bid)
  if (el) el.classList.add('selected')

  // fill panel
  const exts    = State.extinguishers.filter(e => e.buildingId===bid)
  const danger  = exts.filter(e=>e.status==='danger').length
  const warning = exts.filter(e=>e.status==='warning').length

  document.getElementById('vb-icon').style.background = b.color
  document.getElementById('vb-name').textContent = b.name
  document.getElementById('vb-sub').textContent  = \`총 \${exts.length}개 소화기\`
  document.getElementById('vb-total').textContent = exts.length
  document.getElementById('vb-warn').textContent  = warning
  document.getElementById('vb-danger').textContent = danger

  // floor buttons
  const fl = document.getElementById('floor-list')
  fl.innerHTML = ''
  for (let i=1; i<=b.floors; i++) {
    const cnt = exts.filter(e=>e.floor===i)
    const d = cnt.filter(e=>e.status==='danger').length
    const w = cnt.filter(e=>e.status==='warning').length
    const chip = d>0 ? \`<span class="text-red-400 text-xs font-bold">\${d}건 위험</span>\`
                : w>0 ? \`<span class="text-yellow-400 text-xs font-bold">\${w}건 주의</span>\`
                : \`<span class="text-green-400 text-xs">정상</span>\`
    fl.innerHTML += \`<button onclick="showFloorView(State.selectedBuilding,\${i})"
      class="bg-slate-700 hover:bg-slate-600 rounded-xl p-3 text-left transition border border-slate-600 hover:border-slate-400">
      <div class="text-white font-bold text-sm">\${i}층</div>
      <div class="text-gray-400 text-xs mt-0.5">\${cnt.length}개 소화기</div>
      <div class="mt-1">\${chip}</div>
    </button>\`
  }

  showView('building')
  updateBreadcrumb()
}

function showFloorView(b, floor) {
  if (!b) return
  State.selectedBuilding = b
  State.selectedFloor    = floor
  State.selectedExt      = null

  const exts = State.extinguishers.filter(e => e.buildingId===b.id && e.floor===floor)

  document.getElementById('floor-ext-header').textContent = \`\${b.name} \${floor}층 소화기 목록 (\${exts.length}개)\`

  // floor plan markers
  const g = document.getElementById('fp-markers')
  g.innerHTML = ''
  // floor plan background label
  const bg = document.getElementById('floor-plan-svg').querySelector('text')
  if (bg) bg.textContent = \`\${b.name} \${floor}층 평면도\`

  exts.forEach(ext => {
    const cx = 20 + (ext.location.x/100)*360
    const cy = 15 + (ext.location.y/100)*190
    const col = {good:'#16a34a',warning:'#d97706',danger:'#dc2626'}[ext.status]
    const mark = document.createElementNS('http://www.w3.org/2000/svg','g')
    mark.innerHTML = \`
      <circle class="fp-marker" cx="\${cx}" cy="\${cy}" r="9" fill="\${col}" stroke="white" stroke-width="1.5" onclick="selectExt('\${ext.id}')"/>
      <text x="\${cx}" y="\${cy+4}" text-anchor="middle" fill="white" font-size="9" font-weight="bold" pointer-events="none">
        <i class="fas fa-fire-extinguisher"></i>
      </text>
      <circle cx="\${cx}" cy="\${cy}" r="9" fill="none" stroke="\${col}" stroke-width="1.5" opacity="0.4">
        \${ext.status==='danger'?'<animate attributeName="r" from="9" to="18" dur="1.5s" repeatCount="indefinite"/>':''} 
        \${ext.status==='danger'?'<animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/>':''}
      </circle>
    \`
    g.appendChild(mark)
  })

  // ext list
  const list = document.getElementById('floor-ext-list')
  list.innerHTML = exts.length===0
    ? '<div class="text-gray-500 text-sm text-center py-6">이 층에 소화기가 없습니다</div>'
    : exts.map(ext => {
        const dday = calcDday(ext.nextInspection)
        const ddayText = dday>0?'D-'+dday:dday===0?'D-Day':'D+'+Math.abs(dday)
        const ddayColor = dday<0?'text-red-400':dday<=30?'text-yellow-400':'text-green-400'
        return \`<div class="ext-card" id="card-\${ext.id}" onclick="selectExt('\${ext.id}')">
          <span class="s-dot \${ext.status}"></span>
          <div class="flex-1 min-w-0">
            <div class="text-white text-sm font-semibold">\${ext.name}</div>
            <div class="text-gray-400 text-xs">\${ext.type} \${ext.capacity}</div>
          </div>
          <div class="\${ddayColor} text-sm font-bold">\${ddayText}</div>
        </div>\`
      }).join('')

  showView('floor')
  updateBreadcrumb()
}

function selectExt(eid) {
  const ext = State.extinguishers.find(e=>e.id===eid)
  if (!ext) return
  State.selectedExt = ext

  const b = State.selectedBuilding
  const dday = calcDday(ext.nextInspection)
  const ddayText = dday>0?'D-'+dday:dday===0?'D-Day':'D+'+Math.abs(dday)
  const col = {good:'#16a34a',warning:'#d97706',danger:'#dc2626'}[ext.status]
  const statusLabel = {good:'✅ 정상',warning:'⚠️ 점검 주의',danger:'🚨 기한 초과'}[ext.status]
  const chipClass = 'dday-chip '+ext.status

  document.getElementById('ve-icon').style.background = col
  document.getElementById('ve-name').textContent = ext.name
  document.getElementById('ve-loc').textContent  = (b?.name||'') + ' ' + ext.floor + '층'
  document.getElementById('ve-dday').textContent = ddayText
  document.getElementById('ve-dday').style.color  = col
  document.getElementById('ve-id').textContent   = ext.id
  document.getElementById('ve-type').textContent = ext.type
  document.getElementById('ve-cap').textContent  = ext.capacity
  document.getElementById('ve-mfg').textContent  = ext.manufacture
  document.getElementById('ve-last').textContent = ext.lastInspected
  document.getElementById('ve-next').textContent = ext.nextInspection
  document.getElementById('ve-inspector').textContent = ext.inspector
  document.getElementById('ve-status-chip').innerHTML = \`<span class="\${chipClass}">\${statusLabel}</span>\`

  // highlight card
  document.querySelectorAll('.ext-card').forEach(c=>c.classList.remove('selected'))
  const card = document.getElementById('card-'+eid)
  if (card) card.classList.add('selected')

  showView('ext')
  updateBreadcrumb()
}

// ═══════════════════════════════════════════════════════════════════
//  HOME VIEW
// ═══════════════════════════════════════════════════════════════════
function renderHomeView() {
  const exts = State.extinguishers
  document.getElementById('hs-total').textContent  = exts.length
  document.getElementById('hs-warn').textContent   = exts.filter(e=>e.status==='warning').length
  document.getElementById('hs-danger').textContent = exts.filter(e=>e.status==='danger').length
  document.getElementById('ns-good').textContent   = exts.filter(e=>e.status==='good').length + ' 정상'
  document.getElementById('ns-warn').textContent   = exts.filter(e=>e.status==='warning').length + ' 주의'
  document.getElementById('ns-danger').textContent = exts.filter(e=>e.status==='danger').length + ' 위험'

  const listEl = document.getElementById('home-bld-list')
  listEl.innerHTML = State.buildings.map(b => {
    const bexts = exts.filter(e=>e.buildingId===b.id)
    const d = bexts.filter(e=>e.status==='danger').length
    const w = bexts.filter(e=>e.status==='warning').length
    const chip = d>0 ? \`<span class="text-red-400 text-xs font-bold ml-1">\${d}건 위험</span>\`
               : w>0 ? \`<span class="text-yellow-400 text-xs font-bold ml-1">\${w}건 주의</span>\`
               : \`<span class="text-green-400 text-xs ml-1">정상</span>\`
    return \`<div onclick="selectBuildingById('\${b.id}')"
      class="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl p-3 cursor-pointer transition border border-slate-700 hover:border-slate-500">
      <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style="background:\${b.color}">
        <i class="fas fa-building text-white text-xs"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-white text-sm font-semibold">\${b.name}</div>
        <div class="text-gray-400 text-xs">\${b.floors}층 · 소화기 \${bexts.length}개\${chip}</div>
      </div>
      <i class="fas fa-chevron-right text-gray-500 text-xs"></i>
    </div>\`
  }).join('')
}

// ═══════════════════════════════════════════════════════════════════
//  INSPECT FORM
// ═══════════════════════════════════════════════════════════════════
function openInspectForm() {
  const d = new Date(); d.setMonth(d.getMonth()+6)
  document.getElementById('form-next-date').value = d.toISOString().split('T')[0]
  document.getElementById('inspect-modal').classList.remove('hidden')
}
function closeInspectForm() {
  document.getElementById('inspect-modal').classList.add('hidden')
}
async function submitInspect() {
  const inspector = document.getElementById('form-inspector').value.trim()
  const nextDate  = document.getElementById('form-next-date').value
  if (!inspector||!nextDate) { showToast('⚠️ 모든 항목을 입력해주세요'); return }
  const ext = State.selectedExt
  if (!ext) return
  const res = await fetch('/api/extinguishers/'+ext.id+'/inspect',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({inspector, nextInspection:nextDate})
  })
  const data = await res.json()
  if (data.success) {
    const idx = State.extinguishers.findIndex(e=>e.id===ext.id)
    State.extinguishers[idx] = data.extinguisher
    State.selectedExt = data.extinguisher
    closeInspectForm()
    renderOverlays()
    renderHomeView()
    selectExt(ext.id)
    showFloorView(State.selectedBuilding, State.selectedFloor) // refresh markers
    setTimeout(()=>selectExt(ext.id),50)
    showToast('✅ 점검이 기록되었습니다')
  }
}

// ═══════════════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════════════
function calcDday(dateStr) {
  const today=new Date(); today.setHours(0,0,0,0)
  const t=new Date(dateStr); t.setHours(0,0,0,0)
  return Math.ceil((t-today)/(1000*60*60*24))
}
function showToast(msg) {
  const t=document.getElementById('toast')
  t.textContent=msg; t.style.display='block'
  clearTimeout(t._tid)
  t._tid=setTimeout(()=>t.style.display='none',3000)
}

// home-list 클릭용 wrapper (전역 함수)
function selectBuildingById(bid) {
  const b = State.buildings.find(bb=>bb.id===bid)
  if (!b) return
  selectBuilding(bid)
  zoomToBuilding(b)
}


// ═══════════════════════════════════════════════════════════════════
//  POLYGON TOOL  (퍼센트 좌표 추출)
// ═══════════════════════════════════════════════════════════════════
const PolyTool = (() => {
  let active   = false
  let points   = []        // [{x, y}] % 좌표 (이미지 기준)
  let closed   = false
  let saved    = []        // [{name, points, closed}]
  let mousePos = {x:0, y:0}

  // 드래그 vs 클릭 구분용
  let mouseDownPos = null
  const DRAG_THRESHOLD = 5   // px 이상 움직이면 드래그로 판정

  const svgEl     = () => document.getElementById('poly-svg')
  const panelEl   = () => document.getElementById('poly-panel')
  const btnEl     = () => document.getElementById('poly-tool-btn')
  const outputEl  = () => document.getElementById('poly-coords-output')
  const countEl   = () => document.getElementById('poly-count')
  const savedBox  = () => document.getElementById('poly-saved-list')
  const savedEl   = () => document.getElementById('poly-saved-items')
  const nameInp   = () => document.getElementById('poly-name-input')
  const ptsNumEl  = () => document.getElementById('poly-pts-num')
  const closedTag = () => document.getElementById('poly-closed-tag')

  // ── 이미지 기준 퍼센트 좌표 계산 ─────────────────────────
  // map-viewport 좌표를 받아 factory-img 기준 %로 변환
  function clientToPercent(clientX, clientY) {
    const img = document.getElementById('factory-img')
    const rect = img.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width  * 100
    const y = (clientY - rect.top)  / rect.height * 100
    return {
      x: Math.max(0, Math.min(100, +x.toFixed(2))),
      y: Math.max(0, Math.min(100, +y.toFixed(2)))
    }
  }

  // ── SVG 다시 그리기 ──────────────────────────────────────
  function redraw() {
    const s = svgEl()
    s.innerHTML = ''

    // 저장된 폴리곤들 (흐리게)
    saved.forEach((item, si) => {
      if (item.points.length < 2) return
      const pts = item.points.map(p => p.x+','+p.y).join(' ')
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
      poly.setAttribute('points', pts)
      poly.setAttribute('fill', 'rgba(124,58,237,0.10)')
      poly.setAttribute('stroke', '#7c3aed')
      poly.setAttribute('stroke-width', '0.4')
      poly.setAttribute('stroke-dasharray', '1.5,1')
      s.appendChild(poly)
      // 라벨
      const cx = item.points.reduce((a,p)=>a+p.x,0)/item.points.length
      const cy = item.points.reduce((a,p)=>a+p.y,0)/item.points.length
      const txt = document.createElementNS('http://www.w3.org/2000/svg','text')
      txt.setAttribute('x', cx); txt.setAttribute('y', cy)
      txt.setAttribute('text-anchor','middle'); txt.setAttribute('dominant-baseline','middle')
      txt.setAttribute('fill','#c4b5fd'); txt.setAttribute('font-size','1.6')
      txt.setAttribute('font-weight','700'); txt.setAttribute('paint-order','stroke')
      txt.setAttribute('stroke','rgba(0,0,0,0.85)'); txt.setAttribute('stroke-width','0.6')
      txt.textContent = item.name || ('구역'+(si+1))
      s.appendChild(txt)
    })

    if (points.length === 0) return

    // 현재 작업 폴리곤
    if (points.length >= 2) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', closed ? 'polygon' : 'polyline')
      el.setAttribute('points', points.map(p=>p.x+','+p.y).join(' '))
      el.setAttribute('fill', closed ? 'rgba(99,102,241,0.22)' : 'none')
      el.setAttribute('stroke', '#6366f1')
      el.setAttribute('stroke-width', '0.55')
      el.setAttribute('stroke-linejoin','round')
      if (!closed) el.setAttribute('stroke-dasharray','2,1')
      s.appendChild(el)
    }

    // 미리보기 선 (마우스까지)
    if (!closed && points.length >= 1 && active) {
      const last = points[points.length-1]
      const ln = document.createElementNS('http://www.w3.org/2000/svg','line')
      ln.setAttribute('x1', last.x); ln.setAttribute('y1', last.y)
      ln.setAttribute('x2', mousePos.x); ln.setAttribute('y2', mousePos.y)
      ln.setAttribute('stroke','rgba(99,102,241,0.45)')
      ln.setAttribute('stroke-width','0.35')
      ln.setAttribute('stroke-dasharray','1.5,1')
      s.appendChild(ln)
    }

    // 점들
    points.forEach((p, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle')
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y)
      c.setAttribute('r', i===0 ? '1.2' : '0.85')
      c.setAttribute('fill', i===0 ? '#f59e0b' : '#6366f1')
      c.setAttribute('stroke', 'white'); c.setAttribute('stroke-width','0.3')
      c.style.cursor = i===0 && points.length>=3 && !closed ? 'cell' : 'default'
      if (i===0 && points.length>=3 && !closed) {
        c.addEventListener('click', e => { e.stopPropagation(); closePoly() })
      }
      s.appendChild(c)
      // 순번
      const t = document.createElementNS('http://www.w3.org/2000/svg','text')
      t.setAttribute('x', p.x); t.setAttribute('y', p.y - 1.4)
      t.setAttribute('text-anchor','middle'); t.setAttribute('fill','#e2e8f0')
      t.setAttribute('font-size','1.1'); t.setAttribute('font-weight','700')
      t.setAttribute('paint-order','stroke'); t.setAttribute('stroke','rgba(0,0,0,0.9)')
      t.setAttribute('stroke-width','0.6')
      t.textContent = i+1
      s.appendChild(t)
    })
  }

  // ── 상태/출력 업데이트 ───────────────────────────────────
  function updateOutput() {
    const name = nameInp().value.trim() || 'zone'
    const n = points.length
    if (ptsNumEl()) ptsNumEl().textContent = n
    if (closedTag()) {
      if (closed) closedTag().classList.add('show')
      else closedTag().classList.remove('show')
    }
    countEl().textContent = '점: '+n+'개'+(closed?' (닫힘)':n>0?' (열림)':'')

    if (n === 0) {
      outputEl().textContent = '📍 지도 위를 클릭하여 점을 추가하세요'
      return
    }

    const minX = Math.min(...points.map(p=>p.x))
    const minY = Math.min(...points.map(p=>p.y))
    const maxX = Math.max(...points.map(p=>p.x))
    const maxY = Math.max(...points.map(p=>p.y))

    outputEl().textContent =
      '// '+name+'\\n' +
      'mapX:'+minX.toFixed(1)+', mapY:'+minY.toFixed(1)+',\\n' +
      'mapW:'+(maxX-minX).toFixed(1)+', mapH:'+(maxY-minY).toFixed(1)+'\\n\\n' +
      '// 폴리곤 points:\\n['+
      points.map(p=>'['+p.x+','+p.y+']').join(', ')+
      ']'
  }

  // ── 폴리곤 닫기 ─────────────────────────────────────────
  function closePoly() {
    if (points.length < 3) { showToast('⚠️ 점이 3개 이상 필요합니다'); return }
    closed = true
    redraw(); updateOutput()
    showToast('✅ 폴리곤이 닫혔습니다')
  }

  // ── 이벤트 핸들러 ────────────────────────────────────────
  let lastClickTime = 0

  function onMouseDown(e) {
    if (!active) return
    mouseDownPos = { x: e.clientX, y: e.clientY }
  }

  function onMouseUp(e) {
    if (!active || !mouseDownPos) return
    const dx = Math.abs(e.clientX - mouseDownPos.x)
    const dy = Math.abs(e.clientY - mouseDownPos.y)
    mouseDownPos = null

    // 드래그였으면 무시
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) return
    // 건물 오버레이 클릭 무시
    if (e.target.closest('.bld-overlay')) return
    // 패널 클릭 무시
    if (e.target.closest('#poly-panel') || e.target.closest('#poly-tool-btn')) return
    if (closed) return

    const now = Date.now()
    // 더블클릭 → 닫기
    if (now - lastClickTime < 300 && points.length >= 3) {
      closePoly(); lastClickTime = 0; return
    }
    lastClickTime = now

    const pt = clientToPercent(e.clientX, e.clientY)
    points.push(pt)
    redraw(); updateOutput()
  }

  function onMouseMove(e) {
    if (!active) return
    const pt = clientToPercent(e.clientX, e.clientY)
    mousePos = pt
    if (!closed) redraw()
  }

  // ── 토글 ─────────────────────────────────────────────────
  function toggle() {
    active = !active
    const s = svgEl(); const b = btnEl(); const p = panelEl()
    if (active) {
      s.classList.add('active')
      b.classList.add('active')
      b.innerHTML = '<i class="fas fa-times"></i> 툴 종료'
      p.classList.add('open')
      // 드래그 충돌 없이 mouseup 기반으로 처리
      const vp = document.getElementById('map-viewport')
      vp.addEventListener('mousedown', onMouseDown)
      vp.addEventListener('mouseup', onMouseUp)
      vp.addEventListener('mousemove', onMouseMove)
      showToast('📍 클릭으로 점을 추가하세요. 더블클릭 또는 첫번째 점 클릭으로 닫기')
    } else {
      s.classList.remove('active')
      b.classList.remove('active')
      b.innerHTML = '<i class="fas fa-draw-polygon"></i> 좌표 따기'
      p.classList.remove('open')
      const vp = document.getElementById('map-viewport')
      vp.removeEventListener('mousedown', onMouseDown)
      vp.removeEventListener('mouseup', onMouseUp)
      vp.removeEventListener('mousemove', onMouseMove)
    }
  }

  function undo() {
    if (closed) { closed = false; redraw(); updateOutput(); return }
    if (points.length === 0) return
    points.pop()
    redraw(); updateOutput()
  }

  function clear() {
    points = []; closed = false
    redraw(); updateOutput()
    outputEl().textContent = '📍 지도 위를 클릭하여 점을 추가하세요'
    countEl().textContent = '점: 0개'
    if (ptsNumEl()) ptsNumEl().textContent = '0'
    if (closedTag()) closedTag().classList.remove('show')
  }

  function save() {
    if (points.length < 2) { showToast('⚠️ 점이 2개 이상 필요합니다'); return }
    const name = nameInp().value.trim() || ('구역'+(saved.length+1))
    saved.push({ name, points:[...points], closed })
    renderSavedList()
    showToast('✅ "'+name+'" 저장됨')
    clear()
    nameInp().value = ''
  }

  function copyJSON() {
    const target = (saved.length > 0 && points.length === 0) ? saved
      : [{ name: nameInp().value.trim()||'zone', points, closed }]
    if (target[0].points.length === 0) { showToast('⚠️ 좌표가 없습니다'); return }
    const json = JSON.stringify(target.map(s => ({
      name: s.name,
      points: s.points,
      mapX: +Math.min(...s.points.map(p=>p.x)).toFixed(2),
      mapY: +Math.min(...s.points.map(p=>p.y)).toFixed(2),
      mapW: +(Math.max(...s.points.map(p=>p.x))-Math.min(...s.points.map(p=>p.x))).toFixed(2),
      mapH: +(Math.max(...s.points.map(p=>p.y))-Math.min(...s.points.map(p=>p.y))).toFixed(2),
    })), null, 2)
    navigator.clipboard.writeText(json)
      .then(()=>showToast('📋 JSON 복사됨!'))
      .catch(()=>{
        const ta=document.createElement('textarea')
        ta.value=json; document.body.appendChild(ta); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
        showToast('📋 JSON 복사됨!')
      })
  }

  function renderSavedList() {
    if (saved.length === 0) { savedBox().style.display='none'; return }
    savedBox().style.display = 'block'
    const container = savedEl()
    container.innerHTML = ''
    saved.forEach(function(item, i) {
      const row = document.createElement('div')
      row.className = 'saved-item'
      const nameSpan = document.createElement('span')
      nameSpan.className = 'saved-name'
      nameSpan.innerHTML = '<i class="fas fa-vector-square" style="color:#7c3aed;margin-right:4px;font-size:9px"></i>'
        + item.name
        + '<span style="color:#475569;font-size:10px"> (' + item.points.length + '점)</span>'
      const actions = document.createElement('div')
      actions.className = 'saved-actions'
      const editBtn = document.createElement('button')
      editBtn.className = 'sa-btn'
      editBtn.innerHTML = '<i class="fas fa-edit"></i>'
      editBtn.onclick = function() { PolyTool.loadSaved(i) }
      const copyBtn = document.createElement('button')
      copyBtn.className = 'sa-btn'
      copyBtn.innerHTML = '<i class="fas fa-copy"></i>'
      copyBtn.onclick = function() { PolyTool.copySaved(i) }
      const delBtn = document.createElement('button')
      delBtn.className = 'sa-btn del'
      delBtn.innerHTML = '<i class="fas fa-trash"></i>'
      delBtn.onclick = function() { PolyTool.deleteSaved(i) }
      actions.appendChild(editBtn)
      actions.appendChild(copyBtn)
      actions.appendChild(delBtn)
      row.appendChild(nameSpan)
      row.appendChild(actions)
      container.appendChild(row)
    })
  }

  function loadSaved(i) {
    const item = saved[i]; if(!item) return
    points = [...item.points]; closed = item.closed
    nameInp().value = item.name
    redraw(); updateOutput()
    showToast('📂 "'+item.name+'" 불러옴')
  }

  function copySaved(i) {
    const item = saved[i]; if(!item) return
    const json = JSON.stringify({
      name: item.name,
      points: item.points,
      mapX: +Math.min(...item.points.map(p=>p.x)).toFixed(2),
      mapY: +Math.min(...item.points.map(p=>p.y)).toFixed(2),
      mapW: +(Math.max(...item.points.map(p=>p.x))-Math.min(...item.points.map(p=>p.x))).toFixed(2),
      mapH: +(Math.max(...item.points.map(p=>p.y))-Math.min(...item.points.map(p=>p.y))).toFixed(2),
    }, null, 2)
    navigator.clipboard.writeText(json)
      .then(()=>showToast('📋 "'+item.name+'" 복사됨'))
      .catch(()=>{
        const ta=document.createElement('textarea'); ta.value=json
        document.body.appendChild(ta); ta.select(); document.execCommand('copy')
        document.body.removeChild(ta); showToast('📋 "'+item.name+'" 복사됨')
      })
  }

  function deleteSaved(i) {
    saved.splice(i,1); renderSavedList(); redraw()
    showToast('🗑️ 삭제됨')
  }

  return { toggle, undo, clear, save, closePoly, copyJSON, loadSaved, copySaved, deleteSaved }
})()

// ═══════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════
async function boot() {
  const [buildings, exts] = await Promise.all([
    fetch('/api/buildings').then(r=>r.json()),
    fetch('/api/extinguishers').then(r=>r.json()),
  ])
  State.buildings      = buildings
  State.extinguishers  = exts
  renderHomeView()
  App.init()
  // hide hint after 4s
  setTimeout(()=>{
    const h=document.getElementById('map-hint')
    h.style.transition='opacity 1s'; h.style.opacity='0'
    setTimeout(()=>h.style.display='none',1000)
  },4000)
}
boot()
</script>
</body>
</html>`

// ── /master: 마스터 데이터 목록 (React SPA, localStorage 기반) ──────────────
app.get('/master', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>소화기 마스터 데이터 – 태경BK 단양1공장</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" />
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; background: #f1f5f9; color: #1e293b; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #e2e8f0; }
    ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 3px; }
    .row-replace { color: #dc2626 !important; font-weight: 600; }
    .row-replace td { color: #dc2626 !important; }
    .badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:600; white-space:nowrap; }
    .badge-good    { background:#dcfce7; color:#15803d; }
    .badge-replace { background:#fee2e2; color:#dc2626; }
    .badge-check   { background:#ffedd5; color:#c2410c; }
    .badge-defect  { background:#f3e8ff; color:#7e22ce; }
    .badge-normal  { background:#dbeafe; color:#1d4ed8; }
    @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
    .animate-in { animation: fadeIn 0.35s ease both; }
    .table-row:hover { background: #f8fafc !important; }
    input[type=text], input[type=date], select, textarea {
      background:#ffffff; color:#1e293b; border:1px solid #cbd5e1;
      border-radius:6px; padding:6px 10px; outline:none;
    }
    input[type=text]:focus, input[type=date]:focus, select:focus, textarea:focus {
      border-color:#3b82f6; box-shadow:0 0 0 2px rgba(59,130,246,0.15);
    }
    .modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:50;display:flex;align-items:center;justify-content:center; }
    .modal-box { background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;width:min(520px,95vw);max-height:90vh;overflow-y:auto;padding:28px 32px; }
  </style>
</head>
<body class="min-h-screen text-gray-800">
  <div id="root"></div>

  <script type="text/babel">
  const { useState, useEffect, useMemo, useCallback } = React;

  // ═══════════════════════════════════════════════════════════════
  //  상수 & 초기 데이터
  // ═══════════════════════════════════════════════════════════════
  const STORAGE_KEY = 'tkbk_extinguishers_master';
  const REPLACE_MONTHS = 120;   // 10년
  const INSPECT_DAYS   = 30;    // 30일

  const INITIAL_DATA = [
    { id:1,  location:'관리동 1층(현관)',          type:'ABC분말 3.3kg',  mfgYm:'2024.08', status:'정상', manager:'박광식', note:'' },
    { id:2,  location:'관리동 1층(대표실)',         type:'ABC분말 3.3kg',  mfgYm:'2021.03', status:'정상', manager:'',      note:'' },
    { id:3,  location:'관리동 경영지원',             type:'ABC분말 3.3kg',  mfgYm:'2024.08', status:'정상', manager:'',      note:'' },
    { id:4,  location:'관리동 1층(흡연구역)',        type:'ABC분말 3.3kg',  mfgYm:'2023.01', status:'정상', manager:'',      note:'' },
    { id:5,  location:'목욕탕(남)',                  type:'ABC분말 3.3kg',  mfgYm:'2018.05', status:'정상', manager:'',      note:'' },
    { id:6,  location:'목욕탕(여)',                  type:'ABC분말 3.3kg',  mfgYm:'2018.05', status:'정상', manager:'',      note:'' },
    { id:7,  location:'복지동 입구(1)',              type:'ABC분말 4.5kg',  mfgYm:'2020.01', status:'정상', manager:'',      note:'' },
    { id:8,  location:'복지동 입구(2)',              type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',      note:'' },
    { id:9,  location:'복지동(흡연구역)',             type:'ABC분말 3.3kg',  mfgYm:'2017.03', status:'정상', manager:'',      note:'' },
    { id:10, location:'식당 홀(1)',                  type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',      note:'' },
    { id:11, location:'식당 홀(2)',                  type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',      note:'' },
    { id:12, location:'식당 주방(1)',                type:'하론 3kg',        mfgYm:'1999.01', status:'정상', manager:'',      note:'' },
    { id:13, location:'식당 주방(2)',                type:'하론 3kg',        mfgYm:'1999.01', status:'정상', manager:'',      note:'' },
    { id:14, location:'식당 주방(3)',                type:'자동확산 3kg',    mfgYm:'2021.02', status:'정상', manager:'',      note:'' },
    { id:15, location:'식당 주방(4)',                type:'자동확산 3kg',    mfgYm:'2021.02', status:'정상', manager:'',      note:'눈금 확인 안됨' },
    { id:16, location:'식당 주방(5)',                type:'K급(4L) 7.5kg',  mfgYm:'2017.07', status:'정상', manager:'',      note:'' },
    { id:17, location:'복지동 회의실 1층',           type:'ABC분말 3.3kg',  mfgYm:'2017.03', status:'정상', manager:'',      note:'' },
    { id:18, location:'복지동 2층 지회 사무실',      type:'ABC분말 3.3kg',  mfgYm:'2017.03', status:'정상', manager:'',      note:'' },
    { id:19, location:'경비실(1)',                   type:'ABC분말 3.3kg',  mfgYm:'2023.01', status:'정상', manager:'',      note:'' },
    { id:20, location:'경비실(2)',                   type:'ABC분말 3.3kg',  mfgYm:'2023.01', status:'정상', manager:'',      note:'' },

    // ── 생산지원본부_구매파트 ──────────────────────────────────
    { id:21,  location:'구매파트 사무실',                   type:'ABC분말 3.3kg',  mfgYm:'2025.08', status:'정상', manager:'정운영',       note:'' },
    { id:22,  location:'구매 창고(목욕탕건물)',              type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },

    // ── 안전관리본부_영업관리팀 ────────────────────────────────
    { id:23,  location:'물류파트 사무실',                   type:'ABC분말 4.5kg',  mfgYm:'2019.04', status:'정상', manager:'성동욱',       note:'' },
    { id:24,  location:'물류파트 흡연구역',                  type:'ABC분말 3.3kg',  mfgYm:'2023.01', status:'정상', manager:'',            note:'' },

    // ── 안전관리본부_안전환경파트 ──────────────────────────────
    { id:25,  location:'안전환경파트 사무실',                type:'ABC분말 4.5kg',  mfgYm:'2019.04', status:'정상', manager:'박영훈',       note:'' },
    { id:26,  location:'기사 휴게실(관리동 아래)',           type:'ABC분말 4.5kg',  mfgYm:'2022.07', status:'정상', manager:'',            note:'' },
    { id:27,  location:'안전환경파트 흡연구역',              type:'ABC분말 3.3kg',  mfgYm:'2024.02', status:'정상', manager:'',            note:'' },

    // ── 안전관리본부_품질관리 ──────────────────────────────────
    { id:28,  location:'실험실(전기로옆)',                   type:'ABC분말 4.5kg',  mfgYm:'2020.01', status:'정상', manager:'우재웅',       note:'' },
    { id:29,  location:'실험실(XRF 실)',                    type:'',               mfgYm:'',        status:'정상', manager:'',            note:'10년초과 교체준비중' },
    { id:30,  location:'실험실(회의실 통로 문옆)',           type:'ABC분말 4.5kg',  mfgYm:'2020.01', status:'정상', manager:'',            note:'' },

    // ── 생산관리본부_공무파트_장비 ─────────────────────────────
    { id:31,  location:'장비분임 대기실',                   type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'김수재',       note:'' },
    { id:32,  location:'장비분임 대기실',                   type:'ABC분말 3.3kg',  mfgYm:'2022.04', status:'정상', manager:'',            note:'' },

    // ── 생산관리본부_비료생산파트_수산화칼슘 ──────────────────
    { id:33,  location:'수산화칼슘 운전실(2)',               type:'ABC분말 4.5kg',  mfgYm:'2020.01', status:'정상', manager:'원훈희 / 이주현', note:'폐기 필요' },
    { id:34,  location:'수산화칼슘 D/M 전기히터 하부(1)',    type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },
    { id:35,  location:'수산화칼슘 D/M 전기히터 하부(2)',    type:'ABC분말 20kg',   mfgYm:'2021.03', status:'정상', manager:'',            note:'' },
    { id:36,  location:'입상 수산화칼슘 1층',               type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:37,  location:'입상 수산화칼슘 2층',               type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:38,  location:'수산화칼슘 제품 포장실(1)',          type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:39,  location:'수산화칼슘 제품 포장실(2)',          type:'ABC분말 20kg',   mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:40,  location:'LPG저장소(1)',                      type:'ABC분말 3.3kg',  mfgYm:'2018.04', status:'정상', manager:'',            note:'' },
    { id:41,  location:'LPG저장소(2)',                      type:'ABC분말 3.3kg',  mfgYm:'2018.04', status:'정상', manager:'',            note:'' },
    { id:42,  location:'LPG저장소(3)',                      type:'ABC분말 20kg',   mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:43,  location:'LPG저장소(4)',                      type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:44,  location:'LPG저장소(5)',                      type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:45,  location:'LPG저장소(6)',                      type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:46,  location:'LPG저장소(7)',                      type:'ABC분말 20kg',   mfgYm:'2018.09', status:'정상', manager:'',            note:'' },

    // ── 생산관리본부_비료생산파트_고토 ────────────────────────
    { id:47,  location:'고토 운전실',                       type:'ABC분말 3.3kg',  mfgYm:'2018.05', status:'정상', manager:'원훈희 / 이주현', note:'' },
    { id:48,  location:'고토 작업장(1)',                    type:'ABC분말 3.3kg',  mfgYm:'2018.05', status:'정상', manager:'',            note:'' },
    { id:49,  location:'고토 작업장(2)',                    type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:50,  location:'고토 작업장(3)',                    type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:51,  location:'고토 작업장(4)',                    type:'ABC분말 20kg',   mfgYm:'2019.06', status:'정상', manager:'',            note:'' },
    { id:52,  location:'생분포장라인(고토)',                  type:'ABC분말 4.5kg',  mfgYm:'2019.04', status:'정상', manager:'',            note:'' },

    // ── 생산팀_출하관리파트 ────────────────────────────────────
    { id:53,  location:'제품관리 사무실',                   type:'ABC분말 4.5kg',  mfgYm:'2019.04', status:'정상', manager:'원훈희 / 김천일', note:'' },
    { id:54,  location:'대기실(男)',                        type:'ABC분말 4.5kg',  mfgYm:'2020.01', status:'정상', manager:'',            note:'' },
    { id:55,  location:'대기실(女)',                        type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:56,  location:'BK 상차 운전실',                   type:'ABC분말 3.3kg',  mfgYm:'2020.02', status:'정상', manager:'',            note:'' },
    { id:57,  location:'여자 휴게실(관리동 아래)',           type:'ABC분말 4.5kg',  mfgYm:'2027.07', status:'정상', manager:'',            note:'' },
    { id:58,  location:'호이스트 창고',                     type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },
    { id:59,  location:'BKC150e창고',                      type:'ABC분말 3.3kg',  mfgYm:'2020.02', status:'정상', manager:'',            note:'' },
    { id:60,  location:'생분포장라인(출하)',                  type:'ABC분말 4.5kg',  mfgYm:'2019.04', status:'정상', manager:'',            note:'' },
    { id:61,  location:'Bag 보수장',                        type:'ABC분말 4.5kg',  mfgYm:'2020.01', status:'정상', manager:'',            note:'' },
    { id:62,  location:'회전로 대기실(1)',                   type:'ABC분말 3.3kg',  mfgYm:'2022.04', status:'정상', manager:'',            note:'' },
    { id:63,  location:'회전로 대기실(2)',                   type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:64,  location:'회전로 대기실(3)',                   type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },

    // ── 생산팀_생산1파트 ───────────────────────────────────────
    { id:65,  location:'AK 로정(1)',                        type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'김기택',       note:'' },
    { id:66,  location:'AK 로정(2)',                        type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:67,  location:'AK 배광기 1호',                    type:'ABC분말 20kg',   mfgYm:'2017.04', status:'정상', manager:'',            note:'' },
    { id:68,  location:'AK 배광기 2호',                    type:'ABC분말 20kg',   mfgYm:'2019.06', status:'정상', manager:'',            note:'' },
    { id:69,  location:'AK 배광기 중앙(1)',                 type:'ABC분말 20kg',   mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:70,  location:'AK 배광기 중앙(2)',                 type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:71,  location:'AK 배광기 중앙(3)',                 type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:72,  location:'BKLS 로상부 services tank',         type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:73,  location:'BKLS 로정',                        type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:74,  location:'BKLS 하부 소성대',                  type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:75,  location:'BKLS J10(1)',                       type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },
    { id:76,  location:'BKLS J10(2)',                       type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:77,  location:'BKLS J10(3)',                       type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:78,  location:'BK300 상부연소실(1)',               type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:79,  location:'BK300 상부연소실(2)',               type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:80,  location:'BK300 상부연소실(3)',               type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:81,  location:'BK300 하부연소실(1)',               type:'ABC분말 3.3kg',  mfgYm:'2022.04', status:'정상', manager:'',            note:'' },
    { id:82,  location:'BK300 하부연소실(2)',               type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:83,  location:'BK300 하부연소실(3)',               type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:84,  location:'BK300 FAN ROOM(1)',                 type:'ABC분말 20kg',   mfgYm:'2021.03', status:'정상', manager:'',            note:'' },
    { id:85,  location:'BK300 FAN ROOM(2)',                 type:'ABC분말 20kg',   mfgYm:'2019.11', status:'정상', manager:'',            note:'' },
    { id:86,  location:'BK300 FAN ROOM(3) H7',             type:'ABC분말 20kg',   mfgYm:'2019.06', status:'정상', manager:'',            note:'' },
    { id:87,  location:'BK300 MCC(1)',                      type:'CO2 6.8kg',      mfgYm:'2019.11', status:'정상', manager:'',            note:'' },
    { id:88,  location:'BK300 MCC(2)',                      type:'ABC분말 3.3kg',  mfgYm:'2018.05', status:'정상', manager:'',            note:'' },
    { id:89,  location:'BK300 MCC(3)',                      type:'ABC분말 3.3kg',  mfgYm:'2021.03', status:'정상', manager:'',            note:'' },
    { id:90,  location:'BK300 DOSING(1)',                   type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:91,  location:'BK300 DOSING(2)',                   type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:92,  location:'OIL PUMP 장(1)',                    type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:93,  location:'OIL PUMP 장(2)',                    type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'',            note:'' },
    { id:94,  location:'OIL PUMP 장(3)',                    type:'ABC분말 3.3kg',  mfgYm:'2019.10', status:'정상', manager:'',            note:'' },
    { id:95,  location:'OIL PUMP 장(4)',                    type:'ABC분말 3.3kg',  mfgYm:'2019.10', status:'정상', manager:'',            note:'' },
    { id:96,  location:'OIL PUMP 장(5)',                    type:'ABC분말 3.3kg',  mfgYm:'2019.10', status:'정상', manager:'',            note:'' },
    { id:97,  location:'경유보일러실(1)',                    type:'ABC분말 4.5kg',  mfgYm:'2019.11', status:'정상', manager:'',            note:'' },
    { id:98,  location:'경유보일러실(2)',                    type:'ABC분말 3.3kg',  mfgYm:'2019.10', status:'정상', manager:'',            note:'오타보정: 2109.10→2019.10' },
    { id:99,  location:'경유보일러실(3)',                    type:'ABC분말 3.3kg',  mfgYm:'2019.08', status:'정상', manager:'',            note:'' },
    { id:100, location:'경유보일러실(4)',                    type:'ABC분말 20kg',   mfgYm:'2017.04', status:'정상', manager:'',            note:'' },
    { id:101, location:'정제유 탱크(1)',                     type:'ABC분말 20kg',   mfgYm:'2019.11', status:'정상', manager:'',            note:'' },
    { id:102, location:'정제유 탱크(2)',                     type:'ABC분말 20kg',   mfgYm:'2019.11', status:'정상', manager:'',            note:'' },
    { id:103, location:'정제유 탱크(3)',                     type:'ABC분말 3.3kg',  mfgYm:'2021.03', status:'정상', manager:'',            note:'' },
    { id:104, location:'정제유 탱크(4)',                     type:'ABC분말 3.3kg',  mfgYm:'2021.03', status:'정상', manager:'',            note:'' },
    { id:105, location:'정제유 탱크(5)',                     type:'ABC분말 3.3kg',  mfgYm:'2018.05', status:'정상', manager:'',            note:'' },
    { id:106, location:'BK 운전실(1)',                      type:'ABC분말 4.5kg',  mfgYm:'2016.05', status:'정상', manager:'',            note:'' },
    { id:107, location:'BK 운전실(2)',                      type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:108, location:'BK 운전실 MCC룸(CO2)',              type:'CO2 23kg',       mfgYm:'2021.03', status:'정상', manager:'',            note:'' },
    { id:109, location:'BK 운전실 MCC룸(ABC)',              type:'ABC분말 3.3kg',  mfgYm:'2021.03', status:'정상', manager:'',            note:'' },
    { id:110, location:'BK 창고(흡연실)',                   type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:111, location:'MILL I/C실',                        type:'ABC분말 20kg',   mfgYm:'2019.11', status:'정상', manager:'',            note:'' },
    { id:112, location:'MILL 운전실(1)',                    type:'ABC분말 4.5kg',  mfgYm:'2019.04', status:'정상', manager:'',            note:'' },
    { id:113, location:'MILL 운전실(2)',                    type:'ABC분말 4.5kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:114, location:'ALC MILL(1)',                       type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },
    { id:115, location:'ALC MILL(2)',                       type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },
    { id:116, location:'ALC MILL(3)',                       type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },

    // ── 생산팀_생산2파트 ───────────────────────────────────────
    { id:117, location:'SK운전실(1)',                        type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'김진홍 / 오성호', note:'' },
    { id:118, location:'SK운전실(2)',                        type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:119, location:'SK 흡연구역',                        type:'ABC분말 3.3kg',  mfgYm:'2023.01', status:'정상', manager:'',            note:'' },
    { id:120, location:'SK통합운전실(1)',                    type:'ABC분말 4.5kg',  mfgYm:'2020.01', status:'정상', manager:'',            note:'' },
    { id:121, location:'SK통합운전실(2)',                    type:'ABC분말 4.5kg',  mfgYm:'2024.02', status:'정상', manager:'',            note:'' },
    { id:122, location:'SK통합운전실(3)',                    type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:123, location:'L/M운전실(1)',                       type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:124, location:'L/M운전실(2)',                       type:'ABC분말 20kg',   mfgYm:'2017.04', status:'정상', manager:'',            note:'' },
    { id:125, location:'B/M운전실(1)',                       type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:126, location:'B/M운전실(2)',                       type:'ABC분말 3.3kg',  mfgYm:'2019.05', status:'정상', manager:'',            note:'' },
    { id:127, location:'L/M현장(1)',                         type:'ABC분말 20kg',   mfgYm:'2019.06', status:'정상', manager:'',            note:'' },
    { id:128, location:'L/M현장(2)',                         type:'ABC분말 20kg',   mfgYm:'2019.06', status:'정상', manager:'',            note:'' },
    { id:129, location:'6-9호 대기실(1)',                    type:'ABC분말 20kg',   mfgYm:'2022.04', status:'정상', manager:'',            note:'' },
    { id:130, location:'6-9호 대기실(2)',                    type:'ABC분말 20kg',   mfgYm:'2022.04', status:'정상', manager:'',            note:'' },
    { id:131, location:'6-9호 대기실(3)',                    type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:132, location:'6-9호 대기실(4)',                    type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:133, location:'6-9호 대기실(5)',                    type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:134, location:'6-9호 대기실(6)',                    type:'ABC분말 4.5kg',  mfgYm:'2022.03', status:'정상', manager:'',            note:'' },
    { id:135, location:'SK MCC판넬(1)',                      type:'CO2 23kg',       mfgYm:'2008.04', status:'정상', manager:'',            note:'' },
    { id:136, location:'SK MCC판넬(2)',                      type:'CO2 23kg',       mfgYm:'2009.12', status:'정상', manager:'',            note:'' },
    { id:137, location:'SK 3-9호 무연탄 저장창고(1)',        type:'ABC분말 3.3kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:138, location:'SK 3-9호 무연탄 저장창고(2)',        type:'ABC분말 3.3kg',  mfgYm:'2017.03', status:'정상', manager:'',            note:'' },
    { id:139, location:'SK 6-9호 무연탄 저장창고',           type:'ABC분말 4.5kg',  mfgYm:'2020.01', status:'정상', manager:'',            note:'' },
    { id:140, location:'RK운전실(1)',                        type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },
    { id:141, location:'RK운전실(2)',                        type:'ABC분말 4.5kg',  mfgYm:'2021.02', status:'정상', manager:'',            note:'' },
    { id:142, location:'RK 하부(1)',                         type:'ABC분말 3.3kg',  mfgYm:'2022.04', status:'정상', manager:'',            note:'' },
    { id:143, location:'RK 하부(2)',                         type:'ABC분말 3.3kg',  mfgYm:'2022.04', status:'정상', manager:'',            note:'' },
    { id:144, location:'정제유 탱크(6)',                     type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:145, location:'정제유 탱크(7)',                     type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:146, location:'정제유 탱크(8)',                     type:'ABC분말 20kg',   mfgYm:'2015.08', status:'정상', manager:'',            note:'' },
    { id:147, location:'RK 원석 LINE 현장',                  type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:148, location:'소석회1층운전실(1)',                  type:'ABC분말 3.3kg',  mfgYm:'2015.10', status:'정상', manager:'김진홍 / 문영철', note:'' },
    { id:149, location:'소석회1층운전실(2)',                  type:'ABC분말 3.3kg',  mfgYm:'2022.11', status:'정상', manager:'',            note:'' },
    { id:150, location:'소석회 흡연구역',                    type:'ABC분말 3.3kg',  mfgYm:'2023.01', status:'정상', manager:'',            note:'' },
    { id:151, location:'인젝션 운전실',                      type:'ABC분말 3.3kg',  mfgYm:'2018.05', status:'정상', manager:'',            note:'' },
    { id:152, location:'고반응소석회 운전실(1)',              type:'ABC분말 3.3kg',  mfgYm:'2018.05', status:'정상', manager:'',            note:'' },
    { id:153, location:'고반응소석회 운전실(2)',              type:'ABC분말 3.3kg',  mfgYm:'2022.04', status:'정상', manager:'',            note:'' },
    { id:154, location:'소석회2층운전실',                    type:'ABC분말 3.3kg',  mfgYm:'2022.04', status:'정상', manager:'',            note:'' },
    { id:155, location:'과립 포장실(로봇 운전실)',            type:'ABC분말 3.3kg',  mfgYm:'2021.03', status:'정상', manager:'',            note:'' },
    { id:156, location:'A동 콤프레샤실',                     type:'ABC분말 3.3kg',  mfgYm:'2019.05', status:'정상', manager:'',            note:'' },
  ];

  // ═══════════════════════════════════════════════════════════════
  //  유틸리티 함수
  // ═══════════════════════════════════════════════════════════════

  /** YYYY.MM → Date (해당 월 1일) */
  function parseYm(ym) {
    if (!ym) return null;
    const [y, m] = ym.split('.');
    if (!y || !m) return null;
    return new Date(parseInt(y), parseInt(m) - 1, 1);
  }

  /** 제조년월로부터 경과 개월 수 */
  function monthsElapsed(ym) {
    const d = parseYm(ym);
    if (!d) return 0;
    const now = new Date();
    return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  }

  /** 마지막 점검일로부터 경과 일 수 */
  function daysElapsed(dateStr) {
    if (!dateStr) return 9999;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / 86400000);
  }

  /** 표시용 상태 계산 */
  function calcDisplayStatus(item) {
    // 1순위: 제조 10년 초과 → 교체대상
    const mo = monthsElapsed(item.mfgYm);
    if (mo >= REPLACE_MONTHS) return 'replace';
    // 2순위: 점검 결과 비정상 항목 존재 → 불량
    if (item.defect === true) return 'defect';
    // 3순위: 최근 점검일 30일 이내 → 양호
    const days = daysElapsed(item.lastInspectionDate);
    if (days < INSPECT_DAYS) return 'good';
    // 4순위: 30일 초과 또는 미점검 → 점검 필요
    return 'check';
  }

  /** 오늘 기준 랜덤 날짜(0~60일 전) 생성 */
  /** 제조년월(YYYY.MM)에서 10년 후 교체년월 계산 */
  function calcReplaceYm(mfgYm) {
    if (!mfgYm) return '-';
    const parts = mfgYm.split('.');
    if (parts.length < 2) return '-';
    const year = parseInt(parts[0], 10);
    if (isNaN(year)) return '-';
    return (year + 10) + '.' + parts[1];
  }

  function randomRecentDate() {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * 60));
    return d.toISOString().slice(0, 10);
  }

  /** localStorage 초기화 (최초 1회) */
  function initStorage() {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      try { return JSON.parse(existing); } catch { /* fall through */ }
    }
    const seeded = INITIAL_DATA.map(item => ({
      ...item,
      lastInspectionDate: randomRecentDate(),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  function saveStorage(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ═══════════════════════════════════════════════════════════════
  //  백엔드 연동용 빈 함수 (나중에 Spring Boot API 호출로 교체)
  // ═══════════════════════════════════════════════════════════════
  const API = {
    async fetchAll()          { return null; /* TODO: GET /api/extinguishers */ },
    async createItem(item)    { return null; /* TODO: POST /api/extinguishers */ },
    async updateItem(id,item) { return null; /* TODO: PUT /api/extinguishers/{id} */ },
    async deleteItem(id)      { return null; /* TODO: DELETE /api/extinguishers/{id} */ },
  };

  // ═══════════════════════════════════════════════════════════════
  //  StatusBadge 컴포넌트
  // ═══════════════════════════════════════════════════════════════
  function StatusBadge({ item }) {
    const st = calcDisplayStatus(item);
    if (st === 'replace') return <span className="badge badge-replace"><i className="fas fa-triangle-exclamation mr-1"></i>교체대상</span>;
    if (st === 'defect')  return <span className="badge badge-defect"><i className="fas fa-circle-xmark mr-1"></i>불량</span>;
    if (st === 'check')   return <span className="badge badge-check"><i className="fas fa-clock mr-1"></i>점검 필요</span>;
    return <span className="badge badge-good"><i className="fas fa-circle-check mr-1"></i>양호</span>;
  }

  // ═══════════════════════════════════════════════════════════════
  //  요약 카드
  // ═══════════════════════════════════════════════════════════════
  function SummaryCards({ items, activeFilter, onFilterChange }) {
    const total   = items.length;
    const replace = items.filter(i => calcDisplayStatus(i) === 'replace').length;
    const defect  = items.filter(i => calcDisplayStatus(i) === 'defect').length;
    const check   = items.filter(i => calcDisplayStatus(i) === 'check').length;
    const good    = total - replace - defect - check;

    const cards = [
      { label:'전체 소화기', value:total,   icon:'fa-fire-extinguisher',   filterKey:'all',     color:'from-blue-600 to-blue-800',       ring:'ring-blue-400',    textColor:'text-blue-200',   valueColor:'text-white' },
      { label:'양호',        value:good,    icon:'fa-circle-check',         filterKey:'good',    color:'from-emerald-600 to-emerald-800', ring:'ring-emerald-400', textColor:'text-emerald-200', valueColor:'text-white' },
      { label:'점검 필요',   value:check,   icon:'fa-clock',                filterKey:'check',   color:'from-amber-600 to-amber-800',     ring:'ring-amber-400',   textColor:'text-amber-200',  valueColor:'text-white' },
      { label:'불량',        value:defect,  icon:'fa-circle-xmark',         filterKey:'defect',  color:'from-purple-700 to-purple-900',   ring:'ring-purple-400',  textColor:'text-purple-200', valueColor:'text-white' },
      { label:'교체 대상',   value:replace, icon:'fa-triangle-exclamation', filterKey:'replace', color:'from-red-700 to-red-900',         ring:'ring-red-400',     textColor:'text-red-200',    valueColor:'text-white' },
    ];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {cards.map((c, i) => {
          const isActive = activeFilter === c.filterKey;
          return (
            <div
              key={i}
              onClick={() => onFilterChange(c.filterKey)}
              className={
                "rounded-xl p-5 bg-gradient-to-br shadow-lg animate-in "
                + c.color
                + " cursor-pointer select-none transition-all duration-200 "
                + "hover:opacity-90 hover:-translate-y-1 hover:shadow-xl "
                + (isActive ? "ring-2 ring-offset-2 ring-offset-white " + c.ring : "")
              }
              style={{animationDelay: i*0.07+'s'}}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={"text-sm font-medium " + c.textColor}>{c.label}</span>
                <i className={"fas " + c.icon + " text-lg opacity-70 " + c.textColor}></i>
              </div>
              <div className={"text-3xl font-bold " + c.valueColor}>
                {c.value}<span className="text-base font-normal ml-1 opacity-70">개</span>
              </div>
              {isActive && (
                <div className={"text-xs mt-2 font-medium opacity-80 " + c.textColor}>
                  <i className="fas fa-filter mr-1"></i>필터 적용 중
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  편집 모달
  // ═══════════════════════════════════════════════════════════════
  function EditModal({ item, onSave, onClose }) {
    const isNew = !item.id;
    const [form, setForm] = useState({
      location: item.location || '',
      type:     item.type     || '',
      mfgYm:    item.mfgYm    || '',
      status:   item.status   || '정상',
      manager:  item.manager  || '',
      note:     item.note     || '',
      lastInspectionDate: item.lastInspectionDate || new Date().toISOString().slice(0,10),
    });

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    function handleSubmit(e) {
      e.preventDefault();
      if (!form.location.trim()) { alert('설치 위치를 입력하세요.'); return; }
      if (!form.type.trim())     { alert('소화기 종류를 입력하세요.'); return; }
      if (!form.mfgYm.match(/^\\d{4}\\.\\d{2}$/)) { alert('제조년월을 YYYY.MM 형식으로 입력하세요.'); return; }
      onSave(form);
    }

    const fields = [
      { label:'설치 위치 *', key:'location', type:'text', placeholder:'예) 관리동 1층(현관)' },
      { label:'소화기 종류 *', key:'type',  type:'text', placeholder:'예) ABC분말 3.3kg' },
      { label:'제조년월 * (YYYY.MM)', key:'mfgYm', type:'text', placeholder:'예) 2023.06' },
      { label:'담당자', key:'manager', type:'text', placeholder:'예) 홍길동' },
      { label:'최근 점검일', key:'lastInspectionDate', type:'date', placeholder:'' },
    ];

    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal-box animate-in">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-800">
              <i className={"fas " + (isNew ? "fa-plus-circle text-blue-500" : "fa-pen-to-square text-amber-500") + " mr-2"}></i>
              {isNew ? '소화기 추가' : '소화기 정보 수정'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition text-xl"><i className="fas fa-xmark"></i></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                  placeholder={f.placeholder} className="w-full" />
              </div>
            ))}
            <div>
              <label className="block text-xs text-gray-500 mb-1">비고</label>
              <textarea value={form.note} onChange={e => set('note', e.target.value)}
                rows={2} className="w-full resize-none" placeholder="특이사항 입력" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg transition">
                <i className="fas fa-check mr-2"></i>{isNew ? '추가' : '저장'}
              </button>
              <button type="button" onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg border border-gray-300 transition">
                취소
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  삭제 확인 모달
  // ═══════════════════════════════════════════════════════════════
  function DeleteModal({ item, onConfirm, onClose }) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal-box animate-in" style={{maxWidth:360}}>
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-trash text-red-500 text-xl"></i>
            </div>
            <p className="text-gray-800 font-semibold text-base mb-1">소화기를 삭제할까요?</p>
            <p className="text-gray-500 text-sm">"{item.location}" 항목이 영구 삭제됩니다.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 rounded-lg transition">
              <i className="fas fa-trash mr-2"></i>삭제
            </button>
            <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg border border-gray-300 transition">취소</button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  점검 체크리스트 모달
  // ═══════════════════════════════════════════════════════════════
  const CHECK_ITEMS = [
    { key: 'pin',      label: '안전핀 및 봉인 상태 확인' },
    { key: 'gauge',    label: '압력계(게이지) 정상 범위 확인' },
    { key: 'hose',     label: '호스 및 노즐 파손 여부 확인' },
    { key: 'body',     label: '본체 부식, 변형, 누출 여부 확인' },
  ];

  function InspectModal({ item, onComplete, onClose }) {
    // 각 항목의 결과: true = 정상, false = 비정상
    const [results, setResults] = useState(
      Object.fromEntries(CHECK_ITEMS.map(c => [c.key, true]))
    );

    const hasDefect = Object.values(results).some(v => v === false);

    function handleSubmit() {
      onComplete(item.id, hasDefect);
    }

    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal-box animate-in">
          {/* 헤더 */}
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <i className="fas fa-clipboard-check text-blue-500"></i>
                소화기 점검
              </h2>
              <p className="text-gray-500 text-xs mt-1">
                항목별로 정상 여부를 선택하면 점검 결과가 자동으로 갱신됩니다.
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition text-xl ml-4 mt-0.5">
              <i className="fas fa-xmark"></i>
            </button>
          </div>

          {/* 소화기 정보 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-5 mt-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shrink-0">
              <i className="fas fa-fire-extinguisher text-white text-sm"></i>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-800">{item.location || '-'}</div>
              <div className="text-xs text-gray-500">{item.type || '-'} &nbsp;·&nbsp; 제조 {item.mfgYm || '-'} &nbsp;·&nbsp; BK-FE-{String(item.id).padStart(3,'0')}</div>
            </div>
          </div>

          {/* 점검 항목 */}
          <div className="space-y-3 mb-6">
            {CHECK_ITEMS.map((ci, idx) => (
              <div key={ci.key}
                className={"rounded-lg border px-4 py-3 flex items-center justify-between transition-colors "
                  + (results[ci.key] === false
                    ? "border-red-300 bg-red-50"
                    : "border-gray-200 bg-gray-50")}>
                <div className="flex items-center gap-2.5">
                  <span className={"w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 "
                    + (results[ci.key] === false ? "bg-red-500 text-white" : "bg-gray-200 text-gray-600")}>
                    {idx + 1}
                  </span>
                  <span className={"text-sm " + (results[ci.key] === false ? "text-red-600" : "text-gray-700")}>
                    {ci.label}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0 ml-3">
                  <label className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer border text-xs font-semibold transition-colors "
                    + (results[ci.key] === true
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-gray-100 border-gray-300 text-gray-500 hover:border-emerald-500")}>
                    <input type="radio" name={ci.key} className="hidden"
                      checked={results[ci.key] === true}
                      onChange={() => setResults(r => ({...r, [ci.key]: true}))} />
                    <i className="fas fa-circle-check"></i> 정상
                  </label>
                  <label className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer border text-xs font-semibold transition-colors "
                    + (results[ci.key] === false
                      ? "bg-red-600 border-red-500 text-white"
                      : "bg-gray-100 border-gray-300 text-gray-500 hover:border-red-400")}>
                    <input type="radio" name={ci.key} className="hidden"
                      checked={results[ci.key] === false}
                      onChange={() => setResults(r => ({...r, [ci.key]: false}))} />
                    <i className="fas fa-circle-xmark"></i> 비정상
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* 결과 요약 */}
          <div className={"rounded-lg px-4 py-3 mb-5 flex items-center gap-2 text-sm font-medium "
            + (hasDefect ? "bg-red-900/50 text-red-300 border border-red-700" : "bg-emerald-900/40 text-emerald-300 border border-emerald-700")}>
            <i className={"fas " + (hasDefect ? "fa-triangle-exclamation" : "fa-circle-check")}></i>
            {hasDefect
              ? '비정상 항목이 있습니다. 점검 완료 시 불량으로 기록됩니다.'
              : '모든 항목 정상 — 점검 완료 시 양호로 갱신됩니다.'}
          </div>

          {/* 버튼 */}
          <div className="flex gap-3">
            <button onClick={handleSubmit}
              className={"flex-1 font-semibold py-2.5 rounded-lg transition text-white "
                + (hasDefect ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500")}>
              <i className={"fas mr-2 " + (hasDefect ? "fa-triangle-exclamation" : "fa-clipboard-check")}></i>
              점검 완료
            </button>
            <button onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg border border-gray-300 transition">
              취소
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  메인 앱
  // ═══════════════════════════════════════════════════════════════
  function App() {
    const [items,       setItems]       = useState([]);
    const [search,      setSearch]      = useState('');
    const [filter,      setFilter]      = useState('all');  // all | good | replace | check | defect
    const [editItem,    setEditItem]    = useState(null);
    const [delItem,     setDelItem]     = useState(null);
    const [inspectItem, setInspectItem] = useState(null);
    const [activeTab,   setActiveTab]   = useState('extinguisher'); // extinguisher | bagfilter | hazard
    const [toast,       setToast]       = useState(null);

    const TABS = [
      { key: 'extinguisher', label: '소화기',         icon: 'fa-fire-extinguisher' },
      { key: 'bagfilter',    label: '백필터',          icon: 'fa-wind' },
      { key: 'hazard',       label: '유해위험기계기구', icon: 'fa-gear' },
    ];

    // 초기 로드
    useEffect(() => { setItems(initStorage()); }, []);

    // 토스트
    const showToast = useCallback((msg, type='success') => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 2800);
    }, []);

    // 필터 + 검색
    const filtered = useMemo(() => {
      return items.filter(item => {
        const st = calcDisplayStatus(item);
        // 상태 필터 (defect 포함 모든 탭 정확히 매칭)
        if (filter !== 'all' && st !== filter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (item.location||'').toLowerCase().includes(q)
            || (item.type||'').toLowerCase().includes(q)
            || (item.manager||'').toLowerCase().includes(q)
            || (item.note||'').toLowerCase().includes(q);
      });
    }, [items, search, filter]);

    // CRUD
    function handleAdd() {
      setEditItem({});
    }

    function handleEdit(item) {
      setEditItem(item);
    }

    function handleSave(form) {
      let updated;
      if (!editItem.id) {
        // 신규
        const newId = Math.max(0, ...items.map(i => i.id)) + 1;
        const newItem = { ...form, id: newId };
        updated = [...items, newItem];
        showToast('소화기가 추가되었습니다.', 'success');
      } else {
        // 수정
        updated = items.map(i => i.id === editItem.id ? { ...i, ...form } : i);
        showToast('수정되었습니다.', 'success');
      }
      saveStorage(updated);
      setItems(updated);
      setEditItem(null);
      API.createItem(form); // Spring Boot 연동 시 교체
    }

    function handleDelete(item) {
      setDelItem(item);
    }

    function confirmDelete() {
      const updated = items.filter(i => i.id !== delItem.id);
      saveStorage(updated);
      setItems(updated);
      setDelItem(null);
      showToast('삭제되었습니다.', 'error');
    }

    // 점검 완료 처리
    function handleInspectComplete(itemId, hasDefect) {
      const today = new Date().toISOString().slice(0, 10);
      const updated = items.map(i =>
        i.id === itemId
          ? { ...i, lastInspectionDate: today, defect: hasDefect }
          : i
      );
      saveStorage(updated);
      setItems(updated);
      setInspectItem(null);
      showToast(
        hasDefect ? '⚠️ 점검 완료 – 비정상 항목이 기록되었습니다.' : '✅ 점검 완료 – 양호 상태로 갱신되었습니다.',
        hasDefect ? 'error' : 'success'
      );
    }

    function handleReset() {
      if (!confirm('초기 데이터로 리셋하시겠습니까? 현재 데이터가 모두 삭제됩니다.')) return;
      const seeded = INITIAL_DATA.map(item => ({ ...item, lastInspectionDate: randomRecentDate() }));
      saveStorage(seeded);
      setItems(seeded);
      showToast('초기 데이터로 리셋되었습니다.', 'success');
    }

    return (
      <div className="min-h-screen bg-gray-50 text-gray-800">
        {/* ── GNB ── */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
          {/* 1행: 로고 + 시스템명 + 우측 액션 */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            {/* 좌: 로고 */}
            <div className="flex items-center gap-3">
              <a href="/" className="text-gray-400 hover:text-gray-600 transition text-sm">
                <i className="fas fa-arrow-left"></i>
              </a>
              <div className="flex items-center gap-3">
                <img src="/static/tkbk-logo.png" alt="TAEKYUNG BK" className="h-8 object-contain" />
                <span className="hidden sm:block text-gray-300 text-sm">|</span>
                <span className="hidden sm:block text-gray-500 text-xs font-medium">단양1공장 설비관리시스템</span>
              </div>
            </div>
            {/* 우: 액션 버튼 (소화기 탭일 때만) */}
            {activeTab === 'extinguisher' && (
              <div className="flex items-center gap-2">
                <button onClick={handleReset}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 hover:border-gray-400 bg-white px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
                  <i className="fas fa-rotate-left"></i>
                  <span className="hidden sm:inline">초기화</span>
                </button>
                <button onClick={handleAdd}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2 shadow-sm">
                  <i className="fas fa-plus"></i>소화기 추가
                </button>
              </div>
            )}
          </div>
          {/* 2행: 메인 메뉴 탭 */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-end gap-0 border-t border-gray-100">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={
                  "px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap "
                  + (activeTab === tab.key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300")
                }>
                <i className={"fas " + tab.icon + " text-xs"}></i>
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* ── 탭별 본문 ── */}
        {activeTab !== 'extinguisher' ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-gray-400">
            <i className="fas fa-screwdriver-wrench text-5xl opacity-30"></i>
            <p className="text-lg font-medium">준비 중인 화면입니다.</p>
            <p className="text-sm opacity-60">{TABS.find(t=>t.key===activeTab)?.label} 기능은 현재 개발 중입니다.</p>
          </div>
        ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

          {/* 요약 카드 */}
          <SummaryCards items={items} activeFilter={filter} onFilterChange={setFilter} />

          {/* 검색 바 */}
          <div className="flex mb-4">
            <div className="relative flex-1 max-w-md">
              <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="위치, 종류, 담당자 검색..." className="w-full pl-10 pr-4 py-2 text-sm" />
            </div>
          </div>

          {/* 결과 수 */}
          <div className="text-xs text-gray-400 mb-2 ml-1">
            {filtered.length}개 항목
            {(search || filter !== 'all') && <span className="ml-1">(전체 {items.length}개 중 필터)</span>}
          </div>

          {/* 테이블 */}
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-200">
                    <th className="px-4 py-3 text-center w-10 whitespace-nowrap">No.</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">고유 번호</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">설치 위치</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">소화기 종류</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">제조년월</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">교체 년월</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">최근 점검일</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">상태</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">담당자</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">비고</th>
                    <th className="px-4 py-3 text-center w-24 whitespace-nowrap">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-16 text-gray-400">
                        <i className="fas fa-inbox text-3xl mb-3 block opacity-40"></i>
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  ) : filtered.map((item, idx) => {
                    const st      = calcDisplayStatus(item);
                    const mo      = monthsElapsed(item.mfgYm);
                    const isRepl  = st === 'replace';
                    const rowCls  = "table-row border-t border-gray-100 transition-colors " + (isRepl ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50");
                    const cellCls = isRepl ? "text-red-600" : "text-gray-700";
                    return (
                      <tr key={item.id} className={rowCls}>
                        <td className={"px-4 py-3 text-center text-gray-400 text-xs " + (isRepl ? "text-red-500" : "")}>{item.id}</td>
                        <td className={"px-4 py-3 text-center font-mono text-xs " + (isRepl ? "text-red-500" : "text-gray-400")}>
                          {'BK-FE-' + String(item.id).padStart(3, '0')}
                        </td>
                        <td className={"px-4 py-3 font-medium " + (isRepl ? "text-red-600 font-semibold" : "text-gray-900")}>
                          {item.location || '-'}
                        </td>
                        <td className={"px-4 py-3 " + cellCls}>{item.type || '-'}</td>
                        <td className={"px-4 py-3 text-center " + cellCls}>{item.mfgYm || '-'}</td>
                        <td className={"px-4 py-3 text-center font-mono text-xs " + (mo >= REPLACE_MONTHS ? "text-red-600 font-bold" : mo >= 90 ? "text-amber-600" : "text-gray-500")}>
                          {calcReplaceYm(item.mfgYm)}
                        </td>
                        <td className={"px-4 py-3 text-center " + (daysElapsed(item.lastInspectionDate) >= INSPECT_DAYS ? "text-amber-600" : "text-gray-600")}>
                          {item.lastInspectionDate || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge item={item} />
                        </td>
                        <td className={"px-4 py-3 text-center " + cellCls}>{item.manager || <span className="text-gray-400">-</span>}</td>
                        <td className={"px-4 py-3 max-w-[140px] truncate text-xs " + (item.note ? "text-amber-700" : "text-gray-400")}>
                          {item.note || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setInspectItem(item)}
                              className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded transition whitespace-nowrap" title="점검하기">
                              <i className="fas fa-clipboard-check mr-1"></i>점검
                            </button>
                            <button onClick={() => handleEdit(item)}
                              className="text-gray-400 hover:text-amber-500 transition p-1.5 rounded hover:bg-amber-50" title="수정">
                              <i className="fas fa-pen text-xs"></i>
                            </button>
                            <button onClick={() => handleDelete(item)}
                              className="text-gray-400 hover:text-red-500 transition p-1.5 rounded hover:bg-red-50" title="삭제">
                              <i className="fas fa-trash text-xs"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 범례 */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
            <span><i className="fas fa-circle-check text-emerald-400 mr-1"></i>양호: 점검일 30일 미경과 &amp; 제조 120개월 미만</span>
            <span><i className="fas fa-clock text-amber-400 mr-1"></i>점검 필요: 최근 점검일로부터 30일 이상 경과</span>
            <span><i className="fas fa-triangle-exclamation text-red-400 mr-1"></i>교체 대상: 제조 후 120개월(10년) 이상 경과 → 빨간색 강조</span>
          </div>
        </main>
        )} {/* end activeTab === 'extinguisher' */}

        {/* 모달 */}
        {editItem !== null && (
          <EditModal item={editItem} onSave={handleSave} onClose={() => setEditItem(null)} />
        )}
        {delItem && (
          <DeleteModal item={delItem} onConfirm={confirmDelete} onClose={() => setDelItem(null)} />
        )}
        {inspectItem && (
          <InspectModal item={inspectItem} onComplete={handleInspectComplete} onClose={() => setInspectItem(null)} />
        )}

        {/* 토스트 */}
        {toast && (
          <div className={"fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-2 animate-in z-50 " +
            (toast.type === 'success' ? "bg-emerald-700 text-white" : "bg-red-700 text-white")}>
            <i className={"fas " + (toast.type === 'success' ? "fa-circle-check" : "fa-circle-xmark")}></i>
            {toast.msg}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  마운트
  // ═══════════════════════════════════════════════════════════════
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
  </script>
</body>
</html>`)
})

export default app
