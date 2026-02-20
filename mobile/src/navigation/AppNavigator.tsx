import { createBottomTabNavigator, type BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
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
import { FinanceToolsScreen } from "../screens/app/FinanceToolsScreen";
import { PrinterNoteScreen } from "../screens/app/PrinterNoteScreen";
import { HelpInfoScreen } from "../screens/app/HelpInfoScreen";
import { WhatsAppToolsScreen } from "../screens/app/WhatsAppToolsScreen";
import { ServicesScreen } from "../screens/app/ServicesScreen";
import { StaffScreen } from "../screens/app/StaffScreen";
import { OutletsScreen } from "../screens/app/OutletsScreen";
import { ShippingZonesScreen } from "../screens/app/ShippingZonesScreen";
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
      <AccountStack.Screen name="Services" component={ServicesScreen} />
      <AccountStack.Screen name="Staff" component={StaffScreen} />
      <AccountStack.Screen name="Outlets" component={OutletsScreen} />
      <AccountStack.Screen name="ShippingZones" component={ShippingZonesScreen} />
      <AccountStack.Screen name="FinanceTools" component={FinanceToolsScreen} />
      <AccountStack.Screen name="PrinterNote" component={PrinterNoteScreen} />
      <AccountStack.Screen name="HelpInfo" component={HelpInfoScreen} />
      <AccountStack.Screen name="WhatsAppTools" component={WhatsAppToolsScreen} />
    </AccountStack.Navigator>
  );
}

function QuickActionTabButton(props: BottomTabBarButtonProps) {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const minEdge = Math.min(width, height);
  const isTablet = minEdge >= 600;
  const buttonSize = isTablet ? 62 : isLandscape ? 52 : 58;
  const wrapperTop = isLandscape ? -10 : -16;

  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      style={[styles.quickActionButtonWrap, { top: wrapperTop }]}
    >
      <View
        style={[
          styles.quickActionButton,
          {
            borderColor: theme.colors.surface,
            backgroundColor: theme.colors.primaryStrong,
            width: buttonSize,
            height: buttonSize,
            shadowColor: theme.colors.primaryStrong,
            shadowOpacity: theme.mode === "dark" ? 0.35 : 0.22,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          },
        ]}
      >
        <Ionicons color={theme.colors.primaryContrast} name="add" size={isTablet ? 30 : 28} />
      </View>
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
          tabBarIcon: ({ color, focused }) => <Ionicons color={color} name={focused ? "home" : "home-outline"} size={iconSize} />,
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
  },
  quickActionButton: {
    borderRadius: 999,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
