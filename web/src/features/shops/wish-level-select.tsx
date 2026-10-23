import {
  WISH_LEVEL_LABEL,
  WISH_LEVELS,
  WishLevel,
} from "@/features/shops/status.ts";
import { NativeSelect } from "@chakra-ui/react";

/** 気になる度 picker; "" is 未設定. */
export function WishLevelSelect({
  value,
  onChange,
}: {
  value: WishLevel | "";
  onChange: (value: WishLevel | "") => void;
}) {
  return (
    <NativeSelect.Root size="sm" width="200px">
      <NativeSelect.Field
        aria-label="気になる度"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(WISH_LEVELS.find((level) => level === next) ?? "");
        }}
      >
        <option value="">未設定</option>
        {WISH_LEVELS.map((level) => (
          <option key={level} value={level}>
            {WISH_LEVEL_LABEL[level]}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}
