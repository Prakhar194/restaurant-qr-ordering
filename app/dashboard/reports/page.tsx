import {createClient} from "@/lib/supabase/server";
import ReportsPanel from "@/components/reports-panel";
export const dynamic="force-dynamic";
export default async function Reports(){const sb=await createClient();const {data:orders}=await sb.from("orders").select("id,total,status,created_at,restaurant_tables(table_number),order_items(id,unit_price,quantity,line_total)").order("created_at",{ascending:false});return <ReportsPanel orders={orders??[]}/>}
