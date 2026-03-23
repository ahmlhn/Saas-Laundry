import type { NavigatorScreenParams } from "@react-navigation/native";
import type { OrderBucket } from "../features/orders/orderBuckets";
import type { Customer } from "../types/customer";
import type { Promotion, PromotionType } from "../types/promotion";
import type { ServiceCatalogItem, ServiceType } from "../types/service";
import type { StaffMember } from "../types/staff";

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type OrdersStackParamList = {
  OrdersToday:
    | {
        initialBucket?: OrderBucket;
      }
    | undefined;
  OrderDetail: {
    orderId: string;
    returnToOrders?: boolean;
  };
};

export type AccountStackParamList = {
  AccountHub: undefined;
  Customers: undefined;
  CustomerDetail: {
    customer: Customer;
  };
  CustomerForm: {
    mode: "create" | "edit";
    customer?: Customer;
    returnToQuickAction?: boolean;
  };
  Services: undefined;
  ServiceCatalog:
    | {
        title?: string;
        description?: string;
        initialKeyword?: string;
      }
    | undefined;
  ServiceForm: {
    mode: "create" | "edit";
    service?: ServiceCatalogItem;
  };
  ServiceTypeList: {
    serviceType: ServiceType;
    title: string;
  };
  ServiceGroupForm: {
    mode: "create" | "edit";
    serviceType: ServiceType;
    group?: ServiceCatalogItem;
  };
  ServiceVariantForm: {
    mode: "create" | "edit";
    serviceType: ServiceType;
    variant?: ServiceCatalogItem;
    parentServiceId?: string | null;
  };
  ProcessTagManager: undefined;
  ParfumItem: undefined;
  ParfumItemForm: {
    mode: "create" | "edit";
    serviceType: "perfume" | "item";
    item?: ServiceCatalogItem;
  };
  Promo: undefined;
  PromoForm: {
    mode: "create" | "edit";
    promo?: Promotion;
    presetType?: PromotionType;
  };
  FeaturePlaceholder: {
    title: string;
    description?: string;
  };
  Staff: undefined;
  StaffForm: {
    mode: "create" | "edit";
    staff?: StaffMember;
  };
  Outlets: undefined;
  ShippingZones:
    | {
        outletId?: string;
        outletLabel?: string;
      }
    | undefined;
  TenantManagement: undefined;
  SubscriptionCenter: undefined;
  FinanceTools: undefined;
  PaymentGateway: undefined;
  PrinterNote: undefined;
  HelpInfo: undefined;
  WhatsAppTools: undefined;
  Notifications: undefined;
};

export type OrderCreateRouteParams = {
  openCreateStamp?: number;
  preselectCustomerId?: string;
  editOrderId?: string;
  editStartStep?: "customer" | "services" | "review";
};

export type AppTabParamList = {
  HomeTab: undefined;
  OrdersTab: NavigatorScreenParams<OrdersStackParamList> | undefined;
  QuickActionTab: undefined;
  ReportsTab: undefined;
  AccountTab: NavigatorScreenParams<AccountStackParamList> | undefined;
};

export type AppRootStackParamList = {
  OutletSelect: undefined;
  MainTabs: NavigatorScreenParams<AppTabParamList> | undefined;
  OrderCreate: OrderCreateRouteParams | undefined;
  OrderPayment: {
    orderId: string;
    source: "create" | "detail";
    flow?: "payment" | "receipt";
    initialAmount?: number;
    initialMethod?: "cash" | "transfer" | "other";
  };
  PlatformHub: undefined;
};
