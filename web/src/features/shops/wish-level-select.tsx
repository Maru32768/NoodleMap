import {
  SegmentedOption,
  SegmentedPicker,
} from "@/components/segmented-picker.tsx";
import {
  WISH_LEVEL_LABEL,
  WISH_LEVELS,
  WishLevel,
} from "@/features/shops/status.ts";

const OPTIONS: SegmentedOption<WishLevel | "">[] = [
  { id: "", label: "未設定" },
  ...WISH_LEVELS.map((level) => ({
    id: level,
    label: WISH_LEVEL_LABEL[level],
  })),
];

/** 気になる度 picker; "" is 未設定. */
export function WishLevelSelect({
  value,
  onChange,
}: {
  value: WishLevel | "";
  onChange: (value: WishLevel | "") => void;
}) {
  return (
    <SegmentedPicker
      label="気になる度"
      options={OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}
