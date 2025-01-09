import { ApiError } from "@/utils/request.ts";
import { toaster } from "@/components/ui/toaster.tsx";

export function toastError(options: Parameters<typeof toaster.error>[0]) {
  toaster.error(options);
}

export function toastApiError(err: ApiError) {
  toastError({
    title: err.statusText,
    description: JSON.stringify(err),
  });
}
