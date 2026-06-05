# 🎯 数据库配置 - 3步完成

## 📌 只需完成以下 3 个步骤

### ✅ 步骤 1: 创建 Supabase 项目
👉 访问：https://supabase.com  
点击 "New Project" → 填写信息 → 等待创建完成（约1分钟）

### ✅ 步骤 2: 执行建表脚本
1. 打开 Supabase Dashboard → **SQL Editor**
2. 复制 `supabase-schema.sql` 的全部内容
3. 粘贴并点击 **"Run"**

### ✅ 步骤 3: 配置环境变量
1. 在 Supabase Dashboard → **Settings** → **API**，复制：
   - Project URL
   - anon public key

2. 编辑 `.env.local` 文件，替换这两行：
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## ✅ 验证配置

运行测试命令：
```bash
npm run test:db
```

看到以下输出即表示配置成功：
```
🎉 所有测试通过！Supabase 配置正确！
```

启动开发服务器：
```bash
npm run dev
```

访问 http://localhost:3000/api/rules  
✅ 成功标志：返回 `"demo": false`

---

## 📚 详细文档

- **快速开始**: [QUICK_START_DB.md](./QUICK_START_DB.md)
- **完整指南**: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- **配置总结**: [DATABASE_SETUP_COMPLETE.md](./DATABASE_SETUP_COMPLETE.md)

---

## 💡 核心提示

| 项目 | 说明 |
|------|------|
| **当前状态** | ✅ 代码已支持数据库<br>⚠️ 需要配置 Supabase |
| **演示模式** | 无需配置，数据存内存（重启丢失） |
| **数据库模式** | 配置后自动切换，数据持久化 |
| **切换方式** | 只需配置 `.env.local`，代码自动识别 |

---

**配置完成后，规则和订单将自动从数据库读取！** 🚀
