export type Order = {
  id: string;
  caseOrderId: string | null;
  externalUid: number | null;
  productTypeId: string | null;
  productName: string;
  productImage: string | null;
  productDetails: string | null;
  accountEmail: string | null;
  accountPassword: string | null;
  price: number | null;
  costPrice: number | null;
  profit: number | null;
  typeMenu: string | null;
  purchaseDate: string | null;
  usernameBuy: string | null;
  buyerUserId: string | null;
  buyerEmail: string | null;
  buyerDisplayName: string | null;
  apiProviderId: string | null;
  purchaseOptionId: string | null;
  purchaseOptionName: string | null;
  purchaseOptionQuantity: number | null;
  rawResponse: unknown;
  createdAt: string;
  siteId: string;
  isLocal: boolean;
};

export type CreateOrderInput = {
  typeId: string;
  usernameBuy?: string | null;
  buyerUserId?: string | null;
  salePrice?: number | null;
  buyerEmail?: string | null;
  buyerDisplayName?: string | null;
  apiProviderId?: string | null;
  external: {
    uid?: number | null;
    name: string;
    imageapi: string | null;
    textdb: string | null;
    point: number;
    date?: string | null;
  };
};
