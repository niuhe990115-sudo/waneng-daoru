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
1. 首先找出所有列名/字段名（表头行）
2. 确定数据起始行号：
   - 如果第0行就是表头（列名），则数据从第1行开始，regionRules 设为空数组 []
   - 如果前面有标题、说明等非表头内容，需要设置 header_skip
3. 识别收件人信息在哪里：
   - 情况A：收件人信息在数据表格的列中（如"收件人姓名"、"收件人电话"列）
   - 情况B：收件人信息在文件尾部横向排列
4. 建立字段映射关系

【必须映射的系统字段】
- externalCode: 外部编码（配送单号/订单号/单号/运单号） - 必填
- storeName: 收货门店/店铺/收货点/网点 - 选填（如果没有就填recipientName）
- recipientName: 收件人姓名/收货人/联系人/姓名/客户姓名 - 必填
- recipientPhone: 收件人电话/收货人电话/手机/联系方式/收件人手机 - 必填
- recipientAddress: 收件人地址/收货地址/详细地址/收货人地址 - 选填
- SKU物品编码: 商品编码/物料编码/物品编码/商品SKU - 选填
- SKU物品名称: 商品名称/物料名称/物品名称/商品名/品名 - 必填
- SKU发货数量: 数量/发货数量/件数/重量 - 必填
- SKU规格型号: 规格/型号/规格型号 - 选填

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

【字段映射规则】
1. sourceField 必须与文件中的列名完全一致（不要加引号）
2. 如果列名是“收件人姓名”，sourceField 就写“收件人姓名”（不要写"收件人姓名"）
3. 如果列名是“收件人电话”，sourceField 就写“收件人电话”
4. 如果列名是“收件人地址”，sourceField 就写“收件人地址”
5. 如果列名是“配送单号”，sourceField 就写“配送单号”
6. 如果列名是“外部编码”，sourceField 就写“外部编码”
7. 如果列名是“物品名称”，sourceField 就写“物品名称”
8. 如果列名是“件数”，sourceField 就写“件数”

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

文件内容预览（前3000字符）：
${String(fileContent).slice(0, 3000)}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });

    let content = completion.choices[0]?.message?.content || '';
    console.log('[AI生成] 原始返回内容:', content);
    
    // 尝试多种方式提取 JSON，最多重试 2 次
    let rule = null;
    let attempts = 0;
    const maxAttempts = 2;
    
    while (!rule && attempts <= maxAttempts) {
      if (attempts > 0) {
        console.log(`[AI生成] 第 ${attempts + 1} 次尝试解析 JSON...`);
        // 如果解析失败，请求 AI 重新生成
        const retryCompletion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: content },
            { role: 'user', content: '上一次返回的内容无法解析为 JSON，请重新生成纯 JSON 格式的规则，不要包含任何解释文字。' }
          ],
          temperature: 0.3,
          max_tokens: 2000,
        });
        content = retryCompletion.choices[0]?.message?.content || '';
        console.log(`[AI生成] 第 ${attempts + 1} 次重试内容:`, content);
      }
      
      // 方法1：使用正则匹配 JSON 对象
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          rule = JSON.parse(jsonMatch[0]);
          console.log('[AI生成] 方法1成功：正则匹配');
          break;
        } catch (e) {
          console.log('[AI生成] 方法1失败：', e);
        }
      }
      
      // 方法2：如果方法1失败，尝试查找 JSON 数组
      if (!rule) {
        const jsonMatch2 = content.match(/\[[\s\S]*\]/);
        if (jsonMatch2) {
          try {
            rule = JSON.parse(jsonMatch2[0]);
            console.log('[AI生成] 方法2成功：数组匹配');
            break;
          } catch (e) {
            console.log('[AI生成] 方法2失败：', e);
          }
        }
      }
      
      // 方法3：尝试找到第一个 { 和最后一个 } 之间的内容
      if (!rule) {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            const jsonStr = content.substring(firstBrace, lastBrace + 1);
            rule = JSON.parse(jsonStr);
            console.log('[AI生成] 方法3成功：首尾括号匹配');
            break;
          } catch (e) {
            console.log('[AI生成] 方法3失败：', e);
          }
        }
      }
      
      attempts++;
    }
    
    if (!rule) {
      console.error('[AI生成] 所有方法都失败，原始内容:', content);
      return NextResponse.json({ 
        error: 'AI 返回的内容格式不正确，请重试',
        raw: content 
      }, { status: 500 });
    }
    
    console.log('[AI生成] 最终解析的规则:', JSON.stringify(rule, null, 2));

    return NextResponse.json({ rule, raw: content, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
