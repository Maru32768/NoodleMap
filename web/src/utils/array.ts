import { useMemo, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSort<T extends Record<string, any>>(data: T[]) {
  const [sortKey, setSortKey] = useState<keyof T | undefined>();
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC" | undefined>();

  const sortedData = useMemo(() => {
    if (sortKey && sortOrder) {
      return data.toSorted((a, b) => {
        return (
          (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) *
          (sortOrder === "ASC" ? 1 : -1)
        );
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
