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
function extractTailRecipients(data: string[][], rule: ParseRule): { name: string; phone: string; address: string; externalCode: string; storeName: string } {
  const result = { name: '', phone: '', address: '', externalCode: '', storeName: '' };
  
  for (const reg of rule.regionRules) {
    if (reg.type === 'tail横向提取') {
      // 强制扩大搜索范围：至少搜索最后15行，确保能覆盖到底部信息
      const rowsFromEnd = Math.max(reg.rowsFromEnd || 1, 15);
      const startRow = Math.max(0, data.length - rowsFromEnd);
      
      console.log(`[尾部提取] 搜索范围: 第${startRow}行 到 第${data.length - 1}行 (共${data.length}行)`);
      
      // 打印尾部区域的原始数据（调试用）
      console.log(`[尾部提取] 尾部区域数据预览:`);
      for (let r = startRow; r < data.length; r++) {
        const row = data[r];
        if (row && row.some(cell => cell && String(cell).trim())) {
          console.log(`  第${r}行:`, row.slice(0, 15)); // 只显示前15列
        }
      }
      
      // 方法1：从字段映射中找收件人相关字段
      for (const mapping of rule.fieldMappings) {
        const target = mapping.targetField;
        const source = trim(mapping.sourceField);
        
        if (target === 'recipientName' || target === '收件人姓名') {
          // 在尾部区域搜索这个字段
          for (let r = startRow; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
              const cell = trim(data[r][c]);
              const cellLower = cell.toLowerCase();
              // 支持格式: "收货人: 张锦峰" 或 "收货人 张锦峰"
              if (cellLower.includes('收货人') || cellLower.includes('收件人')) {
                // 提取值：可能是同一单元格的后面部分，或右边单元格
                const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
                result.name = afterColon || trim(data[r][c + 1]) || trim(data[r][c + 2]) || '';
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
              const cell = trim(data[r][c]);
              const cellLower = cell.toLowerCase();
              if (cellLower.includes('收货电话') || cellLower.includes('收货手机') || cellLower.includes('联系电话')) {
                const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
                result.phone = afterColon || trim(data[r][c + 1]) || trim(data[r][c + 2]) || '';
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
              const cell = trim(data[r][c]);
              const cellLower = cell.toLowerCase();
              if (cellLower.includes('收货地址') || cellLower.includes('地址')) {
                const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
                result.address = afterColon || trim(data[r][c + 1]) || trim(data[r][c + 2]) || '';
                console.log(`[尾部提取] 找到收件人地址: "${result.address}" (第${r}行第${c}列)`);
                break;
              }
            }
            if (result.address) break;
          }
        }
        
        // 新增：提取单据号
        if (target === 'externalCode' || target === '外部编码' || target === '配送单号') {
          for (let r = startRow; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
              const cell = trim(data[r][c]);
              const cellLower = cell.toLowerCase();
              if (cellLower.includes('单据号') || cellLower.includes('单号') || cellLower.includes('配送单号')) {
                const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
                result.externalCode = afterColon || trim(data[r][c + 1]) || trim(data[r][c + 2]) || '';
                console.log(`[尾部提取] 找到单据号: "${result.externalCode}" (第${r}行第${c}列)`);
                break;
              }
            }
            if (result.externalCode) break;
          }
        }
        
        // 新增：提取收货机构/门店
        if (target === 'storeName' || target === '收货门店' || target === '收货机构') {
          for (let r = startRow; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
              const cell = trim(data[r][c]);
              const cellLower = cell.toLowerCase();
              if (cellLower.includes('收货机构') || cellLower.includes('收货门店') || cellLower.includes('机构')) {
                const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
                result.storeName = afterColon || trim(data[r][c + 1]) || trim(data[r][c + 2]) || '';
                console.log(`[尾部提取] 找到收货机构: "${result.storeName}" (第${r}行第${c}列)`);
                break;
              }
            }
            if (result.storeName) break;
          }
        }
      }
      
      // 方法2：如果字段映射没找到，用关键词搜索（更强大的正则表达式）
      if (!result.name || !result.phone || !result.externalCode) {
        console.log(`[尾部提取] 方法1未完全找到，尝试方法2（关键词+正则）`);
        
        for (let r = startRow; r < data.length; r++) {
          for (let c = 0; c < data[r].length; c++) {
            const cell = trim(data[r][c]);
            const cellLower = cell.toLowerCase();
            
            // 手机号匹配（11位数字）
            if (/1[3-9]\d{9}/.test(cell) && !result.phone) {
              result.phone = cell;
              console.log(`[尾部提取] 找到手机号: "${result.phone}" (第${r}行第${c}列)`);
            }
            
            // 收货人匹配（支持多种格式）
            if (!result.name) {
              const nameMatch = cell.match(/[收受]货[人客]|收件[人客][：:]\s*([^,，;；\n]+)/);
              if (nameMatch) {
                result.name = nameMatch[1].trim();
                console.log(`[尾部提取] 找到收货人: "${result.name}" (第${r}行第${c}列)`);
              }
            }
            
            // 单据号匹配
            if (!result.externalCode) {
              const codeMatch = cell.match(/(单据|配送|运|订)[单号][：:]\s*([^,，;；\n]+)/i);
              if (codeMatch) {
                result.externalCode = codeMatch[2].trim();
                console.log(`[尾部提取] 找到单据号: "${result.externalCode}" (第${r}行第${c}列)`);
              }
            }
            
            // 收货机构匹配
            if (!result.storeName) {
              const storeMatch = cell.match(/(收货|门店|机构|配送中心)[：:]\s*([^,，;；\n]+)/i);
              if (storeMatch && !storeMatch[0].includes('备注')) {
                result.storeName = storeMatch[2].trim();
                console.log(`[尾部提取] 找到收货机构: "${result.storeName}" (第${r}行第${c}列)`);
              }
            }
          }
        }
      }
      
      break;
    }
  }
  
  console.log(`[尾部提取] 最终结果: 姓名="${result.name}", 电话="${result.phone}", 地址="${result.address}", 单据号="${result.externalCode}", 机构="${result.storeName}"`);
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
  
  // 智能检测：在更大范围内查找最可能是表头的行
  // 表头特征：包含多个与 fieldMappings 中 sourceField 匹配的列名
  console.log('[Excel解析] 开始智能检测表头行...');
  let bestHeaderRow = dataStartRow;
  let bestMatchScore = 0;
  
  // 扩大搜索范围：从第0行到第40行，或者从dataStartRow-5开始
  const searchStart = Math.max(0, dataStartRow - 10); // 允许向前搜索10行
  const searchEnd = Math.min(40, sheetData.length);
  
  console.log(`[Excel解析] 搜索范围: 第${searchStart}行 到 第${searchEnd}行 (dataStartRow=${dataStartRow})`);
  
  for (let r = searchStart; r < searchEnd; r++) {
    let matchScore = 0;
    const row = sheetData[r];
    const matchedFields: string[] = [];
    
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
          matchedFields.push(src);
          break;
        }
      }
    }
    
    console.log(`[Excel解析] 第${r}行匹配得分: ${matchScore}/${rule.fieldMappings.length}, 匹配字段: [${matchedFields.join(', ')}]`);
    
    // 关键优化：表头行必须满足以下条件之一
    // 1. 匹配了至少 2/3 的字段（严格标准）
    // 2. 或者匹配了至少3个字段（适用于字段较少的规则）
    const minRequired = Math.max(3, Math.floor(rule.fieldMappings.length * 0.66));
    
    if (matchScore > bestMatchScore && matchScore >= minRequired) {
      bestMatchScore = matchScore;
      bestHeaderRow = r;
      console.log(`[Excel解析]    更新最佳表头: 第${r}行 (匹配${matchScore}个字段)`);
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
    
    // 新增：对于卡片式布局，如果这一行只包含 1-2 个字段名（散落的说明），也应该跳过
    // 例如：第5行的“调入门店”、“收货人”、“电话”等
    if (matchCount >= 1 && matchCount < headerThreshold) {
      // 检查这一行是否有实质性的数据（非表头名称的内容）
      const hasRealData = rule.fieldMappings.some(mapping => {
        const target = mapping.targetField;
        const colIdx = colMap[target];
        if (colIdx >= 0 && colIdx < sheetData[r].length) {
          const cellValue = trim(sheetData[r][colIdx]);
          const sourceFieldLower = trim(mapping.sourceField).toLowerCase();
          // 如果单元格内容不是表头名称，且有实际内容，则认为是数据行
          return cellValue && !cellValue.toLowerCase().includes(sourceFieldLower);
        }
        return false;
      });
      
      if (!hasRealData) {
        console.log(`[解析第${r}行] 检测到散落的字段说明（匹配${matchCount}个字段），跳过`);
        continue;
      }
    }

    // 提取行数据
    const sku编码 = colMap['SKU物品编码'] >= 0 ? getCell(sheetData, r, colMap['SKU物品编码']) : getCell(sheetData, r, 0);
    const sku名称 = colMap['SKU物品名称'] >= 0 ? getCell(sheetData, r, colMap['SKU物品名称']) : getCell(sheetData, r, 1);
    const sku数量 = colMap['SKU发货数量'] >= 0
      ? parseFloat(getCell(sheetData, r, colMap['SKU发货数量']))
      : parseFloat(getCell(sheetData, r, 2)) || 1;
    const sku规格 = colMap['SKU规格型号'] >= 0 ? getCell(sheetData, r, colMap['SKU规格型号']) : '';

    // 收货人信息（支持两种字段名格式）
    // 注意：如果规则包含 tail横向提取，说明单据号和收货人在底部，应该优先使用尾部提取的结果
    const hasTailExtraction = rule.regionRules.some(r => r.type === 'tail横向提取');
    
    const recipientNameCol = colMap['recipientName'] ?? colMap['收件人姓名'] ?? -1;
    const recipientPhoneCol = colMap['recipientPhone'] ?? colMap['收件人电话'] ?? -1;
    const recipientAddressCol = colMap['recipientAddress'] ?? colMap['收件人地址'] ?? -1;
    const storeNameCol = colMap['storeName'] ?? colMap['收货门店'] ?? -1;
    const externalCodeCol = colMap['externalCode'] ?? colMap['外部编码'] ?? colMap['配送单号'] ?? -1;
    
    // 如果有尾部提取规则，优先使用尾部提取的结果
    let recipientName = tailRecipient.name;
    let recipientPhone = tailRecipient.phone;
    let recipientAddress = tailRecipient.address;
    let storeName = tailRecipient.storeName;
    let externalCode = tailRecipient.externalCode;
    
    // 只有当尾部没提取到，才尝试从列中读取
    if (!hasTailExtraction || !recipientName) {
      recipientName = recipientNameCol >= 0 ? getCell(sheetData, r, recipientNameCol) : recipientName;
    }
    if (!hasTailExtraction || !recipientPhone) {
      recipientPhone = recipientPhoneCol >= 0 ? getCell(sheetData, r, recipientPhoneCol) : recipientPhone;
    }
    if (!hasTailExtraction || !recipientAddress) {
      recipientAddress = recipientAddressCol >= 0 ? getCell(sheetData, r, recipientAddressCol) : recipientAddress;
    }
    if (!hasTailExtraction || !storeName) {
      storeName = storeNameCol >= 0 ? getCell(sheetData, r, storeNameCol) : storeName;
    }
    if (!hasTailExtraction || !externalCode) {
      externalCode = externalCodeCol >= 0 ? getCell(sheetData, r, externalCodeCol) : externalCode;
    }
    
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
