"use client";
import {useMemo,useState} from "react";

type Range="daily"|"weekly"|"monthly"|"yearly"|"custom";

function startOfDay(d:Date){const x=new Date(d);x.setHours(0,0,0,0);return x}
function endOfDay(d:Date){const x=new Date(d);x.setHours(23,59,59,999);return x}
function money(v:number){return `₹${v.toFixed(2)}`}
function orderTotal(o:any){
  const items=Array.isArray(o.order_items)?o.order_items:[];
  const fromItems=items.reduce((s:number,i:any)=>s+(Number(i.line_total) || Number(i.unit_price)*Number(i.quantity) || 0),0);
  const stored=Number(o.total);
  return fromItems>0?fromItems:(Number.isFinite(stored)?stored:0);
}
function weekStart(d:Date){const x=startOfDay(d);const day=x.getDay();x.setDate(x.getDate()-(day===0?6:day-1));return x}

export default function ReportsPanel({orders}:{orders:any[]}){
  const [range,setRange]=useState<Range>("daily");
  const now=new Date();
  const [customFrom,setCustomFrom]=useState(()=>{const d=new Date(now);d.setDate(d.getDate()-6);return d.toISOString().slice(0,10)});
  const [customTo,setCustomTo]=useState(()=>now.toISOString().slice(0,10));

  const bounds=useMemo(()=>{
    if(range==="custom"){
      const from=new Date(`${customFrom}T00:00:00`);const to=new Date(`${customTo}T23:59:59.999`);
      return from<=to?{from,to}:{from:to, to:from};
    }
    if(range==="daily")return {from:startOfDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-6)),to:endOfDay(now)};
    if(range==="weekly")return {from:startOfDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-55)),to:endOfDay(now)};
    if(range==="monthly")return {from:new Date(now.getFullYear(),now.getMonth()-11,1),to:endOfDay(now)};
    return {from:new Date(now.getFullYear()-4,0,1),to:endOfDay(now)};
  },[range,customFrom,customTo]);

  const filtered=useMemo(()=>orders.filter(o=>o.status!=="cancelled"&&new Date(o.created_at)>=bounds.from&&new Date(o.created_at)<=bounds.to),[orders,bounds]);
  const total=filtered.reduce((s,o)=>s+orderTotal(o),0);
  const average=filtered.length?total/filtered.length:0;

  const chart=useMemo(()=>{
    const buckets:{key:string;label:string;value:number;orders:number}[]=[];
    const push=(key:string,label:string)=>{if(!buckets.some(x=>x.key===key))buckets.push({key,label,value:0,orders:0})};
    if(range==="daily"||range==="custom"){
      const cursor=startOfDay(bounds.from);const last=startOfDay(bounds.to);
      while(cursor<=last){const key=cursor.toISOString().slice(0,10);push(key,cursor.toLocaleDateString(undefined,{month:"short",day:"numeric"}));cursor.setDate(cursor.getDate()+1)}
      filtered.forEach(o=>{const d=new Date(o.created_at);const key=d.toISOString().slice(0,10);const b=buckets.find(x=>x.key===key);if(b){b.value+=orderTotal(o);b.orders++}});
    }else if(range==="weekly"){
      const cursor=weekStart(bounds.from);const last=weekStart(bounds.to);
      while(cursor<=last){const key=cursor.toISOString().slice(0,10);push(key,cursor.toLocaleDateString(undefined,{month:"short",day:"numeric"}));cursor.setDate(cursor.getDate()+7)}
      filtered.forEach(o=>{const d=weekStart(new Date(o.created_at));const key=d.toISOString().slice(0,10);const b=buckets.find(x=>x.key===key);if(b){b.value+=orderTotal(o);b.orders++}});
    }else if(range==="monthly"){
      const cursor=new Date(bounds.from.getFullYear(),bounds.from.getMonth(),1);const last=new Date(bounds.to.getFullYear(),bounds.to.getMonth(),1);
      while(cursor<=last){const key=`${cursor.getFullYear()}-${cursor.getMonth()}`;push(key,cursor.toLocaleDateString(undefined,{month:"short",year:"numeric"}));cursor.setMonth(cursor.getMonth()+1)}
      filtered.forEach(o=>{const d=new Date(o.created_at);const key=`${d.getFullYear()}-${d.getMonth()}`;const b=buckets.find(x=>x.key===key);if(b){b.value+=orderTotal(o);b.orders++}});
    }else{
      for(let y=bounds.from.getFullYear();y<=bounds.to.getFullYear();y++)push(String(y),String(y));
      filtered.forEach(o=>{const b=buckets.find(x=>x.key===String(new Date(o.created_at).getFullYear()));if(b){b.value+=orderTotal(o);b.orders++}});
    }
    return buckets;
  },[filtered,range,bounds]);
  const max=Math.max(...chart.map(x=>x.value),1);

  return <>
    <div><h1 style={{marginBottom:4}}>Sales reports</h1><p className="muted">Revenue, transactions and trends from non-cancelled orders.</p></div>
    <div className="tabs section report-tabs">{(["daily","weekly","monthly","yearly","custom"] as Range[]).map(x=><button key={x} className={`tab ${range===x?"active":""}`} onClick={()=>setRange(x)}>{x}</button>)}</div>
    {range==="custom"&&<div className="card section report-date-picker"><div><label className="muted">From</label><input className="input" type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></div><div><label className="muted">To</label><input className="input" type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></div></div>}
    <div className="grid cards"><div className="card"><div className="muted">Sales</div><div className="stat">{money(total)}</div></div><div className="card"><div className="muted">Orders</div><div className="stat">{filtered.length}</div></div><div className="card"><div className="muted">Average order</div><div className="stat">{money(average)}</div></div></div>
    <div className="card section"><div className="row between"><div><h2 style={{marginBottom:4}}>Revenue graph</h2><p className="muted">{range==="daily"?"Last 7 days":range==="weekly"?"Weekly revenue · last 8 weeks":range==="monthly"?"Monthly revenue · last 12 months":range==="yearly"?"Yearly revenue · last 5 years":`${customFrom} to ${customTo}`}</p></div><strong>{money(total)}</strong></div><div className="report-chart" aria-label="Revenue graph">{chart.map(b=><div className="report-bar-wrap" key={b.key} title={`${b.label}: ${money(b.value)} · ${b.orders} orders`}><div className="report-bar-value">{b.value?money(b.value):"₹0"}</div><div className="report-bar" style={{height:`${Math.max(4,(b.value/max)*100)}%`}}/><div className="report-bar-label">{b.label}</div></div>)}</div></div>
    <div className="card section"><h2>Transactions</h2><div className="table-wrap"><table className="data"><thead><tr><th>Order</th><th>Table</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{filtered.length?filtered.map(o=><tr key={o.id}><td>#{o.id.slice(0,8)}</td><td>{o.restaurant_tables?.table_number??"-"}</td><td>{money(orderTotal(o))}</td><td>{o.status}</td><td>{new Date(o.created_at).toLocaleString()}</td></tr>):<tr><td colSpan={5} className="muted">No transactions found for this date range.</td></tr>}</tbody></table></div></div>
  </>;
}
