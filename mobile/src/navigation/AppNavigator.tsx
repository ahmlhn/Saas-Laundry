import { createBottomTabNavigator, type BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { HomeDashboardScreen } from "../screens/app/HomeDashboardScreen";
import { OrderDetailScreen } from "../screens/app/OrderDetailScreen";
import { OrdersTodayScreen } from "../screens/app/OrdersTodayScreen";
import { OutletSelectScreen } from "../screens/app/OutletSelectScreen";
import { useSession } from "../state/SessionContext";
import { useAppTheme } from "../theme/useAppTheme";
import type { AccountStackParamList, AppRootStackParamList, AppTabParamList, OrdersStackParamList } from "./types";
import { QuickActionScreen } from "../screens/app/QuickActionScreen";
import { ReportsScreen } from "../screens/app/ReportsScreen";
import { AccountHubScreen } from "../screens/app/AccountHubScreen";
import { CustomersScreen } from "../screens/app/CustomersScreen";
import { CustomerDetailScreen } from "../screens/app/CustomerDetailScreen";
import { CustomerFormScreen } from "../screens/app/CustomerFormScreen";
import { FinanceToolsScreen } from "../screens/app/FinanceToolsScreen";
import { PrinterNoteScreen } from "../screens/app/PrinterNoteScreen";
import { HelpInfoScreen } from "../screens/app/HelpInfoScreen";
import { WhatsAppToolsScreen } from "../screens/app/WhatsAppToolsScreen";
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
import { OutletsScreen } from "../screens/app/OutletsScreen";
import { ShippingZonesScreen } from "../screens/app/ShippingZonesScreen";
import { TenantManagementScreen } from "../screens/app/TenantManagementScreen";
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
      <AccountStack.Screen name="Outlets" component={OutletsScreen} />
      <AccountStack.Screen name="ShippingZones" component={ShippingZonesScreen} />
      <AccountStack.Screen name="TenantManagement" component={TenantManagementScreen} />
      <AccountStack.Screen name="FinanceTools" component={FinanceToolsScreen} />
      <AccountStack.Screen name="PrinterNote" component={PrinterNoteScreen} />
      <AccountStack.Screen name="HelpInfo" component={HelpInfoScreen} />
      <AccountStack.Screen name="WhatsAppTools" component={WhatsAppToolsScreen} />
    </AccountStack.Navigator>
  );
}

function QuickActionTabButton(props: BottomTabBarButtonProps) {
  const theme = useAppTheme();
  const navigation = useNavigation<BottomTabNavigationProp<AppTabParamList>>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const minEdge = Math.min(width, height);
  const isTablet = minEdge >= 600;
  const buttonSize = isTablet ? 64 : isLandscape ? 54 : 60;
  const wrapperTopIdle = isLandscape ? -10 : -16;
  const wrapperTopActive = isLandscape ? -4 : -8;
  const haloSize = buttonSize + (isTablet ? 16 : 14);
  const isActive = Boolean(props.accessibilityState?.selected);

  function handlePress(): void {
    navigation.navigate("QuickActionTab", {
      openCreateStamp: Date.now(),
    });
  }

  return (
    <Pressable
      accessibilityHint="Buka halaman aksi cepat untuk membuat pesanan baru"
      accessibilityLabel="Tambah Pesanan"
      accessibilityRole="button"
      onLongPress={props.onLongPress}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.quickActionButtonWrap,
        {
          gap: isActive ? 0 : 6,
          top: isActive ? wrapperTopActive : wrapperTopIdle,
          transform: [{ scale: pressed ? 0.95 : 1 }],
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.quickActionHalo,
          {
            width: haloSize,
            height: haloSize,
            borderColor: theme.mode === "dark" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.92)",
            backgroundColor: theme.mode === "dark" ? "rgba(13,77,123,0.22)" : "rgba(31,163,232,0.14)",
          },
        ]}
      />
      <View
        style={[
          styles.quickActionButton,
          {
            borderColor: theme.colors.surface,
            backgroundColor: isActive ? theme.colors.info : theme.colors.primaryStrong,
            width: buttonSize,
            height: buttonSize,
            shadowColor: isActive ? theme.colors.info : theme.colors.primaryStrong,
            shadowOpacity: theme.mode === "dark" ? 0.35 : 0.22,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          },
        ]}
      >
        <Ionicons color={theme.colors.primaryContrast} name={isActive ? "add-circle" : "add"} size={isTablet ? 30 : 28} />
      </View>
      {!isActive ? (
        <View
          style={[
            styles.quickActionCaption,
            {
              backgroundColor: theme.mode === "dark" ? "#0f2f44" : "#eff8ff",
              borderColor: theme.mode === "dark" ? "rgba(102,191,255,0.35)" : "rgba(31,163,232,0.3)",
            },
          ]}
        >
          <Text style={[styles.quickActionCaptionText, { color: theme.colors.info }]}>Tambah</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function MainTabsNavigator() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const minEdge = Math.min(width, height);
  const isTablet = minEdge >= 600;
  const tabBarHeight = isTablet ? 86 : isLandscape ? 68 : 74;
  const labelSize = isTablet ? 12 : 11;
  const iconSize = isTablet ? 21 : 19;
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
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: isLandscape ? 6 : 8,
          paddingBottom: isLandscape ? 6 : 8,
        },
        tabBarActiveTintColor: theme.colors.info,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: theme.fonts.semibold,
          fontSize: labelSize,
          marginBottom: 2,
        },
        tabBarItemStyle: {
          paddingTop: isLandscape ? 0 : 2,
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
          component={QuickActionScreen}
          options={{
            tabBarLabel: "",
            tabBarAccessibilityLabel: "Tambah Pesanan",
            tabBarIcon: () => null,
            tabBarButton: (props) => <QuickActionTabButton {...props} />,
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
          tabBarIcon: ({ color, focused }) => <Ionicons color={color} name={focused ? "grid" : "grid-outline"} size={iconSize} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { selectedOutlet } = useSession();
  const theme = useAppTheme();

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {selectedOutlet ? (
        <RootStack.Screen name="MainTabs" component={MainTabsNavigator} />
      ) : (
        <RootStack.Screen name="OutletSelect" component={OutletSelectScreen} />
      )}
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  quickActionButtonWrap: {
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  quickActionHalo: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
  },
  quickActionButton: {
    borderRadius: 999,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionCaption: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 58,
    alignItems: "center",
  },
  quickActionCaptionText: {
    fontSize: 10.5,
    letterSpacing: 0.2,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
