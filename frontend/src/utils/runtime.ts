import Constants, { ExecutionEnvironment } from "expo-constants";

// True when running inside the Expo Go sandbox app (not a standalone/dev build).
// Native modules like react-native-maps and AdMob behave differently / render blank here.
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
