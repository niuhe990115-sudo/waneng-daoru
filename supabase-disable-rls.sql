-- ============================================
-- 禁用 RLS（行级安全策略）- 开发环境使用
-- ============================================
-- 在 Supabase Dashboard -> SQL Editor 中执行此脚本
-- 生产环境建议启用 RLS 并配置认证
-- ============================================

-- 禁用 parse_rules 表的 RLS
ALTER TABLE parse_rules DISABLE ROW LEVEL SECURITY;

-- 禁用 orders 表的 RLS
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- 验证是否已禁用
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('parse_rules', 'orders');

-- 预期输出：rowsecurity = f (表示已禁用)
