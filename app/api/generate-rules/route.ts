// AI 生成解析规则 API
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: '请在 .env.local 中配置 OPENAI_API_KEY 才能使用 AI 生成规则功能' }, { status: 503 });
  }

  try {
    const { fileContent, fileType } = await req.json();

    if (!fileContent || !fileType) {
      return NextResponse.json({ error: '缺少文件内容或类型' }, { status: 400 });
    }

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });

    const prompt = `你是一个物流订单文件解析专家。请分析以下${fileType === 'excel' ? 'Excel' : fileType === 'word' ? 'Word' : 'PDF'}文件的内容，生成一套解析规则。

【分析步骤】
1. 首先判断文件布局类型：
   - 类型A：标准表格格式（最常见）- 第一行是表头，下面是数据行
   - 类型B：卡片式布局 - 键值对散落在表格各处（如："收货人: 张三", "电话: 138xxx"）
   - 类型C：尾部横向格式 - 收件人信息在文件末尾
2. 根据布局类型选择解析策略：
   - 类型A：直接在 fieldMappings 中映射列名
   - 类型B：在 fieldMappings 中映射键名（如"收货人"、"收货电话"），并标记需要全局搜索
   - 类型C：在 regionRules 中添加 tail横向提取
3. 确定数据起始行号
4. 建立字段映射关系

【必须映射的系统字段】
- externalCode: 外部编码（配送单号/订单号/单号/运单号/物品编码） - 必填
- storeName: 收货门店/店铺/收货点/网点/收货机构 - 选填（如果没有就填recipientName）
- recipientName: 收件人姓名/收货人/联系人/姓名/客户姓名 - 必填
- recipientPhone: 收件人电话/收货人电话/手机/联系方式/收件人手机/收货电话 - 必填
- recipientAddress: 收件人地址/收货地址/详细地址/收货人地址 - 选填
- SKU物品编码: 商品编码/物料编码/物品编码/商品SKU - 选填
- SKU物品名称: 商品名称/物料名称/物品名称/商品名/品名 - 必填
- SKU发货数量: 数量/发货数量/件数/重量 - 必填
- SKU规格型号: 规格/型号/规格型号 - 选填

【特别重要 - externalCode字段】
1. externalCode 是最重要的字段，必须映射！
2. 如果表格中有"物品编码"、"配送单号"、"单据号"等包含编码的列，必须映射为 externalCode
3. 例如：{"sourceField": "物品编码", "targetField": "externalCode", "isAIGuess": true}
4. 没有externalCode字段，解析器无法分组订单，会导致解析失败！

【重要提示 - 卡片式布局（键值对散落）】
如果文件是卡片式布局（键值对散落在表格各处），例如：
- "收货机构: 黎明屯铁锅炖（海口龙湖..."
- "收货人: 张锦峰"
- "收货电话: 18533660999"
- "收货地址: 海南省海口市..."

则必须：
1. 在 fieldMappings 中直接映射键名（不带冒号），并且每个字段都必须添加 "layoutType": "card_kv" 标记：
   - {"sourceField": "收货机构", "targetField": "storeName", "isAIGuess": true, "layoutType": "card_kv"}
   - {"sourceField": "收货人", "targetField": "recipientName", "isAIGuess": true, "layoutType": "card_kv"}
   - {"sourceField": "收货电话", "targetField": "recipientPhone", "isAIGuess": true, "layoutType": "card_kv"}
   - {"sourceField": "收货地址", "targetField": "recipientAddress", "isAIGuess": true, "layoutType": "card_kv"}
2. 不需要在 regionRules 中添加特殊规则，解析器会自动进行全局搜索
3. 物品信息如果有标准表格，则物品字段不要加 layoutType 标记
4. 这个标记非常重要！没有这个标记，解析器无法识别卡片式布局

【重要提示 - 多工作表文件】
如果文件包含多个工作表（Sheet），且每个工作表都包含运单数据：
- 在返回的 JSON 中添加 splitRule 字段
- 例如："splitRule": {"mergeAllSheets": true, "description": "合并所有工作表的订单数据"}
- 这样解析器会遍历所有工作表并合并解析结果

【重要提示 - 表头和数据行】
1. 如果文件第一行（第0行）就是表头（列名），则 regionRules 应该是空数组 []，不需要设置 header_skip
2. 如果文件前面有标题、说明文字等非表头内容，比如：
   第0行："订单列表"
   第1行："生成日期：2024-01-01"
   第2行："外部编码 | 收件人姓名 | ..."（这才是表头）
   第3行："ORD-001 | 张三 | ..."（这是数据）
   则 regionRules 应该设置为：[{"type": "header_skip", "rowsToSkip": 2, "description": "跳过标题行，从第2行开始找表头"}]
3. rowsToSkip 的值 = 表头行的行号（因为解析器会从 dataStartRow + 1 开始读取数据）
4. 大多数情况下，如果第一行就是表头，regionRules 设为空数组 [] 即可

【重要提示 - 收件人信息位置】
情况A：如果收件人信息在数据表格的列中（最常见）
- 直接在 fieldMappings 中映射即可
- 例如：{"sourceField": "收件人姓名", "targetField": "recipientName", "isAIGuess": true}
- 例如：{"sourceField": "收件人电话", "targetField": "recipientPhone", "isAIGuess": true}
- 例如：{"sourceField": "收件人地址", "targetField": "recipientAddress", "isAIGuess": true}
- 不需要在 regionRules 中添加 tail横向提取

情况B：如果收件人信息在文件尾部（横向排列）
- 在 regionRules 中添加：{"type": "tail横向提取", "rowsFromEnd": N, "description": "尾部收件人信息"}
- 在 fieldMappings 中仍然需要映射：{"sourceField": "收货人", "targetField": "recipientName", "isAIGuess": true}

情况C：如果是卡片式布局（键值对散落）
- 在 fieldMappings 中映射键名，并添加 "layoutType": "card_kv" 标记
- 例如：{"sourceField": "收货人", "targetField": "recipientName", "isAIGuess": true, "layoutType": "card_kv"}
- 解析器会识别这个标记并启用全局搜索功能

【字段映射规则】
1. sourceField 必须与文件中的列名完全一致（不要加引号）
2. 如果列名是"收件人姓名"，sourceField 就写"收件人姓名"（不要写"收件人姓名"）
3. 如果列名是"收件人电话"，sourceField 就写"收件人电话"
4. 如果列名是"收件人地址"，sourceField 就写"收件人地址"
5. 如果列名是"配送单号"，sourceField 就写"配送单号"
6. 如果列名是"外部编码"，sourceField 就写"外部编码"
7. 如果列名是"物品名称"，sourceField 就写"物品名称"
8. 如果列名是"件数"，sourceField 就写"件数"

【返回格式】
{
  "name": "规则名称",
  "description": "规则描述",
  "fieldMappings": [
    {"sourceField": "源字段名或列索引", "targetField": "系统字段名", "isAIGuess": true}
  ],
  "regionRules": [
    {"type": "header_skip|footer_extract|tail横向提取", "rowsToSkip": N, "rowsFromEnd": N, "description": ""}
  ],
  "aggregationRule": {"type": "group_by_column", "groupByColumn": "列名"},
  "transposeRule": {"enabled": false, "colFields": [], "valueFields": []},
  "notes": "AI推测说明，特别是收件人信息的位置"
}

【示例1 - 标准表格格式（收件人在列中，第一行就是表头）】
如果文件结构是：
第0行：| 外部编码 | 收件人姓名 | 收件人电话 | 收件人地址 | 物品名称 | 数量 |
第1行：| ORD-001 | 张三 | 13800138001 | 某街道 | 手机 | 2 |

则 fieldMappings 应该是：
[
  {"sourceField": "外部编码", "targetField": "externalCode", "isAIGuess": true},
  {"sourceField": "收件人姓名", "targetField": "recipientName", "isAIGuess": true},
  {"sourceField": "收件人电话", "targetField": "recipientPhone", "isAIGuess": true},
  {"sourceField": "收件人地址", "targetField": "recipientAddress", "isAIGuess": true},
  {"sourceField": "物品名称", "targetField": "SKU物品名称", "isAIGuess": true},
  {"sourceField": "数量", "targetField": "SKU发货数量", "isAIGuess": true}
]
regionRules 应该是空数组 [] （因为第一行就是表头，不需要跳过）

【示例2 - 尾部横向格式】
如果文件尾部有：
收货人：张三  联系电话：13800138001  收货地址：某某街道

则 regionRules 应该是：
[{"type": "tail横向提取", "rowsFromEnd": 1, "description": "尾部收件人信息"}]

fieldMappings 应该包含：
[{"sourceField": "收货人", "targetField": "recipientName", "isAIGuess": true},
 {"sourceField": "联系电话", "targetField": "recipientPhone", "isAIGuess": true}]

【示例3 - 卡片式布局（键值对散落）】
如果文件结构是：
第1行：| 收货机构 | 黎明屯铁锅炖（海口龙湖... |
第2行：| 供货机构 | 黎明屯铁锅炖配送中心 |
...
第12行：| 收货人 | 张锦峰 | 收货电话 | 18533660999 |
第13行：| 收货地址 | 海南省海口市... |

则 fieldMappings 应该是：
[
  {"sourceField": "收货机构", "targetField": "storeName", "isAIGuess": true, "layoutType": "card_kv"},
  {"sourceField": "收货人", "targetField": "recipientName", "isAIGuess": true, "layoutType": "card_kv"},
  {"sourceField": "收货电话", "targetField": "recipientPhone", "isAIGuess": true, "layoutType": "card_kv"},
  {"sourceField": "收货地址", "targetField": "recipientAddress", "isAIGuess": true, "layoutType": "card_kv"},
  {"sourceField": "物品名称", "targetField": "SKU物品名称", "isAIGuess": true},
  {"sourceField": "数量", "targetField": "SKU发货数量", "isAIGuess": true}
]
regionRules 应该是空数组 [] （因为解析器会自动全局搜索键值对）

文件内容预览（前3000字符）：
${String(fileContent).slice(0, 3000)}`;

    const startTime = Date.now();
    console.log('[AI生成] 开始请求OpenAI API...');
    
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,  // 降低随机性，提高速度和准确性
      max_tokens: 1500,  // 减少token数，加快速度
      response_format: { type: "json_object" },  // 强制JSON格式，避免解析错误
    });

    const elapsedTime = Date.now() - startTime;
    console.log(`[AI生成] API请求完成，耗时: ${elapsedTime}ms`);

    let content = completion.choices[0]?.message?.content || '';
    console.log('[AI生成] 返回内容长度:', content.length);
    
    // 简化JSON提取逻辑，因为使用了response_format: json_object
    let rule = null;
    
    // 直接使用正则提取JSON，不需要重试
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        rule = JSON.parse(jsonMatch[0]);
        console.log('[AI生成] JSON解析成功，耗时总计:', Date.now() - startTime, 'ms');
      } catch (e) {
        console.error('[AI生成] JSON解析失败:', e);
      }
    }
    
    if (!rule) {
      console.error('[AI生成] 解析失败，原始内容:', content.substring(0, 200));
      return NextResponse.json({ 
        error: 'AI返回的内容格式不正确，请重试',
        raw: content 
      }, { status: 500 });
    }
    
    console.log('[AI生成] 最终规则字段数:', rule.fieldMappings?.length || 0);

    return NextResponse.json({ rule, raw: content, success: true });
  } catch (err: any) {
    console.error('[AI生成] 错误:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
