// 订单 CRUD API
import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

// 演示模式内存存储
let demoOrders: any[] = [];

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    // 演示模式：返回内存中的订单
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    
    let filteredOrders = demoOrders;
    if (search) {
      filteredOrders = demoOrders.filter(o => 
        (o.external_code || '').includes(search) || 
        (o.recipient_name || '').includes(search)
      );
    }
    
    const offset = (page - 1) * limit;
    const paginatedOrders = filteredOrders.slice(offset, offset + limit);
    
    return NextResponse.json({ 
      orders: paginatedOrders.map((r: any) => ({
        id: r.id,
        externalCode: r.external_code,
        storeName: r.store_name,
        recipientName: r.recipient_name,
        recipientPhone: r.recipient_phone,
        recipientAddress: r.recipient_address,
        items: r.items,
        remark: r.remark,
        createdAt: r.created_at,
      })),
      total: filteredOrders.length,
      page,
      limit,
      demo: true 
    });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  let query = supabase!
    .from('orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`external_code.ilike.%${search}%,recipient_name.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    orders: data?.map((r: any) => ({
      id: r.id,
      externalCode: r.external_code,
      storeName: r.store_name,
      recipientName: r.recipient_name,
      recipientPhone: r.recipient_phone,
      recipientAddress: r.recipient_address,
      items: r.items,
      remark: r.remark,
      createdAt: r.created_at,
    })) || [],
    total: count || 0,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    // 演示模式：保存到内存
    const { orders } = await req.json();

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: '无效的订单数据' }, { status: 400 });
    }

    const rows = orders.map((o: any) => ({
      id: 'demo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      external_code: o.externalCode || null,
      store_name: o.storeName || null,
      recipient_name: o.recipientName || null,
      recipient_phone: o.recipientPhone || null,
      recipient_address: o.recipientAddress || null,
      items: o.items,
      remark: o.remark || null,
      status: 'pending',
      created_at: new Date().toISOString(),
    }));

    // 添加到内存数组开头
    demoOrders.unshift(...rows);
    console.log(`[演示模式] ${rows.length} 条订单已保存到内存`);
    
    return NextResponse.json({ 
      success: true, 
      demo: true, 
      message: `演示模式：${rows.length} 条订单已保存`,
      data: rows
    });
  }

  const { orders } = await req.json();

  if (!Array.isArray(orders) || orders.length === 0) {
    return NextResponse.json({ error: '无效的订单数据' }, { status: 400 });
  }

  const rows = orders.map((o: any) => ({
    external_code: o.externalCode || null,
    store_name: o.storeName || null,
    recipient_name: o.recipientName || null,
    recipient_phone: o.recipientPhone || null,
    recipient_address: o.recipientAddress || null,
    items: o.items,
    remark: o.remark || null,
    status: 'pending',
  }));

  const { data, error } = await supabase!.from('orders').insert(rows).select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
