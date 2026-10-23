import { Button } from "@/components/ui/button.tsx";
import { Box, useFieldContext } from "@chakra-ui/react";
import { KeyboardEvent, useRef } from "react";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

const NEXT_KEYS = ["ArrowRight", "ArrowDown"];
const PREV_KEYS = ["ArrowLeft", "ArrowUp"];

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
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
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
      display="flex"
      gap="6px"
      flexWrap="wrap"
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
            variant="plain"
            px="10px"
            py="5px"
            h="auto"
            minH="auto"
            fontSize="12px"
            fontWeight={selected ? 600 : 400}
            bg={selected ? "nm.ink" : "nm.bg"}
            color={selected ? "nm.paper" : "nm.inkMuted"}
            border="1px solid"
            borderColor={selected ? "nm.ink" : "nm.line"}
            rounded="nmMd"
            _hover={{ borderColor: "nm.ink" }}
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
