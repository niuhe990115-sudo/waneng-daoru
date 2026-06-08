// 测试所有test-data文件的解析
const fs = require('fs');
const path = require('path');
const { parseExcel } = require('../lib/parser/excel-parser');

const testDir = path.join(__dirname, '..', 'test-data');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));

console.log(` 开始测试解析 ${files.length} 个测试文件\n`);

files.forEach(fileName => {
  const filePath = path.join(testDir, fileName);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 测试文件: ${fileName}`);
  console.log('='.repeat(60));
  
  try {
    const buffer = fs.readFileSync(filePath);
    
    // 创建一个基础规则（针对标准表格格式）
    const basicRule = {
      name: '标准表格解析规则',
      description: '解析标准表格格式的运单数据',
      fieldMappings: [
        { sourceField: '外部编码', targetField: 'externalCode' },
        { sourceField: '外部订单号', targetField: 'externalCode' },
        { sourceField: '客户单号', targetField: 'externalCode' },
        { sourceField: '收货人', targetField: 'recipientName' },
        { sourceField: '收件人', targetField: 'recipientName' },
        { sourceField: 'Receiver', targetField: 'recipientName' },
        { sourceField: '收货电话', targetField: 'recipientPhone' },
        { sourceField: '收件人电话', targetField: 'recipientPhone' },
        { sourceField: 'Receiver Tel', targetField: 'recipientPhone' },
        { sourceField: '收货地址', targetField: 'recipientAddress' },
        { sourceField: '收件人地址', targetField: 'recipientAddress' },
        { sourceField: 'Receiver Address', targetField: 'recipientAddress' },
        { sourceField: '重量', targetField: 'SKU发货数量' },
        { sourceField: '数量', targetField: 'SKU发货数量' },
        { sourceField: 'Weight', targetField: 'SKU发货数量' },
      ],
      regionRules: [],
      aggregationRule: null,
      transposeRule: { enabled: false, colFields: [], valueFields: [] },
      splitRule: { mergeAllSheets: true }
    };
    
    const result = parseExcel(buffer, basicRule);
    
    console.log(`✅ 解析成功: ${result.orders.length} 条订单`);
    
    if (result.orders.length > 0) {
      result.orders.forEach((order, idx) => {
        console.log(`  订单 ${idx + 1}:`);
        console.log(`    外部编码: ${order.externalCode || '(空)'}`);
        console.log(`    收件人: ${order.recipientName || '(空)'}`);
        console.log(`    电话: ${order.recipientPhone || '(空)'}`);
        console.log(`    地址: ${order.recipientAddress || '(空)'}`);
        console.log(`    物品: ${order.items.length} 个`);
      });
    }
    
    if (result.errors.length > 0) {
      console.log(`\n⚠️  错误:`);
      result.errors.forEach(err => console.log(`  - ${err}`));
    }
    
  } catch (error) {
    console.log(`❌ 解析失败: ${error.message}`);
    console.log(error.stack);
  }
});

console.log(`\n\n${'='.repeat(60)}`);
console.log(`✅ 测试完成`);
console.log('='.repeat(60));
