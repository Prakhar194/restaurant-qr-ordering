import { createAdminClient } from "@/lib/supabase/admin";
import CustomerMenu from "@/components/customer-menu";
import { notFound } from "next/navigation";

export default async function TablePage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const supabase=createAdminClient();
  const {data:table}=await supabase.from("restaurant_tables").select("id,table_number,is_active").eq("qr_token",token).maybeSingle();
  if(!table || !table.is_active) notFound();
  const {data:categories}=await supabase.from("categories").select("id,name,sort_order").order("sort_order");
  const {data:items}=await supabase.from("menu_items").select("id,category_id,name,description,price,half_price,full_price,has_half_full,is_available,image_url").eq("is_available",true).order("name");
  return <CustomerMenu table={table} tableToken={token} categories={categories??[]} items={items??[]}/>;
}
