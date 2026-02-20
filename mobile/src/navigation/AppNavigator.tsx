import { createBottomTabNavigator, type BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
      <AccountStack.Screen name="FinanceTools" component={FinanceToolsScreen} />
      <AccountStack.Screen name="PrinterNote" component={PrinterNoteScreen} />
      <AccountStack.Screen name="HelpInfo" component={HelpInfoScreen} />
      <AccountStack.Screen name="WhatsAppTools" component={WhatsAppToolsScreen} />
    </AccountStack.Navigator>
  );
}

function QuickActionTabButton(props: BottomTabBarButtonProps) {
  const theme = useAppTheme();

  return (
    <Pressable accessibilityLabel={props.accessibilityLabel} onPress={props.onPress} style={styles.quickActionButtonWrap}>
      <View
        style={[
          styles.quickActionButton,
          {
            borderColor: theme.colors.surface,
            backgroundColor: theme.colors.primaryStrong,
          },
        ]}
      >
        <Text style={[styles.quickActionButtonText, { color: theme.colors.primaryContrast, fontFamily: theme.fonts.heavy }]}>+</Text>
      </View>
    </Pressable>
  );
}

function MainTabsNavigator() {
  const theme = useAppTheme();
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
          height: 74,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: theme.colors.info,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: theme.fonts.semibold,
          fontSize: 11,
          marginBottom: 2,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeDashboardScreen}
        options={{
          tabBarLabel: "Beranda",
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>H</Text>,
        }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersTabNavigator}
        options={{
          tabBarLabel: "Pesanan",
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>P</Text>,
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
            tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>L</Text>,
          }}
        />
      ) : null}
      <Tab.Screen
        name="AccountTab"
        component={AccountTabNavigator}
        options={{
          tabBarLabel: "Akun",
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>A</Text>,
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
  tabIcon: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: -2,
  },
  quickActionButtonWrap: {
    top: -16,
    justifyContent: "center",
    alignItems: "center",
  },
  quickActionButton: {
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionButtonText: {
    fontSize: 30,
    lineHeight: 30,
  },
});
