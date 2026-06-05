// ============================================================
// Excel 解析器
// ============================================================
import * as XLSX from 'xlsx';
import { ParseRule, Order, OrderItem } from './types';

export interface ParseContext {
  rawData: string[][];
  sheetNames: string[];
  fileName: string;
}

export interface ParseOutput {
  orders: Order[];
  errors: string[];
}

// ---------- 辅助函数 ----------
function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function trim(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// 查找列：支持多行搜索表头
function findCol(data: string[][], colName: string, rowStart = 0): number {
  // 清理列名：去除引号、空格
  const cleanColName = colName.replace(/["'']/g, '').trim().toLowerCase();
  
  console.log(`[findCol] 搜索列: "${colName}" (清理后: "${cleanColName}")`);
  
  // 搜索前10行作为可能的表头行
  for (let r = rowStart; r < Math.min(rowStart + 10, data.length); r++) {
    for (let c = 0; c < (data[r]?.length || 0); c++) {
      const cell = trim(data[r]?.[c]);
      
      // 跳过空单元格
      if (!cell) continue;
      
      // 清理单元格内容：去除引号、空格
      const cleanCell = cell.replace(/["'']/g, '').trim().toLowerCase();
      
      // 优先完全匹配
      if (cleanCell === cleanColName) {
        console.log(`[findCol] ✓ 完全匹配: "${colName}" -> 第${r}行第${c}列 (原始值: "${data[r][c]}")`);
        return c;
      }
    }
  }
  
  // 如果没有完全匹配，再尝试包含匹配
  for (let r = rowStart; r < Math.min(rowStart + 10, data.length); r++) {
    for (let c = 0; c < (data[r]?.length || 0); c++) {
      const cell = trim(data[r]?.[c]);
      if (!cell) continue;
      
      const cleanCell = cell.replace(/["'']/g, '').trim().toLowerCase();
      
      // 包含匹配（双向）
      if (cleanCell.includes(cleanColName) || cleanColName.includes(cleanCell)) {
        console.log(`[findCol] ✓ 包含匹配: "${colName}" -> 第${r}行第${c}列 (原始值: "${data[r][c]}")`);
        return c;
      }
    }
  }
  
  console.log(`[findCol] ✗ 未找到列: "${colName}"`);
  return -1;
}

function getCell(data: string[][], row: number, col: number): string {
  return trim(data[row]?.[col]);
}

// 收集尾部横向信息区（收货人散落在文件末尾的情况）
function extractTailRecipients(data: string[][], rule: ParseRule): { name: string; phone: string; address: string } {
  const result = { name: '', phone: '', address: '' };
  
  for (const reg of rule.regionRules) {
    if (reg.type === 'tail横向提取') {
      const rowsFromEnd = reg.rowsFromEnd || 3;
      const startRow = Math.max(0, data.length - rowsFromEnd);
      
      console.log(`[尾部提取] 从倒数第 ${rowsFromEnd} 行开始搜索 (第${startRow}行到第${data.length - 1}行)`);
      
      // 方法1：从字段映射中找收件人相关字段
      for (const mapping of rule.fieldMappings) {
        const target = mapping.targetField;
        const source = trim(mapping.sourceField);
        
        if (target === 'recipientName' || target === '收件人姓名') {
          // 在尾部区域搜索这个字段
          for (let r = startRow; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
              const cell = trim(data[r][c]).toLowerCase();
              if (cell.includes(source.toLowerCase()) || cell.includes('收货人') || cell.includes('收件人')) {
                // 找到了字段名，值在下一列或右边
                result.name = trim(data[r][c + 1]) || trim(data[r][c + 2]) || '';
                console.log(`[尾部提取] 找到收件人姓名: "${result.name}" (第${r}行第${c}列)`);
                break;
              }
            }
            if (result.name) break;
          }
        }
        
        if (target === 'recipientPhone' || target === '收件人电话') {
          for (let r = startRow; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
              const cell = trim(data[r][c]).toLowerCase();
              if (cell.includes(source.toLowerCase()) || cell.includes('电话') || cell.includes('手机') || cell.includes('联系')) {
                result.phone = trim(data[r][c + 1]) || trim(data[r][c + 2]) || '';
                console.log(`[尾部提取] 找到收件人电话: "${result.phone}" (第${r}行第${c}列)`);
                break;
              }
            }
            if (result.phone) break;
          }
        }
        
        if (target === 'recipientAddress' || target === '收件人地址') {
          for (let r = startRow; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
              const cell = trim(data[r][c]).toLowerCase();
              if (cell.includes(source.toLowerCase()) || cell.includes('地址')) {
                result.address = trim(data[r][c + 1]) || trim(data[r][c + 2]) || '';
                console.log(`[尾部提取] 找到收件人地址: "${result.address}" (第${r}行第${c}列)`);
                break;
              }
            }
            if (result.address) break;
          }
        }
      }
      
      // 方法2：如果字段映射没找到，用关键词搜索
      if (!result.name || !result.phone) {
        for (let r = startRow; r < data.length; r++) {
          for (let c = 0; c < data[r].length; c++) {
            const cell = trim(data[r][c]);
            // 手机号匹配（11位数字）
            if (/1[3-9]\d{9}/.test(cell) && !result.phone) {
              result.phone = cell;
              console.log(`[尾部提取] 找到手机号: "${result.phone}" (第${r}行第${c}列)`);
            }
            // 收货人/收件人关键词
            if ((cell.includes('收货人') || cell.includes('收件人')) && !result.name) {
              result.name = trim(data[r][c + 1]) || trim(data[r][c + 2]) || cell.replace(/[收货人收件人：:]/g, '');
              console.log(`[尾部提取] 找到收货人: "${result.name}" (第${r}行第${c}列)`);
            }
          }
        }
      }
      
      break;
    }
  }
  
  console.log(`[尾部提取] 最终结果: 姓名="${result.name}", 电话="${result.phone}", 地址="${result.address}"`);
  return result;
}

// ---------- 规则应用核心 ----------
function applyRuleToSheet(sheetData: string[][], rule: ParseRule): Order[] {
  if (!sheetData || sheetData.length < 3) return [];

  const orders: Order[] = [];

  // 1. 智能检测表头行位置
  let dataStartRow = 0;
  
  // 如果规则指定了 header_skip，使用它
  for (const reg of rule.regionRules) {
    if (reg.type === 'header_skip' && reg.rowsToSkip) {
      dataStartRow = Math.max(dataStartRow, reg.rowsToSkip);
    }
  }
  
  // 智能检测：在前10行中查找最可能是表头的行
  // 表头特征：包含多个与 fieldMappings 中 sourceField 匹配的列名
  console.log('[Excel解析] 开始智能检测表头行...');
  let bestHeaderRow = dataStartRow;
  let bestMatchScore = 0;
  
  const searchRows = Math.min(10, sheetData.length);
  for (let r = 0; r < searchRows; r++) {
    let matchScore = 0;
    const row = sheetData[r];
    
    for (const mapping of rule.fieldMappings) {
      const src = trim(mapping.sourceField).toLowerCase();
      if (!src) continue;
      
      // 检查这一行是否包含这个字段名
      for (let c = 0; c < row.length; c++) {
        const cell = trim(row[c]).toLowerCase();
        if (!cell) continue;
        
        // 完全匹配或高度相似
        if (cell === src || 
            (cell.includes(src) && src.includes(cell) && cell.length > 2)) {
          matchScore++;
          break;
        }
      }
    }
    
    console.log(`[Excel解析] 第${r}行匹配得分: ${matchScore}/${rule.fieldMappings.length}`);
    
    // 如果这一行匹配了超过一半的字段，认为是表头行
    if (matchScore > bestMatchScore && matchScore >= rule.fieldMappings.length * 0.5) {
      bestMatchScore = matchScore;
      bestHeaderRow = r;
    }
  }
  
  // 使用检测到的表头行
  if (bestMatchScore > 0) {
    dataStartRow = bestHeaderRow;
    console.log(`[Excel解析] ✓ 检测到表头在第${dataStartRow}行 (匹配${bestMatchScore}个字段)`);
  } else {
    console.log(`[Excel解析] 未检测到明确的表头行，使用默认值: 第${dataStartRow}行`);
  }

  // 2. 找到字段映射的列
  const colMap: Record<string, number> = {};
  console.log('[Excel解析] 字段映射配置:', rule.fieldMappings);
  console.log('[Excel解析] dataStartRow:', dataStartRow);
  
  // 打印表头行（dataStartRow）的内容
  if (sheetData[dataStartRow]) {
    console.log(`[Excel解析] 表头行(第${dataStartRow}行):`, sheetData[dataStartRow]);
  }
  
  for (const mapping of rule.fieldMappings) {
    const src = trim(mapping.sourceField);
    const target = mapping.targetField;
    // 优先按列索引（纯数字），其次按列名查找
    if (/^\d+$/.test(src)) {
      colMap[target] = parseInt(src);
      console.log(`[Excel解析] 列索引映射: ${src} -> ${target} (列${parseInt(src)})`);
    } else {
      colMap[target] = findCol(sheetData, src, dataStartRow);
      console.log(`[Excel解析] 列名映射: ${src} -> ${target} (列${colMap[target]})`);
    }
  }
  console.log('[Excel解析] 最终列映射:', colMap);

  // 3. 尾部收货人信息提取
  const tailRecipient = extractTailRecipients(sheetData, rule);

  // 4. 处理聚合：同外部编码/配送单号合并行
  const groupCol = colMap['外部编码'] ?? colMap['配送单号'] ?? -1;

  // 5. 处理矩阵转置
  if (rule.transposeRule?.enabled) {
    const cols = rule.transposeRule.colFields || [];
    const valCol = findCol(sheetData, rule.transposeRule.valueFields?.[0] || '数量', dataStartRow);
    const skuCol = colMap['SKU物品编码'] ?? findCol(sheetData, '物品编码', dataStartRow);
    const skuNameCol = colMap['SKU物品名称'] ?? findCol(sheetData, '物品名称', dataStartRow);

    for (let r = dataStartRow + 1; r < sheetData.length; r++) {
      const rowLabel = getCell(sheetData, r, skuCol >= 0 ? skuCol : 0);
      if (!rowLabel || /合计|小计|统计/.test(rowLabel)) continue;

      for (const colIdx of cols) {
        const col = typeof colIdx === 'string' ? parseInt(colIdx) : colIdx;
        const cellVal = getCell(sheetData, r, col);
        if (!cellVal || /^\s*$/.test(cellVal)) continue;

        // 复合单元格拆分：物品名x数量\n物品名x数量
        const parts = cellVal.split(/\n|[,，;；]/).filter(Boolean);
        for (const part of parts) {
          const match = part.match(/(.+?)[xX×多x](\d+)/);
          if (match) {
            const item: OrderItem = {
              id: generateId(),
              sku编码: trim(sheetData[r]?.[skuCol >= 0 ? skuCol : 0]) || '',
              sku名称: trim(match[1]),
              sku数量: parseInt(match[2]) || 1,
            };
            const order = createOrder(rule, colMap, sheetData, r, item);
            order.storeName = sheetData[dataStartRow]?.[typeof colIdx === 'string' ? parseInt(colIdx) : colIdx] || '';
            orders.push(order);
          } else {
            const item: OrderItem = {
              id: generateId(),
              sku编码: trim(sheetData[r]?.[skuCol >= 0 ? skuCol : 0]) || '',
              sku名称: trim(part),
              sku数量: 1,
            };
            const order = createOrder(rule, colMap, sheetData, r, item);
            orders.push(order);
          }
        }
      }
    }
    return orders;
  }

  // 6. 普通表格行处理
  const currentOrder: Record<string, Order> = {};

  for (let r = dataStartRow + 1; r < sheetData.length; r++) {
    const row0 = getCell(sheetData, r, 0);

    // 卡片边界识别
    for (const reg of rule.regionRules) {
      if (reg.type === 'card_boundary' && reg.cardStartKeyword) {
        if (row0.includes(reg.cardStartKeyword)) {
          // 新卡片开始，清空当前
          Object.keys(currentOrder).forEach(k => delete currentOrder[k]);
        }
      }
    }

    // 跳过合计行、空行、表头行
    if (!row0 || /合计|小计|统计|签收|签字/.test(row0)) continue;
    
    // 智能检测：如果这一行的多个字段都是表头名称，则跳过（防止表头被当作数据）
    // 使用更严格的条件：至少 2/3 的字段匹配才认为是表头
    const matchCount = rule.fieldMappings.filter(mapping => {
      const src = trim(mapping.sourceField);
      const target = mapping.targetField;
      const colIdx = colMap[target];
      if (colIdx >= 0 && colIdx < sheetData[r].length) {
        const cellValue = trim(sheetData[r][colIdx]).toLowerCase();
        const sourceFieldLower = src.toLowerCase();
        // 如果单元格内容与 sourceField 完全相同或高度相似
        return cellValue === sourceFieldLower || 
               (cellValue.includes(sourceFieldLower) && sourceFieldLower.includes(cellValue) && cellValue.length > 2);
      }
      return false;
    }).length;
    
    const headerThreshold = Math.max(2, Math.floor(rule.fieldMappings.length * 0.66));
    if (matchCount >= headerThreshold) {
      console.log(`[解析第${r}行] 检测到表头行（匹配${matchCount}/${rule.fieldMappings.length}个字段），跳过`);
      continue;
    }

    // 提取行数据
    const sku编码 = colMap['SKU物品编码'] >= 0 ? getCell(sheetData, r, colMap['SKU物品编码']) : getCell(sheetData, r, 0);
    const sku名称 = colMap['SKU物品名称'] >= 0 ? getCell(sheetData, r, colMap['SKU物品名称']) : getCell(sheetData, r, 1);
    const sku数量 = colMap['SKU发货数量'] >= 0
      ? parseFloat(getCell(sheetData, r, colMap['SKU发货数量']))
      : parseFloat(getCell(sheetData, r, 2)) || 1;
    const sku规格 = colMap['SKU规格型号'] >= 0 ? getCell(sheetData, r, colMap['SKU规格型号']) : '';

    // 收货人信息（支持两种字段名格式）
    const recipientNameCol = colMap['recipientName'] ?? colMap['收件人姓名'] ?? -1;
    const recipientPhoneCol = colMap['recipientPhone'] ?? colMap['收件人电话'] ?? -1;
    const recipientAddressCol = colMap['recipientAddress'] ?? colMap['收件人地址'] ?? -1;
    const storeNameCol = colMap['storeName'] ?? colMap['收货门店'] ?? -1;
    const externalCodeCol = colMap['externalCode'] ?? colMap['外部编码'] ?? colMap['配送单号'] ?? -1;
    
    const recipientName = recipientNameCol >= 0 ? getCell(sheetData, r, recipientNameCol) : tailRecipient.name;
    const recipientPhone = recipientPhoneCol >= 0 ? getCell(sheetData, r, recipientPhoneCol) : tailRecipient.phone;
    const recipientAddress = recipientAddressCol >= 0 ? getCell(sheetData, r, recipientAddressCol) : tailRecipient.address;
    const storeName = storeNameCol >= 0 ? getCell(sheetData, r, storeNameCol) : '';
    const externalCode = externalCodeCol >= 0 ? getCell(sheetData, r, externalCodeCol) : '';
    
    console.log(`[解析第${r}行] externalCode="${externalCode}", storeName="${storeName}", recipientName="${recipientName}", recipientPhone="${recipientPhone}"`);

    // 复合单元格拆分
    const parts = sku名称 ? sku名称.split(/\n|[,，;；]/).filter(Boolean) : [''];
    const qtyParts = String(sku数量).split(/\n|[,，;；]/).filter(Boolean);

    for (let p = 0; p < parts.length; p++) {
      const partQty = qtyParts[p] ? parseFloat(qtyParts[p]) : sku数量;
      if (!trim(parts[p])) continue;

      const item: OrderItem = {
        id: generateId(),
        sku编码: trim(sku编码),
        sku名称: trim(parts[p]),
        sku数量: isNaN(partQty) ? 1 : partQty,
        sku规格: trim(sku规格),
      };

      const orderKey = externalCode || generateId();

      if (!currentOrder[orderKey]) {
        currentOrder[orderKey] = {
          id: generateId(),
          externalCode: trim(externalCode),
          storeName: trim(storeName) || trim(recipientName),
          recipientName: trim(recipientName),
          recipientPhone: trim(recipientPhone),
          recipientAddress: trim(recipientAddress),
          items: [],
        };
      }

      // 避免同一 item 重复添加
      const exists = currentOrder[orderKey].items.some(i => i.sku编码 === item.sku编码 && i.sku名称 === item.sku名称);
      if (!exists) {
        currentOrder[orderKey].items.push(item);
      }
    }
  }

  return Object.values(currentOrder);
}

function createOrder(
  rule: ParseRule,
  colMap: Record<string, number>,
  sheetData: string[][],
  row: number,
  item: OrderItem
): Order {
  return {
    id: generateId(),
    items: [item],
    storeName: '',
    recipientName: '',
    recipientPhone: '',
    recipientAddress: '',
  };
}

// ---------- 主解析入口 ----------
export function parseExcel(
  buffer: ArrayBuffer,
  rule: ParseRule
): ParseOutput {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const allOrders: Order[] = [];
  const errors: string[] = [];

  // 默认处理所有工作表（除非规则明确指定只处理第一个）
  const sheetsToProcess = rule.splitRule?.mergeAllSheets === false
    ? [workbook.SheetNames[0]]
    : workbook.SheetNames;

  console.log(`[Excel解析] 开始解析，共 ${sheetsToProcess.length} 个工作表`);
  console.log(`[Excel解析] 使用的规则:`, JSON.stringify(rule, null, 2));

  for (const sheetName of sheetsToProcess) {
    try {
      console.log(`[Excel解析] 正在处理工作表: ${sheetName}`);
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
      console.log(`[Excel解析] 工作表 ${sheetName} 共有 ${data.length} 行`);
      
      // 打印前5行数据用于调试
      console.log(`[Excel解析] 前5行数据:`);
      for (let i = 0; i < Math.min(5, data.length); i++) {
        console.log(`  第${i}行:`, data[i]);
      }
      
      const sheetOrders = applyRuleToSheet(data, rule);
      console.log(`[Excel解析] 工作表 ${sheetName} 解析出 ${sheetOrders.length} 条订单`);
      allOrders.push(...sheetOrders);
    } catch (e: any) {
      console.error(`[Excel解析] 工作表 ${sheetName} 解析失败:`, e);
      errors.push(`Sheet[${sheetName}] 解析失败: ${e.message}`);
    }
  }

  console.log(`[Excel解析] 总共解析出 ${allOrders.length} 条订单`);
  return { orders: allOrders, errors };
}

// 纯前端解析（不需要规则时，直接提取表格数据）
export function quickParseExcel(buffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
}
