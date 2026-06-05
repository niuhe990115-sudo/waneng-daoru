# Supabase 数据库配置指南

## 📋 概述

本项目使用 **Supabase** 作为后端数据库，用于存储解析规则和订单记录。当前代码已支持数据库模式，只需完成以下配置即可从内存演示模式切换到持久化数据库存储。

---

## 🚀 快速开始（3步完成）

### 步骤 1: 创建 Supabase 项目

1. 访问 [https://supabase.com](https://supabase.com)
2. 点击 **"Start your project"** → **"New Project"**
3. 填写项目信息：
   - **Name**: `waneng-daoru` (或任意名称)
   - **Database Password**: 设置一个强密码（保存好！）
   - **Region**: 选择最近的区域（如 `Asia Pacific (Singapore)`）
4. 等待项目创建完成（约1-2分钟）

### 步骤 2: 执行建表脚本

1. 进入 Supabase Dashboard → **SQL Editor**（左侧菜单）
2. 点击 **"New query"**
3. 复制 `supabase-schema.sql` 文件的完整内容
4. 粘贴到 SQL Editor 中
5. 点击 **"Run"** 执行
6. 验证表是否创建成功：
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   ```
   应该看到 `parse_rules` 和 `orders` 两个表

### 步骤 3: 配置环境变量

1. 在 Supabase Dashboard → **Project Settings** → **API**
2. 复制以下信息：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: 一串长字符（以 `eyJ...` 开头）

3. 打开项目的 `.env.local` 文件
4. 替换以下占位符：

```env
# 将这两行替换为你的实际值
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

5. 保存文件

---

## ✅ 验证配置

### 启动开发服务器

```bash
npm run dev
```

### 测试规则 API

访问：http://localhost:3000/api/rules

**预期结果：**
- 如果配置正确，返回的 JSON 中 `"demo": false`
- 包含 3 条示例规则数据

**演示模式标识：**
- `"demo": true` → 仍在使用内存存储（检查 .env.local 是否正确）
- `"demo": false` → 已成功连接数据库 ✓

### 测试订单 API

访问：http://localhost:3000/api/orders

**预期结果：**
- 返回空数组 `{"orders": [], "total": 0, ...}`
- `"demo": false` 表示已连接数据库

---

## 🔧 故障排查

### 问题 1: 仍然显示 `"demo": true`

**原因：** `.env.local` 中的值不正确或未生效

**解决方案：**
1. 确认 `.env.local` 文件中没有拼写错误
2. 重启开发服务器：
   ```bash
   # Ctrl+C 停止服务器
   npm run dev
   ```
3. 清除 Next.js 缓存后重启：
   ```bash
   rm -rf .next
   npm run dev
   ```

### 问题 2: API 返回 500 错误

**可能原因：**
- Supabase 项目未创建
- 网络连接问题
- 权限配置错误

**检查步骤：**
1. 浏览器访问 Supabase URL 确认项目可访问
2. 查看控制台日志：
   ```bash
   npm run dev
   # 观察是否有 Supabase 连接错误
   ```

### 问题 3: 数据无法保存

**检查点：**
1. 确认数据库中表已创建
2. 检查 RLS（行级安全策略）是否启用
3. 如果是本地开发，建议暂时禁用 RLS：
   ```sql
   ALTER TABLE parse_rules DISABLE ROW LEVEL SECURITY;
   ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
   ```

---

## 📊 数据库结构

### 表：parse_rules（解析规则）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | TEXT | 规则名称 |
| description | TEXT | 规则描述 |
| file_format | TEXT | 文件格式 (excel/pdf/word) |
| field_mappings | JSONB | 字段映射配置 |
| region_rules | JSONB | 区域规则配置 |
| aggregation_rule | JSONB | 聚合规则 |
| transpose_rule | JSONB | 转置规则 |
| split_rule | JSONB | 拆分规则 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表：orders（订单）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| external_code | TEXT | 外部编码/配送单号 |
| store_name | TEXT | 门店名称 |
| recipient_name | TEXT | 收件人姓名 |
| recipient_phone | TEXT | 收件人电话 |
| recipient_address | TEXT | 收件人地址 |
| items | JSONB | 商品明细数组 |
| remark | TEXT | 备注 |
| status | TEXT | 状态 (pending/processing/completed/cancelled) |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

---

## 🎯 下一步

### 生产环境部署

#### Vercel 部署时添加环境变量

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的项目 → **Settings** → **Environment Variables**
3. 添加以下变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. 重新部署项目

#### GitHub Actions CI/CD（可选）

在项目根目录创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

---

## 💡 常见问题

### Q: 可以不使用 Supabase 吗？

A: 可以。当前代码支持**双模式运行**：
- **演示模式**：无需配置，数据存储在内存（重启丢失）
- **数据库模式**：配置 Supabase 后自动切换，数据持久化

### Q: 如何迁移到其他数据库？

A: 修改以下文件：
1. `lib/supabase/client.ts` → 改为其他数据库客户端
2. `app/api/rules/route.ts` → 修改查询逻辑
3. `app/api/orders/route.ts` → 修改查询逻辑

### Q: 数据安全吗？

A: 
- `NEXT_PUBLIC_` 前缀的变量会暴露给前端，但 Supabase anon key 是安全的（仅允许公开操作）
- 敏感操作应通过 Row Level Security (RLS) 控制
- 生产环境建议启用 RLS 并配置认证

---

## 📞 需要帮助？

- **Supabase 文档**: https://supabase.com/docs
- **Next.js 文档**: https://nextjs.org/docs
- **项目 Issues**: https://github.com/niuhe990115-sudo/ces/issues
