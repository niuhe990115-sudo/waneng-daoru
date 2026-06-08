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
  const cleanColName = colName.replace(/["''']/g, '').trim().toLowerCase();
  
  console.log(`[findCol] 搜索列: "${colName}" (清理后: "${cleanColName}")`);
  
  // 搜索前10行作为可能的表头行
  for (let r = rowStart; r < Math.min(rowStart + 10, data.length); r++) {
    for (let c = 0; c < (data[r]?.length || 0); c++) {
      const cell = trim(data[r]?.[c]);
      
      // 跳过空单元格
      if (!cell) continue;
      
      // 清理单元格内容：去除引号、空格
      const cleanCell = cell.replace(/["''']/g, '').trim().toLowerCase();
      
      // 优先完全匹配
      if (cleanCell === cleanColName) {
        console.log(`[findCol] ✓ 完全匹配: "${colName}" -> 第${r}行第${c}列 (原始值: "${data[r][c]}")`);
        return c;
      }
    }
  }
  
  // 如果没有完全匹配，再尝试包含匹配（更智能的匹配）
  for (let r = rowStart; r < Math.min(rowStart + 10, data.length); r++) {
    for (let c = 0; c < (data[r]?.length || 0); c++) {
      const cell = trim(data[r]?.[c]);
      if (!cell) continue;
      
      const cleanCell = cell.replace(/["''']/g, '').trim().toLowerCase();
      
      // 包含匹配（双向）- 增强：支持多个关键词组合
      if (cleanCell.includes(cleanColName) || cleanColName.includes(cleanCell)) {
        console.log(`[findCol] ✓ 包含匹配: "${colName}" -> 第${r}行第${c}列 (原始值: "${data[r][c]}")`);
        return c;
      }
      
      // 新增：对于复合字段名，支持部分匹配
      // 例如："收货人姓名" 可以匹配 "收货人" 或 "姓名"
      const colNameParts = cleanColName.split(/[姓名电话地址编码门店机构]/).filter(Boolean);
      if (colNameParts.length > 0) {
        const hasPartialMatch = colNameParts.some(part => cleanCell.includes(part));
        if (hasPartialMatch && cleanCell.length > 2) {
          console.log(`[findCol] ✓ 部分匹配: "${colName}" -> 第${r}行第${c}列 (原始值: "${data[r][c]}")`);
          return c;
        }
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

// 新增：全局智能搜索收货人信息（用于卡片式布局）
function extractGlobalRecipients(data: string[][], rule: ParseRule): { name: string; phone: string; address: string; externalCode: string; storeName: string } {
  const result = { name: '', phone: '', address: '', externalCode: '', storeName: '' };
  
  console.log('[全局搜索] 开始在整个表格中搜索收货人信息...');
  
  // 方法1：使用字段映射中的关键词搜索
  for (const mapping of rule.fieldMappings) {
    const target = mapping.targetField;
    const source = trim(mapping.sourceField).toLowerCase();
    
    if (target === 'recipientName' || target === '收件人姓名') {
      // 搜索整个表格
      for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
          const cell = trim(data[r][c]);
          const cellLower = cell.toLowerCase();
          
          // 匹配包含"收货人"或"收件人"的单元格
          if ((cellLower.includes('收货人') || cellLower.includes('收件人')) && !cellLower.includes('电话') && !cellLower.includes('地址')) {
            // 跳过包含"【"的单元格（可能是备注或其他信息）
            if (cell.includes('【') || cell.includes('】')) {
              continue;
            }
            
            // 提取值：可能是同一单元格的后面部分，或右边单元格
            const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
            const nextCell = trim(data[r][c + 1]);
            const nextNextCell = trim(data[r][c + 2]);
            
            if (afterColon && afterColon.length > 1 && !afterColon.includes('收货人') && !afterColon.includes('【')) {
              result.name = afterColon;
            } else if (nextCell && nextCell.length > 1 && !nextCell.includes('收货人') && !nextCell.includes('【')) {
              result.name = nextCell;
            } else if (nextNextCell && nextNextCell.length > 1 && !nextNextCell.includes('【')) {
              result.name = nextNextCell;
            }
            
            if (result.name) {
              console.log(`[全局搜索] 找到收件人姓名: "${result.name}" (第${r}行第${c}列)`);
              break;
            }
          }
        }
        if (result.name) break;
      }
    }
    
    if (target === 'recipientPhone' || target === '收件人电话') {
      for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
          const cell = trim(data[r][c]);
          const cellLower = cell.toLowerCase();
          
          if (cellLower.includes('收货电话') || cellLower.includes('收货手机') || cellLower.includes('联系电话') || cellLower.includes('电话')) {
            const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
            const nextCell = trim(data[r][c + 1]);
            const nextNextCell = trim(data[r][c + 2]);
            
            if (afterColon && /1[3-9]\d{9}/.test(afterColon)) {
              result.phone = afterColon;
            } else if (nextCell && /1[3-9]\d{9}/.test(nextCell)) {
              result.phone = nextCell;
            } else if (nextNextCell && /1[3-9]\d{9}/.test(nextNextCell)) {
              result.phone = nextNextCell;
            } else if (afterColon && afterColon.length > 5) {
              result.phone = afterColon;
            } else if (nextCell && nextCell.length > 5) {
              result.phone = nextCell;
            }
            
            if (result.phone) {
              console.log(`[全局搜索] 找到收件人电话: "${result.phone}" (第${r}行第${c}列)`);
              break;
            }
          }
          
          // 直接匹配手机号
          if (/1[3-9]\d{9}/.test(cell) && !result.phone) {
            result.phone = cell;
            console.log(`[全局搜索] 直接找到手机号: "${result.phone}" (第${r}行第${c}列)`);
            break;
          }
        }
        if (result.phone) break;
      }
    }
    
    if (target === 'recipientAddress' || target === '收件人地址') {
      for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
          const cell = trim(data[r][c]);
          const cellLower = cell.toLowerCase();
          
          if (cellLower.includes('收货地址') || cellLower.includes('地址')) {
            const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
            const nextCell = trim(data[r][c + 1]);
            const nextNextCell = trim(data[r][c + 2]);
            
            result.address = afterColon || nextCell || nextNextCell || '';
            if (result.address) {
              console.log(`[全局搜索] 找到收件人地址: "${result.address}" (第${r}行第${c}列)`);
              break;
            }
          }
        }
        if (result.address) break;
      }
    }
    
    if (target === 'externalCode' || target === '外部编码' || target === '配送单号') {
      for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
          const cell = trim(data[r][c]);
          const cellLower = cell.toLowerCase();
          
          if (cellLower.includes('单据号') || cellLower.includes('单号') || cellLower.includes('配送单号')) {
            const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
            const nextCell = trim(data[r][c + 1]);
            const nextNextCell = trim(data[r][c + 2]);
            
            result.externalCode = afterColon || nextCell || nextNextCell || '';
            if (result.externalCode) {
              console.log(`[全局搜索] 找到单据号: "${result.externalCode}" (第${r}行第${c}列)`);
              break;
            }
          }
        }
        if (result.externalCode) break;
      }
    }
    
    if (target === 'storeName' || target === '收货门店' || target === '收货机构') {
      for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
          const cell = trim(data[r][c]);
          const cellLower = cell.toLowerCase();
          
          if (cellLower.includes('收货机构') || cellLower.includes('收货门店') || cellLower.includes('机构') || cellLower.includes('门店')) {
            const afterColon = cell.split(/[:：]/).slice(1).join('').trim();
            const nextCell = trim(data[r][c + 1]);
            const nextNextCell = trim(data[r][c + 2]);
            
            result.storeName = afterColon || nextCell || nextNextCell || '';
            if (result.storeName) {
              console.log(`[全局搜索] 找到收货机构: "${result.storeName}" (第${r}行第${c}列)`);
              break;
            }
          }
        }
        if (result.storeName) break;
      }
    }
  }
  
  console.log(`[全局搜索] 最终结果: 姓名="${result.name}", 电话="${result.phone}", 地址="${result.address}", 单据号="${result.externalCode}", 机构="${result.storeName}"`);
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
  
  // 扩大搜索范围：从第0行到第50行，或者从dataStartRow-5开始
  const searchStart = Math.max(0, dataStartRow - 10); // 允许向前搜索10行
  const searchEnd = Math.min(50, sheetData.length);
  
  console.log(`[Excel解析] 搜索范围: 第${searchStart}行 到 第${searchEnd}行 (dataStartRow=${dataStartRow})`);
  
  // 检查是否有卡片式布局标记（提前声明，后面会用到）
  const hasCardLayout = rule.fieldMappings.some(m => (m as any).layoutType === 'card_kv');
  
  // 如果是卡片式布局，需要区分：收货人信息是键值对，物品信息是表格
  // 对于卡片式布局，我们要找的是物品表格的表头（包含"物品名称"、"物品编码"、"数量"等）
  const itemFields = ['物品名称', '物品编码', '数量', '发货数量', 'SKU', '品名', '件数'];
  const hasItemTable = rule.fieldMappings.some(m => 
    itemFields.some(field => m.sourceField.toLowerCase().includes(field.toLowerCase()))
  );
  
  if (hasCardLayout && hasItemTable) {
    console.log('[Excel解析] 检测到卡片式布局+物品表格，优先搜索物品表头...');
    // 专门搜索包含物品相关字段的行
    for (let r = searchStart; r < searchEnd; r++) {
      let itemMatchScore = 0;
      const row = sheetData[r];
      const matchedItemFields: string[] = [];
      
      for (const itemField of itemFields) {
        for (let c = 0; c < row.length; c++) {
          const cell = trim(row[c]).toLowerCase();
          if (cell.includes(itemField.toLowerCase())) {
            itemMatchScore++;
            matchedItemFields.push(itemField);
            break;
          }
        }
      }
      
      console.log(`[Excel解析] 第${r}行物品字段匹配: ${itemMatchScore}, 匹配字段: [${matchedItemFields.join(', ')}]`);
      
      if (itemMatchScore >= 2) {
        bestMatchScore = itemMatchScore;
        bestHeaderRow = r;
        console.log(`[Excel解析] ✓ 找到物品表头: 第${r}行 (匹配${itemMatchScore}个物品字段)`);
        break;
      }
    }
  } else {
    // 标准表格布局，使用原有逻辑
    for (let r = searchStart; r < searchEnd; r++) {
      let matchScore = 0;
      const row = sheetData[r];
      const matchedFields: string[] = [];
      
      // ===== 增强的说明文字过滤 =====
      const rowText = row.join(' ').toLowerCase();
      const isDescriptionRow = 
        rowText.includes('说明') || 
        rowText.includes('备注') || 
        rowText.includes('提示') || 
        rowText.includes('红色标记') ||
        rowText.includes('必填项') ||
        rowText.includes('填写') ||
        rowText.includes('请') ||
        rowText.includes('注意');
      
      if (isDescriptionRow) {
        console.log(`[Excel解析] 第${r}行是说明文字，跳过`);
        continue;
      }
      
      // 表头行应该有多个列（至少3个），单列的行通常是说明文字
      const nonEmptyCells = row.filter(cell => trim(cell)).length;
      if (nonEmptyCells < 3) {
        console.log(`[Excel解析] 第${r}行非空列数=${nonEmptyCells}，少于3个，跳过`);
        continue;
      }
      
      // 新增：表头行的每个单元格应该是简短的字段名，不应该包含长句
      const hasLongSentences = row.some(cell => {
        const c = trim(cell);
        return c.length > 15 && /[。！？，、]/.test(c); // 包含标点符号的长句
      });
      if (hasLongSentences) {
        console.log(`[Excel解析] 第${r}行包含长句，可能是说明文字，跳过`);
        continue;
      }
      
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
          
          // 新增：支持部分匹配（例如"收货人"匹配"收货人姓名"）
          // 但要确保匹配的单元格内容不是纯说明文字
          const srcParts = src.split(/[姓名电话地址编码门店机构]/).filter(Boolean);
          if (srcParts.length > 0 && srcParts.some(part => cell.includes(part) && part.length > 1)) {
            // 验证：匹配的单元格应该只包含字段名，而不是长句
            if (cell.length < 20) { // 表头字段名通常较短
              matchScore++;
              matchedFields.push(src);
              break;
            }
          }
        }
      }
      
      console.log(`[Excel解析] 第${r}行匹配得分: ${matchScore}/${rule.fieldMappings.length}, 匹配字段: [${matchedFields.join(', ')}], 非空列数: ${nonEmptyCells}`);
      
      // 关键优化：表头行必须满足以下条件之一
      // 1. 匹配了至少 2/3 的字段（严格标准）
      // 2. 或者匹配了至少3个字段（适用于字段较少的规则）
      const minRequired = Math.max(3, Math.floor(rule.fieldMappings.length * 0.66));
      
      if (matchScore > bestMatchScore && matchScore >= minRequired) {
        bestMatchScore = matchScore;
        bestHeaderRow = r;
        console.log(`[Excel解析]    ✓ 更新最佳表头: 第${r}行 (匹配${matchScore}个字段)`);
      }
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
  
  // 新增：智能全局搜索收货人信息（用于卡片式布局）
  console.log('[Excel解析] 准备调用 extractGlobalRecipients, hasCardLayout=', hasCardLayout);
  const globalRecipient = hasCardLayout ? extractGlobalRecipients(sheetData, rule) : { name: '', phone: '', address: '', externalCode: '', storeName: '' };
  console.log('[Excel解析] globalRecipient 结果:', globalRecipient);

  // 4. 处理聚合：同外部编码/配送单号合并行
  // 如果没有externalCode映射，尝试使用物品编码列作为外部编码
  let groupCol = colMap['外部编码'] ?? colMap['配送单号'] ?? -1;
  if (groupCol < 0 && colMap['SKU物品编码'] >= 0) {
    console.log('[Excel解析] 未找到externalCode列，使用SKU物品编码列作为外部编码');
    groupCol = colMap['SKU物品编码'];
  }

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
  
  // 检查布局类型（hasCardLayout已在第437行声明）
  const hasTailExtraction = rule.regionRules.some(r => r.type === 'tail横向提取');
  
  console.log(`[布局检测] hasCardLayout=${hasCardLayout}, hasTailExtraction=${hasTailExtraction}`);
  
  // 对于卡片式布局，需要支持多个卡片的解析
  // 每个卡片有独立的头部信息（外部编码、收货人等）和物品列表
  // 但如果是混合布局（有尾部收货人信息），则不使用多卡片解析
  if (hasCardLayout && hasTailExtraction) {
    console.log('[混合布局] 检测到卡片式布局+尾部提取，使用标准解析逻辑（全局搜索收货人）');
    // 混合布局：收货人在底部全局共享，物品在表格中按外部编码分组
    // 不使用多卡片解析，使用标准逻辑
  } else if (hasCardLayout && !hasTailExtraction) {
    console.log('[卡片式布局] 开始多卡片解析...');
    
    // 查找外部编码/配送单号字段，作为卡片边界的标志
    const externalCodeMapping = rule.fieldMappings.find(m => 
      m.targetField === 'externalCode' || m.targetField === '外部编码'
    );
    
    // 找到外部编码所在的列
    let externalCodeCol = colMap['externalCode'] ?? colMap['外部编码'] ?? colMap['配送单号'] ?? -1;
    
    // 如果没有externalCode映射，尝试使用物品编码列
    if (externalCodeCol < 0 && colMap['SKU物品编码'] >= 0) {
      console.log('[卡片式布局] 未找到externalCode列，使用SKU物品编码列');
      externalCodeCol = colMap['SKU物品编码'];
    }
    
    console.log(`[卡片式布局] 外部编码列: ${externalCodeCol}`);
    
    // 如果找不到externalCode列，说明规则不完整，使用标准解析逻辑
    if (!externalCodeMapping || externalCodeCol < 0) {
      console.log('[卡片式布局] 未找到externalCode字段映射或列，使用标准解析逻辑');
      return applySingleCardParsing(sheetData, rule, colMap, globalRecipient, tailRecipient, dataStartRow);
    }
    
    // 扫描所有行，识别卡片边界
    const cards: Array<{ startRow: number; endRow: number; externalCode: string }> = [];
    let currentCardStart = -1;
    let currentCardCode = '';
    
    for (let r = dataStartRow + 1; r < sheetData.length; r++) {
      const externalCodeValue = trim(getCell(sheetData, r, externalCodeCol));
      
      // 过滤明显的表头/说明文字
      // 1. 跳过包含表头关键词的行（如“上游单据”、“备注”等）
      if (/上游单据|备注|说明|合计|小计|统计|签收|签字/.test(externalCodeValue)) {
        console.log(`[卡片式布局] 第${r}行外部编码="${externalCodeValue}"，是表头文字，跳过`);
        continue;
      }
      
      // 2. 跳过包含“【”的行（备注信息）
      if (externalCodeValue.includes('【') || externalCodeValue.includes('】')) {
        console.log(`[卡片式布局] 第${r}行外部编码="${externalCodeValue}"，包含【】，跳过`);
        continue;
      }
      
      // 3. 外部编码应该是字母+数字组合（如LMTZ0160009），或者纯数字
      // 如果全是中文，说明是表头文字
      if (/^[\u4e00-\u9fa5]+$/.test(externalCodeValue)) {
        console.log(`[卡片式布局] 第${r}行外部编码="${externalCodeValue}"，全是中文，跳过`);
        continue;
      }
      
      // 如果这一行有外部编码，说明是新卡片的开始
      if (externalCodeValue && externalCodeValue.length > 3) {
        // 保存上一个卡片
        if (currentCardStart >= 0 && currentCardCode) {
          cards.push({ startRow: currentCardStart, endRow: r - 1, externalCode: currentCardCode });
        }
        // 开始新卡片
        currentCardStart = r;
        currentCardCode = externalCodeValue;
        console.log(`[卡片式布局] 发现新卡片: 第${r}行, 外部编码=${externalCodeValue}`);
      }
    }
    
    // 保存最后一个卡片
    if (currentCardStart >= 0 && currentCardCode) {
      cards.push({ startRow: currentCardStart, endRow: sheetData.length - 1, externalCode: currentCardCode });
    }
    
    console.log(`[卡片式布局] 共找到 ${cards.length} 个卡片`);
    
    // 对每个卡片进行解析
    for (const card of cards) {
      const cardOrders = parseCard(sheetData, rule, colMap, card, dataStartRow, globalRecipient);
      Object.assign(currentOrder, cardOrders);
    }
    
    return Object.values(currentOrder);
  }
  
  // 非卡片式布局，使用原有逻辑
  let itemTableEnded = false;
  let consecutiveNonItemRows = 0;
  const maxConsecutiveNonItemRows = 2;

  for (let r = dataStartRow + 1; r < sheetData.length; r++) {
    const row0 = getCell(sheetData, r, 0);
    
    // 检测物品表格是否结束
    if (hasCardLayout && !itemTableEnded) {
      // 检查这一行是否是物品数据行
      // 物品行的特征：在物品列（SKU物品编码、SKU物品名称、SKU发货数量）中有数据
      const itemColumns = ['SKU物品编码', 'SKU物品名称', 'SKU发货数量'];
      let hasItemData = false;
      
      for (const itemCol of itemColumns) {
        const colIdx = colMap[itemCol];
        if (colIdx >= 0 && colIdx < sheetData[r].length) {
          const cellValue = trim(sheetData[r][colIdx]);
          if (cellValue) {
            hasItemData = true;
            break;
          }
        }
      }
      
      if (!hasItemData) {
        consecutiveNonItemRows++;
        if (consecutiveNonItemRows >= maxConsecutiveNonItemRows) {
          console.log(`[解析第${r}行] 检测到连续${consecutiveNonItemRows}行非物品数据，物品表格结束`);
          itemTableEnded = true;
        }
      } else {
        consecutiveNonItemRows = 0; // 重置计数
      }
      
      if (itemTableEnded) {
        console.log(`[解析第${r}行] 物品表格已结束，跳过后续行`);
        continue;
      }
    }

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
    
    // 新增：如果这一行包含表头关键词（如"【快递】"），说明是表格的备注信息，不应该当作物品
    if (/【.*】/.test(row0) || row0.includes('备注')) {
      console.log(`[解析第${r}行] 检测到表头关键词（${row0}），跳过`);
      continue;
    }
    
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
    
    // 优先级：全局搜索 > 尾部提取 > 列提取
    let recipientName = globalRecipient.name || tailRecipient.name;
    let recipientPhone = globalRecipient.phone || tailRecipient.phone;
    let recipientAddress = globalRecipient.address || tailRecipient.address;
    let storeName = globalRecipient.storeName || tailRecipient.storeName;
    let externalCode = globalRecipient.externalCode || tailRecipient.externalCode;
    
    // 只有当全局和尾部都没提取到，才尝试从列中读取
    if (!recipientName) {
      recipientName = recipientNameCol >= 0 ? getCell(sheetData, r, recipientNameCol) : '';
    }
    if (!recipientPhone) {
      recipientPhone = recipientPhoneCol >= 0 ? getCell(sheetData, r, recipientPhoneCol) : '';
    }
    if (!recipientAddress) {
      recipientAddress = recipientAddressCol >= 0 ? getCell(sheetData, r, recipientAddressCol) : '';
    }
    if (!storeName) {
      storeName = storeNameCol >= 0 ? getCell(sheetData, r, storeNameCol) : '';
    }
    if (!externalCode) {
      externalCode = externalCodeCol >= 0 ? getCell(sheetData, r, externalCodeCol) : '';
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

// 解析单个卡片（用于卡片式布局）
function parseCard(
  sheetData: string[][],
  rule: ParseRule,
  colMap: Record<string, number>,
  card: { startRow: number; endRow: number; externalCode: string },
  headerRow: number,
  globalRecipient?: { name: string; phone: string; address: string; externalCode: string; storeName: string }
): Record<string, Order> {
  const orders: Record<string, Order> = {};
  const orderKey = card.externalCode;
  
  console.log(`[卡片解析] 开始解析卡片: ${orderKey}, 行范围: ${card.startRow}-${card.endRow}`);
  
  // 优先使用全局搜索到的收货人信息（混合布局场景）
  // 如果没有全局搜索的结果，才尝试从卡片头部提取
  const headerInfo = globalRecipient && globalRecipient.name ?
    {
      storeName: globalRecipient.storeName || '',
      recipientName: globalRecipient.name || '',
      recipientPhone: globalRecipient.phone || '',
      recipientAddress: globalRecipient.address || '',
    } :
    extractCardHeader(sheetData, rule, card.startRow, card.endRow);
  
  console.log(`[卡片解析] 头部信息:`, headerInfo);
  
  // 创建订单对象
  orders[orderKey] = {
    id: generateId(),
    externalCode: orderKey,
    storeName: headerInfo.storeName || '',
    recipientName: headerInfo.recipientName || '',
    recipientPhone: headerInfo.recipientPhone || '',
    recipientAddress: headerInfo.recipientAddress || '',
    items: [],
  };
  
  // 提取物品信息（在头部信息之后的行）
  let itemsStarted = false;
  for (let r = card.startRow; r <= card.endRow; r++) {
    const row = sheetData[r];
    
    // 跳过空行
    const nonEmptyCells = row.filter(cell => trim(cell)).length;
    if (nonEmptyCells === 0) continue;
    
    // 检查这一行是否是物品行
    // 物品行的特征：在物品列（SKU物品编码、SKU物品名称、SKU发货数量）中有数据
    const itemColumns = ['SKU物品编码', 'SKU物品名称', 'SKU发货数量'];
    let hasItemData = false;
    
    for (const itemCol of itemColumns) {
      const colIdx = colMap[itemCol];
      if (colIdx >= 0 && colIdx < row.length) {
        const cellValue = trim(row[colIdx]);
        if (cellValue) {
          hasItemData = true;
          break;
        }
      }
    }
    
    if (!hasItemData) continue;
    
    itemsStarted = true;
    
    // 提取物品数据
    const sku编码 = colMap['SKU物品编码'] >= 0 ? getCell(sheetData, r, colMap['SKU物品编码']) : '';
    const sku名称 = colMap['SKU物品名称'] >= 0 ? getCell(sheetData, r, colMap['SKU物品名称']) : '';
    const sku数量 = colMap['SKU发货数量'] >= 0
      ? parseFloat(getCell(sheetData, r, colMap['SKU发货数量']))
      : 1;
    const sku规格 = colMap['SKU规格型号'] >= 0 ? getCell(sheetData, r, colMap['SKU规格型号']) : '';
    
    if (!trim(sku名称)) continue;
    
    // 支持复合单元格（多个物品在一行）
    const parts = sku名称.split(/\n|[，,;；]/).filter(Boolean);
    const qtyParts = String(sku数量).split(/\n|[，,;；]/).filter(Boolean);
    
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
      
      // 避免重复添加
      const exists = orders[orderKey].items.some(i => i.sku编码 === item.sku编码 && i.sku名称 === item.sku名称);
      if (!exists) {
        orders[orderKey].items.push(item);
      }
    }
  }
  
  console.log(`[卡片解析] 卡片 ${orderKey} 解析完成，共 ${orders[orderKey].items.length} 个物品`);
  
  return orders;
}

// 提取卡片的头部信息（收货人、电话、地址等）
function extractCardHeader(
  sheetData: string[][],
  rule: ParseRule,
  startRow: number,
  endRow: number
): { storeName: string; recipientName: string; recipientPhone: string; recipientAddress: string } {
  const result = { storeName: '', recipientName: '', recipientPhone: '', recipientAddress: '' };
  
  // 在这个卡片的行范围内搜索头部信息
  // 策略：遍历所有字段映射，在卡片范围内搜索对应的键值对
  for (const mapping of rule.fieldMappings) {
    // 只处理非物品字段（即头部信息字段）
    if (['SKU物品编码', 'SKU物品名称', 'SKU发货数量', 'SKU规格型号'].includes(mapping.targetField)) {
      continue;
    }
    
    const sourceField = trim(mapping.sourceField).toLowerCase();
    const targetField = mapping.targetField;
    
    // 在卡片范围内搜索这个字段
    for (let r = startRow; r <= endRow && r < sheetData.length; r++) {
      const row = sheetData[r];
      
      for (let c = 0; c < row.length; c++) {
        const cell = trim(row[c]).toLowerCase();
        
        // 如果单元格包含字段名（如"收货人"、"电话"等）
        if (cell.includes(sourceField) || sourceField.includes(cell)) {
          // 尝试提取值：可能是同一单元格的后面部分，或右边单元格
          const afterColon = row[c].split(/[:：]/).slice(1).join('').trim();
          const nextCell = trim(row[c + 1]);
          const nextNextCell = trim(row[c + 2]);
          
          let value = '';
          if (afterColon && afterColon.length > 1 && !afterColon.toLowerCase().includes(sourceField)) {
            value = afterColon;
          } else if (nextCell && nextCell.length > 1 && !nextCell.toLowerCase().includes(sourceField)) {
            value = nextCell;
          } else if (nextNextCell && nextNextCell.length > 1) {
            value = nextNextCell;
          }
          
          if (value) {
            // 根据targetField设置对应的值
            switch (targetField) {
              case 'storeName':
              case '收货门店':
                result.storeName = value;
                break;
              case 'recipientName':
              case '收件人姓名':
                result.recipientName = value;
                break;
              case 'recipientPhone':
              case '收件人电话':
                result.recipientPhone = value;
                break;
              case 'recipientAddress':
              case '收件人地址':
                result.recipientAddress = value;
                break;
            }
            
            if (value) {
              console.log(`[卡片头部] 找到 ${targetField}: "${value}" (第${r}行第${c}列)`);
            }
          }
        }
      }
      
      // 如果已经找到所有头部信息，提前退出
      if (result.storeName && result.recipientName && result.recipientPhone) {
        break;
      }
    }
  }
  
  return result;
}

// 单卡片解析（用于向后兼容）
function applySingleCardParsing(
  sheetData: string[][],
  rule: ParseRule,
  colMap: Record<string, number>,
  globalRecipient: { name: string; phone: string; address: string; externalCode: string; storeName: string },
  tailRecipient: { name: string; phone: string; address: string; externalCode: string; storeName: string },
  dataStartRow: number
): Order[] {
  const currentOrder: Record<string, Order> = {};
  
  // 使用原有的全局搜索逻辑
  // 优先级：全局搜索 > 尾部提取 > 列提取
  let recipientName = globalRecipient.name || tailRecipient.name;
  let recipientPhone = globalRecipient.phone || tailRecipient.phone;
  let recipientAddress = globalRecipient.address || tailRecipient.address;
  let storeName = globalRecipient.storeName || tailRecipient.storeName;
  
  console.log(`[单卡片解析] 收货人: ${recipientName}, 电话: ${recipientPhone}`);
  
  // 扫描所有行，按外部编码分组物品
  // 优先级：externalCode > 外部编码 > 配送单号 > SKU物品编码
  let externalCodeCol = colMap['externalCode'] ?? colMap['外部编码'] ?? colMap['配送单号'] ?? -1;
  
  // 如果还是没有找到，尝试使用SKU物品编码
  if (externalCodeCol < 0 && colMap['SKU物品编码'] >= 0) {
    console.log('[单卡片解析] 使用SKU物品编码列作为外部编码');
    externalCodeCol = colMap['SKU物品编码'];
  }
  
  console.log(`[单卡片解析] externalCodeCol=${externalCodeCol}`);
  
  for (let r = dataStartRow + 1; r < sheetData.length; r++) {
    const row0 = getCell(sheetData, r, 0);
    
    // 跳过空行、合计行等
    if (!row0 || /合计|小计|统计|签收|签字/.test(row0)) continue;
    if (/【.*】/.test(row0) || row0.includes('备注')) continue;
    
    // 提取行数据
    const sku编码 = colMap['SKU物品编码'] >= 0 ? getCell(sheetData, r, colMap['SKU物品编码']) : getCell(sheetData, r, 0);
    const sku名称 = colMap['SKU物品名称'] >= 0 ? getCell(sheetData, r, colMap['SKU物品名称']) : getCell(sheetData, r, 1);
    const sku数量 = colMap['SKU发货数量'] >= 0
      ? parseFloat(getCell(sheetData, r, colMap['SKU发货数量']))
      : parseFloat(getCell(sheetData, r, 2)) || 1;
    const sku规格 = colMap['SKU规格型号'] >= 0 ? getCell(sheetData, r, colMap['SKU规格型号']) : '';
    
    // 如果没有物品名称，跳过
    if (!trim(sku名称)) continue;
    
    // 提取外部编码（用于分组）
    let externalCode = '';
    if (externalCodeCol >= 0 && externalCodeCol < sheetData[r].length) {
      externalCode = trim(getCell(sheetData, r, externalCodeCol));
    }
    
    // 过滤表头文字：跳过"上游单据"等
    if (/上游单据|备注|说明|合计|小计|统计|签收|签字/.test(externalCode)) {
      console.log(`[单卡片解析] 第${r}行externalCode="${externalCode}"，是表头文字，跳过`);
      continue;
    }
    
    // 过滤包含【】的行
    if (externalCode.includes('【') || externalCode.includes('】')) {
      console.log(`[单卡片解析] 第${r}行externalCode="${externalCode}"，包含【】，跳过`);
      continue;
    }
    
    // 过滤全是中文的外部编码
    if (/^[\u4e00-\u9fa5]+$/.test(externalCode)) {
      console.log(`[单卡片解析] 第${r}行externalCode="${externalCode}"，全是中文，跳过`);
      continue;
    }
    
    // 如果当前行没有外部编码，使用上一个有效的外部编码
    if (!externalCode) {
      const lastOrderKey = Object.keys(currentOrder).pop();
      if (lastOrderKey) {
        externalCode = lastOrderKey;
        console.log(`[单卡片解析] 第${r}行无externalCode，使用上一个: ${externalCode}`);
      } else {
        console.log(`[单卡片解析] 第${r}行无externalCode，跳过`);
        continue;
      }
    }
    
    console.log(`[单卡片解析] 第${r}行: externalCode=${externalCode}, sku名称=${sku名称}, sku数量=${sku数量}`);
    
    // 复合单元格拆分
    const parts = sku名称 ? sku名称.split(/\n|[，,;；]/).filter(Boolean) : [''];
    const qtyParts = String(sku数量).split(/\n|[，,;；]/).filter(Boolean);
    
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
      
      // 避免重复添加
      const exists = currentOrder[orderKey].items.some(i => i.sku编码 === item.sku编码 && i.sku名称 === item.sku名称);
      if (!exists) {
        currentOrder[orderKey].items.push(item);
      }
    }
  }
  
  console.log(`[单卡片解析] 共解析 ${Object.keys(currentOrder).length} 条订单`);
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
