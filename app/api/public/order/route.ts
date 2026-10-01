import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
export async function POST(req:Request){
 try{const body=await req.json();const {table_id,items,note}=body;if(!table_id||!Array.isArray(items)||!items.length)return NextResponse.json({error:"Invalid order"},{status:400});
 const db=createAdminClient();const {data:table}=await db.from("restaurant_tables").select("id,table_number,is_active").eq("id",table_id).maybeSingle();if(!table?.is_active)return NextResponse.json({error:"Table unavailable"},{status:400});
 const ids=items.map((x:any)=>x.menu_item_id);const {data:menu}=await db.from("menu_items").select("id,name,price,half_price,full_price,has_half_full,is_available").in("id",ids);if(!menu||menu.length!==ids.length)return NextResponse.json({error:"One or more items are unavailable"},{status:400});
 const normalized=items.map((x:any)=>{const m=menu.find((v:any)=>v.id===x.menu_item_id);const q=Math.max(1,Math.min(99,Number(x.quantity)||1));const variant=x.variant==="half"?"half":x.variant==="full"?"full":null;if(m.has_half_full&&!variant)throw new Error(`Please choose half or full for ${m.name}`);const unit=variant==="half"?Number(m.half_price):variant==="full"?Number(m.full_price):Number(m.price);if(!Number.isFinite(unit)||unit<0)throw new Error(`Price unavailable for ${m.name}`);return {menu_item_id:m.id,item_name:variant?`${m.name} (${variant})`:m.name,unit_price:unit,quantity:q}});const total=normalized.reduce((s:number,x:any)=>s+(Number(x.unit_price)*Number(x.quantity)),0);
 const {data:order,error}=await db.from("orders").insert({table_id,subtotal:total,total,source:"customer"}).select("id,public_token").single();if(error)throw error;const {error:itemError}=await db.from("order_items").insert(normalized.map(x=>({...x,order_id:order.id})));if(itemError)throw itemError;
 return NextResponse.json({id:order.id,public_token:order.public_token});
 }catch(e:any){return NextResponse.json({error:e.message||"Server error"},{status:500})}
}
