import { HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { Field } from "@/components/ui/field.tsx";
import { CiSearch } from "react-icons/ci";
import { InputGroup } from "@/components/ui/input-group.tsx";
import { Loading } from "@/components/loading.tsx";
import { useState } from "react";
import { Category } from "@/features/categories/api/use-categories.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";

export interface SearchPanelProps {
  count: number;
  categories: Category[];
  currentCategories: string[];
  onChangeCategories: (categories: string[]) => void;
  defaultKeyword: string;
  onChangeKeyword: (keyword: string) => Promise<unknown>;
  favoriteOnly: boolean;
  onChangeFavoriteOnly: (favoriteOnly: boolean) => void;
  visited: boolean;
  onChangeVisited: (visited: boolean) => void;
  unvisited: boolean;
  onChangeUnvisited: (unvisited: boolean) => void;
  clustering: boolean;
  onChangeClustering: (clustering: boolean) => void;
}

export function SearchPanel({
  count,
  categories,
  currentCategories,
  defaultKeyword,
  onChangeKeyword,
  onChangeCategories,
  favoriteOnly,
  onChangeFavoriteOnly,
  visited,
  onChangeVisited,
  unvisited,
  onChangeUnvisited,
  clustering,
  onChangeClustering,
}: SearchPanelProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <VStack alignItems="start" boxSize="full" fontSize="md">
      <Text fontSize="sm">現在の表示件数: {count}</Text>
      <Field
        label={
          <HStack gap={1}>
            <Icon boxSize="1.3rem">
              <CiSearch />
            </Icon>
            <Text>キーワード</Text>
          </HStack>
        }
      >
        <InputGroup width="full" endElement={isPending ? <Loading /> : <></>}>
          <Input
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
      <Field label="カテゴリー">
        <HStack>
          {categories.map((x) => {
            const isChecked = currentCategories.includes(x.id);
            return (
              <Checkbox
                htmlFor={x.id}
                key={x.id}
                value={x.id}
                checked={isChecked}
                onCheckedChange={({ checked }) => {
                  if (checked) {
                    onChangeCategories([...currentCategories, x.id]);
                  } else {
                    onChangeCategories(
                      currentCategories.filter((y) => y !== x.id),
                    );
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
              既訪問店
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
              未訪問店
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
          <Checkbox
            htmlFor="clustering"
            checked={clustering}
            onCheckedChange={({ checked }) => {
              if (typeof checked === "boolean") {
                onChangeClustering(checked);
              }
            }}
          >
            マーカーのクラスタリング
          </Checkbox>
        </VStack>
      </Field>
    </VStack>
  );
}
