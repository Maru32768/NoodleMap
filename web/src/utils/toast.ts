import { ApiError } from "@/utils/request.ts";
import { toaster } from "@/components/ui/toaster.tsx";

export function errorToast(options: Parameters<typeof toaster.error>[0]) {
  toaster.error(options);
}

export function apiErrorToast(err: ApiError) {
  errorToast({
    title: err.statusText,
    description: JSON.stringify(err),
  });
}
