import { HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { Field } from "@/components/ui/field.tsx";
import { CiSearch } from "react-icons/ci";
import { InputGroup } from "@/components/ui/input-group.tsx";
import { Loading } from "@/components/loading.tsx";
import { useState } from "react";

interface Props {
  defaultKeyword: string;
  onChangeKeyword: (keyword: string) => Promise<unknown>;
}

export function SearchPanel({ defaultKeyword, onChangeKeyword }: Props) {
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
    </VStack>
  );
}
