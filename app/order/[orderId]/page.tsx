import OrderTracker from "@/components/order-tracker";
export default async function OrderPage({params,searchParams}:{params:Promise<{orderId:string}>,searchParams:Promise<{token?:string}>}){const {orderId}=await params;const {token}=await searchParams;return <OrderTracker orderId={orderId} token={token||""}/>}
