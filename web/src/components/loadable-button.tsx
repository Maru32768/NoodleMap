import { Button, ButtonProps } from "@/components/ui/button.tsx";
import React, { useState } from "react";

interface Props extends Omit<ButtonProps, "onClick"> {
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => void | undefined | Promise<unknown>;
}

export function LoadableButton({ loading, onClick, ...rest }: Props) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Button
      loading={isLoading || loading}
      onClick={(e) => {
        const res = onClick?.(e);
        if (res) {
          setIsLoading(true);
          res.finally(() => {
            setIsLoading(false);
          });
        }
      }}
      {...rest}
    />
  );
}
