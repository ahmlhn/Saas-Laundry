import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeDashboardScreen } from "../screens/app/HomeDashboardScreen";
import { OrderDetailScreen } from "../screens/app/OrderDetailScreen";
import { OrderPaymentScreen } from "../screens/app/OrderPaymentScreen";
import { OrdersTodayScreen } from "../screens/app/OrdersTodayScreen";
import { OutletSelectScreen } from "../screens/app/OutletSelectScreen";
import { useSession } from "../state/SessionContext";
import { useAppTheme } from "../theme/useAppTheme";
import type { AccountStackParamList, AppRootStackParamList, AppTabParamList, OrdersStackParamList } from "./types";
import { OrderCreateScreen } from "../screens/app/OrderCreateScreen";
import { ReportsScreen } from "../screens/app/ReportsScreen";
import { AccountHubScreen } from "../screens/app/AccountHubScreen";
import { CustomersScreen } from "../screens/app/CustomersScreen";
import { CustomerDetailScreen } from "../screens/app/CustomerDetailScreen";
import { CustomerFormScreen } from "../screens/app/CustomerFormScreen";
import { FinanceToolsScreen } from "../screens/app/FinanceToolsScreen";
import { PaymentGatewayScreen } from "../screens/app/PaymentGatewayScreen";
import { PrinterNoteScreen } from "../screens/app/PrinterNoteScreen";
import { HelpInfoScreen } from "../screens/app/HelpInfoScreen";
import { WhatsAppToolsScreen } from "../screens/app/WhatsAppToolsScreen";
import { NotificationInboxScreen } from "../screens/app/NotificationInboxScreen";
import { ServicesScreen } from "../screens/app/ServicesScreen";
import { ServiceCatalogScreen } from "../screens/app/ServiceCatalogScreen";
import { ServiceFormScreen } from "../screens/app/ServiceFormScreen";
import { ServiceTypeListScreen } from "../screens/app/ServiceTypeListScreen";
import { ServiceGroupFormScreen } from "../screens/app/ServiceGroupFormScreen";
import { ServiceVariantFormScreen } from "../screens/app/ServiceVariantFormScreen";
import { ProcessTagManagerScreen } from "../screens/app/ProcessTagManagerScreen";
import { ParfumItemScreen } from "../screens/app/ParfumItemScreen";
import { ParfumItemFormScreen } from "../screens/app/ParfumItemFormScreen";
import { PromoScreen } from "../screens/app/PromoScreen";
import { PromoFormScreen } from "../screens/app/PromoFormScreen";
import { FeaturePlaceholderScreen } from "../screens/app/FeaturePlaceholderScreen";
import { StaffScreen } from "../screens/app/StaffScreen";
import { StaffFormScreen } from "../screens/app/StaffFormScreen";
import { OutletsScreen } from "../screens/app/OutletsScreen";
import { ShippingZonesScreen } from "../screens/app/ShippingZonesScreen";
import { TenantManagementScreen } from "../screens/app/TenantManagementScreen";
import { SubscriptionCenterScreen } from "../screens/app/SubscriptionCenterScreen";
import { PlatformSubscriptionHubScreen } from "../screens/app/PlatformSubscriptionHubScreen";
import { canSeeQuickActionTab, canSeeReportsTab } from "../lib/accessControl";

const RootStack = createNativeStackNavigator<AppRootStackParamList>();
const Tab = createBottomTabNavigator<AppTabParamList>();
const OrdersStack = createNativeStackNavigator<OrdersStackParamList>();
const AccountStack = createNativeStackNavigator<AccountStackParamList>();

function OrdersTabNavigator() {
  return (
    <OrdersStack.Navigator screenOptions={{ headerShown: false }}>
      <OrdersStack.Screen name="OrdersToday" component={OrdersTodayScreen} />
      <OrdersStack.Screen name="OrderDetail" component={OrderDetailScreen} />
    </OrdersStack.Navigator>
  );
}

function AccountTabNavigator() {
  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }}>
      <AccountStack.Screen name="AccountHub" component={AccountHubScreen} />
      <AccountStack.Screen name="Customers" component={CustomersScreen} />
      <AccountStack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <AccountStack.Screen name="CustomerForm" component={CustomerFormScreen} />
      <AccountStack.Screen name="Services" component={ServicesScreen} />
      <AccountStack.Screen name="ServiceCatalog" component={ServiceCatalogScreen} />
      <AccountStack.Screen name="ServiceForm" component={ServiceFormScreen} />
      <AccountStack.Screen name="ServiceTypeList" component={ServiceTypeListScreen} />
      <AccountStack.Screen name="ServiceGroupForm" component={ServiceGroupFormScreen} />
      <AccountStack.Screen name="ServiceVariantForm" component={ServiceVariantFormScreen} />
      <AccountStack.Screen name="ProcessTagManager" component={ProcessTagManagerScreen} />
      <AccountStack.Screen name="ParfumItem" component={ParfumItemScreen} />
      <AccountStack.Screen name="ParfumItemForm" component={ParfumItemFormScreen} />
      <AccountStack.Screen name="Promo" component={PromoScreen} />
      <AccountStack.Screen name="PromoForm" component={PromoFormScreen} />
      <AccountStack.Screen name="FeaturePlaceholder" component={FeaturePlaceholderScreen} />
      <AccountStack.Screen name="Staff" component={StaffScreen} />
      <AccountStack.Screen name="StaffForm" component={StaffFormScreen} />
      <AccountStack.Screen name="Outlets" component={OutletsScreen} />
      <AccountStack.Screen name="ShippingZones" component={ShippingZonesScreen} />
      <AccountStack.Screen name="TenantManagement" component={TenantManagementScreen} />
      <AccountStack.Screen name="SubscriptionCenter" component={SubscriptionCenterScreen} />
      <AccountStack.Screen name="FinanceTools" component={FinanceToolsScreen} />
      <AccountStack.Screen name="PaymentGateway" component={PaymentGatewayScreen} />
      <AccountStack.Screen name="PrinterNote" component={PrinterNoteScreen} />
      <AccountStack.Screen name="HelpInfo" component={HelpInfoScreen} />
      <AccountStack.Screen name="WhatsAppTools" component={WhatsAppToolsScreen} />
      <AccountStack.Screen name="Notifications" component={NotificationInboxScreen} />
    </AccountStack.Navigator>
  );
}

function QuickActionLauncherPlaceholderScreen() {
  return null;
}

function MainTabsNavigator() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const minEdge = Math.min(width, height);
  const isTablet = minEdge >= 600;
  const baseTabBarHeight = isTablet ? 74 : isLandscape ? 60 : 66;
  const baseTabBarPaddingTop = isLandscape ? 4 : 6;
  const baseTabBarPaddingBottom = isLandscape ? 4 : 6;
  const bottomInset = Math.max(insets.bottom, 0);
  const tabBarHeight = baseTabBarHeight + bottomInset;
  const labelSize = isTablet ? 12 : 10;
  const iconSize = isTablet ? 22 : 20;
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const showQuickAction = canSeeQuickActionTab(roles);
  const showReports = canSeeReportsTab(roles);

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.mode === "dark" ? theme.colors.surface : "#ffffff",
          borderTopColor: theme.mode === "dark" ? theme.colors.borderStrong : "#e7ebee",
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: baseTabBarPaddingTop,
          paddingBottom: baseTabBarPaddingBottom + bottomInset,
          shadowColor: "#000000",
          shadowOpacity: theme.mode === "dark" ? 0.18 : 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -3 },
          elevation: 10,
        },
        tabBarActiveTintColor: theme.colors.success,
        tabBarInactiveTintColor: theme.mode === "dark" ? theme.colors.textMuted : "#98a1ad",
        tabBarLabelStyle: {
          fontFamily: theme.fonts.medium,
          fontSize: labelSize,
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingTop: 0,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeDashboardScreen}
        options={{
          tabBarLabel: "Beranda",
          tabBarIcon: ({ color, focused }) => <Ionicons color={color} name={focused ? "home-sharp" : "home"} size={iconSize + 1} />,
        }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersTabNavigator}
        options={{
          tabBarLabel: "Pesanan",
          tabBarIcon: ({ color, focused }) => <Ionicons color={color} name={focused ? "receipt" : "receipt-outline"} size={iconSize} />,
        }}
      />
      {showQuickAction ? (
        <Tab.Screen
          name="QuickActionTab"
          component={QuickActionLauncherPlaceholderScreen}
          listeners={({ navigation }) => ({
            tabPress: (event) => {
              event.preventDefault();
              navigation.getParent<NativeStackNavigationProp<AppRootStackParamList>>()?.navigate("OrderCreate", {
                openCreateStamp: Date.now(),
              });
            },
          })}
          options={{
            tabBarLabel: "Tambah",
            tabBarAccessibilityLabel: "Tambah Pesanan",
            tabBarIcon: ({ color, focused }) => <Ionicons color={color} name={focused ? "add-circle" : "add-circle-outline"} size={iconSize + 1} />,
          }}
        />
      ) : null}
      {showReports ? (
        <Tab.Screen
          name="ReportsTab"
          component={ReportsScreen}
          options={{
            tabBarLabel: "Laporan",
            tabBarIcon: ({ color, focused }) => <Ionicons color={color} name={focused ? "bar-chart" : "bar-chart-outline"} size={iconSize} />,
          }}
        />
      ) : null}
      <Tab.Screen
        name="AccountTab"
        component={AccountTabNavigator}
        options={{
          tabBarLabel: "Akun",
          tabBarIcon: ({ color, focused }) => <Ionicons color={color} name={focused ? "person" : "person-outline"} size={iconSize} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { selectedOutlet, session } = useSession();
  const theme = useAppTheme();
  const isPlatformWorkspace = session?.workspace === "platform";

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {isPlatformWorkspace ? (
        <RootStack.Screen name="PlatformHub" component={PlatformSubscriptionHubScreen} />
      ) : selectedOutlet ? (
        <>
          <RootStack.Screen name="MainTabs" component={MainTabsNavigator} />
          <RootStack.Screen
            name="OrderCreate"
            component={OrderCreateScreen}
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
          <RootStack.Screen
            name="OrderPayment"
            component={OrderPaymentScreen}
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
        </>
      ) : (
        <RootStack.Screen name="OutletSelect" component={OutletSelectScreen} />
      )}
    </RootStack.Navigator>
  );
}
