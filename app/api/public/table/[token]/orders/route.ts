import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";

export async function GET(req:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  if(!token)return NextResponse.json({error:"Missing table token"},{status:400});
  const db=createAdminClient();
  const {data:table,error:tableError}=await db.from("restaurant_tables").select("id,table_number,is_active").eq("qr_token",token).maybeSingle();
  if(tableError||!table||!table.is_active)return NextResponse.json({error:"Table not found"},{status:404});

  const {data:orders,error}=await db.from("orders")
    .select("id,status,total,created_at,source,public_token,order_items(id,item_name,unit_price,quantity,line_total)")
    .eq("table_id",table.id)
    .neq("status","served")
    .order("created_at",{ascending:false})
    .limit(30);
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({table:{id:table.id,table_number:table.table_number},orders:orders??[]});
}
