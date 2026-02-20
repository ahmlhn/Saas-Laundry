import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeDashboardScreen } from "../screens/app/HomeDashboardScreen";
import { OrdersTodayScreen } from "../screens/app/OrdersTodayScreen";
import { OrderDetailScreen } from "../screens/app/OrderDetailScreen";
import { OutletSelectScreen } from "../screens/app/OutletSelectScreen";
import { useSession } from "../state/SessionContext";
import { useAppTheme } from "../theme/useAppTheme";
import type { AppStackParamList } from "./types";

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  const { selectedOutlet } = useSession();
  const theme = useAppTheme();

  return (
    <Stack.Navigator
      initialRouteName={selectedOutlet ? "HomeDashboard" : "OutletSelect"}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="OutletSelect" component={OutletSelectScreen} />
      <Stack.Screen name="HomeDashboard" component={HomeDashboardScreen} />
      <Stack.Screen name="OrdersToday" component={OrdersTodayScreen} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
    </Stack.Navigator>
  );
}
