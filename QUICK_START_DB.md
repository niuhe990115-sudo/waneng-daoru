# 🚀 万能导入 V2 - 数据库配置快速开始

## 📌 当前状态

✅ 代码已支持 Supabase 数据库  
✅ API 路由已配置（规则 + 订单 CRUD）  
⚠️ 需要您完成 Supabase 项目创建和配置  

---

## ⚡ 3 分钟快速配置

### 第 1 步：创建 Supabase 项目（1 分钟）

1. 访问 [https://supabase.com](https://supabase.com)
2. 点击 **"Start your project"** → **"New Project"**
3. 填写信息：
   - **Name**: `waneng-daoru`
   - **Database Password**: 设置密码（请保存）
   - **Region**: 选择 `Asia Pacific (Singapore)`（离中国最近）
4. 等待项目创建完成

### 第 2 步：执行建表脚本（1 分钟）

1. 进入 Supabase Dashboard → **SQL Editor**
2. 点击 **"New query"**
3. 复制文件 `supabase-schema.sql` 的全部内容
4. 粘贴到 SQL Editor，点击 **"Run"**
5. 看到 "Success" 提示即表示表创建成功

### 第 3 步：配置环境变量（1 分钟）

1. 在 Supabase Dashboard → **Project Settings** → **API**
2. 复制以下两个值：
   ```
   Project URL: https://xxxxx.supabase.co
   anon public: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. 打开项目的 `.env.local` 文件
4. 替换对应的值：
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

---

## ✅ 验证配置

### 方法 1：运行测试脚本（推荐）

```bash
npm run test:db
```

**预期输出：**
```
🔍 开始测试 Supabase 连接...

✅ 环境变量已加载
📡 测试 1: 连接 Supabase...
✅ Supabase 连接成功

📋 测试 2: 查询 parse_rules 表...
✅ 查询成功，共 3 条规则
   示例规则：
   - 黎明屯配送发货单 (excel)
   - 湖南仓发货明细 (excel)
   - 欢乐牧场模板（矩阵转置） (excel)

📦 测试 3: 查询 orders 表...
✅ 查询成功，共 0 条订单

✏️  测试 4: 插入测试数据...
✅ 测试数据插入成功
🗑️  清理测试数据...
✅ 测试数据已清理

═══════════════════════════════════════
🎉 所有测试通过！Supabase 配置正确！
═══════════════════════════════════════
```

### 方法 2：启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000/api/rules

**成功标识：**
- 返回的 JSON 中 `"demo": false`
- 包含 3 条示例规则

**失败标识：**
- `"demo": true` → 仍在使用内存模式（检查 .env.local）
- 500 错误 → 检查 Supabase 配置

---

## 📊 数据库结构概览

### 表：parse_rules（解析规则）
存储文件解析的配置规则

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | TEXT | 规则名称 |
| file_format | TEXT | 文件格式 |
| field_mappings | JSONB | 字段映射 |
| region_rules | JSONB | 区域规则 |
| created_at | TIMESTAMP | 创建时间 |

### 表：orders（订单）
存储解析后的订单数据

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| external_code | TEXT | 配送单号 |
| recipient_name | TEXT | 收件人姓名 |
| items | JSONB | 商品明细 |
| status | TEXT | 订单状态 |
| created_at | TIMESTAMP | 创建时间 |

---

## 🎯 使用流程

### 1. 上传文件生成规则
- 访问首页 → 上传 Excel/PDF/Word 文件
- AI 自动分析并生成解析规则
- 规则自动保存到 `parse_rules` 表

### 2. 查看和管理规则
- API: `GET /api/rules` → 从数据库读取所有规则
- API: `POST /api/rules` → 创建新规则
- API: `DELETE /api/rules` → 删除规则

### 3. 生成订单记录
- 根据规则解析文件
- 解析结果自动保存到 `orders` 表
- API: `GET /api/orders` → 从数据库读取订单

---

## 🔧 常见问题

### Q1: 为什么还显示 "demo": true？

**原因：** `.env.local` 配置未生效

**解决：**
```bash
# 1. 检查 .env.local 是否有拼写错误
# 2. 重启开发服务器
Ctrl+C
npm run dev
```

### Q2: 如何确认数据真的存到数据库了？

**方法：** 在 Supabase Dashboard → Table Editor 中查看：
- 点击 `parse_rules` 表 → 应该能看到规则数据
- 点击 `orders` 表 → 上传文件后会有订单数据

### Q3: 本地开发可以用，部署后会怎样？

**Vercel 部署时需要添加环境变量：**
1. Vercel Dashboard → Settings → Environment Variables
2. 添加 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. 重新部署

---

## 📚 详细文档

- **完整配置指南**: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- **数据库建表脚本**: [supabase-schema.sql](./supabase-schema.sql)
- **Supabase 官方文档**: https://supabase.com/docs

---

## 💡 下一步建议

1. ✅ 完成上述配置后，测试文件上传功能
2. ✅ 在 Supabase Dashboard 查看实时数据
3. ✅ 根据需要调整 RLS（行级安全策略）
4. ✅ 部署到生产环境时配置环境变量

---

**祝您使用愉快！** 🎉
