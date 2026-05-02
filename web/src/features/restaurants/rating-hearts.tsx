import { favToHearts } from "@/features/search/utils.ts";
import { Box } from "@chakra-ui/react";

const HEART_PATH =
  "M12 21s-7-4.35-9.5-9C1 8.5 3 5 6.5 5 8.5 5 10.5 6 12 8c1.5-2 3.5-3 5.5-3C21 5 23 8.5 21.5 12 19 16.65 12 21 12 21z";

type HeartState = "full" | "half" | "empty";

function toState(hearts: number, i: number): HeartState {
  if (i <= hearts) {
    return "full";
  }
  if (i - 0.5 <= hearts) {
    return "half";
  }
  return "empty";
}

export function HeartIcon({ state }: { state: HeartState }) {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      style={{ width: "100%", height: "100%" }}
    >
      <path d={HEART_PATH} fill={state === "full" ? "currentColor" : "none"} />
      {state === "half" && (
        <path
          d={HEART_PATH}
          fill="currentColor"
          stroke="none"
          style={{ clipPath: "inset(0 50% 0 0)" }}
        />
      )}
    </svg>
  );
}

export function MiniHearts({ rate }: { rate: number | undefined }) {
  const hearts = favToHearts(rate);
  return (
    <Box as="span" display="flex" gap="1px" alignItems="center">
      {[1, 2, 3, 4, 5].map((i) => {
        const state = toState(hearts, i);
        return (
          <Box
            as="span"
            key={i}
            w="11px"
            h="11px"
            color={state !== "empty" ? "nm.shu" : "nm.inkFaint"}
            opacity={state === "empty" ? 0.4 : 1}
          >
            <HeartIcon state={state} />
          </Box>
        );
      })}
    </Box>
  );
}

export function FavoriteRating({
  rate,
  compact = false,
}: {
  rate: number | undefined;
  compact?: boolean;
}) {
  const hearts = favToHearts(rate);

  return (
    <Box display="flex" alignItems="center" gap="0.375rem">
      <Box display="flex" gap="0.1875rem">
        {[1, 2, 3, 4, 5].map((i) => {
          const state = toState(hearts, i);
          return (
            <Box
              key={i}
              w="22px"
              h="22px"
              color={state !== "empty" ? "nm.shu" : "nm.inkFaint"}
              opacity={state === "empty" ? 0.4 : 1}
            >
              <HeartIcon state={state} />
            </Box>
          );
        })}
      </Box>
      {rate !== undefined && (
        <Box
          ml="auto"
          fontFamily="mono"
          fontSize="0.8125rem"
          color="nm.ink"
          fontWeight={500}
        >
          {rate}
          <Box as="span" fontSize="0.625rem" color="nm.inkFaint">
            {compact ? " /100" : " / 100"}
          </Box>
        </Box>
      )}
    </Box>
  );
}
