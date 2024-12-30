import { HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { Field } from "@/components/ui/field.tsx";
import { CiSearch } from "react-icons/ci";
import { InputGroup } from "@/components/ui/input-group.tsx";
import { Loading } from "@/components/loading.tsx";
import { useState } from "react";
import { Category } from "@/features/categories/api/useCategories.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";

interface Props {
  categories: Category[];
  currentCategories: string[];
  defaultKeyword: string;
  onChangeKeyword: (keyword: string) => Promise<unknown>;
  onChangeCategories: (categories: string[]) => void;
}

export function SearchPanel({
  categories,
  currentCategories,
  defaultKeyword,
  onChangeKeyword,
  onChangeCategories,
}: Props) {
  const [isPending, setIsPending] = useState(false);

  return (
    <VStack boxSize="20rem" fontSize="md">
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
    </VStack>
  );
}
