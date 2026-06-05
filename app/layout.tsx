import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '万能导入 V2 - 智能多格式批量下单系统',
  description: '通过大模型实现任意格式文件的智能解析与批量下单',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
