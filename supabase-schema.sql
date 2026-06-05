-- ============================================
-- 万能导入 V2 - Supabase 数据库建表脚本
-- ============================================
-- 在 Supabase Dashboard -> SQL Editor 中执行此脚本
-- ============================================

-- 1. 解析规则表 (parse_rules)
CREATE TABLE IF NOT EXISTS parse_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- 规则名称
  description TEXT,                      -- 规则描述
  file_format TEXT NOT NULL DEFAULT 'excel',  -- 文件格式: excel, pdf, word
  field_mappings JSONB DEFAULT '[]',     -- 字段映射配置
  region_rules JSONB DEFAULT '[]',       -- 区域规则配置
  aggregation_rule JSONB,                -- 聚合规则
  transpose_rule JSONB,                  -- 转置规则
  split_rule JSONB,                      -- 拆分规则
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_parse_rules_created_at ON parse_rules(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parse_rules_name ON parse_rules(name);

-- 添加注释
COMMENT ON TABLE parse_rules IS '解析规则表 - 存储文件解析的配置规则';
COMMENT ON COLUMN parse_rules.field_mappings IS '字段映射配置数组，定义源字段到目标字段的映射';
COMMENT ON COLUMN parse_rules.region_rules IS '区域规则数组，定义表格区域处理逻辑';
COMMENT ON COLUMN parse_rules.aggregation_rule IS '聚合规则，定义数据聚合方式';

-- 2. 订单表 (orders)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_code TEXT,                    -- 外部编码/配送单号
  store_name TEXT,                       -- 门店名称
  recipient_name TEXT,                   -- 收件人姓名
  recipient_phone TEXT,                  -- 收件人电话
  recipient_address TEXT,                -- 收件人地址
  items JSONB NOT NULL,                  -- 商品明细数组 [{sku, name, quantity}]
  remark TEXT,                           -- 备注
  status TEXT NOT NULL DEFAULT 'pending', -- 状态: pending, processing, completed, cancelled
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code);
CREATE INDEX IF NOT EXISTS idx_orders_recipient_name ON orders(recipient_name);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 添加注释
COMMENT ON TABLE orders IS '订单表 - 存储解析后的订单数据';
COMMENT ON COLUMN orders.items IS '商品明细数组，格式: [{"sku":"SKU001","name":"商品名","quantity":10}]';
COMMENT ON COLUMN orders.status IS '订单状态: pending(待处理), processing(处理中), completed(已完成), cancelled(已取消)';

-- 3. 插入示例数据（可选）
INSERT INTO parse_rules (name, description, file_format, field_mappings, region_rules, aggregation_rule) VALUES
('黎明屯配送发货单', '适用42列表格，干扰头部+尾部横向收货人', 'excel', 
 '[{"sourceField":"1","targetField":"SKU物品编码"},{"sourceField":"2","targetField":"SKU物品名称"},{"sourceField":"3","targetField":"SKU发货数量"},{"sourceField":"0","targetField":"外部编码"}]',
 '[{"type":"header_skip","rowsToSkip":4,"description":"跳过前4行干扰头"},{"type":"tail横向提取","rowsFromEnd":3,"description":"从末尾3行提取收货人信息"}]',
 '{"type":"group_by_column","groupByColumn":"外部编码"}'::jsonb),

('湖南仓发货明细', '按配送单号聚合，32列表格', 'excel',
 '[{"sourceField":"物品编码","targetField":"SKU物品编码"},{"sourceField":"物品名称","targetField":"SKU物品名称"},{"sourceField":"数量","targetField":"SKU发货数量"},{"sourceField":"配送单号","targetField":"外部编码"},{"sourceField":"收货人","targetField":"收件人姓名"},{"sourceField":"电话","targetField":"收件人电话"},{"sourceField":"地址","targetField":"收件人地址"}]',
 '[{"type":"header_skip","rowsToSkip":2,"description":"跳过前2行说明"}]',
 '{"type":"group_by_column","groupByColumn":"配送单号"}'::jsonb),

('欢乐牧场模板（矩阵转置）', 'SKU×门店矩阵，需横向转置', 'excel',
 '[{"sourceField":"0","targetField":"SKU物品编码"},{"sourceField":"1","targetField":"SKU物品名称"}]',
 '[{"type":"header_skip","rowsToSkip":2,"description":"跳过合并表头"}]',
 NULL);

-- 4. 启用行级安全策略（RLS）- 可选，根据需求开启
-- ALTER TABLE parse_rules ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 5. 创建更新触发器（自动更新 updated_at）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_parse_rules_updated_at
  BEFORE UPDATE ON parse_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 验证表是否创建成功
-- ============================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'parse_rules';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders';
