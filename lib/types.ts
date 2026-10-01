export type Role="staff"|"admin"|"developer";
export type OrderStatus="ordered"|"preparing"|"ready"|"served"|"cancelled";
export type Category={id:string;name:string;sort_order:number};
export type MenuItem={id:string;category_id:string;name:string;description:string|null;price:number;half_price:number|null;full_price:number|null;has_half_full:boolean;is_available:boolean;image_url:string|null;category?:Category};
export type CartItem={menu_item_id:string;name:string;price:number;quantity:number;variant?:"half"|"full"};
