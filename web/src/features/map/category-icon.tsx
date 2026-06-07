import { CategorySlug } from "@/features/categories/categories.ts";

interface CategoryIconProps {
  category: CategorySlug;
  closed?: boolean;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function CategoryIcon({
  category,
  closed = false,
  size = 26,
  color = "currentColor",
  strokeWidth = 1.6,
}: CategoryIconProps) {
  const sw = strokeWidth;
  if (closed) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        aria-label="閉店"
      >
        <circle cx="12" cy="12" r="9.5" strokeWidth={1.4} opacity={0.55} />
        <path d="M8 8 L16 16 M16 8 L8 16" />
      </svg>
    );
  }
  if (category === "udon") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="3 2 18 16"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="うどん"
      >
        <path
          d="M3.5 11 H20.5 A8.5 5 0 0 1 3.5 11 Z"
          fill={color}
          fillOpacity={0.14}
        />
        <path d="M3.5 11 H20.5" />
        <path d="M6 8.4 Q9 6.6 12 8.4 T18 8.4" />
        <path d="M5.5 6.4 Q9 4.6 12.5 6.4 T18.5 6.4" />
        <path d="M2 14 H22" strokeWidth={sw * 0.75} opacity={0.55} />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="ラーメン"
    >
      {/* Chopsticks */}
      <path d="M4 5 L20 1.5" strokeWidth={sw * 0.95} />
      <path d="M4 7.5 L20 4" strokeWidth={sw * 0.95} />
      {/* Hanging noodle strands */}
      <path d="M8.5 5.2 C7 8.2 9.5 11.5 8 14.5" strokeWidth={sw * 0.85} />
      <path d="M12 4.5 C10.5 7.5 13 11 11.5 14" strokeWidth={sw * 0.85} />
      <path d="M15.5 3.8 C14 7.5 16.5 11 15 14" strokeWidth={sw * 0.85} />
      {/* Bowl interior */}
      <path
        d="M2 15 C2 21 7 23 12 23 C17 23 22 21 22 15 Z"
        fill={color}
        fillOpacity={0.16}
      />
      {/* Bowl rim */}
      <path d="M2 15 H22" strokeWidth={sw * 1.05} />
      {/* Ramen-shop thunder pattern */}
      <g strokeWidth={sw * 0.75} strokeLinecap="square" strokeLinejoin="miter">
        <path d="M4.4 18.5 h1.7 v1.8 h1.7" />
        <path d="M10.3 18.5 h1.7 v1.8 h1.7" />
        <path d="M16.2 18.5 h1.7 v1.8 h1.7" />
      </g>
    </svg>
  );
}
