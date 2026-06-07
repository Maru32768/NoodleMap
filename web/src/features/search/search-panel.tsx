import { Loading } from "@/components/loading.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Field } from "@/components/ui/field.tsx";
import { InputGroup } from "@/components/ui/input-group.tsx";
import {
  CATEGORY_OPTIONS,
  CategorySlug,
} from "@/features/categories/categories.ts";
import { HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { CiFilter, CiSearch } from "react-icons/ci";

export interface SearchPanelProps {
  count: number;
  currentCategory: CategorySlug | "all";
  onChangeCategory: (category: CategorySlug | "all") => void;
  defaultKeyword: string;
  onChangeKeyword: (keyword: string) => Promise<unknown>;
  favoriteOnly: boolean;
  onChangeFavoriteOnly: (favoriteOnly: boolean) => void;
  visited: boolean;
  onChangeVisited: (visited: boolean) => void;
  unvisited: boolean;
  onChangeUnvisited: (unvisited: boolean) => void;
}

export function SearchPanel({
  count,
  currentCategory,
  defaultKeyword,
  onChangeKeyword,
  onChangeCategory,
  favoriteOnly,
  onChangeFavoriteOnly,
  visited,
  onChangeVisited,
  unvisited,
  onChangeUnvisited,
}: SearchPanelProps) {
  const [isPending, setIsPending] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  return (
    <VStack alignItems="start" boxSize="full" fontSize="md">
      <Field height="3rem" width="full">
        <InputGroup
          boxSize="full"
          startElement={
            isPending ? (
              <Loading />
            ) : (
              <Icon boxSize="70%">
                <CiSearch />
              </Icon>
            )
          }
          endElement={
            <Button
              variant="ghost"
              onClick={() => {
                setIsFilterOpen(!isFilterOpen);
              }}
            >
              <Icon boxSize="80%" minWidth="0" padding="0">
                <CiFilter fill="black" />
              </Icon>
            </Button>
          }
        >
          <Input
            boxSize="full"
            defaultValue={defaultKeyword}
            onChange={(e) => {
              const ret = onChangeKeyword(e.target.value);
              setIsPending(true);
              ret.finally(() => {
                setIsPending(false);
              });
            }}
          />
        </InputGroup>
      </Field>
      {isFilterOpen && (
        <VStack alignItems="start" padding={2} boxSize="full">
          <Text fontSize="sm">現在の表示件数: {count}</Text>
          <Field label="カテゴリー">
            <HStack>
              {CATEGORY_OPTIONS.map((x) => {
                const isChecked = currentCategory === x.id;
                return (
                  <Checkbox
                    htmlFor={x.id}
                    key={x.id}
                    value={x.id}
                    checked={isChecked}
                    onCheckedChange={({ checked }) => {
                      if (checked) {
                        onChangeCategory(x.id);
                      } else {
                        onChangeCategory("all");
                      }
                    }}
                  >
                    {x.label}
                  </Checkbox>
                );
              })}
            </HStack>
          </Field>
          <Field label="その他">
            <VStack alignItems="start">
              <HStack>
                <Checkbox
                  htmlFor="visited"
                  checked={visited}
                  onCheckedChange={({ checked }) => {
                    if (typeof checked === "boolean") {
                      onChangeVisited(checked);
                    }
                  }}
                >
                  食べた店
                </Checkbox>
                <Checkbox
                  htmlFor="unvisited"
                  checked={unvisited}
                  onCheckedChange={({ checked }) => {
                    if (typeof checked === "boolean") {
                      onChangeUnvisited(checked);
                    }
                  }}
                >
                  気になる店
                </Checkbox>
              </HStack>
              <Checkbox
                htmlFor="maruFavorite"
                checked={favoriteOnly}
                onCheckedChange={({ checked }) => {
                  if (typeof checked === "boolean") {
                    onChangeFavoriteOnly(checked);
                  }
                }}
              >
                Maruのお気に入りのみ
              </Checkbox>
            </VStack>
          </Field>
        </VStack>
      )}
    </VStack>
  );
}
