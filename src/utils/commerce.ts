import type { CartItem, OrderRecord } from '../types/store';

export function formatPkr(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString('en-PK')}`;
}

export function getEffectivePrice(pricePkr: number, discountPricePkr?: number): number {
  if (typeof discountPricePkr === 'number' && discountPricePkr > 0 && discountPricePkr < pricePkr) {
    return discountPricePkr;
  }
  return pricePkr;
}

export function getDiscountPercent(pricePkr: number, discountPricePkr?: number): number | null {
  if (typeof discountPricePkr === 'number' && discountPricePkr > 0 && discountPricePkr < pricePkr) {
    return Math.round(((pricePkr - discountPricePkr) / pricePkr) * 100);
  }
  return null;
}

export function buildSingleProductWhatsAppUrl(params: {
  whatsappNumber: string;
  productName: string;
  volume: string;
  quantity: number;
  unitPricePkr: number;
  customerName?: string;
  address?: string;
}): string {
  const cleanNum = params.whatsappNumber.replace(/\D/g, '');
  const total = params.unitPricePkr * params.quantity;
  const lines = [
    'Hello! I want to order from Aurelia Botanica:',
    `Product: ${params.productName} (${params.volume})`,
    `Quantity: ${params.quantity}`,
    `Price: PKR ${total.toLocaleString('en-PK')}`,
    params.customerName ? `Name: ${params.customerName}` : null,
    `Delivery Address: ${params.address || 'Please confirm delivery details'}`,
  ].filter(Boolean);

  return `https://wa.me/${cleanNum}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function buildCartWhatsAppUrl(params: {
  whatsappNumber: string;
  items: CartItem[];
  subtotalPkr: number;
  shippingPkr: number;
  discountPkr: number;
  totalPkr: number;
  couponCode?: string;
  customerName?: string;
  phone?: string;
  address?: string;
  orderNumber?: string;
}): string {
  const cleanNum = params.whatsappNumber.replace(/\D/g, '');
  const itemLines = params.items.map(
    (item, idx) =>
      `${idx + 1}. ${item.name} (${item.volume}) x${item.quantity} — PKR ${(item.pricePkr * item.quantity).toLocaleString('en-PK')}`,
  );

  const lines = [
    params.orderNumber
      ? `Hello! Confirming Aurelia Botanica Order #${params.orderNumber}:`
      : 'Hello! I want to place an order with Aurelia Botanica:',
    '',
    ...itemLines,
    '',
    `Subtotal: PKR ${params.subtotalPkr.toLocaleString('en-PK')}`,
    params.discountPkr > 0
      ? `Discount${params.couponCode ? ` (${params.couponCode})` : ''}: -PKR ${params.discountPkr.toLocaleString('en-PK')}`
      : null,
    `Shipping: ${params.shippingPkr === 0 ? 'FREE' : `PKR ${params.shippingPkr.toLocaleString('en-PK')}`}`,
    `Total Payable: PKR ${params.totalPkr.toLocaleString('en-PK')}`,
    '',
    params.customerName ? `Customer: ${params.customerName}` : null,
    params.phone ? `Phone: ${params.phone}` : null,
    `Delivery Address: ${params.address || 'To be confirmed'}`,
  ].filter((line) => line !== null);

  return `https://wa.me/${cleanNum}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function buildOrderTrackingWhatsAppUrl(whatsappNumber: string, order: OrderRecord): string {
  const cleanNum = whatsappNumber.replace(/\D/g, '');
  const lines = [
    `Hello Aurelia Botanica! Checking on my order:`,
    `Order Number: ${order.orderNumber}`,
    `Name: ${order.customerName}`,
    `Total: PKR ${order.totalPkr.toLocaleString('en-PK')}`,
  ];
  return `https://wa.me/${cleanNum}?text=${encodeURIComponent(lines.join('\n'))}`;
}
