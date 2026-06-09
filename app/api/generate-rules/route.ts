// AI 生成解析规则 API（优化版 - 提升速度）
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

    // 精简版提示词，减少AI处理时间
    const prompt = `你是一个物流订单文件解析专家。请分析${fileType}文件内容，生成JSON格式的解析规则。

【核心字段映射】（必须全部映射）
- externalCode: 外部编码/配送单号/订单号/物品编码（必填）
- recipientName: 收件人姓名/收货人/联系人（必填）
- recipientPhone: 收件人电话/收货电话/手机（必填）
- storeName: 收货门店/店铺/机构（选填，无则填recipientName）
- recipientAddress: 收件人地址/收货地址（选填）
- SKU物品名称: 商品名称/物品名称/品名（必填）
- SKU发货数量: 数量/发货数量/件数（必填）
- SKU物品编码: 商品编码/物料编码（选填）
- SKU规格型号: 规格/型号（选填）

【布局类型判断】
1. 标准表格：第一行是表头列名，下面是数据行 → fieldMappings直接映射列名，regionRules=[]
2. 卡片式布局：键值对散落（如"收货人:张三"）→ fieldMappings映射键名，每个收货人字段加"layoutType":"card_kv"标记
3. 尾部格式：收件人信息在文件末尾 → regionRules加{"type":"tail横向提取","rowsFromEnd":N}

【重要规则】
- externalCode必填！没有它解析器无法分组订单
- 卡片式布局的收件人字段必须加"layoutType":"card_kv"标记
- 如果文件有多个工作表，添加"splitRule":{"mergeAllSheets":true}
- 如果第一行是表头，regionRules=[]；如果有标题行，regionRules=[{"type":"header_skip","rowsToSkip":表头行号}]

【返回JSON格式】
{"name":"规则名称","description":"描述","fieldMappings":[{"sourceField":"列名","targetField":"系统字段","isAIGuess":true}],"regionRules":[],"aggregationRule":{"type":"group_by_column","groupByColumn":"列名"},"transposeRule":{"enabled":false,"colFields":[],"valueFields":[]},"notes":"说明"}

文件内容预览（前2500字符）：
${String(fileContent).slice(0, 2500)}`;

    const startTime = Date.now();
    console.log('[AI生成] 开始请求OpenAI API...');
    
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200,  // 进一步减少token数
      response_format: { type: "json_object" },
    });

    const elapsedTime = Date.now() - startTime;
    console.log(`[AI生成] API请求完成，耗时: ${elapsedTime}ms`);

    let content = completion.choices[0]?.message?.content || '';
    console.log('[AI生成] 返回内容长度:', content.length);
    
    // 快速JSON提取（使用response_format: json_object保证格式正确）
    let rule = null;
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
