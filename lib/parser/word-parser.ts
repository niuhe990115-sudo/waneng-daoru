// ============================================================
// Word 解析器（纯文本段落格式）
// ============================================================
import mammoth from 'mammoth';
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

export async function parseWord(
  buffer: ArrayBuffer,
  _rule: ParseRule
): Promise<ParseOutput> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value;

  const orders: Order[] = [];
  const errors: string[] = [];

  // 用分隔线 "━━━" 或连续 "=" 划分记录
  const recordBlocks = text.split(/={5,}|[[:punct:]]{5,}|━━━━|^={3,}$/gm)
    .map(b => b.trim())
    .filter(Boolean);

  // 纯文本正则解析
  const phoneRegex = /1[3-9]\d{9}/;
  const itemLineRegex = /(\d+)[.、:：]\s*([A-Z0-9\-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)/;

  let currentOrder: Order | null = null;

  for (const block of recordBlocks) {
    const lines = block.split('\n').map(trim).filter(Boolean);

    for (const line of lines) {
      // 收件人检测
      const phoneMatch = line.match(phoneRegex);
      if ((/收货人|收件人|姓名|门店/.test(line)) && phoneMatch) {
        if (currentOrder) orders.push(currentOrder);
        currentOrder = {
          id: generateId(),
          items: [],
          storeName: '',
          recipientName: '',
          recipientPhone: '',
          recipientAddress: '',
        };
        // 尝试提取姓名
        const nameMatch = line.match(/[姓大名]+[：:]\s*([^\s\d]+)/);
        if (nameMatch) currentOrder.recipientName = trim(nameMatch[1]);
        currentOrder.recipientPhone = phoneMatch[0];
        // 找地址
        for (const l2 of lines) {
          if (/地址/.test(l2)) {
            currentOrder.recipientAddress = trim(l2).replace(/地址[:：]?\s*/, '');
            break;
          }
        }
        continue;
      }

      // 物品行检测
      const itemMatch = line.match(itemLineRegex);
      if (itemMatch && currentOrder) {
        currentOrder.items.push({
          id: generateId(),
          sku编码: trim(itemMatch[2]),
          sku名称: trim(itemMatch[3]),
          sku规格: trim(itemMatch[4]),
          sku数量: parseInt(itemMatch[5]) || 1,
        });
        continue;
      }

      // 简单格式：编号 编码 | 名称 | 规格 | 数量
      const simpleMatch = line.match(/([A-Z0-9\-]+)\s*\|\s*([^\|]+)\s*\|\s*(\d+)/);
      if (simpleMatch && currentOrder) {
        currentOrder.items.push({
          id: generateId(),
          sku编码: trim(simpleMatch[1]),
          sku名称: trim(simpleMatch[2]),
          sku数量: parseInt(simpleMatch[3]) || 1,
        });
      }
    }

    if (currentOrder) orders.push(currentOrder);
  }

  // 如果没有找到任何订单，尝试全局解析
  if (orders.length === 0) {
    const globalOrder: Order = {
      id: generateId(),
      items: [],
      storeName: '',
      recipientName: '',
      recipientPhone: '',
      recipientAddress: '',
    };

    const allLines = text.split('\n').map(trim).filter(Boolean);
    for (const line of allLines) {
      const itemMatch = line.match(itemLineRegex);
      if (itemMatch) {
        globalOrder.items.push({
          id: generateId(),
          sku编码: trim(itemMatch[2]),
          sku名称: trim(itemMatch[3]),
          sku规格: trim(itemMatch[4]),
          sku数量: parseInt(itemMatch[5]) || 1,
        });
      }
    }

    if (globalOrder.items.length > 0) orders.push(globalOrder);
  }

  return { orders, errors };
}

export async function extractTextFromWord(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}
