export type PurchaseOption = {
  id: string;
  siteId: string;
  productId: string;
  productTypeId: string;
  name: string;
  quantity: number;
  price: number;
  priceVip: number | null;
  priceWalkin: number | null;
  displayOrder: number;
  isActive: boolean;
  availableStock?: number;
  canBuy?: boolean;
};

export type PurchaseOptionInput = {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  priceVip?: number | null;
  priceWalkin?: number | null;
  displayOrder?: number;
  isActive?: boolean;
};
