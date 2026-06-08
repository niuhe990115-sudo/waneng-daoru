'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Toaster, toast } from 'sonner';
import * as XLSX from 'xlsx';
import { parseExcel } from '@/lib/parser/excel-parser';
import { parseWord } from '@/lib/parser/word-parser';
import { parsePDF } from '@/lib/parser/pdf-parser';
import { ParseRule, Order, OrderItem, ValidationError, ParseResult } from '@/lib/parser/types';
import { Upload, FileSpreadsheet, FileText, File, CheckCircle, XCircle, Plus, Trash2, Save, Download, RefreshCw, ChevronLeft, ChevronRight, Search, X, Edit3, Eye, Check, AlertCircle, Settings, Package, Clock, Loader2, Wand2 } from 'lucide-react';

// ============================================================
// 类型
// ============================================================
type Tab = 'import' | 'rules' | 'orders';
type ImportStep = 'upload' | 'rule_select' | 'preview' | 'success';

interface EditableOrder extends Order {
  _errors: Record<string, string>;
  _selected?: boolean;
}

interface RuleEditor {
  name: string;
  description: string;
  fileFormat: 'excel' | 'word' | 'pdf';
  fieldMappings: { sourceField: string; targetField: string; isAIGuess?: boolean }[];
  regionRules: { type: string; rowsToSkip?: number; rowsFromEnd?: number; description?: string; cardStartKeyword?: string }[];
  aggregationRule?: { type: string; groupByColumn: string };
  transposeRule?: { enabled: boolean; colFields: number[]; valueFields: string[] };
}

// ============================================================
// 工具函数
// ============================================================
function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

function getFileType(name: string): 'excel' | 'word' | 'pdf' | null {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['xlsx', 'xls'].includes(ext || '')) return 'excel';
  if (['docx'].includes(ext || '')) return 'word';
  if (['pdf'].includes(ext || '')) return 'pdf';
  return null;
}

function validateOrder(order: EditableOrder): Record<string, string> {
  const errors: Record<string, string> = {};
  const hasStore = Boolean(order.storeName?.trim());
  const hasRecipientName = Boolean(order.recipientName?.trim());
  const hasRecipientPhone = Boolean(order.recipientPhone?.trim());
  const hasRecipientAddress = Boolean(order.recipientAddress?.trim());
  const hasRecipient = hasRecipientName || hasRecipientPhone || hasRecipientAddress;

  // 至少要有收货门店 或 收件人信息（姓名/电话/地址至少一项）
  if (!hasStore && !hasRecipient) {
    errors['storeName'] = '收货门店 与 收件人信息 至少填写一组';
    errors['recipientName'] = '收件人姓名/电话/地址至少填写一项';
  }
  
  // 如果有电话，验证格式
  if (order.recipientPhone && !/^1[3-9]\d{9}$/.test(order.recipientPhone.trim())) {
    errors['recipientPhone'] = '电话号码格式不正确';
  }
  
  // 至少需要一个物品
  if (order.items.length === 0) {
    errors['items'] = '至少需要一个物品';
  }
  
  // 验证物品
  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    if (!item.sku名称?.trim()) {
      errors[`item_${i}_sku名称`] = '物品名称不能为空';
    }
    if (!item.sku数量 || isNaN(Number(item.sku数量)) || Number(item.sku数量) <= 0) {
      errors[`item_${i}_sku数量`] = '数量必须为正数';
    }
  }
  
  return errors;
}

function exportToExcel(orders: EditableOrder[]) {
  const rows: Record<string, any>[] = [];
  for (const order of orders) {
    for (const item of order.items) {
      rows.push({
        '外部编码': order.externalCode || '',
        '收货门店': order.storeName || '',
        '收件人姓名': order.recipientName || '',
        '收件人电话': order.recipientPhone || '',
        '收件人地址': order.recipientAddress || '',
        'SKU编码': item.sku编码 || '',
        'SKU名称': item.sku名称 || '',
        'SKU数量': item.sku数量 || '',
        'SKU规格': item.sku规格 || '',
        '备注': order.remark || '',
      });
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '运单数据');
  XLSX.writeFile(wb, '运单导出.xlsx');
}

// ============================================================
// 主组件
// ============================================================
export default function WanengDaoruPage() {
  // --- 状态 ---
  const [activeTab, setActiveTab] = useState<Tab>('import');
  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileContent, setFileContent] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState<'excel' | 'word' | 'pdf' | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [rawTextContent, setRawTextContent] = useState<string>('');

  // 规则相关
  const [rules, setRules] = useState<any[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleEditor>({
    name: '', description: '', fileFormat: 'excel',
    fieldMappings: [], regionRules: [], aggregationRule: undefined,
    transposeRule: undefined,
  });
  const [aiSuggestedRule, setAiSuggestedRule] = useState<any>(null);

  // 预览/编辑
  const [orders, setOrders] = useState<EditableOrder[]>([]);
  const [allErrors, setAllErrors] = useState<ValidationError[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: number; failed: number } | null>(null);

  // 运单列表
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableBodyRef = useRef<HTMLDivElement>(null);

  // 加载规则
  const loadRules = useCallback(async () => {
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      setRules(data.rules || []);
    } catch {
      toast.error('加载规则失败');
    }
  }, []);

  // 加载历史运单
  const loadHistory = useCallback(async (page = 1, search = '') => {
    try {
      const res = await fetch(`/api/orders?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setOrderHistory(data.orders || []);
      setHistoryTotal(data.total || 0);
    } catch {
      toast.error('加载历史记录失败');
    }
  }, []);

  useEffect(() => {
    loadRules();
    loadHistory();
  }, [loadRules, loadHistory]);

  // 防抖搜索（手机号/外部编码）
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setHistoryPage(1); // 重置到第一页
      loadHistory(1, debouncedSearch);
    }, 300); // 300ms 防抖
    
    return () => clearTimeout(timer);
  }, [debouncedSearch, loadHistory]);

  // --- 文件上传处理 ---
  const handleFile = useCallback(async (file: File) => {
    const ext = getFileType(file.name);
    if (!ext) {
      toast.error('不支持的文件格式，请上传 Excel、Word 或 PDF 文件');
      return;
    }
    setFileType(ext);
    setFileName(file.name);
    setIsProcessing(true);
    setUploadProgress(10);

    try {
      const buffer = await file.arrayBuffer();
      setFileBuffer(buffer);
      setUploadProgress(30);

      if (ext === 'excel') {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        console.log('[Excel解析] 工作表数量:', workbook.SheetNames.length);
        console.log('[Excel解析] 所有工作表名称:', workbook.SheetNames);
        
        // 合并所有工作表的数据（用于预览）
        let allData: string[][] = [];
        let totalRows = 0;
        
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
          
          console.log(`[Excel解析] 工作表 "${sheetName}" 有 ${data.length} 行`);
          
          // 如果不是第一个工作表，添加一个分隔行
          if (allData.length > 0 && data.length > 0) {
            allData.push([`--- 工作表: ${sheetName} ---`]);
          }
          
          allData.push(...data);
          totalRows += data.length;
        }
        
        console.log(`[Excel解析] 所有工作表总计: ${totalRows} 行数据`);
        console.log('[Excel解析] 前5行预览:', allData.slice(0, 5));
        
        setFileContent(allData);
        setUploadProgress(100);
        toast.success(`已读取文件：${workbook.SheetNames.length} 个工作表，共 ${totalRows} 行`);
        setImportStep('rule_select');
      } else if (ext === 'word') {
        const { extractTextFromWord } = await import('@/lib/parser/word-parser');
        const text = await extractTextFromWord(buffer);
        console.log('[Word解析] 提取文本长度:', text.length);
        console.log('[Word解析] 文本前200字符:', text.substring(0, 200));
        setRawTextContent(text);
        const lines = text.split('\n').filter(l => l.trim()).map(l => [l.trim()]);
        console.log('[Word解析] 分割后行数:', lines.length);
        setFileContent(lines);
        setUploadProgress(100);
        toast.success('Word 文件已解析');
        setImportStep('rule_select');
      } else if (ext === 'pdf') {
        const { extractTextFromPDF } = await import('@/lib/parser/pdf-parser');
        const text = await extractTextFromPDF(buffer);
        console.log('[PDF解析] 提取文本长度:', text.length);
        console.log('[PDF解析] 文本前200字符:', text.substring(0, 200));
        setRawTextContent(text);
        const lines = text.split('\n').filter(l => l.trim()).map(l => [l.trim()]);
        console.log('[PDF解析] 分割后行数:', lines.length);
        setFileContent(lines);
        setUploadProgress(100);
        toast.success('PDF 文件已解析');
        setImportStep('rule_select');
      }
    } catch (e: any) {
      toast.error(`解析失败: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // --- AI 生成规则 ---
  const handleAIGenerate = useCallback(async () => {
    if (!fileContent || !fileType) return;
    setIsGenerating(true);
    try {
      // 提取所有工作表的前几行用于分析
      const previewData = [];
      let currentSheet = '';
      
      for (const row of fileContent.slice(0, 100)) {
        const rowStr = row.join('\t');
        if (rowStr.startsWith('--- 工作表:')) {
          currentSheet = rowStr;
          previewData.push(currentSheet);
        } else if (rowStr.trim()) {
          previewData.push(rowStr);
        }
        
        // 最多100行
        if (previewData.length >= 100) break;
      }
      
      const res = await fetch('/api/generate-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileContent: previewData.join('\n'),
          fileType,
        }),
      });
      const data = await res.json();
      if (data.rule) {
        setAiSuggestedRule(data.rule);
        const newRule = {
          name: data.rule.name || `新建规则（${fileName}）`,
          description: data.rule.description || data.rule.notes || '',
          fileFormat: fileType,
          fieldMappings: data.rule.fieldMappings || [],
          regionRules: data.rule.regionRules || [],
          aggregationRule: data.rule.aggregationRule,
          transposeRule: data.rule.transposeRule,
        };
        setEditingRule(newRule);
        
        // 自动保存 AI 生成的规则
        try {
          const saveRes = await fetch('/api/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRule),
          });
          const saveData = await saveRes.json();
          if (saveData.success) {
            toast.success('AI 已生成并自动保存规则');
            await loadRules(); // 等待规则列表刷新
            // 自动选中新保存的规则（通过名称匹配）
            setTimeout(() => {
              setRules(prevRules => {
                const savedRule = prevRules.find(r => r.name === newRule.name);
                if (savedRule && savedRule.id) {
                  setSelectedRuleId(savedRule.id);
                  console.log('[自动选择] 已选中规则:', savedRule.name, savedRule.id);
                }
                return prevRules;
              });
            }, 100);
          } else {
            toast.warning('AI 已生成规则，但保存失败，请手动保存');
          }
        } catch (saveError) {
          console.error('[规则保存] 失败:', saveError);
          toast.warning('AI 已生成规则，请点击“保存规则”按钮手动保存');
        }
      } else {
        toast.error(data.error || 'AI 生成失败，请手动配置规则');
      }
    } catch {
      toast.error('AI 生成请求失败');
    } finally {
      setIsGenerating(false);
    }
  }, [fileContent, fileType, fileName, loadRules]);

  // --- 解析执行 ---
  const handleParse = useCallback(async () => {
    console.log('[解析开始] selectedRuleId:', selectedRuleId);
    console.log('[解析开始] editingRule:', editingRule);
    console.log('[解析开始] rules 列表:', rules.map(r => ({ id: r.id, name: r.name })));
    
    const rule = rules.find(r => r.id === selectedRuleId || r.name === editingRule.name);
    console.log('[解析开始] 找到的 rule:', rule);
    
    if (!rule && !editingRule.fieldMappings.length) {
      toast.error('请先选择或创建规则');
      return;
    }

    const activeRule: ParseRule = rule ? {
      ...rule,
      fieldMappings: rule.fieldMappings || editingRule.fieldMappings,
      regionRules: rule.regionRules || editingRule.regionRules,
      aggregationRule: rule.aggregationRule || editingRule.aggregationRule,
      transposeRule: rule.transposeRule || editingRule.transposeRule,
    } : editingRule as ParseRule;
    
    console.log('[解析开始] 最终使用的 activeRule:', JSON.stringify(activeRule, null, 2));

    setIsProcessing(true);
    setUploadProgress(0);

    try {
      let parsedOrders: Order[] = [];

      if (fileType === 'excel' && fileBuffer) {
        setUploadProgress(30);
        const result = parseExcel(fileBuffer, activeRule);
        parsedOrders = result.orders;
        if (result.errors.length) toast.warning(result.errors.join('; '));
      } else if (fileType === 'word' && fileBuffer) {
        setUploadProgress(30);
        const result = await parseWord(fileBuffer, activeRule);
        parsedOrders = result.orders;
        if (result.errors.length) toast.warning(result.errors.join('; '));
      } else if (fileType === 'pdf' && fileBuffer) {
        setUploadProgress(30);
        const result = await parsePDF(fileBuffer, activeRule);
        parsedOrders = result.orders;
        if (result.errors.length) toast.warning(result.errors.join('; '));
      }

      setUploadProgress(70);

      // 转换为可编辑订单并校验
      const editableOrders: EditableOrder[] = parsedOrders.map(o => ({
        ...o,
        id: o.id || generateId(),
        _errors: {},
      }));

      const errors: ValidationError[] = [];
      for (let i = 0; i < editableOrders.length; i++) {
        const errs = validateOrder(editableOrders[i]);
        editableOrders[i]._errors = errs;
        Object.entries(errs).forEach(([field, msg]) => {
          errors.push({ rowIndex: i, field, message: msg });
        });
      }

      setUploadProgress(100);
      setOrders(editableOrders);
      setAllErrors(errors);

      if (editableOrders.length === 0) {
        toast.warning('未解析到任何订单，请检查规则配置');
      } else {
        toast.success(`解析完成，共 ${editableOrders.length} 条运单`);
        setImportStep('preview');
      }
    } catch (e: any) {
      toast.error(`解析失败: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [fileBuffer, fileType, fileName, rules, selectedRuleId, editingRule]);

  // --- 单元格编辑 ---
  const startEdit = useCallback((row: number, field: string, value: any) => {
    setEditingCell({ row, field });
    setEditValue(value ?? '');
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { row, field } = editingCell;
    setOrders(prev => {
      const next = [...prev];
      const order = { ...next[row] };
      if (field.startsWith('item_')) {
        const [, idx, subfield] = field.split('_');
        const items = [...order.items];
        items[parseInt(idx)] = { ...items[parseInt(idx)], [subfield]: editValue };
        order.items = items;
      } else {
        (order as any)[field] = editValue;
      }
      order._errors = validateOrder(order);
      next[row] = order;
      return next;
    });
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue]);

  const deleteRow = useCallback((index: number) => {
    setOrders(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addRow = useCallback(() => {
    const newOrder: EditableOrder = {
      id: generateId(),
      items: [{ id: generateId(), sku编码: '', sku名称: '', sku数量: 1, sku规格: '' }],
      _errors: {},
    };
    setOrders(prev => [...prev, newOrder]);
  }, []);

  const addItem = useCallback((orderIndex: number) => {
    setOrders(prev => {
      const next = [...prev];
      const order = { ...next[orderIndex] };
      order.items = [...order.items, { id: generateId(), sku编码: '', sku名称: '', sku数量: 1, sku规格: '' }];
      next[orderIndex] = order;
      return next;
    });
  }, []);

  // --- 提交下单 ---
  const handleSubmit = useCallback(async () => {
    // 先全部校验
    const errors: ValidationError[] = [];
    const validated = orders.map((o, i) => {
      const errs = validateOrder(o);
      const newOrder = { ...o, _errors: errs };
      Object.entries(errs).forEach(([field, msg]) => {
        errors.push({ rowIndex: i, field, message: msg });
      });
      return newOrder;
    });

    setOrders(validated);
    setAllErrors(errors);

    if (errors.length > 0) {
      toast.error(`仍有 ${errors.length} 个错误，请修正后再提交`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: validated }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitResult({ success: validated.length, failed: 0 });
        setImportStep('success');
        toast.success(`成功提交 ${validated.length} 条运单`);
        loadHistory();
      } else {
        toast.error(data.error || '提交失败');
      }
    } catch {
      toast.error('提交失败');
    } finally {
      setSubmitting(false);
    }
  }, [orders, loadHistory]);

  // --- 规则保存 ---
  const handleSaveRule = useCallback(async () => {
    if (!editingRule.name.trim()) {
      toast.error('请填写规则名称');
      return;
    }
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRule),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('规则保存成功');
        setRuleEditorOpen(false);
        loadRules();
      }
    } catch {
      toast.error('规则保存失败');
    }
  }, [editingRule, loadRules]);

  // --- 规则删除 ---
  const handleDeleteRule = useCallback(async (ruleId: string, ruleName: string) => {
    if (!confirm(`确定要删除规则「${ruleName}」吗？`)) {
      return;
    }
    try {
      const res = await fetch('/api/rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ruleId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('规则已删除');
        loadRules();
        // 如果删除的是当前选中的规则，清空选择
        if (selectedRuleId === ruleId) {
          setSelectedRuleId('');
        }
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('删除失败');
    }
  }, [selectedRuleId, loadRules]);

  // 重置
  const handleReset = useCallback(() => {
    setImportStep('upload');
    setOrders([]);
    setAllErrors([]);
    setFileContent(null);
    setFileName('');
    setFileType(null);
    setFileBuffer(null);
    setRawTextContent('');
    setSelectedRuleId('');
    setAiSuggestedRule(null);
    setEditingRule({ name: '', description: '', fileFormat: 'excel', fieldMappings: [], regionRules: [] });
    setSubmitResult(null);
  }, []);

  // 错误行高亮
  const hasError = (rowIndex: number) => allErrors.some(e => e.rowIndex === rowIndex);
  const getRowError = (rowIndex: number, field: string) =>
    allErrors.find(e => e.rowIndex === rowIndex && e.field === field)?.message || '';

  // ============================================================
  // 渲染
  // ============================================================

  // ---- Tab 导航 ----
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'import', label: '万能导入下单', icon: <Upload size={16} /> },
    { key: 'rules', label: '解析规则管理', icon: <Settings size={16} /> },
    { key: 'orders', label: '已导入运单', icon: <Package size={16} /> },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif" }}>
      <Toaster position="top-center" richColors />
      {/* 顶栏 */}
      <div style={{
        background: 'linear-gradient(135deg, #0fc6c2 0%, #0bada9 100%)',
        color: '#fff',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(15,198,194,0.3)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Package size={22} />
          <span style={{ fontSize: 18, fontWeight: 700 }}>万能导入 V2</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>智能多格式批量下单系统</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 16px', borderRadius: 20,
                border: 'none', cursor: 'pointer', fontSize: 13,
                fontWeight: activeTab === t.key ? 600 : 400,
                background: activeTab === t.key ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: '#fff',
                transition: 'all 0.2s',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>

        {/* ======================== 导入下单 ======================== */}
        {activeTab === 'import' && (
          <div>
            {/* 步骤条 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32, gap: 0 }}>
              {['上传文件', '选择规则', '预览编辑', '提交成功'].map((label, i) => {
                const steps = ['upload', 'rule_select', 'preview', 'success'];
                const currentIdx = steps.indexOf(importStep);
                const done = i < currentIdx;
                const active = i === currentIdx;
                return (
                  <React.Fragment key={label}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: done ? '#0fc6c2' : active ? '#0fc6c2' : '#e5e6eb',
                        color: done || active ? '#fff' : '#86909c',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 600,
                        boxShadow: active ? '0 0 0 4px rgba(15,198,194,0.2)' : 'none',
                        transition: 'all 0.2s',
                      }}>
                        {done ? <Check size={16} /> : i + 1}
                      </div>
                      <span style={{ fontSize: 12, color: active ? '#0fc6c2' : '#86909c', fontWeight: active ? 600 : 400 }}>{label}</span>
                    </div>
                    {i < 3 && (
                      <div style={{
                        width: 80, height: 2,
                        background: i < currentIdx ? '#0fc6c2' : '#e5e6eb',
                        margin: '0 8px', marginBottom: 22,
                        transition: 'background 0.3s',
                      }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* 步骤1: 上传 */}
            {importStep === 'upload' && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={handleUploadClick}
                  style={{
                    width: '100%', maxWidth: 600, margin: '0 auto',
                    border: `2px dashed ${isDragging ? '#0fc6c2' : '#d0e8e8'}`,
                    borderRadius: 16, padding: '60px 40px',
                    background: isDragging ? '#e8fafa' : '#fff',
                    cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                  }}
                >
                  <Upload size={48} color={isDragging ? '#0fc6c2' : '#0fc6c2'} style={{ marginBottom: 16 }} />
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1d2129', marginBottom: 8 }}>
                    {isDragging ? '松开以上传文件' : '拖拽文件到此处，或点击上传'}
                  </div>
                  <div style={{ fontSize: 13, color: '#86909c' }}>
                    支持 Excel（.xlsx/.xls）、Word（.docx）、PDF
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
                    {[
                      { icon: <FileSpreadsheet size={20} />, label: 'Excel' },
                      { icon: <FileText size={20} />, label: 'Word' },
                      { icon: <File size={20} />, label: 'PDF' },
                    ].map(f => (
                      <div key={f.label} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 8,
                        background: '#f2f3f5', color: '#4e5969', fontSize: 12,
                      }}>
                        {f.icon} {f.label}
                      </div>
                    ))}
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.docx,.pdf" style={{ display: 'none' }} onChange={handleFileInput} />
              </div>
            )}

            {/* 步骤2: 选择/创建规则 */}
            {importStep === 'rule_select' && (
              <div>
                {/* 已选文件信息 */}
                <div style={{
                  background: '#fff', borderRadius: 12, padding: '16px 24px',
                  display: 'flex', alignItems: 'center', gap: 16,
                  marginBottom: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
                }}>
                  {fileType === 'excel' ? <FileSpreadsheet size={32} color="#0fc6c2" /> :
                   fileType === 'word' ? <FileText size={32} color="#0fc6c2" /> :
                   <File size={32} color="#0fc6c2" />}
                  <div>
                    <div style={{ fontWeight: 600, color: '#1d2129' }}>{fileName}</div>
                    <div style={{ fontSize: 12, color: '#86909c' }}>
                      {fileContent?.length || 0} 行数据 · {fileType?.toUpperCase()}
                      {fileContent && fileContent.length > 0 && (
                        <span style={{ marginLeft: 8, color: '#52c41a' }}>
                          ✓ 数据已加载
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={handleReset} style={{
                    marginLeft: 'auto', padding: '6px 16px', borderRadius: 8,
                    border: '1px solid #e5e6eb', background: '#fff', cursor: 'pointer',
                    fontSize: 13, color: '#4e5969',
                  }}>
                    重新上传
                  </button>
                </div>

                {/* AI 生成规则 */}
                <div style={{
                  background: '#fff', borderRadius: 12, padding: 24,
                  marginBottom: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
                  border: aiSuggestedRule ? '2px solid #52c41a' : '1px solid #e8fafa',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1d2129', fontSize: 15 }}> AI 智能生成规则</div>
                      <div style={{ fontSize: 12, color: '#86909c', marginTop: 4 }}>
                        由大模型分析文件结构，自动生成推荐解析规则
                        {aiSuggestedRule && (
                          <span style={{ marginLeft: 8, color: '#52c41a', fontWeight: 600 }}>
                            ✓ 已自动生成并保存
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handleAIGenerate}
                        disabled={isGenerating}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 20px', borderRadius: 8,
                          background: isGenerating ? '#e5e6eb' : 'linear-gradient(135deg, #0fc6c2, #0bada9)',
                          color: '#fff', border: 'none', cursor: isGenerating ? 'not-allowed' : 'pointer',
                          fontSize: 13, fontWeight: 600,
                          opacity: isGenerating ? 0.7 : 1,
                          boxShadow: isGenerating ? 'none' : '0 2px 8px rgba(15,198,194,0.3)',
                        }}
                      >
                        {isGenerating ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
                        {isGenerating ? 'AI 分析中...' : aiSuggestedRule ? '重新生成' : 'AI 生成规则'}
                      </button>
                      {aiSuggestedRule && (
                        <button
                          onClick={() => {
                            console.log('【完整AI规则JSON】', JSON.stringify(aiSuggestedRule, null, 2));
                            const ruleText = `【AI 生成的规则详情】\n\n名称：${aiSuggestedRule.name}\n描述：${aiSuggestedRule.description || '无'}\n\n【字段映射】\n${(aiSuggestedRule.fieldMappings || []).map((m: any) => `${m.sourceField} -> ${m.targetField}${(m as any).layoutType ? ' [layoutType: ' + (m as any).layoutType + ']' : ''}`).join('\n')}\n\n【区域规则】\n${(aiSuggestedRule.regionRules || []).map((r: any) => `${r.type}: ${r.description || ''}`).join('\n')}\n\n【聚合规则】\n${aiSuggestedRule.aggregationRule ? JSON.stringify(aiSuggestedRule.aggregationRule, null, 2) : '无'}\n\n【完整 JSON 已输出到控制台】`;
                            alert(ruleText);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '10px 16px', borderRadius: 8,
                            background: '#fff', color: '#1890ff',
                            border: '1px solid #1890ff', cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          <Eye size={16} />
                          查看规则
                        </button>
                      )}
                    </div>
                  </div>

                  {/* AI 生成的规则详情 */}
                  {aiSuggestedRule && (
                    <div style={{
                      marginTop: 16, padding: 16,
                      background: '#f6ffed', border: '1px solid #b7eb8f',
                      borderRadius: 8,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#52c41a', marginBottom: 8 }}>
                        ✨ AI 推荐规则：{aiSuggestedRule.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#52c41a', marginBottom: 8 }}>
                        {aiSuggestedRule.description || '无描述'}
                      </div>
                      <div style={{ fontSize: 11, color: '#86909c' }}>
                        <div>• 字段映射：{(aiSuggestedRule.fieldMappings || []).length} 个</div>
                        <div>• 区域规则：{(aiSuggestedRule.regionRules || []).length} 个</div>
                        {aiSuggestedRule.aggregationRule && <div>• 聚合规则：已配置</div>}
                        {aiSuggestedRule.transposeRule?.enabled && <div>• 矩阵转置：已启用</div>}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#86909c' }}>
                        💡 该规则已自动保存到“选择已有规则”列表中，可直接使用或点击下方按钮开始解析
                      </div>
                    </div>
                  )}

                  {/* 预览前几行 */}
                  {fileContent && fileContent.length > 0 ? (
                    <div style={{ overflowX: 'auto', marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: '#86909c', marginBottom: 6 }}>
                        数据预览（前10行）
                        {fileContent.some(row => row[0] && String(row[0]).startsWith('--- 工作表:')) && (
                          <span style={{ marginLeft: 8, color: '#1890ff', fontWeight: 600 }}>
                            · 多工作表文件
                          </span>
                        )}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <tbody>
                          {fileContent.slice(0, 10).map((row, ri) => {
                            const rowStr = row.join('\t');
                            const isSheetSeparator = rowStr.startsWith('--- 工作表:');
                            
                            if (isSheetSeparator) {
                              return (
                                <tr key={ri} style={{ background: '#e8fafa' }}>
                                  <td colSpan={8} style={{ 
                                    padding: '6px 8px', 
                                    textAlign: 'center',
                                    fontWeight: 600,
                                    color: '#1890ff',
                                    fontSize: 12,
                                  }}>
                                    {row[0]}
                                  </td>
                                </tr>
                              );
                            }
                            
                            return (
                              <tr key={ri} style={{ background: ri % 2 === 0 ? '#fafbfc' : '#fff' }}>
                                {row.slice(0, 8).map((cell, ci) => (
                                  <td key={ci} style={{ padding: '4px 8px', border: '1px solid #e5e6eb', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {cell || <span style={{ color: '#d9d9d9' }}>[空]</span>}
                                  </td>
                                ))}
                                {row.length > 8 && <td style={{ padding: '4px 8px', border: '1px solid #e5e6eb', color: '#86909c' }}>...</td>}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {fileContent.length > 10 && (
                        <div style={{ fontSize: 11, color: '#86909c', marginTop: 6 }}>
                          ... 还有 {fileContent.length - 10} 行数据
                        </div>
                      )}
                    </div>
                  ) : fileContent && fileContent.length === 0 ? (
                    <div style={{ marginTop: 12, padding: 16, background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: '#d46b08', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertCircle size={14} />
                        文件中未检测到数据，请检查文件格式是否正确
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 规则选择列表 */}
                <div style={{
                  background: '#fff', borderRadius: 12, padding: 24,
                  boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, color: '#1d2129', fontSize: 15 }}>选择已有规则</div>
                    <button
                      onClick={() => {
                        setEditingRule({ name: '', description: '', fileFormat: fileType || 'excel', fieldMappings: [], regionRules: [] });
                        setRuleEditorOpen(true);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 16px', borderRadius: 8,
                        background: '#e8fafa', color: '#0b6e6e',
                        border: '1px solid #b5e8e8', cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      <Plus size={14} /> 新建规则
                    </button>
                  </div>

                  {rules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#86909c', fontSize: 13 }}>
                      暂无规则，请先创建或由 AI 生成
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {rules.filter(r => !fileType || r.fileFormat === fileType).map(rule => (
                        <div
                          key={rule.id}
                          onClick={() => setSelectedRuleId(rule.id)}
                          style={{
                            padding: '14px 16px', borderRadius: 10,
                            border: `2px solid ${selectedRuleId === rule.id ? '#0fc6c2' : '#e5e6eb'}`,
                            background: selectedRuleId === rule.id ? '#e8fafa' : '#fafbfc',
                            cursor: 'pointer', transition: 'all 0.2s',
                            position: 'relative',
                          }}
                        >
                          {/* 删除按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRule(rule.id, rule.name);
                            }}
                            style={{
                              position: 'absolute', top: 8, right: 8,
                              padding: 4, borderRadius: 4,
                              border: 'none', background: 'transparent',
                              cursor: 'pointer', color: '#cf1322',
                              opacity: 0.6,
                              transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                            title="删除规则"
                          >
                            <Trash2 size={14} />
                          </button>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: rule.fileFormat === 'excel' ? '#52c41a' : rule.fileFormat === 'word' ? '#1890ff' : '#fa541c',
                            }} />
                            <span style={{ fontWeight: 600, fontSize: 13, color: '#1d2129' }}>{rule.name}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>
                            {rule.description || '无描述'}
                          </div>
                          <div style={{ fontSize: 11, color: '#86909c' }}>
                            映射字段：{(rule.fieldMappings || []).length} 个
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
                  <button onClick={() => setImportStep('upload')} style={{
                    padding: '12px 28px', borderRadius: 8, border: '1px solid #e5e6eb',
                    background: '#fff', cursor: 'pointer', fontSize: 14,
                  }}>
                    上一步
                  </button>
                  <button
                    onClick={handleParse}
                    disabled={isProcessing || (!selectedRuleId && !editingRule.fieldMappings.length)}
                    style={{
                      padding: '12px 32px', borderRadius: 8,
                      background: (selectedRuleId || editingRule.fieldMappings.length) ? 'linear-gradient(135deg, #0fc6c2, #0bada9)' : '#e5e6eb',
                      color: '#fff', border: 'none', cursor: (selectedRuleId || editingRule.fieldMappings.length) ? 'pointer' : 'not-allowed',
                      fontSize: 14, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 8,
                      boxShadow: (selectedRuleId || editingRule.fieldMappings.length) ? '0 2px 8px rgba(15,198,194,0.3)' : 'none',
                    }}
                  >
                    {isProcessing && <Loader2 size={16} className="spin" />}
                    {isProcessing ? `解析中 ${uploadProgress}%` : '开始解析'}
                  </button>
                </div>
              </div>
            )}

            {/* 步骤3: 预览编辑 */}
            {importStep === 'preview' && (
              <div>
                {/* 工具栏 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 13, color: '#86909c' }}>
                    共 <strong style={{ color: '#0fc6c2' }}>{orders.length}</strong> 条运单，
                    <span style={{ color: allErrors.length > 0 ? '#cf1322' : '#52c41a' }}>
                      {allErrors.length > 0 ? `${allErrors.length} 个错误` : '全部有效'}
                    </span>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={addRow} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8,
                      border: '1px solid #e5e6eb', background: '#fff',
                      cursor: 'pointer', fontSize: 12,
                    }}>
                      <Plus size={14} /> 新增运单
                    </button>
                    <button onClick={() => exportToExcel(orders)} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8,
                      border: '1px solid #e5e6eb', background: '#fff',
                      cursor: 'pointer', fontSize: 12,
                    }}>
                      <Download size={14} /> 导出 Excel
                    </button>
                    <button onClick={() => setImportStep('rule_select')} style={{
                      padding: '7px 14px', borderRadius: 8,
                      border: '1px solid #e5e6eb', background: '#fff',
                      cursor: 'pointer', fontSize: 12,
                    }}>
                      重新解析
                    </button>
                  </div>
                </div>

                {/* 错误汇总 */}
                {allErrors.length > 0 && (
                  <div style={{
                    background: '#fff1f0', border: '1px solid #ffccc7',
                    borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                    maxHeight: 120, overflowY: 'auto',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <AlertCircle size={16} color="#cf1322" />
                      <span style={{ fontWeight: 600, color: '#cf1322', fontSize: 13 }}>全部错误（共 {allErrors.length} 条）</span>
                    </div>
                    {allErrors.slice(0, 20).map((e, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#cf1322', marginBottom: 4 }}>
                        第 {e.rowIndex + 1} 行 · {e.field}: {e.message}
                      </div>
                    ))}
                    {allErrors.length > 20 && (
                      <div style={{ fontSize: 12, color: '#86909c' }}>...还有 {allErrors.length - 20} 条</div>
                    )}
                  </div>
                )}

                {/* 预览表格 */}
                <div style={{
                  background: '#fff', borderRadius: 12,
                  boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#e8fafa' }}>
                          {['序号', '外部编码', '收货门店', '收件人', '电话', '地址', 'SKU物品', '数量', '备注', '操作'].map(h => (
                            <th key={h} style={{
                              padding: '10px 12px', textAlign: 'left',
                              color: '#0b6e6e', fontWeight: 600, fontSize: 12,
                              borderBottom: '1px solid #d0e8e8',
                              whiteSpace: 'nowrap',
                              minWidth: h === 'SKU物品' ? 200 : h === '地址' ? 180 : 100,
                            }}>
                              {h}
                              {h === '数量' && <span style={{ color: '#fa541c', marginLeft: 2 }}>*</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order, rowIdx) => {
                          const hasErr = hasError(rowIdx);
                          const recipientErr = getRowError(rowIdx, 'recipientName');
                          return (
                            <React.Fragment key={order.id}>
                              {/* 运单主行 */}
                              <tr style={{ background: hasErr ? '#fff1f0' : (rowIdx % 2 === 0 ? '#fafbfc' : '#fff'), transition: 'background 0.2s' }}>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb', color: '#86909c', fontSize: 12 }}>
                                  {rowIdx + 1}
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb' }}>
                                  {editingCell?.row === rowIdx && editingCell?.field === 'externalCode' ? (
                                    <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                      onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()}
                                      style={{ border: '1px solid #0fc6c2', borderRadius: 4, padding: '2px 6px', fontSize: 13, width: '100%' }} />
                                  ) : (
                                    <CellValue value={order.externalCode} onClick={() => startEdit(rowIdx, 'externalCode', order.externalCode)} hasError={hasErr} />
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb' }}>
                                  {editingCell?.row === rowIdx && editingCell?.field === 'storeName' ? (
                                    <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                      onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()}
                                      style={{ border: '1px solid #0fc6c2', borderRadius: 4, padding: '2px 6px', fontSize: 13, width: '100%' }} />
                                  ) : (
                                    <CellValue value={order.storeName} onClick={() => startEdit(rowIdx, 'storeName', order.storeName)} hasError={!!order._errors.storeName} />
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb' }}>
                                  {editingCell?.row === rowIdx && editingCell?.field === 'recipientName' ? (
                                    <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                      onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()}
                                      style={{ border: '1px solid #0fc6c2', borderRadius: 4, padding: '2px 6px', fontSize: 13, width: '100%' }} />
                                  ) : (
                                    <CellValue value={order.recipientName} onClick={() => startEdit(rowIdx, 'recipientName', order.recipientName)} hasError={!!recipientErr} />
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb' }}>
                                  {editingCell?.row === rowIdx && editingCell?.field === 'recipientPhone' ? (
                                    <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                      onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()}
                                      style={{ border: '1px solid #0fc6c2', borderRadius: 4, padding: '2px 6px', fontSize: 13, width: '100%' }} />
                                  ) : (
                                    <CellValue value={order.recipientPhone} onClick={() => startEdit(rowIdx, 'recipientPhone', order.recipientPhone)} hasError={!!order._errors.recipientPhone} />
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb', maxWidth: 180 }}>
                                  {editingCell?.row === rowIdx && editingCell?.field === 'recipientAddress' ? (
                                    <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                      onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()}
                                      style={{ border: '1px solid #0fc6c2', borderRadius: 4, padding: '2px 6px', fontSize: 13, width: '100%' }} />
                                  ) : (
                                    <CellValue value={order.recipientAddress} onClick={() => startEdit(rowIdx, 'recipientAddress', order.recipientAddress)} hasError={!!order._errors.recipientAddress} />
                                  )}
                                </td>
                                {/* SKU区域：显示第一个物品 */}
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb' }}>
                                  {order.items[0] ? (
                                    editingCell?.row === rowIdx && editingCell?.field === `item_0_sku名称` ? (
                                      <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                        onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()}
                                        style={{ border: '1px solid #0fc6c2', borderRadius: 4, padding: '2px 6px', fontSize: 13, width: '100%' }} />
                                    ) : (
                                      <CellValue value={order.items[0].sku名称} onClick={() => startEdit(rowIdx, 'item_0_sku名称', order.items[0]?.sku名称)} hasError={!!order._errors[`item_0_sku名称`]} />
                                    )
                                  ) : <span style={{ color: '#fa541c', fontSize: 11 }}>无物品</span>}
                                  {order.items.length > 1 && (
                                    <div style={{ fontSize: 11, color: '#86909c' }}>+{order.items.length - 1} 个物品</div>
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb' }}>
                                  {order.items[0] ? (
                                    editingCell?.row === rowIdx && editingCell?.field === `item_0_sku数量` ? (
                                      <input type="number" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                        onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()}
                                        style={{ border: '1px solid #0fc6c2', borderRadius: 4, padding: '2px 6px', fontSize: 13, width: 60 }} />
                                    ) : (
                                      <CellValue value={String(order.items[0].sku数量)} onClick={() => startEdit(rowIdx, 'item_0_sku数量', String(order.items[0]?.sku数量))} hasError={!!order._errors[`item_0_sku数量`]} />
                                    )
                                  ) : '-'}
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb' }}>
                                  {editingCell?.row === rowIdx && editingCell?.field === 'remark' ? (
                                    <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                      onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()}
                                      style={{ border: '1px solid #0fc6c2', borderRadius: 4, padding: '2px 6px', fontSize: 13, width: '100%' }} />
                                  ) : (
                                    <CellValue value={order.remark} onClick={() => startEdit(rowIdx, 'remark', order.remark)} />
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e6eb' }}>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => deleteRow(rowIdx)} title="删除" style={{
                                      padding: '4px 8px', borderRadius: 6,
                                      border: '1px solid #ffccc7', background: '#fff1f0',
                                      cursor: 'pointer', color: '#cf1322', fontSize: 11,
                                    }}>
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 提交按钮 */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
                  <button onClick={handleReset} style={{
                    padding: '12px 28px', borderRadius: 8, border: '1px solid #e5e6eb',
                    background: '#fff', cursor: 'pointer', fontSize: 14,
                  }}>
                    重新开始
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{
                      padding: '12px 36px', borderRadius: 8,
                      background: 'linear-gradient(135deg, #0fc6c2, #0bada9)',
                      color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                      fontSize: 14, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 8,
                      boxShadow: '0 2px 8px rgba(15,198,194,0.3)',
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting && <Loader2 size={16} className="spin" />}
                    {submitting ? '提交中...' : `提交下单（${orders.length} 条）`}
                  </button>
                </div>
              </div>
            )}

            {/* 步骤4: 成功 */}
            {importStep === 'success' && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0fc6c2, #0bada9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 24px', boxShadow: '0 4px 20px rgba(15,198,194,0.4)',
                }}>
                  <CheckCircle size={40} color="#fff" />
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1d2129', marginBottom: 8 }}>
                  提交成功！
                </div>
                <div style={{ fontSize: 14, color: '#86909c', marginBottom: 32 }}>
                  共提交 <strong style={{ color: '#0fc6c2' }}>{submitResult?.success || orders.length}</strong> 条运单
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <button onClick={() => setActiveTab('orders')} style={{
                    padding: '10px 24px', borderRadius: 8,
                    border: '1px solid #e5e6eb', background: '#fff',
                    cursor: 'pointer', fontSize: 13,
                  }}>
                    查看已导入运单
                  </button>
                  <button onClick={handleReset} style={{
                    padding: '10px 24px', borderRadius: 8,
                    background: 'linear-gradient(135deg, #0fc6c2, #0bada9)',
                    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>
                    继续导入
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================== 规则管理 ======================== */}
        {activeTab === 'rules' && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1d2129' }}>解析规则管理</div>
                <div style={{ fontSize: 13, color: '#86909c', marginTop: 4 }}>
                  管理所有解析规则，支持创建、编辑、复制、删除
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingRule({ name: '', description: '', fileFormat: 'excel', fieldMappings: [], regionRules: [] });
                  setRuleEditorOpen(true);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #0fc6c2, #0bada9)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(15,198,194,0.3)',
                }}
              >
                <Plus size={16} /> 新建规则
              </button>
            </div>

            <div style={{
              background: '#fff', borderRadius: 12,
              boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#e8fafa' }}>
                    {['规则名称', '适用格式', '描述', '字段映射数', '创建时间', '操作'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#0b6e6e', fontWeight: 600, fontSize: 12, borderBottom: '1px solid #d0e8e8' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 48, textAlign: 'center', color: '#86909c', fontSize: 13 }}>
                        暂无规则，点击上方「新建规则」创建
                      </td>
                    </tr>
                  ) : rules.map(rule => (
                    <tr key={rule.id} style={{ borderBottom: '1px solid #f2f3f5' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, color: '#1d2129' }}>
                        {rule.name}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11,
                          background: rule.fileFormat === 'excel' ? '#f6ffed' : rule.fileFormat === 'word' ? '#e6f7ff' : '#fff7e8',
                          color: rule.fileFormat === 'excel' ? '#52c41a' : rule.fileFormat === 'word' ? '#1890ff' : '#fa541c',
                        }}>
                          {rule.fileFormat?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#86909c', maxWidth: 200 }}>
                        {rule.description || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#86909c' }}>
                        {(rule.fieldMappings || []).length} 个
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#86909c' }}>
                        {rule.created_at ? new Date(rule.created_at).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => {
                              setEditingRule({
                                name: rule.name, description: rule.description,
                                fileFormat: rule.fileFormat,
                                fieldMappings: rule.fieldMappings || [],
                                regionRules: rule.regionRules || [],
                                aggregationRule: rule.aggregationRule,
                                transposeRule: rule.transposeRule,
                              });
                              setRuleEditorOpen(true);
                            }}
                            style={{
                              padding: '4px 10px', borderRadius: 6, border: '1px solid #b5e8e8',
                              background: '#e8fafa', cursor: 'pointer', fontSize: 11, color: '#0b6e6e',
                            }}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`确定删除规则「${rule.name}」？`)) return;
                              await fetch('/api/rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rule.id }) });
                              loadRules();
                              toast.success('规则已删除');
                            }}
                            style={{
                              padding: '4px 10px', borderRadius: 6, border: '1px solid #ffccc7',
                              background: '#fff1f0', cursor: 'pointer', fontSize: 11, color: '#cf1322',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================== 已导入运单 ======================== */}
        {activeTab === 'orders' && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1d2129' }}>已导入运单</div>
                <div style={{ fontSize: 13, color: '#86909c', marginTop: 4 }}>
                  共 <strong>{historyTotal}</strong> 条历史记录
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#86909c' }} />
                  <input
                    placeholder="搜索外部编码/收件人/手机号..."
                    value={debouncedSearch}
                    onChange={e => setDebouncedSearch(e.target.value)}
                    style={{
                      padding: '8px 12px 8px 32px', borderRadius: 8,
                      border: '1px solid #e5e6eb', fontSize: 13, width: 260,
                      outline: 'none',
                    }}
                  />
                  {debouncedSearch && (
                    <button
                      onClick={() => setDebouncedSearch('')}
                      style={{
                        position: 'absolute', right: 8, top: 8,
                        padding: 2, background: 'transparent', border: 'none',
                        cursor: 'pointer', color: '#86909c',
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setHistoryPage(1);
                    loadHistory(1, debouncedSearch);
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: 8,
                    background: 'linear-gradient(135deg, #0fc6c2, #0bada9)',
                    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13,
                  }}
                >
                  搜索
                </button>
                <button
                  onClick={() => loadHistory(historyPage, debouncedSearch)}
                  style={{
                    padding: '8px 16px', borderRadius: 8,
                    border: '1px solid #e5e6eb', background: '#fff',
                    cursor: 'pointer', fontSize: 13,
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div style={{
              background: '#fff', borderRadius: 12,
              boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}>
              {orderHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#86909c' }}>
                  <Package size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                  <div style={{ fontSize: 14 }}>暂无已导入的运单</div>
                  <div style={{ fontSize: 12, marginTop: 8 }}>导入文件并提交后，数据将显示在这里</div>
                </div>
              ) : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#e8fafa' }}>
                        {['序号', '外部编码', '收货门店', '收件人', '电话', '地址', '物品数', '提交时间'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#0b6e6e', fontWeight: 600, fontSize: 12, borderBottom: '1px solid #d0e8e8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderHistory.map((order, idx) => (
                        <tr key={order.id} style={{ borderBottom: '1px solid #f2f3f5' }}>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#86909c' }}>{(historyPage - 1) * 20 + idx + 1}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: '#1d2129' }}>{order.externalCode || '-'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#4e5969' }}>{order.storeName || '-'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#4e5969' }}>{order.recipientName || '-'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#4e5969' }}>{order.recipientPhone || '-'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#4e5969', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.recipientAddress || '-'}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#0fc6c2', fontWeight: 600 }}>{(order.items || []).length}</td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#86909c' }}>{order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* 分页 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 24px' }}>
                    <button
                      onClick={() => { const p = historyPage - 1; if (p >= 1) { setHistoryPage(p); loadHistory(p, historySearch); } }}
                      disabled={historyPage <= 1}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e6eb', background: '#fff', cursor: historyPage <= 1 ? 'not-allowed' : 'pointer', color: historyPage <= 1 ? '#d0d0d0' : '#4e5969', fontSize: 12 }}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: 13, color: '#86909c' }}>
                      第 {historyPage} / {Math.max(1, Math.ceil(historyTotal / 20))} 页，共 {historyTotal} 条
                    </span>
                    <button
                      onClick={() => { const p = historyPage + 1; if (p <= Math.ceil(historyTotal / 20)) { setHistoryPage(p); loadHistory(p, historySearch); } }}
                      disabled={historyPage >= Math.ceil(historyTotal / 20)}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e6eb', background: '#fff', cursor: historyPage >= Math.ceil(historyTotal / 20) ? 'not-allowed' : 'pointer', color: historyPage >= Math.ceil(historyTotal / 20) ? '#d0d0d0' : '#4e5969', fontSize: 12 }}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======================== 规则编辑器弹窗 ======================== */}
      {ruleEditorOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 16,
        }}
          onClick={() => setRuleEditorOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16,
              width: '100%', maxWidth: 700, maxHeight: '90vh',
              overflow: 'auto', padding: 28,
              boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1d2129' }}>编辑解析规则</div>
              <button onClick={() => setRuleEditorOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#86909c' }}>
                <X size={20} />
              </button>
            </div>

            {/* 基本信息 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5969', marginBottom: 6, display: 'block' }}>规则名称 *</label>
                <input
                  value={editingRule.name}
                  onChange={e => setEditingRule(p => ({ ...p, name: e.target.value }))}
                  placeholder="如：黎明屯配送发货单"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e6eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5969', marginBottom: 6, display: 'block' }}>文件格式</label>
                <select
                  value={editingRule.fileFormat}
                  onChange={e => setEditingRule(p => ({ ...p, fileFormat: e.target.value as any }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e6eb', fontSize: 13, outline: 'none' }}
                >
                  <option value="excel">Excel</option>
                  <option value="word">Word</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5969', marginBottom: 6, display: 'block' }}>描述</label>
              <input
                value={editingRule.description}
                onChange={e => setEditingRule(p => ({ ...p, description: e.target.value }))}
                placeholder="规则描述（可选）"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e6eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* 区域规则 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#1d2129' }}>区域规则</label>
                <button
                  onClick={() => setEditingRule(p => ({
                    ...p,
                    regionRules: [...p.regionRules, { type: 'header_skip', rowsToSkip: 1, description: '' }]
                  }))}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #b5e8e8', background: '#e8fafa', cursor: 'pointer', color: '#0b6e6e' }}
                >
                  <Plus size={12} /> 添加
                </button>
              </div>
              {editingRule.regionRules.map((reg, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select value={reg.type} onChange={e => {
                    const next = [...editingRule.regionRules];
                    next[i] = { ...next[i], type: e.target.value };
                    setEditingRule(p => ({ ...p, regionRules: next }));
                  }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e6eb', fontSize: 12 }}>
                    <option value="header_skip">跳过头部行</option>
                    <option value="tail横向提取">尾部横向提取收货人</option>
                    <option value="footer_extract">底部区域提取</option>
                    <option value="card_boundary">卡片边界识别</option>
                  </select>
                  {reg.type === 'header_skip' && (
                    <input type="number" placeholder="跳过行数" value={reg.rowsToSkip || ''} onChange={e => {
                      const next = [...editingRule.regionRules]; next[i] = { ...next[i], rowsToSkip: parseInt(e.target.value) }; setEditingRule(p => ({ ...p, regionRules: next }));
                    }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e6eb', fontSize: 12, width: 80 }} />
                  )}
                  {(reg.type === 'tail横向提取' || reg.type === 'footer_extract') && (
                    <input type="number" placeholder="尾部行数" value={reg.rowsFromEnd || ''} onChange={e => {
                      const next = [...editingRule.regionRules]; next[i] = { ...next[i], rowsFromEnd: parseInt(e.target.value) }; setEditingRule(p => ({ ...p, regionRules: next }));
                    }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e6eb', fontSize: 12, width: 80 }} />
                  )}
                  {reg.type === 'card_boundary' && (
                    <input placeholder="卡片起始关键词" value={reg.cardStartKeyword || ''} onChange={e => {
                      const next = [...editingRule.regionRules]; next[i] = { ...next[i], cardStartKeyword: e.target.value }; setEditingRule(p => ({ ...p, regionRules: next }));
                    }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e6eb', fontSize: 12, flex: 1 }} />
                  )}
                  <button onClick={() => {
                    const next = editingRule.regionRules.filter((_, j) => j !== i);
                    setEditingRule(p => ({ ...p, regionRules: next }));
                  }} style={{ padding: 4, borderRadius: 4, border: 'none', background: '#fff1f0', cursor: 'pointer', color: '#cf1322' }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              {editingRule.regionRules.length === 0 && (
                <div style={{ fontSize: 12, color: '#86909c', padding: 8, background: '#fafbfc', borderRadius: 8, textAlign: 'center' }}>
                  暂无区域规则（可留空）
                </div>
              )}
            </div>

            {/* 字段映射 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#1d2129' }}>字段映射</label>
                <button
                  onClick={() => setEditingRule(p => ({
                    ...p,
                    fieldMappings: [...p.fieldMappings, { sourceField: '', targetField: 'SKU物品编码' }]
                  }))}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #b5e8e8', background: '#e8fafa', cursor: 'pointer', color: '#0b6e6e' }}
                >
                  <Plus size={12} /> 添加映射
                </button>
              </div>
              <div style={{ background: '#fafbfc', borderRadius: 10, overflow: 'hidden' }}>
                {editingRule.fieldMappings.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #f2f3f5', alignItems: 'center' }}>
                    <input
                      value={m.sourceField}
                      onChange={e => {
                        const next = [...editingRule.fieldMappings]; next[i] = { ...next[i], sourceField: e.target.value }; setEditingRule(p => ({ ...p, fieldMappings: next }));
                      }}
                      placeholder="源字段名/列索引"
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e6eb', fontSize: 12, outline: 'none' }}
                    />
                    <span style={{ color: '#86909c', fontSize: 12 }}>→</span>
                    <select value={m.targetField} onChange={e => {
                      const next = [...editingRule.fieldMappings]; next[i] = { ...next[i], targetField: e.target.value }; setEditingRule(p => ({ ...p, fieldMappings: next }));
                    }} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e6eb', fontSize: 12, outline: 'none' }}>
                      {['externalCode', 'storeName', 'recipientName', 'recipientPhone', 'recipientAddress', 'SKU物品编码', 'SKU物品名称', 'SKU发货数量', 'SKU规格型号', '备注'].map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    {m.isAIGuess && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#fff7e8', color: '#d97b00' }}>AI推测</span>}
                    <button onClick={() => {
                      const next = editingRule.fieldMappings.filter((_, j) => j !== i);
                      setEditingRule(p => ({ ...p, fieldMappings: next }));
                    }} style={{ padding: 4, borderRadius: 4, border: 'none', background: '#fff1f0', cursor: 'pointer', color: '#cf1322' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {editingRule.fieldMappings.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#86909c' }}>
                    暂无映射，请点击「添加映射」<br />
                    <span style={{ fontSize: 11 }}>源字段名支持列索引（如 0, 1, 2）或列名关键字</span>
                  </div>
                )}
              </div>
            </div>

            {/* 聚合 & 转置 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5969', marginBottom: 6, display: 'block' }}>聚合规则</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    placeholder="按哪列聚合（如：配送单号）"
                    value={editingRule.aggregationRule?.groupByColumn || ''}
                    onChange={e => setEditingRule(p => ({
                      ...p,
                      aggregationRule: e.target.value ? { type: 'group_by_column', groupByColumn: e.target.value } : undefined
                    }))}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e6eb', fontSize: 12, outline: 'none' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5969', marginBottom: 6, display: 'block' }}>矩阵转置</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingRule.transposeRule?.enabled || false}
                    onChange={e => setEditingRule(p => ({ ...p, transposeRule: { ...p.transposeRule, enabled: e.target.checked, colFields: [], valueFields: [] } }))}
                  />
                  启用矩阵转置
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setRuleEditorOpen(false)} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #e5e6eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                取消
              </button>
              <button onClick={handleSaveRule} style={{
                padding: '10px 28px', borderRadius: 8,
                background: 'linear-gradient(135deg, #0fc6c2, #0bada9)',
                color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(15,198,194,0.3)',
              }}>
                <Save size={14} style={{ marginRight: 6 }} /> 保存规则
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CellValue 组件（可编辑单元格）
// ============================================================
function CellValue({ value, onClick, hasError }: { value?: string; onClick: () => void; hasError?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'text', padding: '2px 4px', borderRadius: 4,
        border: '1px solid transparent',
        background: hasError ? '#fff1f0' : 'transparent',
        color: hasError ? '#cf1322' : '#4e5969',
        fontSize: 13, minWidth: 60,
        transition: 'border-color 0.15s',
      }}
      title="点击编辑"
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#0fc6c2')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
    >
      {value || <span style={{ color: '#d0d0d0' }}>—</span>}
    </div>
  );
}
