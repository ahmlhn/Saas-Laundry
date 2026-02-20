import type { NavigatorScreenParams } from "@react-navigation/native";
import type { OrderBucket } from "../features/orders/orderBuckets";

export type AuthStackParamList = {
  Login: undefined;
};

export type OrdersStackParamList = {
  OrdersToday:
    | {
        initialBucket?: OrderBucket;
      }
    | undefined;
  OrderDetail: {
    orderId: string;
  };
};

export type AccountStackParamList = {
  AccountHub: undefined;
  Customers: undefined;
  FinanceTools: undefined;
  PrinterNote: undefined;
  HelpInfo: undefined;
  WhatsAppTools: undefined;
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
  MainTabs: undefined;
};
