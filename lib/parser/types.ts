// ============================================================
// 解析规则类型定义
// ============================================================

/** 字段映射类型 */
export type FieldMapping = {
  sourceField: string;   // 源文件中的字段名
  targetField: string;   // 目标字段（系统标准字段）
  isAIGuess?: boolean;   // 是否为 AI 推测
};

/** 区域提取规则 */
export type RegionRule = {
  type: 'header_skip' | 'footer_extract' | 'tail横向提取' | 'card_boundary';
  description: string;
  // header_skip: 跳过前 N 行
  rowsToSkip?: number;
  // footer_extract / tail横向提取: 从最后 N 行提取
  rowsFromEnd?: number;
  // 提取哪些列（列索引）
  columns?: number[];
  // tail横向提取: 收货人字段在哪一行（相对于文件末尾）
  recipientRowOffset?: number;
  // card_boundary: 卡片起始标记
  cardStartKeyword?: string;
};

/** 聚合规则 */
export type AggregationRule = {
  type: 'group_by_column';  // 按列值分组
  groupByColumn: string | number; // 按哪列聚合（列索引或列名）
};

/** 矩阵转置规则 */
export type TransposeRule = {
  enabled: boolean;
  rowField: string;    // 行标题字段（如 SKU）
  colFields: string[]; // 列标题字段（如门店名）
  valueFields: string[];// 值字段
};

/** 拆分规则 */
export type SplitRule = {
  type: 'sheet_merge' | '复合单元格拆分' | 'PDF多单拆分' | '分隔线拆分';
  // sheet_merge: 合并所有 Sheet
  mergeAllSheets?: boolean;
  // 复合单元格拆分: 用什么分隔符拆分
  cellDelimiter?: string;
  // PDF多单拆分 / 分隔线拆分: 分隔符正则
  delimiter?: string;
};

/** 解析规则完整结构 */
export interface ParseRule {
  id?: string;
  name: string;
  description?: string;
  fileFormat: 'excel' | 'word' | 'pdf';
  createdAt?: string;
  updatedAt?: string;

  // 字段映射
  fieldMappings: FieldMapping[];

  // 区域处理
  regionRules: RegionRule[];

  // 聚合
  aggregationRule?: AggregationRule;

  // 矩阵转置
  transposeRule?: TransposeRule;

  // 拆分
  splitRule?: SplitRule;

  // 默认值
  defaultValues?: Record<string, string>;
}

// ============================================================
// 运单数据
// ============================================================

export interface OrderItem {
  id: string;
  sku编码: string;
  sku名称: string;
  sku数量: number;
  sku规格?: string;
}

export interface Order {
  id?: string;
  // 外部编码
  externalCode?: string;
  // A组：门店模式
  storeName?: string;
  // B组：收件人模式
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  // 物品列表
  items: OrderItem[];
  // 元信息
  remark?: string;
  // 数据库字段
  dbId?: string;
  createdAt?: string;
}

// ============================================================
// UI 状态
// ============================================================

export type AppStep = 'upload' | 'rule_select' | 'preview' | 'success';

export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

export interface ParseResult {
  orders: Order[];
  errors: ValidationError[];
  rawPreview?: string[][];
}
