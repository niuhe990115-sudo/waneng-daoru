// 解析规则 CRUD API
import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

// 演示模式内存存储
let demoRules: any[] = [];

function initializeDemoRules() {
  if (demoRules.length === 0) {
    demoRules = getDemoRules();
  }
  return demoRules;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    // 演示模式：返回内存中的规则
    const rules = initializeDemoRules();
    return NextResponse.json({ rules: rules, demo: true });
  }

  const { data, error } = await supabase!
    .from('parse_rules')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data, demo: false });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    // 演示模式：保存到内存
    const rule = await req.json();
    const rules = initializeDemoRules();
    const newRule = {
      ...rule,
      id: 'demo-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    rules.unshift(newRule); // 添加到列表开头
    console.log('[演示模式] 规则已保存到内存:', newRule.name);
    return NextResponse.json({ 
      success: true, 
      demo: true, 
      id: newRule.id,
      rule: newRule 
    });
  }

  const rule = await req.json();
  const { data, error } = await supabase!
    .from('parse_rules')
    .insert([{ ...rule, created_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, rule: data });
}

export async function DELETE(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, demo: true });
  }

  const { id } = await req.json();
  const { error } = await supabase!.from('parse_rules').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// 演示模式默认规则
function getDemoRules() {
  return [
    {
      id: 'rule-demo-1',
      name: '黎明屯配送发货单',
      description: '适用42列表格，干扰头部+尾部横向收货人',
      fileFormat: 'excel',
      fieldMappings: [
        { sourceField: '1', targetField: 'SKU物品编码' },
        { sourceField: '2', targetField: 'SKU物品名称' },
        { sourceField: '3', targetField: 'SKU发货数量' },
        { sourceField: '0', targetField: '外部编码' },
      ],
      regionRules: [
        { type: 'header_skip', rowsToSkip: 4, description: '跳过前4行干扰头' },
        { type: 'tail横向提取', rowsFromEnd: 3, description: '从末尾3行提取收货人信息' },
      ],
      aggregationRule: { type: 'group_by_column', groupByColumn: '外部编码' },
      created_at: new Date().toISOString(),
    },
    {
      id: 'rule-demo-2',
      name: '湖南仓发货明细',
      description: '按配送单号聚合，32列表格',
      fileFormat: 'excel',
      fieldMappings: [
        { sourceField: '物品编码', targetField: 'SKU物品编码' },
        { sourceField: '物品名称', targetField: 'SKU物品名称' },
        { sourceField: '数量', targetField: 'SKU发货数量' },
        { sourceField: '配送单号', targetField: '外部编码' },
        { sourceField: '收货人', targetField: '收件人姓名' },
        { sourceField: '电话', targetField: '收件人电话' },
        { sourceField: '地址', targetField: '收件人地址' },
      ],
      regionRules: [
        { type: 'header_skip', rowsToSkip: 2, description: '跳过前2行说明' },
      ],
      aggregationRule: { type: 'group_by_column', groupByColumn: '配送单号' },
      created_at: new Date().toISOString(),
    },
    {
      id: 'rule-demo-3',
      name: '欢乐牧场模板（矩阵转置）',
      description: 'SKU×门店矩阵，需横向转置',
      fileFormat: 'excel',
      fieldMappings: [
        { sourceField: '0', targetField: 'SKU物品编码' },
        { sourceField: '1', targetField: 'SKU物品名称' },
      ],
      regionRules: [
        { type: 'header_skip', rowsToSkip: 2, description: '跳过合并表头' },
      ],
      transposeRule: { enabled: true, rowField: 'SKU', colFields: [2,3,4,5,6,7], valueFields: ['数量'] },
      created_at: new Date().toISOString(),
    },
    {
      id: 'rule-demo-4',
      name: '黔寨寨配送单（PDF）',
      description: 'PDF格式，底部收货人签字区',
      fileFormat: 'pdf',
      fieldMappings: [
        { sourceField: 'body', targetField: 'SKU物品编码' },
      ],
      regionRules: [
        { type: 'footer_extract', rowsFromEnd: 5, description: '提取底部5行收货人信息' },
      ],
      created_at: new Date().toISOString(),
    },
    {
      id: 'rule-demo-5',
      name: '多Sheet门店出库单',
      description: '多Sheet合并，每个Sheet独立解析',
      fileFormat: 'excel',
      fieldMappings: [
        { sourceField: '1', targetField: 'SKU物品编码' },
        { sourceField: '2', targetField: 'SKU物品名称' },
        { sourceField: '3', targetField: 'SKU发货数量' },
      ],
      regionRules: [
        { type: 'header_skip', rowsToSkip: 1 },
        { type: 'tail横向提取', rowsFromEnd: 2 },
      ],
      splitRule: { type: 'sheet_merge', mergeAllSheets: true },
      aggregationRule: { type: 'group_by_column', groupByColumn: '门店' },
      created_at: new Date().toISOString(),
    },
    {
      id: 'rule-demo-6',
      name: '门店调拨单（卡片式）',
      description: '卡片边界识别，非标准表格',
      fileFormat: 'excel',
      fieldMappings: [
        { sourceField: '1', targetField: 'SKU物品编码' },
        { sourceField: '2', targetField: 'SKU物品名称' },
        { sourceField: '3', targetField: 'SKU发货数量' },
        { sourceField: '门店', targetField: '收货门店' },
      ],
      regionRules: [
        { type: 'card_boundary', cardStartKeyword: '▶', description: '卡片起始标记' },
        { type: 'header_skip', rowsToSkip: 1 },
      ],
      created_at: new Date().toISOString(),
    },
    {
      id: 'rule-demo-7',
      name: '门店配送确认单（Word）',
      description: '纯文本段落，无表格',
      fileFormat: 'word',
      fieldMappings: [
        { sourceField: 'text', targetField: 'SKU物品编码' },
      ],
      regionRules: [],
      created_at: new Date().toISOString(),
    },
    {
      id: 'rule-demo-8',
      name: '周配送计划（双重转置）',
      description: '日期×门店矩阵，复合单元格',
      fileFormat: 'excel',
      fieldMappings: [
        { sourceField: '0', targetField: 'SKU物品编码' },
        { sourceField: '1', targetField: 'SKU物品名称' },
      ],
      regionRules: [
        { type: 'header_skip', rowsToSkip: 2 },
      ],
      transposeRule: { enabled: true, rowField: 'SKU', colFields: [2,3,4,5,6], valueFields: ['数量'] },
      splitRule: { type: '复合单元格拆分', cellDelimiter: '\n' },
      created_at: new Date().toISOString(),
    },
    {
      id: 'rule-demo-9',
      name: '配送签收单（PDF多单）',
      description: 'PDF多订单拆分，分隔线区分',
      fileFormat: 'pdf',
      fieldMappings: [],
      regionRules: [
        { type: 'footer_extract', rowsFromEnd: 6 },
      ],
      splitRule: { type: 'PDF多单拆分', delimiter: '━━━━|签收' },
      created_at: new Date().toISOString(),
    },
  ];
}
