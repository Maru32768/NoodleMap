import { Flex, Input, VStack } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/ui/field.tsx";
import { Button } from "@/components/ui/button.tsx";

export default function LoginPage() {
  const form = useForm<{
    mail: string;
    password: string;
  }>();

  return (
    <Flex boxSize="full" justifyContent="center" paddingTop={10}>
      <VStack
        height="fit-content"
        width="30rem"
        bg="gray.100"
        padding={10}
        borderRadius="md"
      >
        <Field label="メール">
          <Input bg="white" {...form.register("mail")} />
        </Field>
        <Field label="パスワード">
          <Input bg="white" type="password" {...form.register("password")} />
        </Field>
        <Button>ログイン</Button>
      </VStack>
    </Flex>
  );
}
