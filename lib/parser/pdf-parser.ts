// ============================================================
// PDF 解析器
// ============================================================
import { ParseRule, Order, OrderItem } from './types';

export interface ParseOutput {
  orders: Order[];
  errors: string[];
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function trim(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// PDF 文本提取（客户端）
export async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  // 使用 pdfjs-dist
  // @ts-ignore
  const pdfjsLib = await import('pdfjs-dist');
  // @ts-ignore
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += `\n--- Page ${i} ---\n` + pageText;
  }

  return fullText;
}

export async function parsePDF(
  buffer: ArrayBuffer,
  _rule: ParseRule
): Promise<ParseOutput> {
  const text = await extractTextFromPDF(buffer);
  const orders: Order[] = [];
  const errors: string[] = [];

  // 按页面分隔，一个页面一个订单
  const pages = text.split(/--- Page \d+ ---/);

  for (const pageText of pages) {
    if (!trim(pageText)) continue;

    const lines = pageText.split('\n').map(trim).filter(Boolean);
    const order: Order = {
      id: generateId(),
      items: [],
      storeName: '',
      recipientName: '',
      recipientPhone: '',
      recipientAddress: '',
    };

    const phoneRegex = /1[3-9]\d{9}/;
    const numRegex = /\d+/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 收货人信息
      if ((/收货人|收件人|姓名|签收人/.test(line)) && phoneRegex.test(line)) {
        order.recipientName = trim(line.replace(/[^a-zA-Z\u4e00-\u9fa5]+/g, ' ').split(' ').filter(Boolean).pop() || '');
        const phoneMatch = line.match(phoneRegex);
        if (phoneMatch) order.recipientPhone = phoneMatch[0];
        continue;
      }

      // 电话单独一行
      if (phoneRegex.test(line) && !order.recipientPhone) {
        const phoneMatch = line.match(phoneRegex);
        if (phoneMatch) order.recipientPhone = phoneMatch[0];
        continue;
      }

      // 地址
      if (/地址/.test(line)) {
        order.recipientAddress = trim(line.replace(/地址[:：]?\s*/, ''));
        continue;
      }

      // SKU 表格行：类别 / 编码 / 名称 / 数量
      // 检测：数字列+文字列组合
      const parts = line.split(/\s{2,}|\t/).filter(Boolean);
      if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1];
        const qty = parseInt(lastPart);
        if (!isNaN(qty) && qty > 0 && qty < 10000) {
          // 可能是物品行
          const namePart = parts[parts.length - 2] || parts[parts.length - 3] || parts[0];
          const codePart = parts[parts.length - 3] || parts[0];
          if (namePart && !/^\d+$/.test(namePart) && namePart.length > 1) {
            order.items.push({
              id: generateId(),
              sku编码: trim(codePart),
              sku名称: trim(namePart),
              sku数量: qty,
            });
          }
        }
      }
    }

    if (order.items.length > 0 || order.recipientPhone) {
      orders.push(order);
    }
  }

  return { orders, errors };
}

export async function extractPDFPreview(buffer: ArrayBuffer): Promise<string[][]> {
  const text = await extractTextFromPDF(buffer);
  return text.split('\n').map(l => [l.trim()]).filter(l => l[0]);
}
