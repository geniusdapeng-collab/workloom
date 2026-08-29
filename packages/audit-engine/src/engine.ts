/**
 * 引擎编排：runFastScan（获客全链路版）
 * 纪律（fast-scan SKILL.md 四）：
 *  - 时间纪律：软预算默认 30 分钟，逐线检查耗时，超时后剩余线标注 not-covered 出部分报告；
 *  - 降级纪律：某数据源缺失 → 该线标注 not-covered / partial，不阻塞整体；
 *  - 估算透明：所有 Finding 金额必须带 confidence 与计算口径（分析器层已强制）。
 * 输出：一店一份 + 集团总览 + 「流量→转化→成交」链路分组 + 按年化挽回降序 Top10。
 */
import { analyzeChannel } from "./analyzers/channel.js";
import { analyzeFunnel } from "./analyzers/funnel.js";
import { analyzeGeo } from "./analyzers/geo.js";
import { analyzeGrowth } from "./analyzers/growth.js";
import { analyzeInventory } from "./analyzers/inventory.js";
import { analyzePrice } from "./analyzers/price.js";
import { analyzeReputation } from "./analyzers/reputation.js";
import type { AnalyzerContext } from "./analyzers/util.js";
import type {
  AuditLine,
  AuditReport,
  AuditSnapshot,
  ChainStage,
  FastScanOptions,
  Finding,
  HotelReport,
  ImpactPeriod,
  LineCoverage,
  Severity,
} from "./types.js";

/** 线的执行顺序（对齐 SKILL.md 步骤 2→6：酒店运营线 → 获客转化线） */
const LINE_ORDER: readonly AuditLine[] = [
  "hotel_price",
  "hotel_inventory",
  "hotel_channel",
  "hotel_reputation",
  "growth",
  "geo",
  "funnel",
];

const ANALYZERS: Record<AuditLine, (s: AuditSnapshot, ctx: AnalyzerContext) => Finding[]> = {
  hotel_price: analyzePrice,
  hotel_inventory: analyzeInventory,
  hotel_channel: analyzeChannel,
  hotel_reputation: analyzeReputation,
  growth: analyzeGrowth,
  geo: analyzeGeo,
  funnel: analyzeFunnel,
};

/** 默认保底价（R2 口径 ¥380；一店一档缺失时回退并标注） */
export const DEFAULT_FLOOR_PRICE = 380;

/** 线 → 链路环节（报告按「流量→转化→成交」分组） */
export const CHAIN_OF_LINE: Record<AuditLine, ChainStage> = {
  growth: "traffic",
  geo: "traffic",
  funnel: "conversion",
  hotel_price: "deal",
  hotel_inventory: "deal",
  hotel_channel: "deal",
  hotel_reputation: "deal",
};

/**
 * 数据源覆盖度预判：某线所需数据集全空 → not-covered；关键子集缺失 → partial。
 */
function precheckLine(line: AuditLine, s: AuditSnapshot): { coverage: LineCoverage; note?: string } {
  switch (line) {
    case "hotel_price": {
      if (s.channelPrices.length === 0) return { coverage: "not-covered", note: "房价日历源缺失，价格健康线未覆盖" };
      if (s.hotels.every((h) => h.floorPrice === undefined))
        return { coverage: "partial", note: `一店一档保底价未采集，按默认 ¥${DEFAULT_FLOOR_PRICE} 判定（破防子项估算口径）` };
      if (s.holidays.length === 0) return { coverage: "partial", note: "节假日期历缺失，远期日历异常子项降级" };
      return { coverage: "covered" };
    }
    case "hotel_inventory": {
      if (s.roomDays.length === 0) return { coverage: "not-covered", note: "房态源缺失，房态库存健康线未覆盖" };
      if (s.roomDays.every((r) => r.maintenanceRooms === undefined)) return { coverage: "partial", note: "问题房字段未采集，问题房占比/漏售维修判定子项降级" };
      return { coverage: "covered" };
    }
    case "hotel_channel": {
      if (s.channelBills.length === 0 && s.orders.length === 0) return { coverage: "not-covered", note: "渠道账单与订单源均缺失，渠道健康线未覆盖" };
      if (s.channelBills.length === 0) return { coverage: "partial", note: "渠道账单缺失，佣金勾稽子项降级" };
      if (s.orders.length === 0) return { coverage: "partial", note: "订单源缺失，渠道依赖度子项降级" };
      if (s.hotels.every((h) => h.channels.every((c) => c.commissionRate === undefined)))
        return { coverage: "partial", note: "渠道佣金协议比例缺失，佣金勾稽子项降级" };
      return { coverage: "covered" };
    }
    case "hotel_reputation": {
      if (s.reviews.length === 0) return { coverage: "not-covered", note: "评价源缺失，口碑健康线未覆盖" };
      if (s.hotels.every((h) => h.rating === undefined || h.ratingDelta30d === undefined))
        return { coverage: "partial", note: "门店评分/评分趋势未采集，评分下滑子项降级" };
      return { coverage: "covered" };
    }
    case "growth": {
      if (s.accounts.length === 0) return { coverage: "not-covered", note: "社媒账号源缺失，账号与内容健康线未覆盖" };
      if (s.contents.length === 0) return { coverage: "partial", note: "内容数据源缺失，限流/断更/选题子项降级" };
      return { coverage: "covered" };
    }
    case "geo": {
      if (s.geoQueries.length === 0) return { coverage: "not-covered", note: "GEO 能见度快照缺失，GEO 可见度线未覆盖" };
      if (s.geoAssets.length === 0) return { coverage: "partial", note: "GEO 内容资产快照缺失，引用亲和度子项降级" };
      return { coverage: "covered" };
    }
    case "funnel": {
      if (s.accounts.length === 0 && s.directMessages.length === 0 && s.leads.length === 0)
        return { coverage: "not-covered", note: "主页组件/私信/线索源均缺失，转化漏斗线未覆盖" };
      if (s.directMessages.length === 0) return { coverage: "partial", note: "私信快照缺失，私信响应子项降级" };
      if (s.leads.length === 0) return { coverage: "partial", note: "线索漏斗记录缺失，询盘跟进/到店断点子项降级" };
      return { coverage: "covered" };
    }
  }
}

/** 严重度计数器 */
function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { P0: 0, P1: 0, P2: 0 };
  for (const f of findings) c[f.severity] += 1;
  return c;
}

/** 年化折算系数（Top10 按年化挽回排序：monthly ×12，one-off/yearly 原值；LEADS/FANS 同口径原值参与） */
const ANNUALIZE: Record<ImpactPeriod, number> = { "one-off": 1, monthly: 12, yearly: 1 };

function annualized(f: Finding): number {
  const i = f.estimatedImpact;
  return i ? i.amount * ANNUALIZE[i.period] : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const severityRank: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };

/** 排序口径：严重度优先，同年化挽回降序 */
function bySeverityThenImpact(a: Finding, b: Finding): number {
  return severityRank[a.severity] - severityRank[b.severity] || annualized(b) - annualized(a);
}

/**
 * 快速体检主入口：快照 → 双线七分析器 → 报告。
 * 纯函数（除耗时计量）：同一快照 + 同一 now 必得同一报告正文。
 */
export function runFastScan(snapshot: AuditSnapshot, opts: FastScanOptions = {}): AuditReport {
  const startedAt = Date.now();
  const budgetMs = (opts.timeBudgetMinutes ?? 30) * 60_000;
  const ctx: AnalyzerContext = {
    now: opts.now ?? new Date(snapshot.generatedAt),
    floorPriceDefault: opts.floorPriceDefault ?? DEFAULT_FLOOR_PRICE,
  };

  const coverage = {} as Record<AuditLine, LineCoverage>;
  const coverageNotes: string[] = [];
  const allFindings: Finding[] = [];

  for (const line of LINE_ORDER) {
    // 时间纪律：逐线检查软预算，超时后剩余线 not-covered（部分报告仍是有效交付）
    if (Date.now() - startedAt >= budgetMs) {
      coverage[line] = "not-covered";
      coverageNotes.push(`时间预算耗尽（${opts.timeBudgetMinutes ?? 30} 分钟），${line} 线未执行`);
      continue;
    }
    const pre = precheckLine(line, snapshot);
    coverage[line] = pre.coverage;
    if (pre.note) coverageNotes.push(pre.note);
    if (pre.coverage === "not-covered") continue;
    const findings = ANALYZERS[line](snapshot, ctx);
    // 统一编号：FND-<LINE>-<全局序号>（报告可回溯）
    for (const f of findings) {
      f.id = `FND-${line.toUpperCase()}-${String(allFindings.length + 1).padStart(3, "0")}`;
      allFindings.push(f);
    }
  }

  /* ---------- 一店一份 ---------- */
  const byHotel = new Map<string, Finding[]>();
  for (const f of allFindings) {
    const arr = byHotel.get(f.hotelId) ?? [];
    arr.push(f);
    byHotel.set(f.hotelId, arr);
  }
  const sumByUnit = (findings: Finding[]): Record<string, number> => {
    const acc: Record<string, number> = {};
    for (const f of findings) {
      if (!f.estimatedImpact) continue;
      const u = f.estimatedImpact.currency;
      acc[u] = round2((acc[u] ?? 0) + f.estimatedImpact.amount);
    }
    return acc;
  };
  const hotels: HotelReport[] = snapshot.hotels.map((h) => {
    const findings = (byHotel.get(h.hotelId) ?? []).sort(bySeverityThenImpact);
    return {
      hotelId: h.hotelId,
      hotelName: h.hotelName,
      currency: h.currency,
      findings,
      counts: countBySeverity(findings),
      totalRecoverableByUnit: sumByUnit(findings),
    };
  });
  // 有发现但门店不在快照 hotels 里的兜底桶（防御性；正常快照不会触发）
  for (const [hotelId, findings] of byHotel) {
    if (hotels.some((h) => h.hotelId === hotelId)) continue;
    hotels.push({
      hotelId,
      hotelName: hotelId,
      currency: "CNY",
      findings,
      counts: countBySeverity(findings),
      totalRecoverableByUnit: sumByUnit(findings),
    });
  }

  /* ---------- 集团总览 + 链路分组 + Top10 ---------- */
  const chainGroups: Record<ChainStage, Finding[]> = { traffic: [], conversion: [], deal: [] };
  for (const f of allFindings) chainGroups[CHAIN_OF_LINE[f.line]].push(f);
  for (const stage of Object.keys(chainGroups) as ChainStage[]) {
    chainGroups[stage].sort(bySeverityThenImpact);
  }
  const top10 = [...allFindings]
    .filter((f) => f.estimatedImpact)
    .sort((a, b) => annualized(b) - annualized(a))
    .slice(0, 10);

  return {
    reportId: `RPT-${snapshot.snapshotId}`,
    generatedAt: ctx.now.toISOString(),
    snapshotId: snapshot.snapshotId,
    coverage,
    coverageNotes,
    hotels,
    overview: {
      hotelCount: snapshot.hotels.length,
      findingCount: allFindings.length,
      counts: countBySeverity(allFindings),
      totalRecoverableByUnit: sumByUnit(allFindings),
    },
    chainGroups,
    top10,
    elapsedMs: Date.now() - startedAt,
    timeBudgetMinutes: opts.timeBudgetMinutes ?? 30,
  };
}
