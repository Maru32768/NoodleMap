import { useMemo, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSort<T extends Record<string, any>>(
  data: T[],
  initialSortKey?: keyof T,
  initialSortOrder?: "ASC" | "DESC",
) {
  const [sortKey, setSortKey] = useState<keyof T | undefined>(initialSortKey);
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC" | undefined>(
    initialSortOrder,
  );

  const sortedData = useMemo(() => {
    if (sortKey && sortOrder) {
      return data.toSorted((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const direction = sortOrder === "ASC" ? 1 : -1;

        if (typeof av === "string" && typeof bv === "string") {
          return av.localeCompare(bv, "ja") * direction;
        }

        return (av > bv ? 1 : av < bv ? -1 : 0) * direction;
      });
    }
    return data;
  }, [data, sortKey, sortOrder]);

  return {
    sortedData,
    sortKey,
    setSortKey,
    sortOrder,
    setSortOrder,
  };
}
