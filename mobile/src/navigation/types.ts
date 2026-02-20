export type AuthStackParamList = {
  Login: undefined;
};

export type AppStackParamList = {
  OutletSelect: undefined;
  HomeDashboard: undefined;
  OrdersToday: undefined;
  OrderDetail: {
    orderId: string;
  };
};
