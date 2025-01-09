import { ModalDialog } from "@/components/modal-dialog.tsx";
import { createListCollection, HStack, Input, VStack } from "@chakra-ui/react";
import { Controller, useForm } from "react-hook-form";
import { Field } from "@/components/ui/field.tsx";
import {
  NumberInputField,
  NumberInputRoot,
} from "@/components/ui/number-input.tsx";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { useCategories } from "@/features/categories/api/use-categories.ts";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  FindResult,
  GooglePlaceFinder,
} from "@/features/map/google-place-finder.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCallback, useMemo } from "react";

export interface RestaurantEditForm {
  name: string;
  lat: number;
  lng: number;
  postalCode: string;
  address: string;
  closed: boolean;
  googlePlaceId: string;
  categories: string[];
  visited: boolean;
  favorite: boolean;
  rate: number;
}

interface Props {
  initialValue: Restaurant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (command: RestaurantEditForm) => Promise<unknown> | undefined;
}

export function RestaurantEditModal({
  initialValue,
  open,
  onOpenChange,
  onConfirm,
}: Props) {
  const form = useForm<RestaurantEditForm>({
    defaultValues: {
      name: initialValue.name,
      lat: initialValue.lat,
      lng: initialValue.lng,
      postalCode: initialValue.postalCode,
      address: initialValue.address,
      closed: initialValue.closed,
      googlePlaceId: initialValue.googlePlaceId,
      categories: initialValue.categories,
      visited: initialValue.visited,
      favorite: initialValue.favorite,
      rate: initialValue.rate,
    },
  });
  const { categories } = useCategories();
  const categoryOptions = createListCollection({
    items:
      categories?.map((x) => {
        return {
          label: x.label,
          value: x.id,
        };
      }) ?? [],
  });

  const initialPlace = useMemo(() => {
    return {
      placeId: initialValue.googlePlaceId,
      location: {
        lat: initialValue.lat,
        lng: initialValue.lng,
      },
    };
  }, [initialValue]);
  const handleSelect = useCallback(
    (res: FindResult) => {
      form.setValue("name", res.name);
      form.setValue("lat", res.lat);
      form.setValue("lng", res.lng);
      form.setValue("postalCode", res.postalCode);
      form.setValue("address", res.address);
      form.setValue("closed", res.closed);
      form.setValue("googlePlaceId", res.placeId);
    },
    [form],
  );

  return (
    <ModalDialog
      height="90vh"
      width="80vw"
      buttons={[
        {
          label: "キャンセル",
          onClick: () => {
            onOpenChange(false);
          },
        },
        {
          label: "更新する",
          isDisabled: !form.formState.isValid,
          onClick: () => {
            return onConfirm(form.getValues())?.then(() => {
              onOpenChange(false);
              form.reset();
            });
          },
        },
      ]}
      open={open}
      onOpenChange={onOpenChange}
    >
      <HStack alignItems="start" justifyContent="stretch" boxSize="full">
        <VStack
          alignItems="stretch"
          height="full"
          width="48rem"
          overflow="auto"
        >
          <Button
            onClick={() => {
              form.reset();
            }}
          >
            Reset
          </Button>
          <Controller
            control={form.control}
            name="visited"
            render={({ field }) => {
              return (
                <Field label="訪問済み">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(e) => {
                      field.onChange(!!e.checked);
                    }}
                  />
                </Field>
              );
            }}
          />
          <Controller
            control={form.control}
            name="favorite"
            render={({ field }) => {
              return (
                <Field label="お気に入り">
                  <Checkbox
                    disabled={!form.watch("visited")}
                    checked={field.value}
                    onCheckedChange={(e) => {
                      field.onChange(!!e.checked);
                    }}
                  />
                </Field>
              );
            }}
          />
          <Controller
            control={form.control}
            name="rate"
            render={({ field }) => {
              return (
                <Field label="レート">
                  <NumberInputRoot
                    disabled={!form.watch("visited")}
                    value={String(field.value)}
                    onValueChange={(x) => {
                      field.onChange(x.valueAsNumber);
                    }}
                  >
                    <NumberInputField />
                  </NumberInputRoot>
                </Field>
              );
            }}
          />
          <Field label="名前">
            <Input {...form.register("name")} />
          </Field>
          <Controller
            control={form.control}
            name="lat"
            render={({ field }) => {
              return (
                <Field label="緯度">
                  <NumberInputRoot
                    value={String(field.value)}
                    onValueChange={(x) => {
                      field.onChange(x.valueAsNumber);
                    }}
                  >
                    <NumberInputField />
                  </NumberInputRoot>
                </Field>
              );
            }}
          />
          <Controller
            control={form.control}
            name="lng"
            render={({ field }) => {
              return (
                <Field label="経度">
                  <NumberInputRoot
                    value={String(field.value)}
                    onValueChange={(x) => {
                      field.onChange(x.valueAsNumber);
                    }}
                  >
                    <NumberInputField />
                  </NumberInputRoot>
                </Field>
              );
            }}
          />
          <Field label="郵便番号">
            <Input {...form.register("postalCode")} />
          </Field>
          <Field label="住所">
            <Input {...form.register("address")} />
          </Field>
          <Controller
            control={form.control}
            name="closed"
            render={({ field }) => {
              return (
                <Field label="閉店済み">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(e) => {
                      field.onChange(!!e.checked);
                    }}
                  />
                </Field>
              );
            }}
          />
          <Field label="GooglePlaceID">
            <Input {...form.register("googlePlaceId")} />
          </Field>
          <Controller
            control={form.control}
            name="categories"
            rules={{
              validate: (initialValue) => {
                if (initialValue.length === 0) {
                  return "必須入力";
                }
              },
            }}
            render={({ field }) => {
              return (
                <Field
                  label="カテゴリー"
                  invalid={!!form.formState.errors.categories}
                  errorText={form.formState.errors.categories?.message}
                >
                  <SelectRoot
                    disabled
                    multiple
                    collection={categoryOptions}
                    value={field.value}
                    onValueChange={(x) => {
                      field.onChange(x.value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValueText />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.items.map((x) => {
                        return (
                          <SelectItem item={x} key={x.value}>
                            {x.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </SelectRoot>
                </Field>
              );
            }}
          />
        </VStack>
        <GooglePlaceFinder
          initialPlace={initialPlace}
          onSelect={handleSelect}
        />
      </HStack>
    </ModalDialog>
  );
}
