// 调试解析问题
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// 查找最新的 Excel 文件
const uploadsDir = path.join(__dirname, '..', 'uploads');
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

const workbook = XLSX.readFile(latestFile);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log(`总行数: ${jsonData.length}\n`);

// 打印所有行
for (let i = 0; i < jsonData.length; i++) {
  const row = jsonData[i];
  if (Array.isArray(row)) {
    const nonEmpty = row.filter(cell => cell && String(cell).trim());
    if (nonEmpty.length > 0) {
      console.log(`第${i}行:`, JSON.stringify(row.slice(0, 10)));
    }
  }
}

// 查找外部编码的位置
console.log('\n=== 查找外部编码列 ===');
for (let i = 0; i < jsonData.length; i++) {
  const row = jsonData[i];
  if (!Array.isArray(row)) continue;
  
  for (let j = 0; j < row.length; j++) {
    const cell = String(row[j]).trim();
    if (cell.startsWith('LMTZ')) {
      console.log(`找到外部编码 "${cell}" 在第${i}行第${j}列`);
    }
  }
}

// 查找收货人信息
console.log('\n=== 查找收货人信息 ===');
for (let i = 0; i < jsonData.length; i++) {
  const row = jsonData[i];
  if (!Array.isArray(row)) continue;
  
  for (let j = 0; j < row.length; j++) {
    const cell = String(row[j]).trim();
    if (cell.includes('收货人') || cell.includes('张锦峰')) {
      console.log(`第${i}行第${j}列: "${cell}"`);
      // 打印相邻单元格
      console.log(`  右边: "${row[j+1]}"`);
      console.log(`  再右: "${row[j+2]}"`);
    }
  }
}
