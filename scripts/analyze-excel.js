// 测试 Excel 文件结构
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// 查找最新的 Excel 文件
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  console.log('❌ uploads 目录不存在');
  process.exit(1);
}

const files = fs.readdirSync(uploadsDir)
  .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
  .map(f => ({
    name: f,
    time: fs.statSync(path.join(uploadsDir, f)).mtime.getTime()
  }))
  .sort((a, b) => b.time - a.time);

if (files.length === 0) {
  console.log('❌ 没有找到 Excel 文件');
  process.exit(1);
}

const latestFile = path.join(uploadsDir, files[0].name);
console.log(`📄 分析文件: ${files[0].name}\n`);

try {
  const workbook = XLSX.readFile(latestFile);
  
  console.log(`📊 工作表数量: ${workbook.SheetNames.length}`);
  console.log(`📋 工作表名称: ${workbook.SheetNames.join(', ')}\n`);
  
  // 分析第一个工作表
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log(`📏 总行数: ${jsonData.length}`);
  console.log(`📐 最大列数: ${Math.max(...jsonData.map(row => Array.isArray(row) ? row.length : 0))}\n`);
  
  // 打印前 20 行的内容
  console.log('=== 前 20 行内容预览 ===\n');
  for (let i = 0; i < Math.min(20, jsonData.length); i++) {
    const row = jsonData[i];
    if (Array.isArray(row)) {
      const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (nonEmptyCells.length > 0) {
        console.log(`第 ${i + 1} 行 (${row.length} 列):`);
        console.log(`  ${JSON.stringify(row.slice(0, 10))}`); // 只显示前10列
        console.log('');
      }
    }
  }
  
  // 智能检测表头行
  console.log('\n=== 智能检测表头行 ===\n');
  const fieldMappings = [
    '单据号', '收货机构', '收货人', '收货电话', '收货地址',
    '物品编码', '物品名称', '发货数量', '规格型号'
  ];
  
  for (let i = 0; i < Math.min(20, jsonData.length); i++) {
    const row = jsonData[i];
    if (!Array.isArray(row)) continue;
    
    const matchCount = fieldMappings.filter(field => {
      return row.some(cell => {
        const cellStr = String(cell).toLowerCase();
        const fieldLower = field.toLowerCase();
        return cellStr.includes(fieldLower) || fieldLower.includes(cellStr);
      });
    }).length;
    
    if (matchCount >= 2) {
      console.log(`✅ 第 ${i + 1} 行可能是表头（匹配 ${matchCount}/${fieldMappings.length} 个字段）`);
      console.log(`   内容: ${JSON.stringify(row.slice(0, 15))}`);
      console.log('');
    }
  }
  
} catch (error) {
  console.error('❌ 分析失败:', error.message);
}
