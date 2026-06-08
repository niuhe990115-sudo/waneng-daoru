// 分析test-data目录下的所有测试Excel文件
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, '..', 'test-data');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));

console.log(`📁 test-data目录共有 ${files.length} 个测试文件\n`);

files.forEach(fileName => {
  const filePath = path.join(testDir, fileName);
  console.log(`\n${'='.repeat(60)}`);
  console.log(` 文件: ${fileName}`);
  console.log('='.repeat(60));
  
  const workbook = XLSX.readFile(filePath);
  console.log(`工作表数量: ${workbook.SheetNames.length}`);
  console.log(`工作表名称: ${workbook.SheetNames.join(', ')}\n`);
  
  workbook.SheetNames.forEach((sheetName, idx) => {
    console.log(`  【工作表 ${idx + 1}: ${sheetName}】`);
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    console.log(`  总行数: ${data.length}`);
    
    // 打印前10行
    console.log(`  前10行数据:`);
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        const nonEmpty = row.filter(cell => cell && String(cell).trim());
        if (nonEmpty.length > 0) {
          console.log(`    第${i}行 [${nonEmpty.length}列]:`, JSON.stringify(row.slice(0, 8)));
        }
      }
    }
    
    // 查找关键列
    console.log(`  关键列检测:`);
    const keywords = ['外部编码', '配送单号', '物品编码', '物品名称', '收货人', '收货电话', '收货地址', '数量', '发货数量'];
    for (let r = 0; r < Math.min(10, data.length); r++) {
      const row = data[r];
      if (!Array.isArray(row)) continue;
      
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c]).trim();
        const cellLower = cell.toLowerCase();
        
        keywords.forEach(keyword => {
          if (cellLower.includes(keyword.toLowerCase())) {
            console.log(`    ✓ 找到 "${keyword}" 在第${r}行第${c}列: "${cell}"`);
          }
        });
      }
    }
    
    // 统计非空行
    const nonEmptyRows = data.filter(row => Array.isArray(row) && row.some(cell => cell && String(cell).trim()));
    console.log(`  非空行数: ${nonEmptyRows.length}\n`);
  });
});

console.log(`\n${'='.repeat(60)}`);
console.log(`✅ 分析完成`);
console.log('='.repeat(60));
