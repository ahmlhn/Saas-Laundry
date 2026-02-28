import { Image, type ImageStyle, type StyleProp } from "react-native";

interface BrandMarkProps {
  size: number;
  style?: StyleProp<ImageStyle>;
}

const brandMarkSource = require("../../../assets/brand-mark.png");

export function BrandMark({ size, style }: BrandMarkProps) {
  return <Image resizeMode="contain" source={brandMarkSource} style={[{ width: size, height: size }, style]} />;
}
