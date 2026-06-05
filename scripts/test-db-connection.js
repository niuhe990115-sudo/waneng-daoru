/**
 * 数据库连接测试脚本
 * 
 * 使用方法：
 * node scripts/test-db-connection.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 手动加载 .env.local 文件
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('\n🔍 开始测试 Supabase 连接...\n');

// 检查环境变量
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 错误：未找到 Supabase 配置');
  console.error('请确保 .env.local 文件中包含：');
  console.error('  NEXT_PUBLIC_SUPABASE_URL=your-project-url');
  console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key\n');
  process.exit(1);
}

console.log('✅ 环境变量已加载');
console.log(`   URL: ${supabaseUrl}`);
console.log(`   Key: ${supabaseKey.substring(0, 20)}...\n`);

// 创建 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // 测试 1: 连接 Supabase
    console.log('📡 测试 1: 连接 Supabase...');
    const { data: pingData, error: pingError } = await supabase.from('parse_rules').select('count', { count: 'exact', head: true });
    
    if (pingError) {
      throw new Error(`连接失败: ${pingError.message}`);
    }
    console.log('✅ Supabase 连接成功\n');

    // 测试 2: 查询解析规则表
    console.log('📋 测试 2: 查询 parse_rules 表...');
    const { data: rules, error: rulesError } = await supabase
      .from('parse_rules')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (rulesError) {
      throw new Error(`查询规则失败: ${rulesError.message}`);
    }
    console.log(`✅ 查询成功，共 ${rules.length} 条规则`);
    if (rules.length > 0) {
      console.log('   示例规则：');
      rules.forEach(rule => {
        console.log(`   - ${rule.name} (${rule.file_format})`);
      });
    } else {
      console.log('   ⚠️  表中没有数据（这是正常的，可以手动添加规则）');
    }
    console.log();

    // 测试 3: 查询订单表
    console.log('📦 测试 3: 查询 orders 表...');
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (ordersError) {
      throw new Error(`查询订单失败: ${ordersError.message}`);
    }
    console.log(`✅ 查询成功，共 ${orders.length} 条订单`);
    if (orders.length > 0) {
      console.log('   最近订单：');
      orders.forEach(order => {
        console.log(`   - ${order.external_code || 'N/A'} (${order.status})`);
      });
    } else {
      console.log('   ⚠️  表中没有数据（这是正常的，上传文件后会生成订单）');
    }
    console.log();

    // 测试 4: 插入测试数据
    console.log('✏️  测试 4: 插入测试数据...');
    const testRule = {
      name: '测试规则-' + Date.now(),
      description: '这是一个自动测试创建的规则',
      file_format: 'excel',
      field_mappings: [],
      region_rules: []
    };

    const { data: inserted, error: insertError } = await supabase
      .from('parse_rules')
      .insert([testRule])
      .select()
      .single();

    if (insertError) {
      throw new Error(`插入测试数据失败: ${insertError.message}`);
    }
    console.log('✅ 测试数据插入成功');
    console.log(`   ID: ${inserted.id}`);
    console.log(`   名称: ${inserted.name}\n`);

    // 清理测试数据
    console.log('🗑️  清理测试数据...');
    const { error: deleteError } = await supabase
      .from('parse_rules')
      .delete()
      .eq('id', inserted.id);

    if (deleteError) {
      console.error('⚠️  清理测试数据失败:', deleteError.message);
    } else {
      console.log('✅ 测试数据已清理\n');
    }

    // 总结
    console.log('═══════════════════════════════════════');
    console.log('🎉 所有测试通过！Supabase 配置正确！');
    console.log('═══════════════════════════════════════\n');
    console.log('下一步：');
    console.log('1. 启动开发服务器: npm run dev');
    console.log('2. 访问 http://localhost:3000');
    console.log('3. 开始上传文件并生成规则\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('\n请检查：');
    console.error('1. Supabase 项目是否已创建');
    console.error('2. .env.local 中的配置是否正确');
    console.error('3. 数据库表是否已通过 supabase-schema.sql 创建');
    console.error('\n详细信息请参考: SUPABASE_SETUP.md\n');
    process.exit(1);
  }
}

testConnection();
