/**
 * demo-conversation.ts · AskRail 演示会话剧本（DEMO-SCRIPT）
 *
 * 目的：全场景运行态——对话框不是空样板间。首开 AskRail 即呈现一段
 * 「店主 ↔ AI 助手」的真实感经营对话（问询/审批/派单/复盘四幕），
 * 台词数字与种子数据集（seed-acquisition）严格同源，不得编造。
 *
 * 纪律：
 *  - 按工作区出剧本（yunqi-hotel=获客酒店 / video-studio=视频工作室）；
 *  - 真实用户发消息后剧本不再占位（msgs 非空时以真实会话为准）；
 *  - receipt 标记 unverified（剧本非执行留痕，口径与模拟态横幅一致）。
 */

export interface DemoRailMsg {
  role: "human" | "agent";
  text: string;
  action?: string;
  linkTo?: string;
}

const HOTEL_SCRIPT: DemoRailMsg[] = [
  { role: "human", text: "早上好，本周获客情况怎么样？" },
  {
    role: "agent", action: "经营简报",
    text: "【本周获客简报】归因成交 ¥128,600（152 单，环比 +18.2%）：抖音 ¥61,400 / AI 搜索 ¥43,800 / 小红书 ¥15,600 / 企微转介绍 ¥7,800。GEO 上榜词条 12 个，「杭州亲子酒店推荐」升至 AI 答案第 2 位；昨夜询盘 23 条零漏接，平均 3 秒应答。",
  },
  { role: "human", text: "有什么需要我拍板的？" },
  {
    role: "agent", action: "审批清单",
    text: "3 件 L4 决策等你拍板：① 商旅协议价 ¥628/晚（电商公司月 40 间夜，88 折+月结）②「周末亲子券」¥50→¥39 限 200 份 ③ 38 条高意向线索导企微（含婚宴/协议 VIP 2 条）。在经营主页或董事长视图可逐条批。",
    linkTo: "/p21",
  },
  { role: "human", text: "把今晚到店的高意向线索整理成跟进清单，明早给我" },
  {
    role: "agent", action: "任务立项",
    text: "已立项「高意向线索跟进清单」：盘点 38 条 → 按婚宴/协议/亲子分级 → 逐条配话术 → 分派王店长与销售组 → 明早 8:30 随晨报呈送。今晚 22:00 夜班接手整理。",
    linkTo: "/p1",
  },
  { role: "human", text: "这周哪条内容效果最好？" },
  {
    role: "agent", action: "内容复盘",
    text: "「亲子乐园实拍」播放 12.6w、询盘 46 条、转化 9 单 ¥7,104，投产比 1:8.9。已按爆款复制 SOP 排期 3 条变体（亲子早餐/乐园攻略/遛娃动线），周三探店直播同步推。",
  },
];

const VIDEO_SCRIPT: DemoRailMsg[] = [
  { role: "human", text: "昨天内容数据怎么样？" },
  {
    role: "agent", action: "经营简报",
    text: "【昨日战报】发布 4 条，播放 5.28w（2h 峰值 1.86w），GMV ¥9,600，高意向线索 17 条。周累计：播放 48.6w、GMV ¥68,400——实测类比口播类转化高 2.3×。",
  },
  { role: "human", text: "有什么要我拍板的？" },
  {
    role: "agent", action: "审批清单",
    text: "2 件 L4 决策：① 家居品牌年度框架 ¥88,000（24 条定制，¥3,666/条 高于均价 22%）② 母婴达人合作 ¥26,000（86w 粉，客群匹配 91%，预估播放 50w+）。",
    linkTo: "/p21",
  },
  { role: "human", text: "把「焖烧实测」那条爆款复制几条出来" },
  {
    role: "agent", action: "任务立项",
    text: "已按爆款复制 SOP 立项：拆解 12.6w 爆款要素（真实场景/分贝仪实测/前后对比）→ 3 条变体（焖粥/焖汤/母婴辅食）→ 脚本→渲染→审片→四平台排期，本周出片。",
    linkTo: "/p1",
  },
];

/** 按工作区取剧本（缺省酒店获客版） */
export function demoRailMessages(wsName: string): DemoRailMsg[] {
  if (/视频|星芒|创作/i.test(wsName)) return VIDEO_SCRIPT;
  return HOTEL_SCRIPT;
}
