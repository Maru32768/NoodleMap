import { Button } from "@/components/ui/button.tsx";
import { Box, BoxProps, ButtonProps, useFieldContext } from "@chakra-ui/react";
import { KeyboardEvent, useRef } from "react";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

/**
 * - `outline`: separate outlined buttons (form fields).
 * - `segment`: buttons inside one boxed track, like a segmented control.
 */
export type SegmentedVariant = "outline" | "segment";

const NEXT_KEYS = ["ArrowRight", "ArrowDown"];
const PREV_KEYS = ["ArrowLeft", "ArrowUp"];

const GROUP_STYLES: Record<SegmentedVariant, BoxProps> = {
  outline: { display: "flex", gap: "6px", flexWrap: "wrap" },
  segment: {
    display: "inline-flex",
    flexShrink: 0,
    bg: "nm.bg",
    border: "1px solid",
    borderColor: "nm.line",
    rounded: "nmMd",
    p: "2px",
    gap: "1px",
  },
};

function optionStyles(
  variant: SegmentedVariant,
  selected: boolean,
): ButtonProps {
  switch (variant) {
    case "outline":
      return {
        px: "10px",
        py: "5px",
        fontSize: "12px",
        fontWeight: selected ? 600 : 400,
        bg: selected ? "nm.ink" : "nm.bg",
        color: selected ? "nm.paper" : "nm.inkMuted",
        border: "1px solid",
        borderColor: selected ? "nm.ink" : "nm.line",
        rounded: "nmMd",
        _hover: { borderColor: "nm.ink" },
      };
    case "segment":
      return {
        px: "10px",
        py: "5px",
        fontSize: "12px",
        fontWeight: selected ? 600 : 500,
        fontFamily: "body",
        whiteSpace: "nowrap",
        color: selected ? "nm.ink" : "nm.inkMuted",
        bg: selected ? "nm.paper" : "transparent",
        rounded: "4px",
        transition: "all 0.15s",
        boxShadow: selected ? "nmSm" : undefined,
        _hover: { bg: selected ? "nm.paper" : "transparent" },
      };
  }
}

/**
 * A row of buttons choosing exactly one option, as a radio group: Tab reaches
 * the chosen option, arrow keys (and Home/End) move the choice with focus.
 * Inside a {@link FormField} an error marks the group invalid and describes it.
 */
export function SegmentedPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = "outline",
  disabled = false,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  variant?: SegmentedVariant;
  disabled?: boolean;
}) {
  const field = useFieldContext();
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.id === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const last = options.length - 1;
    let next: number;
    if (NEXT_KEYS.includes(event.key)) {
      next = index === last ? 0 : index + 1;
    } else if (PREV_KEYS.includes(event.key)) {
      next = index === 0 ? last : index - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    } else {
      return;
    }
    event.preventDefault();
    onChange(options[next].id);
    buttonRefs.current[next]?.focus();
  };

  return (
    <Box
      role="radiogroup"
      aria-label={label}
      aria-invalid={field?.invalid || undefined}
      aria-describedby={field?.ariaDescribedby}
      aria-disabled={disabled || undefined}
      opacity={disabled ? 0.45 : undefined}
      transition="opacity 0.15s"
      {...GROUP_STYLES[variant]}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <Button
            key={option.id}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            variant="plain"
            h="auto"
            minH="auto"
            {...optionStyles(variant, selected)}
            _disabled={{ cursor: "not-allowed", opacity: 1 }}
            onClick={() => onChange(option.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {option.label}
          </Button>
        );
      })}
    </Box>
  );
}

/**
 * The `segment` track holding independent toggle buttons (`aria-pressed`), any
 * number of which may be on; each is its own tab stop.
 */
export function SegmentedToggles<T extends string>({
  label,
  options,
  value,
  onToggle,
  disabled = false,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: readonly T[];
  onToggle: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <Box
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      opacity={disabled ? 0.45 : undefined}
      transition="opacity 0.15s"
      {...GROUP_STYLES.segment}
    >
      {options.map((option) => {
        const pressed = value.includes(option.id);
        return (
          <Button
            key={option.id}
            aria-pressed={pressed}
            disabled={disabled}
            variant="plain"
            h="auto"
            minH="auto"
            {...optionStyles("segment", pressed)}
            _disabled={{ cursor: "not-allowed", opacity: 1 }}
            onClick={() => onToggle(option.id)}
          >
            {option.label}
          </Button>
        );
      })}
    </Box>
  );
}
