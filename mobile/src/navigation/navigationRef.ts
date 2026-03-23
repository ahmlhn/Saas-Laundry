import { createNavigationContainerRef } from "@react-navigation/native";
import type { AppRootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<AppRootStackParamList>();
